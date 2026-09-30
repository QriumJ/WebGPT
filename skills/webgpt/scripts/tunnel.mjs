import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,renameSync,unlinkSync,realpathSync,readFileSync} from 'node:fs';
import {hostname} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {configuration} from './client.mjs';
import {acquireTunnelLock} from './lock.mjs';

// Keep logs private and bounded. Require a complete delimited origin, not a URL
// prefix followed by a path, port, query, userinfo or another domain suffix.
export function originParser(onOrigin, limit=8192) {
  if(!Number.isInteger(limit)||limit<256)throw Error('invalid log buffer bound');
  let buffered='';
  const scan=final=>{
    const boundary = `[\\s|"'<>)]`;
    const ending = final ? `(?=${boundary}|$)` : `(?=${boundary})`;
    const pattern = new RegExp(`(?:^|[\\s|"'<>(])(https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.trycloudflare\\.com)${ending}`, 'g');
    let consumed=0;
    for(const match of buffered.matchAll(pattern)){onOrigin(match[1]);consumed=match.index+match[0].length;}
    if(consumed)buffered=buffered.slice(consumed);
  };
  return {
    push(chunk){
      const text=chunk.toString(),step=Math.floor(limit/2);
      for(let offset=0;offset<text.length;offset+=step){
        buffered=(buffered+text.slice(offset,offset+step)).slice(-limit);scan(false);
      }
    },
    end(){scan(true);buffered='';},
  };
}

export function saveTunnelState(dataDir,state) {
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const target=join(dataDir,'tunnel.json'),temporary=join(dataDir,`.tunnel-${process.pid}-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary,JSON.stringify(state)+'\n',{mode:0o600,flag:'wx'});
    renameSync(temporary,target);
  } finally {
    try {unlinkSync(temporary);} catch(error) {if(error.code!=='ENOENT')throw error;}
  }
}

// No shell interpolation or publicOrigin mutation. The caller owns this wrapper
// and its child, and installs its own signal handlers around stop().
export function startTunnel(binary,config=configuration(),{
  spawnChild=spawn,pid=process.pid,graceMs=3000,killWaitMs=1000,onState=()=>{},lockProbe,
}={}) {
  if(typeof binary!=='string'||!isAbsolute(binary))throw Error('cloudflared path must be absolute');
  if(!Number.isInteger(graceMs)||graceMs<0||!Number.isInteger(killWaitMs)||killWaitMs<0)throw Error('invalid shutdown bounds');
  mkdirSync(config.dataDir,{recursive:true,mode:0o700});
  const lock=join(config.dataDir,'tunnel.lock');
  const owner=JSON.stringify({pid,nonce:randomUUID(),host:hostname()});
  // Replaces only a provably stale lock (wrapper and child gone, or previous boot); see lock.mjs.
  let recoveredLock;
  try {recoveredLock=acquireTunnelLock(lock,owner,lockProbe);}
  catch(error) {
    if(error.code==='EEXIST')throw Error('tunnel owner lock exists; inspect the owner before removing a stale lock');
    throw error;
  }
  const ownsLock=()=>{try{return readFileSync(lock,'utf8')===owner;}catch{return false;}};
  const release=()=>{if(ownsLock())unlinkSync(lock);};
  let child,finished=false,stopping=false,origin,graceTimer,killTimer;
  let resolveDone;
  const done=new Promise(resolve=>resolveDone=resolve);
  const publish=status=>{
    if(!ownsLock())throw Error('tunnel ownership lost');
    const state={version:1,status,...(status==='running'?{origin}:{}),pid};
    saveTunnelState(config.dataDir,state);onState({status});
  };
  const finish=(result={})=>{
    if(finished)return;
    const retainLock=result.error==='tunnel shutdown unconfirmed';
    finished=true;clearTimeout(graceTimer);clearTimeout(killTimer);
    try {publish('stopped');} catch {result={...result,error:'state persistence failed'};}
    if(!retainLock) {
      try {release();} catch {result={...result,error:'owner lock cleanup failed'};}
    }
    resolveDone(result);
  };
  try {publish('starting');} catch(error) {release();throw error;} // Clear stale origins before starting.
  try {
    child=spawnChild(binary,['tunnel','--url',`http://127.0.0.1:${config.mcpPort}`],{shell:false,stdio:['ignore','pipe','pipe'],windowsHide:true});
  } catch {finish({error:'tunnel launch failed'});return {done,stop:()=>done,...(recoveredLock?{recoveredLock}:{})};}
  const discovered=value=>{
    if(finished||stopping||origin)return;
    origin=value;
    try {publish('running');} catch {stop('SIGTERM');}
  };
  for(const stream of [child.stdout,child.stderr]) {
    const parser=originParser(discovered);
    stream?.on('data',chunk=>parser.push(chunk));
    stream?.on('end',()=>parser.end());
  }
  child.once('error',()=>{
    if(child.pid&&!finished)stop('SIGTERM');
    else finish({error:'tunnel launch failed'});
  });
  child.once('exit',(code,signal)=>finish({code,signal}));
  function stop(signal='SIGTERM') {
    if(!['SIGINT','SIGTERM'].includes(signal))throw Error('invalid shutdown signal');
    if(finished||stopping)return done;
    stopping=true;
    try {child.kill(signal);} catch {}
    if(finished)return done;
    graceTimer=setTimeout(()=>{
      try {child.kill('SIGKILL');} catch {}
      if(finished)return;
      killTimer=setTimeout(()=>{
        child.stdout?.destroy();child.stderr?.destroy();child.unref?.();
        finish({error:'tunnel shutdown unconfirmed'});
      },killWaitMs);
    },graceMs);
    return done;
  }
  return {done,stop,...(recoveredLock?{recoveredLock}:{})};
}

if(process.argv[1]&&process.argv[1]!=='-'&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    if(process.argv.length!==3)throw Error('usage: tunnel.mjs /absolute/cloudflared');
    const tunnel=startTunnel(process.argv[2],configuration(),{onState:state=>console.log(JSON.stringify(state))});
    if(tunnel.recoveredLock)console.log(JSON.stringify({recoveredStaleLock:tunnel.recoveredLock}));
    const interrupt=()=>tunnel.stop('SIGINT'),terminate=()=>tunnel.stop('SIGTERM');
    process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
    const result=await tunnel.done;
    process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);
    if(result.error||result.code)process.exitCode=1;
  } catch(error) {
    console.error(error.message?.startsWith('tunnel owner lock exists')
      ? 'WebGPT tunnel: owner lock exists; inspect its owner before removing a stale lock'
      : 'WebGPT tunnel: startup failed; check configuration and executable path');
    process.exitCode=1;
  }
}
