// Both URLs ship in the web app, so neither is a secret.
export const DATABASES = {
  "win7-simu": "https://win7-simu.firebaseio.com",
  "win7-simu-dev": "https://win7-simu-dev-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const FIELDS = ["id", "lbl", "pic", "own", "use", "date"];

/**
 * @param {Record<string, object> | null} users The `themestudio/users` node.
 * @param {number} generatedAt
 */
export function buildSnapshot(users, generatedAt) {
  const themes = Object.values(users || {})
    .filter((theme) => theme && typeof theme.id === "string")
    .map((theme) => Object.fromEntries(FIELDS.filter((key) => theme[key] != null).map((key) => [key, theme[key]])))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { generatedAt, themes };
}

/**
 * One theme per line, so a diff shows which themes changed.
 *
 * @param {{ generatedAt: number, themes: object[] }} snapshot
 */
export function serialize({ generatedAt, themes }) {
  const lines = themes.map((theme) => "    " + JSON.stringify(theme));
  return `{\n  "generatedAt": ${generatedAt},\n  "themes": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

/**
 * Ignores `generatedAt`, so a run that changes no theme makes no commit.
 *
 * @param {string | null} previous
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
