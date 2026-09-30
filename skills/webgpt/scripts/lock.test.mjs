import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync,existsSync,utimesSync} from 'node:fs';
import {tmpdir,hostname} from 'node:os';
import {join} from 'node:path';
import {acquireWorkerLock,acquireTunnelLock,staleWorkerLock,staleTunnelLock,processAlive,childCount} from './lock.mjs';
import {start} from './worker.mjs';

const hour=3600000;
// Deterministic evidence: booted an hour ago, owner exited, child list unknown.
const probe=overrides=>({host:hostname(),pid:process.pid,now:Date.now(),boot:Date.now()-hour,alive:()=>false,children:()=>null,...overrides});
const record=(pid,host=hostname())=>JSON.stringify({pid,host});
const tempDir=()=>mkdtempSync(join(tmpdir(),'webgpt-lock-'));
const age=(path,ms)=>{const past=new Date(Date.now()-ms);utimesSync(path,past,past);};

test('worker lock is stale only on this host with an exited owner or a previous boot',()=>{
  const now=Date.now(),fresh=now-1000,old=now-2*hour,p=probe({now,boot:now-hour});
  assert.equal(staleWorkerLock({text:record(999999999),mtimeMs:fresh},p),'owner_exited');
  assert.equal(staleWorkerLock({text:record(999999999),mtimeMs:old},{...p,alive:()=>true}),'previous_boot');
  assert.equal(staleWorkerLock({text:record(999999999),mtimeMs:fresh},{...p,alive:()=>true}),null);
  assert.equal(staleWorkerLock({text:record(process.pid),mtimeMs:fresh},p),null);
  assert.equal(staleWorkerLock({text:record(999999999,'elsewhere'),mtimeMs:old},p),null);
  assert.equal(staleWorkerLock({text:'{',mtimeMs:fresh},p),null);
  assert.equal(staleWorkerLock({text:'{',mtimeMs:old},p),'previous_boot');
  // owner.json follows mkdir immediately, so only an old empty lock directory is incomplete.
  assert.equal(staleWorkerLock({text:null,mtimeMs:now-5000},p),null);
  assert.equal(staleWorkerLock({text:null,mtimeMs:now-120000},p),'incomplete');
  // Locks written within the boot margin are judged by their owner PID alone.
  assert.equal(staleWorkerLock({text:record(999999999),mtimeMs:now-hour-60000},{...p,alive:()=>true}),null);
});

test('tunnel lock also needs no surviving child, unless it predates boot with an unknown child list',()=>{
  const now=Date.now(),fresh=now-1000,old=now-2*hour,p=probe({now,boot:now-hour});
  const legacy=JSON.stringify({pid:999999999,nonce:'n'});
  assert.equal(staleTunnelLock({text:legacy,mtimeMs:fresh},{...p,children:()=>0}),'owner_exited');
  assert.equal(staleTunnelLock({text:legacy,mtimeMs:fresh},p),null);
  assert.equal(staleTunnelLock({text:legacy,mtimeMs:fresh},{...p,children:()=>1}),null);
  assert.equal(staleTunnelLock({text:legacy,mtimeMs:old},p),'previous_boot');
  assert.equal(staleTunnelLock({text:legacy,mtimeMs:old},{...p,children:()=>1}),null);
  assert.equal(staleTunnelLock({text:legacy,mtimeMs:old},{...p,alive:()=>true}),null);
  assert.equal(staleTunnelLock({text:JSON.stringify({pid:process.pid,nonce:'n'}),mtimeMs:old},p),null);
  assert.equal(staleTunnelLock({text:JSON.stringify({pid:999999999,nonce:'n',host:'elsewhere'}),mtimeMs:old},{...p,children:()=>0}),null);
  assert.equal(staleTunnelLock({text:'',mtimeMs:fresh},{...p,children:()=>0}),null);
  assert.equal(staleTunnelLock({text:'',mtimeMs:old},p),'previous_boot');
});

