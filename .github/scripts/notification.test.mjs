import assert from "node:assert/strict";
import test from "node:test";

import { MAX_ENTRIES, buildEntry, maskLinks, parseIssueForm, unmaskLinks, updateFeed } from "./notification.mjs";

const form = (overrides = {}) => ({
  id: "winxp-theme-2026",
  type: "success",
  title: "New theme",
  body: "The Windows XP theme is out.",
  ...overrides,
});

test("parseIssueForm reads every field and treats an empty answer as empty", () => {
  const fields = parseIssueForm(
    [
      "### ID",
      "",
      "winxp-theme-2026",
      "",
      "### Type",
      "",
      "warning",
      "",
      "### Body",
      "",
      "Line one.",
      "",
      "Line two.",
      "",
      "### End date",
      "",
      "_No response_",
      "",
      "### Platforms",
      "",
      "web, android",
    ].join("\n"),
  );

  assert.equal(fields.id, "winxp-theme-2026");
  assert.equal(fields.type, "warning");
  assert.equal(fields.body, "Line one.\n\nLine two.");
  assert.equal(fields.to, "");
  assert.equal(fields.platform, "web, android");
});

test("parseIssueForm keeps a markdown heading inside the body", () => {
  const fields = parseIssueForm(["### Body", "", "### Not a field", "", "Still the body.", "", "### Type", "", "error"].join("\n"));

  assert.equal(fields.body, "### Not a field\n\nStill the body.");
  assert.equal(fields.type, "error");
});

test("buildEntry defaults the type and leaves target out when nothing is targeted", () => {
  const entry = buildEntry(form({ type: "" }));

  assert.deepEqual(entry, {
    id: "winxp-theme-2026",
    type: "success",
    title: { en: "New theme" },
    body: { en: "The Windows XP theme is out." },
  });
});

test("buildEntry maps the form answers onto target", () => {
  const entry = buildEntry(
    form({
      from: "2026-09-01",
      to: "2026-09-30",
      platform: "android",
      minVersion: "1.9.0",
      locale: "vi, zh-TW",
      paid: "Only devices that bought nothing",
    }),
  );

  assert.equal(entry.from, "2026-09-01");
  assert.equal(entry.to, "2026-09-30");
  assert.deepEqual(entry.target, {
    platform: ["android"],
    minVersion: "1.9.0",
    locale: ["vi", "zh-TW"],
    paid: false,
  });
});

test("buildEntry drops a rule that already matches everyone", () => {
  const entry = buildEntry(form({ platform: "web, android", paid: "Everyone" }));

  assert.equal(entry.target, undefined);
});

test("buildEntry rejects bad input", () => {
  assert.throws(() => buildEntry(form({ id: "WinXP Theme" })), /ID must be lowercase/);
  assert.throws(() => buildEntry(form({ type: "info" })), /Type must be one of/);
  assert.throws(() => buildEntry(form({ title: "  " })), /Title is required/);
  assert.throws(() => buildEntry(form({ from: "01-09-2026" })), /ISO date/);
  assert.throws(() => buildEntry(form({ from: "2026-02-30" })), /not a real date/);
  assert.throws(() => buildEntry(form({ from: "2026-09-30", to: "2026-09-01" })), /before start date/);
  assert.throws(() => buildEntry(form({ minVersion: "1.9" })), /1\.9\.0/);
  assert.throws(() => buildEntry(form({ minVersion: "2.0.0", maxVersion: "1.9.0" })), /below minimum version/);
  assert.throws(() => buildEntry(form({ locale: "vi, klingon" })), /not supported/);
});

test("a masked link survives a translation that reorders and respaces the sentence", () => {
  const { masked, urls } = maskLinks("The theme is out. [See it](https://visnalize.com) today.");

  assert.equal(masked, "The theme is out. [See it](%%0%%) today.");
  assert.equal(unmaskLinks("今天【看看】 （%%0%% ）。", urls), "今天[看看](https://visnalize.com)。");
});

test("maskLinks numbers each link separately", () => {
  const { masked, urls } = maskLinks("[a](https://a.com) and [b](https://b.com)");

  assert.equal(masked, "[a](%%0%%) and [b](%%1%%)");
  assert.equal(unmaskLinks(masked, urls), "[a](https://a.com) and [b](https://b.com)");
});

test("updateFeed appends the entry and removes what has expired", () => {
  const feed = [
    { id: "old", to: "2026-08-31" },
    { id: "current", to: "2026-09-30" },
    { id: "forever" },
  ];

  assert.deepEqual(updateFeed(feed, { id: "new" }, "2026-09-05"), [
    { id: "current", to: "2026-09-30" },
    { id: "forever" },
    { id: "new" },
  ]);
});

test("updateFeed keeps the entry that ends today", () => {
  const feed = updateFeed([{ id: "ends-today", to: "2026-09-05" }], { id: "new" }, "2026-09-05");

  assert.deepEqual(feed.map((entry) => entry.id), ["ends-today", "new"]);
});

test("updateFeed caps the feed and drops the oldest entries", () => {
  const feed = Array.from({ length: MAX_ENTRIES }, (_, index) => ({ id: `entry-${index}` }));
  const updated = updateFeed(feed, { id: "new" }, "2026-09-05");

  assert.equal(updated.length, MAX_ENTRIES);
  assert.equal(updated[0].id, "entry-1");
  assert.equal(updated.at(-1).id, "new");
});

test("updateFeed refuses to reuse an id", () => {
  assert.throws(() => updateFeed([{ id: "taken" }], { id: "taken" }, "2026-09-05"), /already has an entry/);
});
