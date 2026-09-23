import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync,readFileSync,writeFileSync,statSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {originParser,startTunnel} from './tunnel.mjs';

function fixture() {
  const dataDir=mkdtempSync(join(tmpdir(),'webgpt-tunnel-'));
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.signals=[];
  child.kill=signal=>{child.signals.push(signal);return true;};child.unref=()=>{child.unreferenced=true;};
  const config={dataDir,mcpPort:43137,publicOrigin:'https://verified.example'};
  return {dataDir,child,config,state:()=>JSON.parse(readFileSync(join(dataDir,'tunnel.json'),'utf8')),cleanup:()=>rmSync(dataDir,{recursive:true,force:true})};
}

test('origin parser handles chunk boundaries and refuses prefixes, credentials and invalid labels',()=>{
  const origins=[];const parser=originParser(value=>origins.push(value));
  for(const invalid of [
    'http://abc.trycloudflare.com','https://-abc.trycloudflare.com','https://abc-.trycloudflare.com',
    `https://${'a'.repeat(64)}.trycloudflare.com`,'https://abc.trycloudflare.com.evil',
    'https://abc.trycloudflare.com/path','https://abc.trycloudflare.com:443',
    'https://user@abc.trycloudflare.com','https://abc.trycloudflare.com?key=secret',
  ])parser.push(invalid+'\n');
  assert.deepEqual(origins,[]);
  parser.push('log https://split-');parser.push('origin.trycloudflare.co');parser.push('m');
  assert.deepEqual(origins,[]);
  parser.push(' |\n');assert.equal(origins[0],'https://split-origin.trycloudflare.com');
  const ended=[];const last=originParser(value=>ended.push(value));last.push('https://a.trycloudflare.com');last.end();
  assert.deepEqual(ended,['https://a.trycloudflare.com']);
});

test('large noise is bounded and does not prevent a later split origin',()=>{
  const values=[];const parser=originParser(value=>values.push(value));
  parser.push('x'.repeat(1000000)+'\nhttps://later-');parser.push('origin.trycloudflare.com\n');
  assert.equal(values[0],'https://later-origin.trycloudflare.com');
  parser.push('x'.repeat(100000)+'\nhttps://middle.trycloudflare.com\n'+'x'.repeat(100000));
  assert.deepEqual(values,['https://later-origin.trycloudflare.com','https://middle.trycloudflare.com']);
});

test('lifecycle clears stale origin, publishes private running state and never changes verified config',async()=>{
  const f=fixture();
  try {
    writeFileSync(join(f.dataDir,'tunnel.json'),JSON.stringify({version:1,status:'running',origin:'https://stale.trycloudflare.com',pid:9}));
    const configPath=join(f.dataDir,'config.json');writeFileSync(configPath,JSON.stringify(f.config));
    const original=readFileSync(configPath,'utf8');const calls=[],states=[];
    const tunnel=startTunnel('/fake/cloudflared',f.config,{pid:123,spawnChild:(...args)=>{calls.push(args);return f.child;},onState:value=>states.push(value)});
    assert.deepEqual(f.state(),{version:1,status:'starting',pid:123});
    assert.deepEqual(calls,[['/fake/cloudflared',['tunnel','--url','http://127.0.0.1:43137'],{shell:false,stdio:['ignore','pipe','pipe']}] ]);
    f.child.stdout.write('irrelevant secret log\n');
    f.child.stderr.write('INF | https://fresh-');f.child.stderr.write('origin.trycloudflare.com |\n');
    assert.deepEqual(f.state(),{version:1,status:'running',origin:'https://fresh-origin.trycloudflare.com',pid:123});
    // Windows does not expose POSIX owner/group permission bits.
    if(process.platform!=='win32')assert.equal(statSync(join(f.dataDir,'tunnel.json')).mode&0o777,0o600);
    assert.equal(readFileSync(configPath,'utf8'),original);
    assert.deepEqual(states,[{status:'starting'},{status:'running'}]);
    f.child.emit('exit',0,null);assert.deepEqual(await tunnel.done,{code:0,signal:null});
    assert.deepEqual(f.state(),{version:1,status:'stopped',pid:123});
    assert.equal(readdirSync(f.dataDir).some(name=>name.endsWith('.tmp')),false);
  } finally {f.cleanup();}
});

