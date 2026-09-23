import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import * as pty from 'node-pty';

const execFileAsync = promisify(execFile);
const STOP_TIMEOUT_MS = 3000;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function processTable() {
  const {stdout} = await execFileAsync('ps', ['-axo', 'pid=,ppid=,pgid=,stat=,lstart='], {timeout:1000, maxBuffer:8 * 1024 * 1024});
  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const [pid, ppid, pgid, stat, ...started] = line.trim().split(/\s+/);
    return {pid:Number(pid), ppid:Number(ppid), pgid:Number(pgid), stat, started:started.join(' ')};
  });
}

function ownsOriginalGroup(session, table) {
  const root = table.find(p => p.pid === session.pid);
  // A reaped leader PID may have been reused. Never claim the new process group.
  return !root || Date.parse(root.started) <= session.created + 1000;
}

async function killOwned(session, signal, snapshot) {
  if (process.platform === 'win32') {if (!session.done) session.kill(signal); return;}
  const table = snapshot ?? await processTable();
  const originalGroup = ownsOriginalGroup(session, table);
  const owned = new Set(table.filter(p => session.owned.get(p.pid) === p.started).map(p => p.pid));
  if (originalGroup) for (const p of table) if (p.pgid === session.pid) owned.add(p.pid);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of table) if (owned.has(p.ppid) && !owned.has(p.pid)) {owned.add(p.pid); changed = true;}
  }
  // Signal the entire original group atomically, including children forked since ps.
  if (originalGroup && table.some(p => p.pgid === session.pid)) {
    session.groupSignaled = true;
    try {process.kill(-session.pid, signal);} catch (e) {if (e.code !== 'ESRCH') throw e;}
  }
  for (const p of table) {
    if (!owned.has(p.pid) || (session.owned.has(p.pid) && session.owned.get(p.pid) !== p.started)) continue;
    session.owned.set(p.pid, p.started);
    try {process.kill(p.pid, signal);} catch (e) {if (e.code !== 'ESRCH') throw e;}
  }
}

export function terminalGrant(input) {
  if (input == null) return null;
  if (typeof input.cwd !== 'string' || !isAbsolute(input.cwd)) throw Error('terminal.cwd must be absolute');
  const cwd = realpathSync(input.cwd);
  if (!statSync(cwd).isDirectory()) throw Error('terminal.cwd must be a directory');
  return { cwd };
}

// The cwd is a convenience, not a sandbox. Commands inherit the worker user's OS access.
export class Terminals {
  sessions = new Map();

  isRunning(owner) {
    return [...this.sessions.values()].some(s => s.owner === owner && !s.done);
  }

