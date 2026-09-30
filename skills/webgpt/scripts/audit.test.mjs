import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {start} from './worker.mjs';

async function fixture(t,options={}) {
  const dir=mkdtempSync(join(tmpdir(),'webgpt-audit-'));
  const service=await start({dir,port:0,controlPort:0,...options});
  t.after(async()=>{await service.close();rmSync(dir,{recursive:true,force:true});});
  const log=join(dir,'mcp-audit.jsonl');
  const register=async data=>(await fetch(`http://127.0.0.1:${service.controlPort}/register`,{
    method:'POST',headers:{authorization:'Bearer '+service.key},body:JSON.stringify(data),
  })).json();
  const invoke=async(name,args={},path='/mcp')=>{
    const response=await fetch(`http://127.0.0.1:${service.mcpPort}${path}`,{
      method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:'CLIENT_ID_PRIVATE_CANARY',method:'tools/call',params:{name,arguments:args}}),
    });
    return {status:response.status,...await response.json()};
  };
  const records=()=>readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  return {dir,service,log,register,invoke,records};
}

test('MCP audit is opt-in and ignores requests rejected before tool entry',async t=>{
  const off=await fixture(t);
  await off.invoke('get_task',{token:'invalid'});
  assert.equal(existsSync(off.log),false);
  const on=await fixture(t,{audit:true});
  assert.equal((await on.invoke('submit_result',{},'/wrong-private-route')).status,404);
  assert.deepEqual(on.records().map(r=>r.phase),['started','http_received','http_completed']);
  assert.equal(on.records().at(-1).statusCode,404);
});

test('audit pairs success and failure with generated IDs while excluding private payloads',async t=>{
  const f=await fixture(t,{audit:true,publicMcp:true});
  const secret=readFileSync(join(f.dir,'mcp-path.key'),'utf8');
  const path='/mcp/'+secret;
  const task=await f.register({id:'audit-task',instructions:'INSTRUCTIONS_PRIVATE_CANARY',inputs:{input:'INPUT_PRIVATE_CANARY'}});
  const success=await f.invoke('get_task',{token:task.token,cwd:'CWD_PRIVATE_CANARY'},path);
  assert.equal(success.result.isError,false);
  const failure=await f.invoke('submit_result',{token:task.token,status:'invalid',summary:'SUMMARY_PRIVATE_CANARY',result:'RESULT_PRIVATE_CANARY'},path);
  assert.equal(failure.result.isError,true);
  await f.invoke('UNKNOWN_NAME_PRIVATE_CANARY',{token:'TOKEN_PRIVATE_CANARY'},path);
  const [start]=f.records();
  const rows=f.records().filter(r=>['received','completed'].includes(r.phase));
  assert.equal(start.phase,'started');assert.match(start.runId,/^[0-9a-f-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(start.timestamp)));
  assert.equal(rows.length,6);
  for(let i=0;i<rows.length;i+=2) {
    const received=rows[i],completed=rows[i+1];
    assert.equal(received.phase,'received');assert.equal(completed.phase,'completed');
    assert.match(received.requestId,/^[0-9a-f-]{36}$/);
    assert.equal(completed.requestId,received.requestId);
    assert.ok(Number.isFinite(Date.parse(received.timestamp)));
    assert.ok(completed.durationMs>=0);
    assert.equal(completed.isError,i!==0);
    const allowed=['requestId','transportId','runId','tool','taskId','phase','timestamp','isError','durationMs'];
    for(const row of [received,completed]) {
      assert.ok(Object.keys(row).every(key=>allowed.includes(key)));
      assert.equal(row.runId,start.runId);
    }
    const transport=f.records().filter(r=>r.transportId===received.transportId&&r.phase.startsWith('http_'));
    assert.deepEqual(transport.map(r=>r.phase),['http_received','http_completed']);
    assert.equal(transport[1].aborted,false);assert.equal(transport[1].statusCode,200);
  }
  assert.equal(new Set(rows.filter(r=>r.phase==='received').map(r=>r.requestId)).size,3);
  assert.equal(rows[0].taskId,'audit-task');assert.equal(rows[2].taskId,'audit-task');
  assert.equal(rows[4].tool,'unknown');assert.equal(Object.hasOwn(rows[4],'taskId'),false);
  const raw=readFileSync(f.log,'utf8');
  for(const value of ['PRIVATE_CANARY',task.token,secret,f.service.key,f.dir,'invalid result'])assert.equal(raw.includes(value),false);
  if(process.platform!=='win32')assert.equal(statSync(f.log).mode&0o777,0o600);
});

test('open-session audit identifies its task without recording the connection capability',async t=>{
  const f=await fixture(t,{audit:true});
  const task=await f.register({id:'audit-open',mode:'open',instructions:'',inputs:{},terminal:{cwd:f.dir}});
  // Open sessions reject this tool, but the request still reached the authenticated route.
  const response=await f.invoke('submit_result',{},task.connectionPath);
  assert.equal(response.result.isError,true);
  assert.deepEqual(f.records().filter(r=>r.phase==='received'||r.phase==='completed').map(r=>r.taskId),['audit-open','audit-open']);
  const raw=readFileSync(f.log,'utf8');
  assert.equal(raw.includes(task.token),false);assert.equal(raw.includes(task.connectionPath),false);
});

