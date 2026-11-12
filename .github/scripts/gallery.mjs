// Pure helpers behind the "Refresh theme gallery" workflow. Everything that touches the network or
// the filesystem lives in refresh-gallery.mjs so this file stays testable.

// One snapshot per Firebase project, named after it, so the app's dev build never lists prod themes.
// Both URLs ship in the web app already; neither is a secret.
export const DATABASES = {
  "win7-simu": "https://win7-simu.firebaseio.com",
  "win7-simu-dev": "https://win7-simu-dev-default-rtdb.asia-southeast1.firebasedatabase.app",
};

// What the gallery's listing and its search need. The rest is read from the database when a
// theme is picked.
const FIELDS = ["id", "lbl", "pic", "own", "use", "date"];

/**
 * @param {Record<string, object> | null} users The `themestudio/users` node.
 * @param {number} generatedAt When the read started; the app asks the database for anything newer.
 */
export function buildSnapshot(users, generatedAt) {
  const themes = Object.values(users || {})
    .filter((theme) => theme && typeof theme.id === "string")
    .map((theme) => Object.fromEntries(FIELDS.filter((key) => theme[key] != null).map((key) => [key, theme[key]])))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { generatedAt, themes };
}

/**
 * One theme per line, so a commit's diff shows which themes changed.
 *
 * @param {{ generatedAt: number, themes: object[] }} snapshot
 */
export function serialize({ generatedAt, themes }) {
  const lines = themes.map((theme) => "    " + JSON.stringify(theme));
  return `{\n  "generatedAt": ${generatedAt},\n  "themes": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

/**
 * Whether two snapshots list the same themes, whenever they were taken. A snapshot that only moves
 * the clock is not worth a commit.
 *
 * @param {string | null} previous The file as it is, or null when there is none yet.
 * @param {{ themes: object[] }} next
 */
export function hasSameThemes(previous, next) {
  if (!previous) return false;
  try {
    return JSON.stringify(JSON.parse(previous).themes) === JSON.stringify(next.themes);
  } catch {
    return false;
  }
}
