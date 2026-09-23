import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {start} from './worker.mjs';
import {request,collectTask,finishTasks,resumeTask,readRequest} from './client.mjs';
import {Terminals} from './terminal.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

async function fixture(run) {
  const dir=mkdtempSync(join(tmpdir(),'webgpt-workflow-'));let clock=1000;
  let service=await start({dir,port:0,controlPort:0,now:()=>clock});
  const config={dataDir:dir,mcpPort:service.mcpPort,controlPort:service.controlPort};
  const admin=(action,args)=>request(action,args,config);
  const call=async(name,args)=>{
    const response=await fetch(`http://127.0.0.1:${config.mcpPort}/mcp`,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    return (await response.json()).result;
  };
  const restart=async()=>{await service.close();service=await start({dir,port:0,controlPort:0,now:()=>clock});Object.assign(config,{mcpPort:service.mcpPort,controlPort:service.controlPort});};
  try {await run({dir,config,admin,call,restart,advance:ms=>clock+=ms});}
  finally {await service.close();rmSync(dir,{recursive:true});}
}

test('scoped status is immediate, partial survives restart and collection revokes access',()=>fixture(async({admin,call,config,restart})=>{
  const a=await admin('register',{}),b=await admin('register',{});
  assert.deepEqual(await admin('status',{ids:[a.id]}),{events:[],backupDue:[],settled:false});
  const result={token:a.token,status:'partial',summary:'API done; UI remains',result:'PASS API tests; NOT_RUN UI; next: UI only'};
  assert.equal((await call('submit_result',result)).isError,false);
  await restart();
  assert.equal((await admin('status',{ids:[a.id]})).events[0].status,'partial');
  assert.deepEqual(await admin('status',{ids:[b.id]}),{events:[],backupDue:[],settled:false});
  assert.equal((await collectTask(a.id,config)).integrity,'verified');
  assert.equal((await call('get_task',{token:a.token})).isError,true);
  await assert.rejects(admin('status',{ids:['missing']}),/unknown task/);
  await admin('cancel',{id:b.id});
}));

test('task check interval persists across restart and checked never terminates work',()=>fixture(async({admin,advance,restart})=>{
  for(const backupMs of [0,-1,1.5,'100'])await assert.rejects(admin('register',{backupMs}),/positive integer/);
  const task=await admin('register',{backupMs:100});
  advance(100);assert.deepEqual((await admin('status',{ids:[task.id]})).backupDue,[task.id]);
  await admin('checked',{id:task.id});await restart();
  advance(99);assert.deepEqual((await admin('status',{ids:[task.id]})).backupDue,[]);
  advance(1);const status=await admin('status',{ids:[task.id]});assert.equal(status.settled,false);assert.deepEqual(status.backupDue,[task.id]);
  await admin('cancel',{id:task.id});
}));

test('duplicate result waits for commit, blocks new commands and reports cleanup failure',()=>fixture(async({admin,call,dir})=>{
  const task=await admin('register',{});
  const original=Terminals.prototype.stop;let entered,release;
  const enteredGate=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  Terminals.prototype.stop=async()=>{entered();await gate;throw Error('cleanup test failure');};
  const payload={token:task.token,status:'completed',summary:'done',result:'saved'};
  try {
    const first=call('submit_result',payload);await enteredGate;
    let replied=false;const duplicate=call('submit_result',payload).then(value=>{replied=true;return value;});
    assert.equal((await call('exec_command',{token:task.token,command:'echo forbidden'})).isError,true);
    assert.equal(replied,false);
    assert.equal(JSON.parse(readFileSync(join(dir,'state.json'),'utf8'))[0].status,'running');
    release();const results=await Promise.all([first,duplicate]);
    assert.equal(results[0].structuredContent.cleanupError,'cleanup test failure');
    assert.equal(results[1].structuredContent.duplicate,true);
    assert.equal(JSON.parse(readFileSync(join(dir,'state.json'),'utf8'))[0].status,'completed');
    assert.equal((await admin('status')).events[0].cleanupError,'cleanup test failure');
  } finally {release();Terminals.prototype.stop=original;}
}));

test('failed persistence does not turn a retried submission into a false success',()=>fixture(async({admin,call,dir})=>{
  const task=await admin('register',{});const payload={token:task.token,status:'completed',summary:'done',result:'saved'};
  mkdirSync(join(dir,'state.json.tmp'));
  assert.equal((await call('submit_result',payload)).isError,true);
  assert.equal((await call('submit_result',payload)).isError,true);
  assert.equal(JSON.parse(readFileSync(join(dir,'state.json'),'utf8'))[0].status,'running');
  rmSync(join(dir,'state.json.tmp'),{recursive:true});
  assert.equal((await call('submit_result',payload)).structuredContent.accepted,true);
}));

test('read retry is bounded, excludes permanent failures and can be disabled for mutations',async()=>{
  let calls=0;const sleep=async()=>{};
  const response=await readRequest(async()=>{calls++;if(calls<3)throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});return new Response('{}');},{sleep});
  assert.equal(response.status,200);assert.equal(calls,3);
  calls=0;await assert.rejects(readRequest(async()=>{calls++;throw new TypeError('fetch failed',{cause:{code:'ECONNREFUSED'}});},{sleep,retries:0}));assert.equal(calls,1);
  calls=0;assert.equal((await readRequest(async()=>{calls++;return new Response('{}',{status:401});},{sleep})).status,401);assert.equal(calls,1);
  calls=0;assert.equal((await readRequest(async()=>{calls++;return new Response('{}',{status:503});},{sleep})).status,503);assert.equal(calls,3);
  calls=0;await assert.rejects(readRequest(async()=>{calls++;throw new SyntaxError('bad JSON');},{sleep}));assert.equal(calls,1);
});