test('audit rotates at one MiB and retains only one previous file',async t=>{
  const f=await fixture(t,{audit:true});
  const limit=1024*1024;
  writeFileSync(f.log,'a'.repeat(limit),{mode:0o600});
  await f.invoke('get_task',{token:'invalid'});
  assert.equal(statSync(f.log+'.1').size,limit);
  assert.ok(statSync(f.log).size<limit);
  writeFileSync(f.log,'b'.repeat(limit));
  await f.invoke('get_task',{token:'invalid'});
  assert.equal(readFileSync(f.log+'.1','utf8'),'b'.repeat(limit));
  assert.equal(existsSync(f.log+'.2'),false);
  assert.equal(f.records().length,4);
});

test('audit I/O failure emits one sanitized warning and preserves tool outcomes',async t=>{
  const f=await fixture(t,{audit:true});
  const task=await f.register({id:'audit-failure',instructions:'PRIVATE_CANARY',inputs:{}});
  rmSync(f.log);
  mkdirSync(f.log);
  const original=console.error,warnings=[];
  console.error=(...args)=>warnings.push(args.join(' '));
  try {
    assert.equal((await f.invoke('get_task',{token:task.token})).result.isError,false);
    assert.equal((await f.invoke('get_task',{token:'invalid'})).result.isError,true);
  } finally {console.error=original;}
  assert.deepEqual(warnings,['WebGPT MCP audit write failed; tool execution is unaffected.']);
});

test('terminal audit stores only execution status and output fingerprint',async t=>{
  const f=await fixture(t,{audit:true});
  const task=await f.register({id:'audit-terminal',instructions:'',inputs:{},terminal:{cwd:f.dir}});
  // cmd.exe has no printf, and Windows machines rarely have Git's usr/bin on PATH.
  const command=process.platform==='win32'
    ? `node -e "process.stdout.write('OUTPUT_PRIVATE_CANARY')"`
    : "printf 'OUTPUT_PRIVATE_CANARY'";
  const response=await f.invoke('exec_command',{token:task.token,command,yield_ms:1000});
  let out=response.result.structuredContent;
  while(out.running)out=(await f.invoke('write_stdin',{token:task.token,session_id:out.session_id,yield_ms:1000})).result.structuredContent;
  const completed=f.records().filter(r=>r.phase==='completed');
  assert.ok(completed.some(r=>r.outputBytes===Buffer.byteLength('OUTPUT_PRIVATE_CANARY')&&r.outputSha256===createHash('sha256').update('OUTPUT_PRIVATE_CANARY').digest('hex')));
  assert.equal(completed.at(-1).exit_code,0);assert.equal(completed.at(-1).running,false);
  const raw=readFileSync(f.log,'utf8');
  for(const value of ['OUTPUT_PRIVATE_CANARY',command,out.session_id,task.token,f.dir])assert.equal(raw.includes(value),false);
});

test('transport audit records malformed, origin-rejected and health requests without tool entry',async t=>{
  const f=await fixture(t,{audit:true});
  const url=`http://127.0.0.1:${f.service.mcpPort}`;
  const malformed=await fetch(url+'/mcp',{method:'POST',body:'BODY_PRIVATE_CANARY'});
  assert.equal(malformed.status,400);await malformed.text();
  const origin=await fetch(url+'/mcp',{method:'POST',headers:{origin:'https://HEADER_PRIVATE_CANARY.example'},body:'{}'});
  assert.equal(origin.status,403);await origin.text();
  const health=await fetch(url+'/health');assert.equal(health.status,200);await health.text();
  const other=await fetch(url+'/mcp',{method:'PUT'});assert.equal(other.status,405);await other.text();
  const rows=f.records().slice(1);
  assert.equal(rows.length,8);
  for(let i=0;i<rows.length;i+=2) {
    assert.equal(rows[i].phase,'http_received');assert.equal(rows[i+1].phase,'http_completed');
    assert.equal(rows[i].transportId,rows[i+1].transportId);
    assert.equal(rows[i+1].aborted,false);
    assert.equal(rows[i+1].statusCode,[400,403,200,405][i/2]);
    assert.equal(rows[i].method,['POST','POST','GET','OTHER'][i/2]);
  }
  const allowed=['transportId','method','phase','runId','timestamp','statusCode','aborted','durationMs'];
  assert.ok(rows.every(row=>Object.keys(row).every(key=>allowed.includes(key))));
  assert.equal(readFileSync(f.log,'utf8').includes('PRIVATE_CANARY'),false);
});

test('transport abort produces one outcome and no false tool receipt',async t=>{
  const f=await fixture(t,{audit:true});
  const req=httpRequest({host:'127.0.0.1',port:f.service.mcpPort,path:'/mcp',method:'POST',headers:{'content-length':100}});
  req.on('error',()=>{});
  t.after(()=>req.destroy());
  req.write('{');
  for(let i=0;i<100&&f.records().length<2;i++)await delay(10);
  assert.equal(f.records().at(-1).phase,'http_received');
  req.destroy();
  for(let i=0;i<100&&f.records().length<3;i++)await delay(10);
  const rows=f.records();
  assert.deepEqual(rows.map(r=>r.phase),['started','http_received','http_completed']);
  assert.equal(rows[2].transportId,rows[1].transportId);
  assert.equal(rows[2].aborted,true);assert.equal(rows[2].statusCode,null);
});
