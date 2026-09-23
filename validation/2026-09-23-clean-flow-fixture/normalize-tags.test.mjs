import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTags } from "./normalize-tags.mjs";

test("normalizes tags, removes empties and duplicates, and preserves order", () => {
  assert.deepEqual(
    normalizeTags([" Foo ", "BAR", "foo", "   ", " Baz ", "bar "]),
    ["foo", "bar", "baz"],
  );
});

test("does not mutate the input", () => {
  const values = [" Foo ", "BAR"];
  const original = [...values];

  normalizeTags(values);

  assert.deepEqual(values, original);
});

test("throws TypeError for invalid input", () => {
  assert.throws(() => normalizeTags("foo"), TypeError);
  assert.throws(() => normalizeTags(["foo", 42]), TypeError);
});
