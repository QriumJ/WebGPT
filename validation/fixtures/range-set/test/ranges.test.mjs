import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRanges, subtractRanges } from '../src/ranges.mjs';

test('normalizes overlapping ranges', () => {
  assert.deepEqual(normalizeRanges([[3, 8], [1, 4]]), [[1, 8]]);
});

test('subtracts a middle exclusion', () => {
  assert.deepEqual(subtractRanges([[0, 10]], [[3, 7]]), [[0, 3], [7, 10]]);
});