test('launch exceptions and asynchronous errors produce stopped state without raw errors',async()=>{
  for(const synchronous of [true,false]) {
    const f=fixture();
    try {
      const tunnel=startTunnel('/fake/cloudflared',f.config,{spawnChild:()=>{
        if(synchronous)throw Error('secret launch detail');return f.child;
      }});
      if(!synchronous)f.child.emit('error',Error('secret launch detail'));
      assert.deepEqual(await tunnel.done,{error:'tunnel launch failed'});
      assert.equal(f.state().status,'stopped');assert.equal(f.state().origin,undefined);
    } finally {f.cleanup();}
  }
});

test('shutdown forwards the requested signal once and stops cleanly on child exit',async()=>{
  const f=fixture();
  try {
    const tunnel=startTunnel('/fake/cloudflared',f.config,{spawnChild:()=>f.child,graceMs:10,killWaitMs:10});
    const done=tunnel.stop('SIGINT');assert.equal(tunnel.stop('SIGTERM'),done);
    f.child.emit('exit',null,'SIGINT');
    assert.deepEqual(await done,{code:null,signal:'SIGINT'});
    assert.deepEqual(f.child.signals,['SIGINT']);assert.equal(f.state().status,'stopped');
  } finally {f.cleanup();}
});

test('unresponsive child shutdown escalates and settles within bounded time',async()=>{
  const f=fixture();
  try {
    const tunnel=startTunnel('/fake/cloudflared',f.config,{spawnChild:()=>f.child,graceMs:1,killWaitMs:1});
    const result=await tunnel.stop();
    assert.deepEqual(result,{error:'tunnel shutdown unconfirmed'});
    assert.deepEqual(f.child.signals,['SIGTERM','SIGKILL']);assert.equal(f.child.unreferenced,true);
    assert.equal(f.child.stdout.destroyed,true);assert.equal(f.state().status,'stopped');
    assert.equal(readdirSync(f.dataDir).includes('tunnel.lock'),true);
    assert.throws(()=>startTunnel('/fake/cloudflared',f.config,{spawnChild:()=>assert.fail('duplicate launch')}),/owner lock exists/);
    f.child.emit('exit',0,null);assert.deepEqual(await tunnel.done,result);
  } finally {f.cleanup();}
});


test('exclusive ownership rejects live and stale locks before spawning or changing state',async()=>{
  const f=fixture();
  try {
    let spawns=0;
    const spawnChild=()=>{spawns++;return f.child;};
    const tunnel=startTunnel('/fake/cloudflared',f.config,{spawnChild});
    f.child.stderr.write('https://owned.trycloudflare.com\n');
    const current=readFileSync(join(f.dataDir,'tunnel.json'),'utf8');
    assert.throws(()=>startTunnel('/fake/cloudflared',f.config,{spawnChild}),/owner lock exists/);
    assert.equal(spawns,1);assert.equal(readFileSync(join(f.dataDir,'tunnel.json'),'utf8'),current);
    f.child.emit('exit',0,null);await tunnel.done;
    assert.equal(readdirSync(f.dataDir).includes('tunnel.lock'),false);
    writeFileSync(join(f.dataDir,'tunnel.lock'),JSON.stringify({pid:999999999,nonce:'stale'}));
    assert.throws(()=>startTunnel('/fake/cloudflared',f.config,{spawnChild}),/owner lock exists/);
    assert.equal(spawns,1);assert.equal(f.state().status,'stopped');
  } finally {f.cleanup();}
});
