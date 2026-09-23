import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTags } from './normalize-tags.mjs';

test('normalizes tags without mutating input', () => {
  const values = [' Foo ', 'BAR', 'foo', '   ', ' Baz '];
  const snapshot = [...values];

  assert.deepEqual(normalizeTags(values), ['foo', 'bar', 'baz']);
  assert.deepEqual(values, snapshot);
});

test('preserves first occurrence order after normalization', () => {
  assert.deepEqual(normalizeTags([' B ', 'a', 'b', ' A ', 'c']), ['b', 'a', 'c']);
});

test('throws TypeError for invalid inputs', () => {
  assert.throws(() => normalizeTags('foo'), TypeError);
  assert.throws(() => normalizeTags(['ok', 1]), TypeError);
});
