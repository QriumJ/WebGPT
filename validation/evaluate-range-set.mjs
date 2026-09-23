import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {normalizeRanges:n,subtractRanges:s}=await import(pathToFileURL(resolve(process.argv[2],'src/ranges.mjs')));
const cases = [
 ['normalization',()=>assert.deepEqual(n([[5,7],[1,3],[3,5],[2,4],[1,3],[10,10]]),[[1,7]])],
 ['disjoint fractional negatives',()=>assert.deepEqual(n([[2.5,3],[-4,-2],[-1,0]]),[[-4,-2],[-1,0],[2.5,3]])],
 ['empty ranges',()=>{assert.deepEqual(n([]),[]);assert.deepEqual(n([[2,2]]),[]);assert.deepEqual(s([],[]),[])}],
 ['split multiple holes',()=>assert.deepEqual(s([[0,12]],[[8,10],[2,4],[3,5]]),[[0,2],[5,8],[10,12]])],
 ['cover and clip',()=>assert.deepEqual(s([[0,3],[5,9],[12,16]],[[-3,1],[2,13],[15,20]]),[[1,2],[13,15]])],
 ['touching exclusions',()=>assert.deepEqual(s([[1,4],[7,9]],[[0,1],[4,7],[9,10]]),[[1,4],[7,9]])],
 ['normalizes both sets',()=>assert.deepEqual(s([[5,10],[0,7]],[[6,8],[2,4],[3,6]]),[[0,2],[8,10]])],
 ['whole removal',()=>assert.deepEqual(s([[0,10]], [[-1,11]]),[])],
 ['frozen and fresh',()=>{const a=Object.freeze([Object.freeze([0,10])]);const b=Object.freeze([Object.freeze([3,5])]);assert.deepEqual(s(a,b),[[0,3],[5,10]]);const out=n(a);assert.notEqual(out,a);assert.notEqual(out[0],a[0]);assert.deepEqual(a,[[0,10]])}],
 ['malformed containers and pairs',()=>{for(const a of [null,{},'x',[null],[[1]],[[1,2,3]],[{}],new Array(1)])assert.throws(()=>n(a),TypeError)}],
 ['invalid endpoints',()=>{for(const a of [[[2,1]],[[NaN,1]],[[0,Infinity]],[[-Infinity,1]],[['0',1]],[[0,undefined]],[[true,2]]])assert.throws(()=>n(a),TypeError)}],
 ['validates exclusions even empty source',()=>{for(const b of [null,[[2,1]],[[NaN,NaN]],[[0,Infinity]]])assert.throws(()=>s([],b),TypeError)}],
 ['validates source even full exclusion',()=>assert.throws(()=>s([[2,1]],[[-100,100]]),TypeError)],
];
let passed=0;const results=[];for(const [name,check] of cases){try{check();passed++;results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',error:e.message})}}
console.log(JSON.stringify({passed,total:cases.length,results},null,2));if(passed!==cases.length)process.exitCode=1;