test('CLI accepts scoped status and an explicit task check interval',()=>fixture(async({dir,config,admin,advance})=>{
  const configPath=join(dir,'config.json');writeFileSync(configPath,JSON.stringify(config));
  const cli=async(...args)=>JSON.parse((await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./client.mjs',import.meta.url)),...args],{env:{...process.env,WEBGPT_CONFIG:configPath,WEBGPT_DATA_DIR:dir}})).stdout);
  const task=await cli('register','--cwd',dir,'--backup-ms','75');
  advance(75);const status=await cli('status',task.id);
  assert.deepEqual(status.backupDue,[task.id]);assert.equal(status.settled,false);
  await admin('cancel',{id:task.id});
}));


test('finish collects verified partial and failed bodies without another status request and revokes access',()=>fixture(async({admin,call,config})=>{
  const tasks=[];
  for(const status of ['partial','failed']) {
    const task=await admin('register',{});tasks.push(task);
    await call('submit_result',{token:task.token,status,summary:status,result:`${status} details — preserved`});
  }
  const actions=[];
  const snapshot=await finishTasks(tasks.map(t=>t.id),config,async(action,args,config)=>{
    actions.push(action);return request(action,args,config);
  });
  assert.deepEqual(actions,['wait','ack','ack']);
  assert.equal(snapshot.settled,true);
  assert.deepEqual(snapshot.events.map(e=>e.status),['partial','failed']);
  for(const [index,event] of snapshot.events.entries()) {
    assert.equal(event.result,`${event.status} details — preserved`);
    assert.equal(event.integrity,'verified');assert.equal(event.collected,true);
    assert.equal((await call('get_task',{token:tasks[index].token})).isError,true);
  }
}));

test('finish integrity mismatch never acknowledges or retires the result',()=>fixture(async({admin,call,config})=>{
  const task=await admin('register',{});
  await call('submit_result',{token:task.token,status:'completed',summary:'done',result:'original'});
  const event=(await admin('status',{ids:[task.id]})).events[0];
  writeFileSync(event.artifact,'tampered');
  const actions=[];
  await assert.rejects(finishTasks([task.id],config,async(action,args,config)=>{
    actions.push(action);return request(action,args,config);
  }),/integrity mismatch/);
  assert.deepEqual(actions,['wait']);
  assert.equal((await admin('status',{ids:[task.id]})).events.length,1);
}));

test('finish renews quiet waits but preserves backup, recovery and settled signals unchanged',async()=>{
  const idle={events:[],backupDue:[],settled:false};
  for(const actionable of [
    {events:[{id:'done'}],backupDue:['running'],settled:false},
    {events:[],backupDue:[],recoveryRequired:['running'],settled:false},
    {events:[],backupDue:[],settled:true},
  ]) {
    let calls=0;
    const result=await finishTasks(['running'],{},async action=>{
      assert.equal(action,'wait');return ++calls===1?idle:actionable;
    });
    assert.equal(result,actionable);assert.equal(calls,2);
  }
});

test('finish preserves cleanup errors and does not retry failed acknowledgements',()=>fixture(async({admin,call,config})=>{
  const task=await admin('register',{});
  await call('submit_result',{token:task.token,status:'completed',summary:'done',result:'saved'});
  const snapshot=await admin('status',{ids:[task.id]});
  snapshot.events[0].cleanupError='cleanup remains unresolved';
  let acknowledgements=0;
  const control=async(action,args)=>action==='wait'?snapshot:(acknowledgements++,{ok:true});
  const result=await finishTasks([task.id],config,control);
  assert.equal(result.events[0].cleanupError,'cleanup remains unresolved');
  assert.equal(acknowledgements,1);
  acknowledgements=0;
  await assert.rejects(finishTasks([task.id],config,async action=>{
    if(action==='wait')return snapshot;
    acknowledgements++;throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});
  }),/fetch failed/);
  assert.equal(acknowledgements,1);
}));

