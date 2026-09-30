import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,renameSync,rmSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {hostname,uptime} from 'node:os';
import {join} from 'node:path';

// Windows ends user processes at logoff, shutdown and Fast Startup without running their
// cleanup, so Worker and tunnel locks outlive their owners. Remove a lock only on proof
// that its owner is gone; anything uncertain keeps the supervised recovery in setup.md.
const BOOT_MARGIN_MS=120000; // Locks this close to boot are judged by PID alone (clock correction).
const INCOMPLETE_MS=60000; // The Worker writes owner.json right after creating its lock directory.

export function processAlive(pid) {
  try {process.kill(pid,0);return true;}
  catch(error) {return error.code==='EPERM';}
}

// Windows keeps a dead parent's PID on orphaned children; POSIX reparents them, so the
// answer there is unknown (null). A failed query is also unknown, never "no children".
// Node's job object normally ends a non-detached child with its parent; this proves it did.
export function childCount(pid) {
  if(process.platform!=='win32'||!Number.isSafeInteger(pid)||pid<=0)return null;
  try {
    const shell=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const query=`$ErrorActionPreference='Stop';@(Get-CimInstance -ClassName Win32_Process -Filter 'ParentProcessId=${pid}').Count`;
    const out=execFileSync(shell,['-NoProfile','-NonInteractive','-Command',query],
      {encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
    return /^\d+$/.test(out)?Number(out):null;
  } catch {return null;}
}

export function lockProbe() {
  const now=Date.now();
  return {host:hostname(),pid:process.pid,now,boot:now-uptime()*1000,alive:processAlive,children:childCount};
}

function owner(text) {
  try {const value=JSON.parse(text);return value&&Number.isSafeInteger(value.pid)&&value.pid>0?value:null;}
  catch {return null;}
}

// Evidence is the owner record and its timestamp; retire() compares both after taking the lock.
const fileEvidence=path=>({text:readFileSync(path,'utf8'),mtimeMs:statSync(path).mtimeMs});
function directoryEvidence(path) {
  try {return fileEvidence(join(path,'owner.json'));}
  catch(error) {if(error.code!=='ENOENT')throw error;}
  return {text:null,mtimeMs:statSync(path).mtimeMs};
}

// A same-host Worker lock is stale once its owner PID exited or it predates this boot.
// If a reused PID leaves only the boot rule, port binding still rejects a second live Worker.
export function staleWorkerLock({text,mtimeMs},probe) {
  const previousBoot=mtimeMs<probe.boot-BOOT_MARGIN_MS;
  if(text===null)return previousBoot?'previous_boot':probe.now-mtimeMs>=INCOMPLETE_MS?'incomplete':null;
  const found=owner(text);
  if(!found)return previousBoot?'previous_boot':null;
  if(found.host!==probe.host)return null;
  if(found.pid!==probe.pid&&!probe.alive(found.pid))return 'owner_exited';
  return previousBoot?'previous_boot':null;
}

// The wrapper deliberately keeps its lock when cloudflared may have survived shutdown, so a
// dead wrapper PID alone is not proof: also require no surviving child, or a previous boot.
export function staleTunnelLock({text,mtimeMs},probe) {
  const previousBoot=mtimeMs<probe.boot-BOOT_MARGIN_MS;
  const found=owner(text);
  if(!found)return previousBoot?'previous_boot':null;
  if(found.host!==undefined&&found.host!==probe.host)return null; // Older locks have no host.
  if(found.pid===probe.pid||probe.alive(found.pid))return null;
  const children=probe.children(found.pid);
  if(children===0)return 'owner_exited';
  return children===null&&previousBoot?'previous_boot':null;
}

// Move the inspected lock aside atomically, then confirm it is still the same record.
// A changed record belongs to a new owner: put it back and report the lock as held.
function retire(path,expected,inspect,restore) {
  const moved=`${path}.stale-${process.pid}-${randomUUID()}`;
  try {renameSync(path,moved);} catch(error) {return error.code==='ENOENT';}
  let same=false;
  try {const found=inspect(moved);same=found.text===expected.text&&found.mtimeMs===expected.mtimeMs;} catch {}
  if(same) {try {rmSync(moved,{recursive:true,force:true});} catch {} return true;} // A leftover copy is inert.
  try {restore(moved,path);} catch {}
  return false;
}

// Returns null, or the reason a stale lock was replaced. Rethrows the original EEXIST
// error whenever the owner may still be alive, so callers keep their existing messages.
function acquire(path,create,inspect,stale,restore,probe) {
  try {create();return null;}
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    let found,reason=null;
    try {found=inspect(path);}
    catch(inspectError) {if(inspectError.code!=='ENOENT')throw error;} // Released meanwhile: retry.
    if(found) {
      reason=stale(found,probe());
      if(!reason||!retire(path,found,inspect,restore))throw error;
    }
    create();
    return reason;
  }
}

export function acquireWorkerLock(lock,probe=lockProbe) {
  return acquire(lock,()=>mkdirSync(lock,{mode:0o700}),directoryEvidence,staleWorkerLock,
    (from,to)=>renameSync(from,to),probe);
}

export function acquireTunnelLock(lock,record,probe=lockProbe) {
  return acquire(lock,()=>writeFileSync(lock,record,{mode:0o600,flag:'wx'}),fileEvidence,staleTunnelLock,
    (from,to)=>{writeFileSync(to,readFileSync(from),{mode:0o600,flag:'wx'});unlinkSync(from);},probe);
}
