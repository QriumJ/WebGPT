import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {uniqueById} = await import(pathToFileURL(path.resolve(process.argv[2], 'src/unique.mjs')));
const tests = [
 ['zero', () => { const a={id:0}; assert.deepEqual(uniqueById([a,{id:0}]),[a]); }],
 ['empty string', () => { const a={id:''}; assert.deepEqual(uniqueById([a,{id:''}]),[a]); }],
 ['missing IDs', () => assert.deepEqual(uniqueById([{id:null},{},{id:undefined}]),[])],
 ['order and first object', () => { const a={id:'x'}, b={id:0}, c={id:''}; const result=uniqueById([a,b,{id:'x'},c,{id:0}]); assert.deepEqual(result,[a,b,c]); assert.equal(result[0],a); }],
 ['no mutation', () => { const a=Object.freeze({id:0}), b=Object.freeze({id:''}); const input=Object.freeze([a,b,a]); assert.deepEqual(uniqueById(input),[a,b]); }],
 ['ID types remain distinct', () => { const input=[{id:0},{id:'0'},{id:false},{id:''}]; assert.deepEqual(uniqueById(input),input); }],
 ['empty input', () => assert.deepEqual(uniqueById([]),[])],
];
const results=tests.map(([name,fn])=>{try{fn();return {name,status:'PASS'};}catch(e){return {name,status:'FAIL',error:e.message};}});
console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,total:results.length,results},null,2));
process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
