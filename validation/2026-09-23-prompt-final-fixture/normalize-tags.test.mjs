import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTags } from './normalize-tags.mjs';

test('normalizes, filters, deduplicates, and preserves first occurrence order', () => {
  assert.deepEqual(
    normalizeTags([' Foo ', 'BAR', 'foo', '   ', ' Bar ', 'baz']),
    ['foo', 'bar', 'baz'],
  );
});

test('does not mutate the input array', () => {
  const values = [' Foo ', 'BAR', 'foo'];
  const original = [...values];

  normalizeTags(values);

  assert.deepEqual(values, original);
});

test('throws TypeError for invalid input', () => {
  assert.throws(() => normalizeTags('foo'), TypeError);
  assert.throws(() => normalizeTags(['foo', 42]), TypeError);
});
