import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTags } from './normalize-tags.mjs';

test('normalizes tags without mutating input', () => {
  const values = [' Foo ', 'BAR', 'foo', '   ', ' Bar ', 'Baz'];
  const original = [...values];

  assert.deepEqual(normalizeTags(values), ['foo', 'bar', 'baz']);
  assert.deepEqual(values, original);
});

test('throws TypeError for invalid input', () => {
  assert.throws(() => normalizeTags('foo'), TypeError);
  assert.throws(() => normalizeTags(['foo', 1]), TypeError);
});
