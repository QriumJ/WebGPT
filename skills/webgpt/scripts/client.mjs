import { readFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute, basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

// Shared by the worker and controller client; never store configuration in the skill.
export function configuration(env = process.env) {
  const file = env.WEBGPT_CONFIG ?? join(homedir(), '.config', 'webgpt', 'config.json');
  if (env.WEBGPT_CONFIG && !existsSync(file)) throw Error('WEBGPT_CONFIG file does not exist');
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('invalid WebGPT configuration');
  const config = {
    dataDir: env.WEBGPT_DATA_DIR ?? saved.dataDir ?? join(homedir(), '.local', 'share', 'webgpt'),
    mcpPort: saved.mcpPort ?? 43137,
    controlPort: saved.controlPort ?? 43139,
    publicMcp: saved.publicMcp ?? false,
    ...(saved.publicOrigin ? { publicOrigin: saved.publicOrigin } : {}),
  };
  if (typeof config.dataDir !== 'string' || !isAbsolute(config.dataDir)) throw Error('dataDir must be absolute');
  if (typeof config.publicMcp !== 'boolean') throw Error('publicMcp must be boolean');
  for (const key of ['mcpPort', 'controlPort']) {
    if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > 65535) throw Error('invalid ' + key);
  }
  if (config.mcpPort === config.controlPort) throw Error('MCP and controller ports must differ');
  if (config.publicOrigin) {
    const url = new URL(config.publicOrigin);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('publicOrigin must be an HTTPS origin');
    config.publicOrigin = url.origin;
  }
  Object.defineProperty(config, 'configFile', {value:resolve(file)});
  return config;
}

// Optional local selection hints must never turn a completed registration into a failure.
// Deliberately omit URLs and all other setup fields, including private connection URLs.
function connectionMetadata(config) {
  try {
    if (typeof config.configFile !== 'string' || !isAbsolute(config.configFile)) return {status:'missing'};
    const file = join(dirname(config.configFile), 'setup.json');
    if (!existsSync(file)) return {status:'missing'};
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > 65536) return {status:'invalid'};
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {status:'invalid'};
    const name = saved.connectionName ?? saved.connectorName;
    const id = saved.registrationId ?? saved.connectionRegistrationId ?? saved.connectorRegistrationId;
    if (typeof name !== 'string' || !name.trim() || name.length > 200 ||
        /[\u0000-\u001f\u007f-\u009f\u2028\u2029]|:\/\/|www\./i.test(name) ||
        typeof id !== 'string' || !/^(?:plugin_)?asdk_app_[a-f0-9]{32}$/.test(id)) return {status:'invalid'};
    return {status:'ready',name:name.trim(),registrationId:id.startsWith('plugin_') ? id : 'plugin_'+id};
  } catch { return {status:'invalid'}; }
}

// Managed tunnels publish observed state; publicOrigin remains the verified Worker connector.
// Legacy/custom forwarding has no state file and keeps its existing behavior.
export function forwardingOrigin(config, {requireVerified = true} = {}) {
  const file = join(config.dataDir, 'tunnel.json');
  if (!existsSync(file)) return config.publicOrigin;
  let state;
  try { state = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw Error('tunnel_state_invalid: inspect the owned tunnel service via references/setup.md; do not dispatch'); }
  let alive = false;
  if (Number.isInteger(state?.pid) && state.pid > 0) {
    try { process.kill(state.pid, 0); alive = true; }
    catch (error) { alive = error.code === 'EPERM'; }
  }
  if (state?.version !== 1 || state.status !== 'running' || !alive ||
      typeof state.origin !== 'string' || !/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(state.origin))
    throw Error('tunnel_unavailable: inspect the owned tunnel service via references/setup.md; do not dispatch');
  if (requireVerified && state.origin !== config.publicOrigin)
    throw Error('connection_needs_repair: the forwarding origin changed; follow references/setup.md#origin-recovery before registering or dispatching');
  return state.origin;
}

