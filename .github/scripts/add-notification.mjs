// Entry point for the "Add notification" workflow. Reads the rendered issue form from the
// environment, translates the English title and body, and rewrites news/feed.json.
//
// Usage: ISSUE_BODY=... node .github/scripts/add-notification.mjs

import { appendFile, readFile, writeFile } from "node:fs/promises";
import {
  LOCALES,
  SOURCE_LOCALE,
  buildEntry,
  maskLinks,
  parseIssueForm,
  unmaskLinks,
  updateFeed,
} from "./notification.mjs";

const FEED_PATH = process.env.FEED_PATH ?? "news/feed.json";
const MODEL = "claude-opus-5";

const TRANSLATOR_BRIEF = `You translate short in-app notifications for Win7 Simu, a Windows 7 simulator.
Keep the tone plain and friendly, and keep it short — this text is shown in a small notification panel.
Keep markdown syntax, every URL, product names and version numbers exactly as they are.
Translate only the words a reader sees.`;

/** Translate with Claude. One request covers every locale, which keeps the wording consistent. */
async function translateWithClaude(title, body) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const localeStrings = { type: "object", additionalProperties: false, properties: {}, required: [] };
  for (const { key } of LOCALES) {
    localeStrings.properties[key] = { type: "string" };
    localeStrings.required.push(key);
  }
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { title: localeStrings, body: structuredClone(localeStrings) },
    required: ["title", "body"],
  };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: TRANSLATOR_BRIEF,
    messages: [
      {
        role: "user",
        content: `Translate this notification into every locale of the schema.\n\nTitle: ${title}\n\nBody:\n${body}`,
      },
    ],
    output_config: { format: { type: "json_schema", schema } },
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to translate this notification.");

  const text = response.content.find((block) => block.type === "text");
  if (!text) throw new Error("Claude returned no text to parse.");
  return JSON.parse(text.text);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function translateLine(line, locale) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=en" +
    `&tl=${encodeURIComponent(locale)}&q=${encodeURIComponent(line)}`;

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      const [segments] = await response.json();
      return segments.map(([translated]) => translated).join("");
    }
    if (attempt === 3) throw new Error(`Translating into ${locale} failed with HTTP ${response.status}.`);
    await wait(attempt * 1000);
  }
}

/**
 * Translate with the keyless Google endpoint. It takes one short request at a time, so the text is
 * sent line by line — that keeps every request small and leaves list markers and blank lines in place.
 */
async function translateWithGoogle(title, body) {
  const masked = { title: maskLinks(title), body: maskLinks(body) };
  const out = { title: {}, body: {} };

  for (const { key, translate } of LOCALES) {
    out.title[key] = unmaskLinks(await translateLine(masked.title.masked, translate), masked.title.urls);
    await wait(200);

    const lines = [];
    for (const line of masked.body.masked.split("\n")) {
      lines.push(line.trim() ? unmaskLinks(await translateLine(line, translate), masked.body.urls) : line);
      await wait(200);
    }
    out.body[key] = lines.join("\n");
  }

  return out;
}

async function translate(title, body) {
  if (!process.env.ANTHROPIC_API_KEY) return { via: "Google Translate", ...(await translateWithGoogle(title, body)) };
  try {
    return { via: `Claude (${MODEL})`, ...(await translateWithClaude(title, body)) };
  } catch (error) {
    console.warn(`Claude translation failed (${error.message}), falling back to Google Translate.`);
    return { via: "Google Translate", ...(await translateWithGoogle(title, body)) };
  }
}

async function report(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

const entry = buildEntry(parseIssueForm(process.env.ISSUE_BODY));
const translated = await translate(entry.title[SOURCE_LOCALE], entry.body[SOURCE_LOCALE]);

Object.assign(entry.title, translated.title);
Object.assign(entry.body, translated.body);

const feed = JSON.parse(await readFile(FEED_PATH, "utf8"));
await writeFile(FEED_PATH, `${JSON.stringify(updateFeed(feed, entry), null, 2)}\n`);

await report("id", entry.id);
await report("translator", translated.via);
console.log(`Added "${entry.id}" to ${FEED_PATH}, translated with ${translated.via}.`);