test('worker start replaces only a provably stale lock and reports why',async()=>{
  const dir=tempDir(),lock=join(dir,'worker.lock'),ownerFile=join(lock,'owner.json');
  try {
    mkdirSync(lock);writeFileSync(ownerFile,record(999999999));
    await assert.rejects(start({dir,port:0,controlPort:0,lockProbe:()=>probe({alive:()=>true})}),/data directory locked/);
    assert.equal(readFileSync(ownerFile,'utf8'),record(999999999));
    const service=await start({dir,port:0,controlPort:0,lockProbe:()=>probe()});
    try {
      assert.equal(service.recoveredLock,'owner_exited');
      assert.deepEqual(JSON.parse(readFileSync(ownerFile,'utf8')),{pid:process.pid,host:hostname()});
      assert.equal(readdirSync(dir).some(name=>name.includes('.stale-')),false);
      // The running Worker's own lock is never stale.
      await assert.rejects(start({dir,port:0,controlPort:0}),/data directory locked/);
    } finally {await service.close();}
    assert.equal(existsSync(lock),false);
    const clean=await start({dir,port:0,controlPort:0});
    assert.equal(clean.recoveredLock,undefined);await clean.close();
    // An empty lock directory left by an interrupted acquisition or release.
    mkdirSync(lock);age(lock,120000);
    assert.equal(acquireWorkerLock(lock,()=>probe()),'incomplete');
    assert.deepEqual(readdirSync(lock),[]);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('a lock replaced by a new owner after inspection is restored, not removed',()=>{
  const dir=tempDir();
  try {
    const lock=join(dir,'worker.lock'),ownerFile=join(lock,'owner.json'),replaced=record(999999998);
    mkdirSync(lock);writeFileSync(ownerFile,record(999999999));
    assert.throws(()=>acquireWorkerLock(lock,()=>{writeFileSync(ownerFile,replaced);return probe();}),{code:'EEXIST'});
    assert.equal(readFileSync(ownerFile,'utf8'),replaced);
    const tunnelLock=join(dir,'tunnel.lock'),next=JSON.stringify({pid:999999998,nonce:'new'});
    writeFileSync(tunnelLock,JSON.stringify({pid:999999999,nonce:'old'}));
    assert.throws(()=>acquireTunnelLock(tunnelLock,'{}',()=>{writeFileSync(tunnelLock,next);return probe({children:()=>0});}),{code:'EEXIST'});
    assert.equal(readFileSync(tunnelLock,'utf8'),next);
    assert.deepEqual(readdirSync(dir).sort(),['tunnel.lock','worker.lock']);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('process probe distinguishes live and exited PIDs',()=>{
  assert.equal(processAlive(process.pid),true);
  assert.equal(processAlive(999999999),false);
  if(process.platform!=='win32')assert.equal(childCount(process.pid),null);
});

test('Windows child probe still sees an orphan after its parent exits',{timeout:60000,skip:process.platform!=='win32'&&'POSIX reparents orphans, so childCount is unknown there'},async()=>{
  // Node's job object kills non-detached children with their parent; a detached one escapes it.
  const script="const c=require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'ignore',detached:true});console.log(c.pid);setTimeout(()=>{},60000)";
  const parent=spawn(process.execPath,['-e',script],{stdio:['ignore','pipe','ignore'],windowsHide:true});
  let orphan;
  try {
    orphan=Number(await new Promise((resolve,reject)=>{parent.stdout.once('data',data=>resolve(String(data).trim()));parent.once('error',reject);}));
    assert.ok(childCount(parent.pid)>=1);
    parent.kill();await new Promise(resolve=>parent.once('exit',resolve));
    assert.equal(processAlive(parent.pid),false);
    assert.ok(childCount(parent.pid)>=1,'an orphan keeps its parent PID on Windows');
    process.kill(orphan);
    let children;
    for(let attempt=0;attempt<20&&(children=childCount(parent.pid))!==0;attempt++)await new Promise(resolve=>setTimeout(resolve,250));
    assert.equal(children,0);
    assert.equal(childCount(999999999),0);
  } finally {
    try {parent.kill();} catch {}
    if(orphan)try {process.kill(orphan);} catch {}
  }
});