// Reuse an unexpired project lease without renewing it or restarting the shared worker.
export async function openProject(cwd = process.cwd(), config = configuration(), now = Date.now()) {
  config = {...config, publicOrigin: forwardingOrigin(config, {requireVerified:false})};
  cwd = realpathSync(cwd);
  const statePath = join(config.dataDir, 'state.json');
  const tasks = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : [];
  const existing = tasks.find(t => t.mode === 'open' && t.status === 'running' && !t.collected &&
    t.openKey && t.token && t.terminal?.cwd === cwd && now - t.lastUsed < 86400000);
  let result;
  if (existing) {
    const response = await fetch(`http://127.0.0.1:${config.mcpPort}/open/${existing.openKey}`, {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}), signal: AbortSignal.timeout(10000),
    });
    if (response.ok && (await response.json()).result?.tools?.length === 2)
      result = {id:existing.id,mode:'open',connectionPath:'/open/'+existing.openKey,idleExpiresAt:existing.lastUsed+86400000,reused:true};
    else if (response.status !== 404) throw Error('Existing open connection could not be verified');
  }
  if (!result) {
    result = await request('register', {mode:'open',terminal:{cwd}}, config);
    if (!result.connectionPath) {
      await request('cancel', {id:result.id}, config);
      throw Error('Running worker needs an update for message-free open; preserve active sessions and restart when idle');
    }
    delete result.token;
    result.reused = false;
  }
  const suffix = createHash('sha256').update((config.publicOrigin ?? '') + result.id).digest('hex').slice(0,8);
  return {...result,project:cwd,connectionName:`WebGPT Open ${basename(cwd)} ${suffix}`,
    ...(config.publicOrigin ? {connectionUrl:config.publicOrigin+result.connectionPath} : {needsPublicOrigin:true})};
}

