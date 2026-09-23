import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueById } from '../src/unique.mjs';
test('keeps first occurrence', () => {
 const first = {id: 'a', value: 1};
 assert.deepEqual(uniqueById([first, {id: 'a', value: 2}, {id: 'b'}]), [first, {id: 'b'}]);
});
