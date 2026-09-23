import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {diagnoseTask} from './diagnose.mjs';

const runId='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const timestamp='2026-09-23T01:00:00.000Z';
const base={runId,requestId,timestamp,taskId:'owned',tool:'exec_command'};
function fixture(run) {
  const dir=mkdtempSync(join(tmpdir(),'webgpt-diagnose-'));
  const config={dataDir:dir};
  const log=(records,suffix='')=>writeFileSync(join(dir,'mcp-audit.jsonl'+suffix),records.map(record=>typeof record==='string'?record:JSON.stringify(record)).join('\n')+'\n');
  writeFileSync(join(dir,'state.json'),JSON.stringify([{id:'owned',status:'failed',collected:false,token:'PRIVATE_TOKEN_CANARY'},{id:'foreign',status:'completed',summary:'FOREIGN_SUMMARY_CANARY'}]));
  try {run({dir,config,log});} finally {rmSync(dir,{recursive:true,force:true});}
}

test('diagnosis scopes tool receipts, preserves execution evidence and excludes all private payloads',()=>fixture(({dir,config,log})=>{
  const artifact=join(dir,'PRIVATE_ARTIFACT_PATH_CANARY');writeFileSync(artifact,'PRIVATE_RESULT_BODY_CANARY');
  writeFileSync(join(dir,'state.json'),JSON.stringify([{id:'owned',status:'failed',collected:true,artifact,token:'PRIVATE_TOKEN_CANARY',summary:'PRIVATE_SUMMARY_CANARY'}]));
  const poisoned={...base,command:'PRIVATE_COMMAND_CANARY',token:'PRIVATE_TOKEN_CANARY',output:'PRIVATE_OUTPUT_CANARY',error:'PRIVATE_ERROR_CANARY',url:'https://PRIVATE_URL_CANARY.example',unknown:'PRIVATE_UNKNOWN_CANARY'};
  log([{runId,timestamp,phase:'started',private:'PRIVATE_START_CANARY'},{...poisoned,phase:'received'},
    {...poisoned,phase:'completed',isError:false,durationMs:25,exit_code:1,running:false,outputBytes:5,outputSha256:'a'.repeat(64)},
    {...base,taskId:'foreign',phase:'received',requestId:'33333333-3333-4333-8333-333333333333'},
    {runId,timestamp,phase:'http_completed',statusCode:502,aborted:false,body:'PRIVATE_TRANSPORT_CANARY'},
    {runId,timestamp,phase:'http_completed',statusCode:200,aborted:true},
  ]);
  const before=readFileSync(join(dir,'mcp-audit.jsonl'),'utf8');const result=diagnoseTask('owned',config);
  assert.deepEqual(result.task,{id:'owned',status:'failed',collected:true,hasSavedArtifact:true});
  assert.equal(result.audit.toolRecords.length,2);
  assert.deepEqual(result.audit.toolRecords[1],{phase:'completed',runId,timestamp,requestId,tool:'exec_command',isError:false,durationMs:25,exit_code:1,running:false,outputBytes:5,outputSha256:'a'.repeat(64)});
  assert.deepEqual(result.audit.globalTransportFailures,{scope:'unscoped',failedRequests:2,httpErrorResponses:1,abortedRequests:1});
  assert.deepEqual(result.audit.capture.runStarts,[{runId,timestamp}]);
  assert.equal(JSON.stringify(result).includes('CANARY'),false);
  assert.equal(JSON.stringify(result).includes('foreign'),false);
  assert.equal(readFileSync(join(dir,'mcp-audit.jsonl'),'utf8'),before);
}));

test('missing audit is explicit and unknown task fails without guessing',()=>fixture(({config})=>{
  const result=diagnoseTask('owned',config);
  assert.equal(result.audit.availability,'not_observed');assert.deepEqual(result.audit.toolRecords,[]);
  assert.equal(result.audit.capture.timestampRange,null);assert.equal(result.task.hasSavedArtifact,false);
  assert.match(result.interpretation,/not_observed is not proof of platform cause/);
  assert.throws(()=>diagnoseTask('missing',config),/unknown task/);
}));