test('CLI finish returns verified result body',()=>fixture(async({dir,config,admin,call})=>{
  const task=await admin('register',{});
  await call('submit_result',{token:task.token,status:'completed',summary:'done',result:'CLI result'});
  const configPath=join(dir,'config.json');writeFileSync(configPath,JSON.stringify(config));
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./client.mjs',import.meta.url)),'finish',task.id],{env:{...process.env,WEBGPT_CONFIG:configPath,WEBGPT_DATA_DIR:dir}});
  const result=JSON.parse(stdout);
  assert.equal(result.events[0].result,'CLI result');assert.equal(result.events[0].collected,true);
  assert.equal((await admin('status',{ids:[task.id]})).events.length,0);
}));


test('resume acknowledges only the checked task then quietly finishes it',()=>fixture(async({admin,call,config,advance,dir})=>{
  const task=await admin('register',{backupMs:100}),other=await admin('register',{backupMs:100});
  advance(100);
  const actions=[];
  const result=await resumeTask(task.id,config,async(action,args,cfg)=>{
    actions.push(action);
    if(action==='checked') {
      assert.deepEqual(args,{id:task.id});
      const acknowledged=await request(action,args,cfg);
      const states=JSON.parse(readFileSync(join(dir,'state.json'),'utf8'));
      assert.equal(states.find(t=>t.id===task.id).nextCheck,1200);
      assert.equal(states.find(t=>t.id===other.id).nextCheck,1100);
      await call('submit_result',{token:task.token,status:'completed',summary:'done',result:'resumed result'});
      return acknowledged;
    }
    return request(action,args,cfg);
  });
  assert.deepEqual(actions,['checked','wait','ack']);
  assert.equal(result.events[0].result,'resumed result');
  assert.equal(result.events[0].collected,true);
  assert.deepEqual((await admin('status',{ids:[other.id]})).backupDue,[other.id]);
  await admin('cancel',{id:other.id});
}));

test('resume collects completion racing the check without rescheduling the terminal task',()=>fixture(async({admin,call,config,advance,dir})=>{
  const task=await admin('register',{backupMs:100});advance(100);
  const actions=[];
  const result=await resumeTask(task.id,config,async(action,args,cfg)=>{
    actions.push(action);
    if(action==='checked')await call('submit_result',{token:task.token,status:'partial',summary:'remaining scope',result:'saved before check'});
    return request(action,args,cfg);
  });
  assert.deepEqual(actions,['checked','wait','ack']);
  assert.equal(result.events[0].status,'partial');
  assert.equal(result.events[0].result,'saved before check');
  assert.equal(JSON.parse(readFileSync(join(dir,'state.json'),'utf8'))[0].nextCheck,null);
}));

test('resume does not retry a failed check acknowledgment or continue waiting',async()=>{
  const actions=[];
  await assert.rejects(resumeTask('checked-task',{},async(action)=>{
    actions.push(action);throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});
  }),/fetch failed/);
  assert.deepEqual(actions,['checked']);
  for(const id of [undefined,'',[],['one','two']])await assert.rejects(resumeTask(id,{},async()=>assert.fail('unexpected request')),/one task ID/);
});

test('CLI resume accepts exactly one ID and collects an already completed task',()=>fixture(async({dir,config,admin,call})=>{
  const task=await admin('register',{});
  await call('submit_result',{token:task.token,status:'completed',summary:'done',result:'CLI resumed'});
  const configPath=join(dir,'config.json');writeFileSync(configPath,JSON.stringify(config));
  const cli=(...args)=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('./client.mjs',import.meta.url)),'resume',...args],{env:{...process.env,WEBGPT_CONFIG:configPath,WEBGPT_DATA_DIR:dir}});
  await assert.rejects(cli(),/usage: client.mjs resume/);
  await assert.rejects(cli(task.id,'another'),/usage: client.mjs resume/);
  const result=JSON.parse((await cli(task.id)).stdout);
  assert.equal(result.events[0].result,'CLI resumed');assert.equal(result.events[0].collected,true);
  assert.equal((await admin('status',{ids:[task.id]})).events.length,0);
}));
