// Usage: node .github/scripts/refresh-gallery.mjs [project...]

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { DATABASES, buildSnapshot, hasSameThemes, serialize } from "./gallery.mjs";

const DIR = process.env.GALLERY_DIR ?? "themestudio";
const projects = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(DATABASES);

const written = [];

await mkdir(DIR, { recursive: true });

for (const project of projects) {
  const database = DATABASES[project];
  if (!database) throw new Error(`Unknown project: ${project}`);

  // before the read, so a theme published during it is still newer than the snapshot
  const generatedAt = Date.now();
  const response = await fetch(`${database}/themestudio/users.json`);
  if (!response.ok) throw new Error(`${project}: HTTP ${response.status} ${await response.text()}`);

  const snapshot = buildSnapshot(await response.json(), generatedAt);
  const path = `${DIR}/${project}.json`;
  const previous = await readFile(path, "utf8").catch(() => null);

  if (hasSameThemes(previous, snapshot)) {
    console.log(`${project}: ${snapshot.themes.length} themes, unchanged`);
    continue;
  }
  await writeFile(path, serialize(snapshot));
  console.log(`${project}: ${snapshot.themes.length} themes, written to ${path}`);
  written.push(path);
}

if (process.env.GITHUB_OUTPUT && written.length) {
  await appendFile(process.env.GITHUB_OUTPUT, `files<<EOF\n${written.join("\n")}\nEOF\n`);
}