  async execute(owner, grant, {command, cwd, shell, tty = false, yield_ms = 1000}) {
    if (!grant) throw Error('terminal access not granted');
    if (typeof command !== 'string') throw Error('command must be a string');
    if (!Number.isFinite(yield_ms) || yield_ms < 0 || typeof tty !== 'boolean') throw Error('invalid terminal options');
    cwd ??= grant.cwd;
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw Error('cwd must be absolute');
    shell ??= process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/sh');
    const cmdShell = process.platform === 'win32' && /(?:^|[\\/])cmd(?:\.exe)?$/i.test(shell);
    const args = cmdShell ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command];
    const id = randomUUID();
    const session = {owner, output:'', exit_code:null, signal:null, done:false, listeners:new Set(), owned:new Map(), created:Date.now()};
    session.finished = new Promise(resolve => {session.finish = resolve;});
    const notify = () => { for (const f of [...session.listeners]) f(); };
    if (tty) {
      const child = pty.spawn(shell, cmdShell ? args.join(' ') : args, {cwd, env:process.env, name:'xterm-256color', cols:120, rows:30, useConptyDll:process.platform === 'win32'});
      session.pid = child.pid;
      session.write = text => child.write(text);
      session.kill = signal => {
        if(process.platform !== 'win32') child.kill(signal);
        else if(signal === 'SIGINT') child.write('\u0003');
        else child.kill();
      };
      child.onData(text => {session.output += text; notify();});
      child.onExit(({exitCode, signal}) => {session.done=true; session.exit_code=exitCode; session.signal=signal ?? null; session.finish(); notify();});
    } else {
      const child = spawn(shell, args, {cwd, env:process.env, windowsVerbatimArguments:cmdShell, detached:process.platform !== 'win32', stdio:'pipe'});
      session.pid = child.pid;
      session.write = text => child.stdin.write(text);
      session.kill = signal => {
        if (!child.pid) return;
        // Killing cmd.exe alone leaves its command alive and its pipes open on Windows.
        if (process.platform === 'win32') {
          const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});
          killer.on('error',()=>child.kill(signal));
        }
        else { try { process.kill(-child.pid, signal); } catch(e) { if(e.code !== 'ESRCH') throw e; } }
      };
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8');
        stream.on('data', text => {session.output += text; notify();});
      }
      child.stdin.on('error', () => {});
      child.on('error', error => {session.output += error.message;});
      child.on('close', (code, signal) => {session.done=true; session.exit_code=code; session.signal=signal; session.finish(); notify();});
    }
    this.sessions.set(id, session);
    return this.read(owner, {session_id:id, yield_ms});
  }

  async read(owner, {session_id, input = '', signal, yield_ms = 1000}) {
    const s = this.sessions.get(session_id);
    if (!s || s.owner !== owner) throw Error('unknown terminal session');
    if (typeof input !== 'string' || !Number.isFinite(yield_ms) || yield_ms < 0) throw Error('invalid terminal input');
    if (signal && !['SIGINT','SIGTERM','SIGKILL'].includes(signal)) throw Error('invalid signal');
    if (!s.done && input) s.write(input);
    if (!s.done && signal) await killOwned(s, signal);
    // Yield the HTTP call, not the command. No command timeout or output truncation.
    if (!s.done && !s.output && yield_ms > 0) await new Promise(resolve => {
      let timer;
      const finish = () => {clearTimeout(timer); s.listeners.delete(finish); resolve();};
      s.listeners.add(finish);
      timer = setTimeout(finish, Math.min(yield_ms, 25000));
    });
    const output = s.output; s.output = '';
    const result = {session_id, output, running:!s.done, exit_code:s.exit_code, signal:s.signal};
    if (s.done) {
      // Most completed commands have no group left. Drop them without spawning ps.
      let groupExists = process.platform !== 'win32' && Boolean(s.pid);
      if (groupExists) {
        try {process.kill(-s.pid, 0);} catch (error) {if (error.code === 'ESRCH') groupExists = false; else throw error;}
      }
      if (!groupExists && s.owned.size === 0) this.sessions.delete(session_id);
      else {
        // Keep only cleanup ownership, not closures retaining the exited child/PTY.
        delete s.write; delete s.kill; delete s.finish; delete s.finished;
        s.listeners.clear();
      }
    }
    return result;
  }

  async stop(owner) {
    const selected = [...this.sessions].filter(([, s]) => owner === undefined || s.owner === owner);
    const pending = selected.filter(([, s]) => !s.stopping);
    const closing = selected.filter(([, s]) => s.stopping).map(([, s]) => s.stopping);
    if (pending.length) {
      const cleanup = (async () => {
        const snapshot = process.platform === 'win32' ? [] : await processTable();
        await Promise.all(pending.map(([, s]) => killOwned(s, 'SIGKILL', snapshot)));
        const deadline = Date.now() + STOP_TIMEOUT_MS;
        const remaining = new Map(pending);
        while (Date.now() < deadline) {
          const table = process.platform === 'win32' ? [] : await processTable();
          for (const [id, s] of remaining) {
            const originalGroup = s.groupSignaled && ownsOriginalGroup(s, table);
            const alive = table.some(p => !p.stat.startsWith('Z') && (
              s.owned.get(p.pid) === p.started || (originalGroup && p.pgid === s.pid)
            ));
            if (s.done && !alive) {this.sessions.delete(id); remaining.delete(id);}
          }
          if (remaining.size === 0) return;
          await pause(25);
        }
        throw Error(`Terminal cleanup could not be verified for session ${[...remaining.keys()].join(', ')}`);
      })().finally(() => {
        for (const [, s] of pending) s.stopping = null;
      });
      for (const [, s] of pending) s.stopping = cleanup;
      closing.push(cleanup);
    }
    await Promise.all(closing);
  }
}
