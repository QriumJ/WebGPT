import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/summary.mjs';
test('empty logs produce an empty summary',()=>assert.deepEqual(summarize(''),{count:0,services:[],days:[]}));
test('one event is summarized',()=>assert.deepEqual(summarize(JSON.stringify({id:'a',ts:'2026-01-01T12:00:00Z',service:'api',durationMs:10,status:200})),{count:1,services:[{service:'api',count:1,errors:0,totalMs:10,meanMs:10,p95Ms:10}],days:[{day:'2026-01-01',count:1}]}));
