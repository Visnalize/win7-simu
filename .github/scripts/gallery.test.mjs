import assert from "node:assert/strict";
import test from "node:test";

import { buildSnapshot, hasSameThemes, serialize } from "./gallery.mjs";

const record = (id, props = {}) => ({ id, lbl: id, pic: "", own: "uid-1", use: 0, date: 1, ...props });

test("buildSnapshot keeps only the fields a listing needs, in id order", () => {
  const snapshot = buildSnapshot(
    { "ts-2": record("ts-2", { desc: "long text" }), "ts-1": record("ts-1") },
    500
  );

  assert.equal(snapshot.generatedAt, 500);
  assert.deepEqual(
    snapshot.themes.map((theme) => theme.id),
    ["ts-1", "ts-2"]
  );
  assert.deepEqual(Object.keys(snapshot.themes[1]), ["id", "lbl", "pic", "own", "use", "date"]);
});

test("buildSnapshot skips a record with no id, and a field that is not set", () => {
  const snapshot = buildSnapshot({ a: { lbl: "no id" }, b: null, c: { id: "ts-3", lbl: "x" } }, 1);

  assert.deepEqual(snapshot.themes, [{ id: "ts-3", lbl: "x" }]);
});

test("buildSnapshot copes with an empty database", () => {
  assert.deepEqual(buildSnapshot(null, 1).themes, []);
});

test("serialize writes JSON the app can parse, one theme per line", () => {
  const snapshot = buildSnapshot({ a: record("ts-1"), b: record("ts-2") }, 7);
  const text = serialize(snapshot);

  assert.deepEqual(JSON.parse(text), snapshot);
  assert.equal(text.split("\n").filter((line) => line.includes('"id"')).length, 2);
  assert.deepEqual(JSON.parse(serialize({ generatedAt: 1, themes: [] })), { generatedAt: 1, themes: [] });
});

test("hasSameThemes ignores the clock but not a changed theme", () => {
  const before = serialize(buildSnapshot({ a: record("ts-1") }, 1));

  assert.equal(hasSameThemes(before, buildSnapshot({ a: record("ts-1") }, 2)), true);
  assert.equal(hasSameThemes(before, buildSnapshot({ a: record("ts-1", { use: 1 }) }, 2)), false);
  assert.equal(hasSameThemes(null, buildSnapshot({}, 2)), false);
  assert.equal(hasSameThemes("not json", buildSnapshot({}, 2)), false);
});
