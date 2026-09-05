// Pure helpers behind the "Add notification" workflow. Everything that touches the network,
// the filesystem or the GitHub API lives in add-notification.mjs so this file stays testable.

// Locale codes used as keys in the feed, paired with the code the translator expects.
// Only Chinese needs its region, every other language has a single translation in the app.
export const LOCALES = [
  { key: "ar", translate: "ar" },
  { key: "bn", translate: "bn" },
  { key: "ca", translate: "ca" },
  { key: "de", translate: "de" },
  { key: "es", translate: "es" },
  { key: "fa", translate: "fa" },
  { key: "fr", translate: "fr" },
  { key: "hi", translate: "hi" },
  { key: "id", translate: "id" },
  { key: "it", translate: "it" },
  { key: "ja", translate: "ja" },
  { key: "pl", translate: "pl" },
  { key: "pt", translate: "pt-PT" },
  { key: "ru", translate: "ru" },
  { key: "th", translate: "th" },
  { key: "tr", translate: "tr" },
  { key: "uk", translate: "uk" },
  { key: "vi", translate: "vi" },
  { key: "zh-CN", translate: "zh-CN" },
  { key: "zh-TW", translate: "zh-TW" },
];

export const SOURCE_LOCALE = "en";
export const MAX_ENTRIES = 20;

const TYPES = ["success", "warning", "error"];
const PLATFORMS = ["web", "android"];
const LOCALE_KEYS = [SOURCE_LOCALE, ...LOCALES.map((l) => l.key)];

const FIELDS = {
  ID: "id",
  Type: "type",
  Title: "title",
  Body: "body",
  "Start date": "from",
  "End date": "to",
  Platforms: "platform",
  "Minimum version": "minVersion",
  "Maximum version": "maxVersion",
  Locales: "locale",
  Purchases: "paid",
};

const NO_RESPONSE = "_No response_";

/**
 * Read the fields out of a rendered issue form body.
 *
 * A `### ` line only starts a new field when it names a field of the notification form, so a
 * heading inside the markdown body cannot silently split the entry in two.
 */
export function parseIssueForm(body) {
  const fields = {};
  let current = null;
  let lines = [];

  const flush = () => {
    if (!current) return;
    const value = lines.join("\n").trim();
    fields[current] = value === NO_RESPONSE ? "" : value;
  };

  for (const line of String(body ?? "").split(/\r?\n/)) {
    const heading = line.match(/^#{3}\s+(.+?)\s*$/);
    const field = heading && FIELDS[heading[1]];
    if (field) {
      flush();
      current = field;
      lines = [];
    } else if (current) {
      lines.push(line);
    }
  }
  flush();

  return fields;
}

function fail(message) {
  throw new Error(message);
}

function parseList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function checkDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} must be an ISO date such as 2026-09-01, got "${value}".`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value)) fail(`${label} "${value}" is not a real date.`);
}

function checkVersion(value, label) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) fail(`${label} must look like 1.9.0, got "${value}".`);
}

/** Turn the parsed form fields into a feed entry whose title and body are still English-only. */
export function buildEntry(fields) {
  const id = (fields.id ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`ID must be lowercase letters, digits and dashes, got "${id}".`);

  const type = (fields.type || "success").trim();
  if (!TYPES.includes(type)) fail(`Type must be one of ${TYPES.join(", ")}, got "${type}".`);

  const title = (fields.title ?? "").trim();
  if (!title) fail("Title is required.");

  const body = (fields.body ?? "").trim();
  if (!body) fail("Body is required.");

  const entry = { id, type, title: { en: title }, body: { en: body } };

  const from = (fields.from ?? "").trim();
  const to = (fields.to ?? "").trim();
  if (from) {
    checkDate(from, "Start date");
    entry.from = from;
  }
  if (to) {
    checkDate(to, "End date");
    entry.to = to;
  }
  if (from && to && to < from) fail(`End date "${to}" is before start date "${from}".`);

  const target = {};

  const platform = parseList(fields.platform);
  for (const item of platform) {
    if (!PLATFORMS.includes(item)) fail(`Platform must be one of ${PLATFORMS.join(", ")}, got "${item}".`);
  }
  if (platform.length && platform.length < PLATFORMS.length) target.platform = platform;

  const minVersion = (fields.minVersion ?? "").trim();
  const maxVersion = (fields.maxVersion ?? "").trim();
  if (minVersion) {
    checkVersion(minVersion, "Minimum version");
    target.minVersion = minVersion;
  }
  if (maxVersion) {
    checkVersion(maxVersion, "Maximum version");
    target.maxVersion = maxVersion;
  }
  if (minVersion && maxVersion && compareVersions(maxVersion, minVersion) < 0) {
    fail(`Maximum version "${maxVersion}" is below minimum version "${minVersion}".`);
  }

  const locale = parseList(fields.locale);
  for (const item of locale) {
    if (!LOCALE_KEYS.includes(item)) fail(`Locale "${item}" is not supported by the app.`);
  }
  if (locale.length && locale.length < LOCALE_KEYS.length) target.locale = locale;

  const paid = (fields.paid ?? "").trim();
  if (paid.startsWith("Only devices that bought something")) target.paid = true;
  else if (paid.startsWith("Only devices that bought nothing")) target.paid = false;

  if (Object.keys(target).length) entry.target = target;

  return entry;
}

function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

/**
 * Hide the URL of every markdown link behind a numbered marker so a translator rewrites the link
 * text without touching the address. `%%0%%` survives machine translation in every supported
 * locale, including right-to-left and Chinese.
 */
export function maskLinks(text) {
  const urls = [];
  const masked = text.replace(/\]\(([^)\s]+)\)/g, (_, url) => `](%%${urls.push(url) - 1}%%)`);
  return { masked, urls };
}

/** Undo maskLinks, repairing the spacing a translator may add around the markdown punctuation. */
export function unmaskLinks(text, urls) {
  return text
    .replace(/[［【]/g, "[")
    .replace(/[］】]/g, "]")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\]\s*\(/g, "](")
    .replace(/\(\s*%\s*%\s*(\d+)\s*%\s*%\s*\)/g, (marker, index) =>
      urls[Number(index)] === undefined ? marker : `(${urls[Number(index)]})`,
    );
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Add the entry to the feed, drop what has expired and keep the feed short. A device remembers
 * only its last 50 ids, and dropping an entry also clears it from every action center.
 */
export function updateFeed(feed, entry, now = today()) {
  if (!Array.isArray(feed)) fail("news/feed.json must contain an array.");
  if (feed.some((existing) => existing.id === entry.id)) fail(`The feed already has an entry with the id "${entry.id}".`);

  const kept = feed.filter((existing) => !existing.to || existing.to >= now);
  return [...kept, entry].slice(-MAX_ENTRIES);
}
