import {openSync,readSync,closeSync,existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {configuration} from './client.mjs';

const MAX_AUDIT_BYTES=1024*1024+4096;
const MAX_STATE_BYTES=32*1024*1024;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOOL_NAMES=new Set(['exec_command','write_stdin','get_task','read_input','submit_result','unknown']);
const STATUSES=new Set(['running','completed','partial','failed','cancelled']);
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&!Number.isNaN(Date.parse(value));
const nonnegative=value=>Number.isSafeInteger(value)&&value>=0;

// Read at most the cap plus one sentinel byte even if the file grows concurrently.
function boundedRead(path,optional=false,maxBytes=MAX_AUDIT_BYTES) {
  let fd;
  try {fd=openSync(path,'r');}
  catch(error) {if(optional&&error.code==='ENOENT')return null;throw Error('diagnostic data unavailable');}
  try {
    const buffer=Buffer.alloc(maxBytes+1);let size=0;
    while(size<buffer.length) {
      const read=readSync(fd,buffer,size,buffer.length-size,null);
      if(!read)break;size+=read;
    }
    if(size>maxBytes)throw Error('diagnostic file exceeds safe read limit');
    return buffer.subarray(0,size).toString('utf8');
  } finally {closeSync(fd);}
}

export function diagnoseTask(id,config=configuration()) {
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Error('invalid task ID');
  let tasks;
  try {tasks=JSON.parse(boundedRead(join(config.dataDir,'state.json'),false,MAX_STATE_BYTES));}
  catch(error) {if(error.message==='diagnostic file exceeds safe read limit')throw error;throw Error('task state unavailable');}
  if(!Array.isArray(tasks))throw Error('task state unavailable');
  const task=tasks.find(value=>value&&typeof value==='object'&&value.id===id);
  if(!task)throw Error('unknown task');
  const toolRecords=[],runStarts=[];
  let malformedLineCount=0,present=false,first=null,last=null;
  const globalTransportFailures={scope:'unscoped',failedRequests:0,httpErrorResponses:0,abortedRequests:0};
  const unassignedToolCalls={scope:'unscoped',received:0,failedCompleted:0};
  const knownTaskIds=new Set(tasks.filter(value=>value&&typeof value==='object'&&typeof value.id==='string').map(value=>value.id));
  for(const suffix of ['.1','']) {
    const contents=boundedRead(join(config.dataDir,'mcp-audit.jsonl'+suffix),true);
    if(contents===null)continue;
    present=true;
    for(const line of contents.split('\n')) {
      if(!line.trim())continue;
      let record;
      try {record=JSON.parse(line);} catch {malformedLineCount++;continue;}
      if(!record||typeof record!=='object'||Array.isArray(record)||!UUID.test(record.runId??'')||!timestamp(record.timestamp)
        ||!['started','received','completed','http_received','http_completed'].includes(record.phase)) {
        malformedLineCount++;continue;
      }
      if(first===null||record.timestamp<first)first=record.timestamp;
      if(last===null||record.timestamp>last)last=record.timestamp;
      if(record.phase==='started') {runStarts.push({runId:record.runId,timestamp:record.timestamp});continue;}
      if(record.phase==='http_received'||record.phase==='http_completed') {
        if(record.phase==='http_completed') {
          const httpError=Number.isInteger(record.statusCode)&&record.statusCode>=400&&record.statusCode<=599;
          const aborted=record.aborted===true;
          if(httpError)globalTransportFailures.httpErrorResponses++;
          if(aborted)globalTransportFailures.abortedRequests++;
          if(httpError||aborted)globalTransportFailures.failedRequests++;
        }
        continue;
      }
      if(!UUID.test(record.requestId??'')||!TOOL_NAMES.has(record.tool)) {malformedLineCount++;continue;}
      if(!knownTaskIds.has(record.taskId)) {
        if(record.phase==='received')unassignedToolCalls.received++;
        if(record.phase==='completed'&&record.isError===true)unassignedToolCalls.failedCompleted++;
        continue;
      }
      if(record.taskId!==id)continue;
      const safe={phase:record.phase,runId:record.runId,timestamp:record.timestamp,requestId:record.requestId,tool:record.tool};
      if(record.phase==='completed') {
        if(typeof record.isError==='boolean')safe.isError=record.isError;
        if(nonnegative(record.durationMs))safe.durationMs=record.durationMs;
        if(['exec_command','write_stdin'].includes(record.tool)) {
          if(record.exit_code===null||Number.isSafeInteger(record.exit_code))safe.exit_code=record.exit_code;
          if(typeof record.running==='boolean')safe.running=record.running;
          if(nonnegative(record.outputBytes))safe.outputBytes=record.outputBytes;
          if(typeof record.outputSha256==='string'&&/^[a-f0-9]{64}$/i.test(record.outputSha256))safe.outputSha256=record.outputSha256;
        }
      }
      toolRecords.push(safe);
    }
  }
  return {
    task:{id,status:STATUSES.has(task.status)?task.status:'unknown',collected:task.collected===true,
      hasSavedArtifact:typeof task.artifact==='string'&&existsSync(task.artifact)},
    audit:{availability:present?'present':'not_observed',capture:{runStarts,timestampRange:first===null?null:{first,last}},
      toolRecords,globalTransportFailures,unassignedToolCalls,malformedLineCount},
    interpretation:'not_observed is not proof of platform cause; audit coverage may be disabled, partial or rotated. Transport failures and unassigned tool calls are unscoped; invalid-token calls cannot be assigned to a task. Artifact existence is not hash verification.',
  };
}

if(process.argv[1]&&process.argv[1]!=='-'&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    if(process.argv.length!==3)throw Error('usage: diagnose.mjs <task-id>');
    console.log(JSON.stringify(diagnoseTask(process.argv[2])));
  } catch(error) {
    const allowed=new Set(['usage: diagnose.mjs <task-id>','invalid task ID','unknown task','task state unavailable','diagnostic data unavailable','diagnostic file exceeds safe read limit']);
    console.error('WebGPT diagnose: '+(allowed.has(error.message)?error.message:'diagnosis unavailable'));
    process.exitCode=1;
  }
}