// Retry transport failures and temporary HTTP failures only for read-only requests.
export async function readRequest(fetchRequest, {retries=2, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  for(let attempt=0;;attempt++) {
    let response;
    try { response=await fetchRequest(); }
    catch(error) {
      const transient=error?.name==='TimeoutError'||(error instanceof TypeError&&['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code));
      if(!transient||attempt>=retries)throw error;
      await sleep(250*2**attempt);continue;
    }
    if(![502,503,504].includes(response.status)||attempt>=retries)return response;
    await response.body?.cancel();
    await sleep(250*2**attempt);
  }
}

export async function request(action, payload, config = configuration()) {
  const read = ['wait', 'status'].includes(action);
  if (!read && !['register', 'ack', 'checked', 'cancel'].includes(action)) throw Error('unknown controller action');
  if (read ? payload !== undefined && !(Array.isArray(payload?.ids) && payload.ids.length && payload.ids.every(id => typeof id === 'string')) : !payload || typeof payload !== 'object') throw Error('invalid controller payload');
  if (action === 'register') forwardingOrigin(config, {requireVerified:payload.mode !== 'open'});
  if (action === 'register') payload = { id: randomUUID(), instructions: '', inputs: {}, ...payload };
  const key = readFileSync(join(config.dataDir, 'controller.key'), 'utf8');
  const query = read && payload ? '?' + new URLSearchParams(payload.ids.map(id => ['id', id])) : '';
  const response = await readRequest(() => fetch('http://127.0.0.1:' + config.controlPort + '/' + action + query, {
    method: read ? 'GET' : 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: read ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  }), { retries: read ? 2 : 0 });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'controller request failed: ' + response.status);
  return action === 'register' && payload.mode !== 'open'
    ? {...result,connection:connectionMetadata(config)} : result;
}

// HTTP renewals stay here, not in model turns. Return only actionable task state.
export async function waitForTasks(ids, config = configuration(), read = request) {
  for (;;) {
    const result = await read('wait', { ids }, config);
    if (result.events.length || result.backupDue.length || result.recoveryRequired?.length || result.settled) return result;
  }
}

// Verify the saved artifact before retiring access. Collection is not a code-quality verdict.
async function collectEvent(event, config, control = request, includeResult = false) {
  const bytes = readFileSync(event.artifact);
  if (createHash('sha256').update(bytes).digest('hex') !== event.sha256) throw Error('saved result integrity mismatch');
  const acknowledgement = await control('ack', { id: event.id }, config);
  return { ...event, ...(acknowledgement.cleanupError ? {cleanupError: acknowledgement.cleanupError} : {}),
    ...(includeResult ? {result: bytes.toString('utf8')} : {}), integrity: 'verified', collected: true };
}

export async function collectTask(id, config = configuration()) {
  const snapshot = await request('status', { ids: [id] }, config);
  const event = snapshot.events.find(event => event.id === id);
  if (!event) throw Error('task has no uncollected result');
  return collectEvent(event, config);
}

// Preserve intervention signals; otherwise collect directly from the wait receipt.
// A failed acknowledgement is never blindly retried: callers inspect task state.
export async function finishTasks(ids, config = configuration(), control = request) {
  const snapshot = await waitForTasks(ids, config, control);
  if (snapshot.backupDue.length || snapshot.recoveryRequired?.length || !snapshot.events.length) return snapshot;
  const events = [];
  for (const event of snapshot.events) events.push(await collectEvent(event, config, control, true));
  return { ...snapshot, events };
}

// Call only after checking this task's browser state. Never acknowledge other IDs.
// The worker makes checked a no-op once terminal, so completion racing this call
// is collected normally. An uncertain mutation fails without retrying or waiting.
export async function resumeTask(id, config = configuration(), control = request) {
  if (typeof id !== 'string' || !id.trim()) throw Error('resume requires one task ID');
  await control('checked', { id }, config);
  return finishTasks([id], config, control);
}

if (process.argv[1] && process.argv[1] !== '-' && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const [action, ...args] = process.argv.slice(2);
    let result;
    if (action === 'wait' || action === 'finish') {
      // Accept the previous JSON-file form as well as plain returned IDs.
      const saved = args.length === 1 && existsSync(args[0]) ? JSON.parse(readFileSync(args[0], 'utf8')) : null;
      const ids = saved ? saved.ids ?? [saved.id] : args;
      if (!ids.length) throw Error(`usage: client.mjs ${action} <task-id> [task-id ...]`);
      result = await (action === 'finish' ? finishTasks(ids) : waitForTasks(ids));
    } else if (action === 'resume') {
      if (args.length !== 1) throw Error('usage: client.mjs resume <task-id>');
      result = await resumeTask(args[0]);
    } else if (action === 'status') {
      result = await request('status', args.length ? { ids: args } : undefined);
    } else if (action === 'collect') {
      if (args.length !== 1) throw Error('usage: client.mjs collect <task-id>');
      result = await collectTask(args[0]);
    } else if (action === 'open') {
      if (args.length > 1) throw Error('usage: client.mjs open [project-directory]');
      result = await openProject(args[0]);
    } else if (action === 'register' && args[0] === '--cwd') {
      if (args.length !== 2 && !(args.length === 4 && args[2] === '--backup-ms')) throw Error('usage: client.mjs register --cwd <project-directory> [--backup-ms <milliseconds>]');
      result = await request('register', { terminal: { cwd: args[1] }, ...(args.length === 4 ? {backupMs:Number(args[3])} : {}) });
    } else if (['ack', 'checked', 'cancel'].includes(action)) {
      if (args.length !== 1) throw Error(`usage: client.mjs ${action} <task-id|json-file>`);
      const payload = existsSync(args[0]) ? JSON.parse(readFileSync(args[0], 'utf8')) : { id: args[0] };
      result = await request(action, payload);
    } else {
      const payload = args[0] ? JSON.parse(readFileSync(args[0], 'utf8')) : undefined;
      result = await request(action, payload);
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('WebGPT: ' + error.message);
    process.exitCode = 1;
  }
}
