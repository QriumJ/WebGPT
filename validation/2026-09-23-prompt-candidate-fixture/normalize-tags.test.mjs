import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTags } from './normalize-tags.mjs';

test('normalizes tags while preserving first occurrence order', () => {
  assert.deepEqual(
    normalizeTags([' Foo ', 'bar', 'FOO', '   ', ' Bar ', 'BAZ']),
    ['foo', 'bar', 'baz'],
  );
});

test('does not mutate input', () => {
  const values = [' Foo ', 'BAR'];
  const snapshot = [...values];

  normalizeTags(values);

  assert.deepEqual(values, snapshot);
});

test('throws TypeError for invalid input', () => {
  assert.throws(() => normalizeTags('foo'), TypeError);
  assert.throws(() => normalizeTags(['foo', 1]), TypeError);
});