test('rotated capture ranges and malformed lines remain bounded sanitized evidence',()=>fixture(({config,log})=>{
  log([{runId,timestamp:'2026-09-23T00:59:00.000Z',phase:'started'},'{broken','null'],'.1');
  log([{...base,phase:'completed',timestamp:'2026-09-23T01:01:00.000Z',isError:true,durationMs:-1,
    exit_code:'PRIVATE_EXIT_CANARY',running:'PRIVATE_RUNNING_CANARY',outputBytes:'PRIVATE_SIZE_CANARY',outputSha256:'PRIVATE_HASH_CANARY'},
    {...base,phase:'received',requestId:'PRIVATE_REQUEST_CANARY'}]);
  const result=diagnoseTask('owned',config);
  assert.equal(result.audit.malformedLineCount,3);
  assert.deepEqual(result.audit.capture.timestampRange,{first:'2026-09-23T00:59:00.000Z',last:'2026-09-23T01:01:00.000Z'});
  assert.equal(result.audit.toolRecords[0].isError,true);
  assert.equal(JSON.stringify(result).includes('CANARY'),false);
  assert.equal('exit_code' in result.audit.toolRecords[0],false);
}));

test('oversized active, rotated and state files fail safely rather than truncate evidence',()=>{
  for(const filename of ['mcp-audit.jsonl','mcp-audit.jsonl.1','state.json'])fixture(({dir,config})=>{
    writeFileSync(join(dir,filename),'x'.repeat(filename==='state.json'?32*1024*1024+1:1024*1024+4097));
    assert.throws(()=>diagnoseTask('owned',config),/exceeds safe read limit/);
  });
});

test('CLI reads only local diagnostic files and returns the sanitized task report',()=>fixture(({dir,config,log})=>{
  log([{...base,phase:'received'}]);
  const configPath=join(dir,'config.json');writeFileSync(configPath,JSON.stringify(config));
  const stdout=execFileSync(process.execPath,[fileURLToPath(new URL('./diagnose.mjs',import.meta.url)),'owned'],{env:{...process.env,WEBGPT_CONFIG:configPath,WEBGPT_DATA_DIR:dir},encoding:'utf8'});
  const result=JSON.parse(stdout);assert.equal(result.task.id,'owned');assert.equal(result.audit.toolRecords.length,1);
  assert.equal(stdout.includes('PRIVATE_TOKEN_CANARY'),false);
}));


test('large valid task state does not expose unrelated registered input',()=>fixture(({dir,config})=>{
  writeFileSync(join(dir,'state.json'),JSON.stringify([
    {id:'foreign',status:'running',inputs:{large:'PRIVATE_LARGE_INPUT_CANARY'.repeat(50000)}},
    {id:'owned',status:'running',collected:false},
  ]));
  const result=diagnoseTask('owned',config);
  assert.deepEqual(result.task,{id:'owned',status:'running',collected:false,hasSavedArtifact:false});
  assert.equal(JSON.stringify(result).includes('CANARY'),false);
  assert.deepEqual(result.audit.toolRecords,[]);
}));


test('unassigned invalid-token-shaped calls are counted without attributing them to the requested task',()=>fixture(({config,log})=>{
  const {taskId,...unassigned}=base;
  log([
    {...base,phase:'received'},
    {...unassigned,tool:'submit_result',phase:'received',token:'INVALID_TOKEN_CANARY'},
    {...unassigned,tool:'submit_result',phase:'completed',isError:true,error:'INVALID_TOKEN_MESSAGE_CANARY'},
    {...base,taskId:'foreign',phase:'received'},
    {...base,taskId:'foreign',phase:'completed',isError:true},
    {runId,timestamp,phase:'http_completed',statusCode:200,aborted:false},
  ]);
  const result=diagnoseTask('owned',config);
  assert.equal(result.audit.toolRecords.length,1);
  assert.equal(result.audit.toolRecords[0].tool,'exec_command');
  assert.deepEqual(result.audit.unassignedToolCalls,{scope:'unscoped',received:1,failedCompleted:1});
  assert.equal(result.audit.globalTransportFailures.failedRequests,0);
  assert.match(result.interpretation,/invalid-token calls cannot be assigned to a task/);
  assert.equal(JSON.stringify(result).includes('CANARY'),false);
}));
