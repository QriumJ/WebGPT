import { createServer } from 'node:http';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, unlinkSync, rmdirSync, realpathSync, appendFileSync, statSync, chmodSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { terminalGrant, Terminals } from './terminal.mjs';
import { configuration } from './client.mjs';
import { acquireWorkerLock } from './lock.mjs';

const schema = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const str = {type:'string'};
export const tools = [
  {name:'exec_command',description:'Run a shell command with the local worker user’s full OS permissions: files, Git, builds, network and programs. cwd defaults to the assigned project, not a sandbox. tty enables a real interactive terminal. Returns all available output and a session_id while running; use write_stdin to continue. No command timeout or output truncation.',inputSchema:{type:'object',properties:{token:str,command:str,cwd:str,shell:str,tty:{type:'boolean'},yield_ms:{type:'number'}},required:['token','command'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
  {name:'write_stdin',description:'Read new terminal output, send input, or send SIGINT/SIGTERM/SIGKILL to your command. An empty input reads output. Commands continue between calls.',inputSchema:{type:'object',properties:{token:str,session_id:str,input:str,signal:{type:'string',enum:['SIGINT','SIGTERM','SIGKILL']},yield_ms:{type:'number'}},required:['token','session_id'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
  {name:'get_task',description:'Read the assigned task and input names using its private task token. No repository or Git setup needed.',inputSchema:schema({token:str}),annotations:{readOnlyHint:true,openWorldHint:false}},
  {name:'read_input',description:'Read one explicitly supplied input by name; no arbitrary filesystem access.',inputSchema:schema({token:str,name:str}),annotations:{readOnlyHint:true,openWorldHint:false}},
  {name:'submit_result',description:'Save completed work, changed files, PASS/FAIL/NOT_RUN checks, evidence paths, remaining work and minimal continuation context. Write coordination summaries, verification and continuation context in English; preserve the requested deliverable language and verbatim source material. Use partial when useful work is saved but the assignment is unfinished. Notify the supervisor. No file changes required. Terminal: stops backup checks. Retry identical submission safely. Do not delete the chat.',inputSchema:schema({token:str,status:{type:'string',enum:['completed','partial','failed','cancelled']},summary:str,result:str}),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
const openTools = tools.slice(0,2).map(tool=>{
  const {token,...properties}=tool.inputSchema.properties;
  return {...tool,inputSchema:{...tool.inputSchema,properties,required:tool.inputSchema.required.filter(key=>key!=='token')}};
});
// Only explicitly selected metadata reaches disk; payloads and error messages never do.
function auditWriter(dir, enabled) {
  const path=resolve(dir,'mcp-audit.jsonl');
  const runId=enabled?randomUUID():undefined;
  let warned=false;
  return record=>{
    if(!enabled)return;
    try {
      const line=JSON.stringify({...record,runId,timestamp:new Date().toISOString()})+'\n';
      if(existsSync(path)) {
        chmodSync(path,0o600);
        if(statSync(path).size+Buffer.byteLength(line)>1024*1024)renameSync(path,path+'.1');
      }
      appendFileSync(path,line,{mode:0o600});
    } catch {
      if(!warned){warned=true;console.error('WebGPT MCP audit write failed; tool execution is unaffected.');}
    }
  };
}
export async function start({dir,port=43137,controlPort=43139,publicMcp=false,backupMs=1200000,idleSweepMs=60000,now=Date.now,audit=false,lockProbe}={}) {
  dir=resolve(dir); mkdirSync(dir,{recursive:true,mode:0o700});
  const lock=resolve(dir,'worker.lock');
  // Replaces only a provably stale lock (owner exited or previous boot); see lock.mjs.
  let recoveredLock;
  try{recoveredLock=acquireWorkerLock(lock,lockProbe);}catch(e){if(e.code==='EEXIST')throw Error('WebGPT data directory locked: '+lock+'; verify its owner before recovering a stale lock');throw e;}
  const release=()=>{if(existsSync(resolve(lock,'owner.json')))unlinkSync(resolve(lock,'owner.json'));rmdirSync(lock);};
  try{
  writeFileSync(resolve(lock,'owner.json'),JSON.stringify({pid:process.pid,host:hostname()}),{mode:0o600});
  const statePath=resolve(dir,'state.json'), keyPath=resolve(dir,'controller.key');
  const key=existsSync(keyPath)?readFileSync(keyPath,'utf8'):randomUUID();
  if(!existsSync(keyPath))writeFileSync(keyPath,key,{mode:0o600,flag:'wx'});
  // URL capability authenticates the remote MCP connection; task tokens separately grant work.
  // Keep the URL out of stdout, task prompts and HTTP error responses.
  let mcpPath='/mcp';
  if(publicMcp){
    const pathKey=resolve(dir,'mcp-path.key');
    if(!existsSync(pathKey))writeFileSync(pathKey,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
    const secret=readFileSync(pathKey,'utf8');
    if(!/^[a-f0-9]{64}$/.test(secret))throw Error('invalid mcp-path.key');
    mcpPath+='/'+secret;
  }
  const tasks=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):[];
  const writeAudit=auditWriter(dir,audit===true);
  const terminals=new Terminals();
  const waiters=new Set();
  const persist=()=>{writeFileSync(statePath+'.tmp',JSON.stringify(tasks),{mode:0o600});renameSync(statePath+'.tmp',statePath);};
  const revoke=t=>{delete t.token;delete t.openKey;t.inputs={};t.instructions='';};
  for(const t of tasks) if(t.collected)revoke(t);
  if(tasks.length)persist();
  const activeRequests=new Map();
  const finalizations=new Map();
  const expireIdle=async()=>{
    const expired=tasks.filter(t=>t.mode==='open'&&t.status==='running'&&now()-t.lastUsed>=86400000&&!activeRequests.has(t.id)&&!terminals.isRunning(t.id));
    if(!expired.length)return;
    for(const t of expired){t.status='expired';t.collected=true;t.nextCheck=null;revoke(t);}
    persist();
    await Promise.all(expired.map(t=>terminals.stop(t.id)));
  };
  await expireIdle();
  const view=(selected=tasks)=>{
    selected=selected.filter(t=>t.mode!=='open');
    const recoveryRequired=selected.filter(t=>t.status==='running'&&t.recoveryRequired?.length).map(t=>({id:t.id,journals:t.recoveryRequired}));
    return {events:selected.filter(t=>t.status!=='running'&&!t.collected).map(t=>({id:t.id,status:t.status,summary:t.summary,artifact:t.artifact,sha256:t.sha256,...(t.cleanupError?{cleanupError:t.cleanupError}:{})})),backupDue:selected.filter(t=>t.status==='running'&&now()>=t.nextCheck).map(t=>t.id),...(recoveryRequired.length?{recoveryRequired}:{})};
  };
  const wake=()=>{for(const fn of [...waiters])fn();};
  const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  const body=async req=>{const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>2*1024*1024)throw Error('request too large');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString());};
  const call=async(name,args)=>{
    await expireIdle();
    const t=typeof args.token==='string'&&tasks.find(t=>t.token&&t.token===args.token);if(!t)throw Error('unknown task token');
    if(name==='get_task')return {id:t.id,instructions:t.instructions,inputs:Object.keys(t.inputs),status:t.status,terminal:t.terminal??null,...(t.mode==='open'?{mode:'open',idleExpiresAt:t.lastUsed+86400000}: {})};
    if(name==='read_input'){if(!Object.hasOwn(t.inputs,args.name))throw Error('unknown input');return {name:args.name,text:t.inputs[args.name]};}
    if(name==='exec_command'||name==='write_stdin') {
      if(t.status!=='running'||finalizations.has(t.id))throw Error('task is terminal or finishing; terminal access closed');
      if(!t.terminal)throw Error('terminal access not granted');
      activeRequests.set(t.id,(activeRequests.get(t.id)??0)+1);
      try {
        const out=await (name==='exec_command' ? terminals.execute(t.id,t.terminal,args) : terminals.read(t.id,args));
        if(t.mode==='open'&&t.status==='running'){t.lastUsed=now();persist();}
        return out;
      } finally {const left=activeRequests.get(t.id)-1;if(left)activeRequests.set(t.id,left);else activeRequests.delete(t.id);}
    }
    if(name!=='submit_result')throw Error('unknown tool');
    if(t.mode==='open')throw Error('User-controlled open session: reply in chat; do not submit or close the session');
    if(!['completed','partial','failed','cancelled'].includes(args.status)||typeof args.result!=='string'||typeof args.summary!=='string'||args.summary.length>2048||Buffer.byteLength(args.result)>1024*1024)throw Error('invalid result');
    if(args.status==='completed'&&t.recoveryRequired?.length)throw Error('supervisor recovery required; preserve partial output with failed status');
    const sha=createHash('sha256').update(args.result).digest('hex');
    if(finalizations.has(t.id))await finalizations.get(t.id);
    if(t.status!=='running'){if(sha!==t.sha256||args.status!==t.status||args.summary!==t.summary)throw Error('terminal result differs');return {accepted:true,duplicate:true,sha256:sha,...(t.cleanupError?{cleanupError:t.cleanupError}:{})};}
    const finishing=Promise.resolve().then(async()=>{
      const artifact=resolve(dir,t.id+'.result.txt');
      writeFileSync(artifact,args.result,{mode:0o600});
      let cleanupError;
      try { await terminals.stop(t.id); } catch(error) { cleanupError=error.message; }
      const previous={...t};
      Object.assign(t,{status:args.status,summary:args.summary,artifact,sha256:sha,nextCheck:null,...(cleanupError?{cleanupError}:{})});
      try { persist(); } catch(error) {
        for(const key of Object.keys(t))delete t[key];
        Object.assign(t,previous);
        throw error;
      }
      wake();
      return {accepted:true,sha256:sha,...(cleanupError?{cleanupError}:{})};
    });
    finalizations.set(t.id,finishing);
    try { return await finishing; } finally { finalizations.delete(t.id); }

  };
  const mcp=createServer(async(req,res)=>{
    let transportId;
    if(audit===true) {
      transportId=randomUUID();
      const started=performance.now();
      const record={transportId,method:['GET','POST'].includes(req.method)?req.method:'OTHER'};
      writeAudit({...record,phase:'http_received'});
      let recorded=false;
      const complete=aborted=>{
        if(recorded)return;
        recorded=true;
        writeAudit({...record,phase:'http_completed',statusCode:res.headersSent?res.statusCode:null,aborted,durationMs:Math.max(0,Math.round(performance.now()-started))});
      };
      res.once('finish',()=>complete(false));
      res.once('close',()=>complete(!res.writableFinished));
    }
    if(req.headers.origin)return json(res,403,{});
    if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,name:'WebGPT Worker'});
    await expireIdle();
    const openToken=(req.url??'').match(/^\/open\/([a-f0-9]{64})$/)?.[1];
    const openTask=openToken&&tasks.find(t=>t.mode==='open'&&t.status==='running'&&t.openKey===openToken&&t.token);
    const actual=Buffer.from(req.url??''),expected=Buffer.from(openTask?'/open/'+openTask.openKey:mcpPath);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return json(res,404,{});
    if(req.method!=='POST'){res.setHeader('allow','POST');return json(res,405,{});}
    let m;try{m=await body(req);}catch{return json(res,400,{error:'invalid request'});}
    if(!m||typeof m!=='object'||Array.isArray(m))return json(res,400,{error:'invalid request'});
    if(m.method==='notifications/initialized'){res.writeHead(202);return res.end();}
    let result;
    if(m.method==='initialize')result={protocolVersion:m.params?.protocolVersion??'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'webgpt-worker',version:'2.0.0'},instructions:'Follow the assignment and explicit workflow preferences in the chat. Use English for coordination, operational summaries, verification reports, blockers and continuation context; preserve the requested deliverable language and verbatim sources. get_task is optional when registered context is needed. Use the terminal to perform authorized project work directly. Terminal access is the local OS user’s access, not a project sandbox; no separate file tools or read-only enforcement. Preserve unrelated work. For delegated tasks, submit the result with evidence and limitations when finished; this stops remaining terminal sessions and backup checks. For user-led open sessions, reply in chat and do not submit_result; terminal use renews the 24-hour idle lease. By default do not run reporting timers or delete chats/tabs: the worker handles deadlines and Codex handles cleanup subject to the user retention preference. Never claim unexecuted checks passed.'};
    else if(m.method==='tools/list')result={tools:openTask?openTools:tools};
    else if(m.method==='tools/call'){
      let started,record;
      if(audit===true) {
        started=performance.now();
        const token=m.params?.arguments?.token;
        const task=openTask||(typeof token==='string'&&tasks.find(t=>t.token&&t.token===token));
        record={requestId:randomUUID(),transportId,tool:tools.some(tool=>tool.name===m.params?.name)?m.params.name:'unknown',...(typeof task?.id==='string'?{taskId:task.id}:{})};
        writeAudit({...record,phase:'received'});
      }
      try {
        if(openTask&&(!openTools.some(tool=>tool.name===m.params?.name)||Object.hasOwn(m.params?.arguments??{},'token')))throw Error('unknown tool or invalid arguments');
        const out=await call(m.params.name,openTask?{...m.params.arguments,token:openTask.token}:m.params.arguments??{});
        result={content:[{type:'text',text:JSON.stringify(out)}],structuredContent:out,isError:false};
      } catch(e) {result={content:[{type:'text',text:e.message}],isError:true};}
      if(record) {
        const execution={};
        const out=result.structuredContent;
        if(!result.isError&&['exec_command','write_stdin'].includes(record.tool)) {
          if(out.exit_code===null||Number.isSafeInteger(out.exit_code))execution.exit_code=out.exit_code;
          if(typeof out.running==='boolean')execution.running=out.running;
          if(typeof out.output==='string') {
            execution.outputBytes=Buffer.byteLength(out.output);
            execution.outputSha256=createHash('sha256').update(out.output).digest('hex');
          }
        }
        writeAudit({...record,phase:'completed',isError:result.isError,durationMs:Math.max(0,Math.round(performance.now()-started)),...execution});
      }
    }
    else return json(res,200,{jsonrpc:'2.0',id:m.id??null,error:{code:-32601,message:'method not found'}});
    if(openTask&&m.method==='initialize')result.instructions=`Use the terminal for the user's requests. Default project directory: ${JSON.stringify(openTask.terminal.cwd)}. Access is the local OS user's access, not a sandbox. Preserve unrelated work and report results in chat.`;
    json(res,200,{jsonrpc:'2.0',id:m.id??null,result});
  });
  const control=createServer(async(req,res)=>{
    if(req.headers.authorization!=='Bearer '+key)return json(res,401,{});
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&['/wait','/status'].includes(url.pathname)){
        const ids=url.searchParams.getAll('id');
        if(ids.some(id=>!tasks.some(t=>t.id===id)))throw Error('unknown task');
        if(ids.some(id=>tasks.some(t=>t.id===id&&t.mode==='open')))throw Error('open sessions are user-controlled; do not wait or collect');
        const selected=(ids.length?tasks.filter(t=>ids.includes(t.id)):tasks).filter(t=>t.mode!=='open');
        const snapshot=()=>({...view(selected),...(ids.length?{settled:!selected.some(t=>t.status==='running')}:{})});
        const ready=v=>v.events.length||v.backupDue.length||v.recoveryRequired?.length||!selected.some(t=>t.status==='running');
        const v=snapshot();if(url.pathname==='/status'||ready(v))return json(res,200,v);
        let timer;const done=(timeout=false)=>{const v=snapshot();if(!timeout&&!ready(v))return;clearTimeout(timer);waiters.delete(done);if(!res.destroyed)json(res,200,v);};waiters.add(done);
        const due=Math.min(...selected.filter(t=>t.status==='running').map(t=>t.nextCheck-now()));timer=setTimeout(()=>done(true),Math.max(1,Math.min(55000,due)));res.on('close',()=>{clearTimeout(timer);waiters.delete(done);});return;
      }
      if(req.method!=='POST')return json(res,404,{});
      const a=await body(req);
      if(req.url==='/register'){
        if(!/^[a-zA-Z0-9_-]{1,80}$/.test(a.id)||tasks.some(t=>t.id===a.id)||typeof a.instructions!=='string'||!a.inputs||typeof a.inputs!=='object'||Array.isArray(a.inputs)||Object.values(a.inputs).some(v=>typeof v!=='string'))throw Error('invalid task');
        if(a.workspace)throw Error('workspace grants were removed; explicitly authorize terminal:{cwd} instead');
        if(a.mode!==undefined&&a.mode!=='open')throw Error('invalid mode');
        if(a.backupMs!==undefined&&(!Number.isSafeInteger(a.backupMs)||a.backupMs<1))throw Error('backupMs must be a positive integer');
        const checkInterval=a.backupMs??backupMs;
        const terminal=terminalGrant(a.terminal);
        if(a.mode==='open'&&!terminal)throw Error('open requires a project directory');
        const t={id:a.id,token:randomUUID(),instructions:a.instructions,inputs:a.inputs,terminal,status:'running',nextCheck:a.mode==='open'?null:now()+checkInterval,backupMs:checkInterval,collected:false,...(a.mode==='open'?{mode:'open',openKey:randomBytes(32).toString('hex'),lastUsed:now()}: {})};tasks.push(t);persist();wake();return json(res,200,{id:t.id,token:t.token,...(t.mode==='open'?{mode:'open',connectionPath:'/open/'+t.openKey,idleExpiresAt:t.lastUsed+86400000}: {})});
      }
      const t=tasks.find(t=>t.id===a.id);if(!t)throw Error('unknown task');
      if(finalizations.has(t.id))await finalizations.get(t.id);
      if(t.mode==='open'&&req.url!=='/cancel')throw Error('open sessions are user-controlled');
      if(req.url==='/ack'){if(t.status==='running')throw Error('not complete');t.collected=true;revoke(t);}
      else if(req.url==='/checked'){if(t.status==='running')t.nextCheck=now()+(t.backupMs??backupMs);}
      else if(req.url==='/cancel'){if(t.status==='running'){t.status='cancelled';t.summary='Cancelled by supervisor';t.nextCheck=null;t.collected=true;revoke(t);try{await terminals.stop(t.id);}catch(error){t.cleanupError=error.message;}}}
      else return json(res,404,{});
      persist();wake();json(res,200,{ok:true,...(t.cleanupError?{cleanupError:t.cleanupError}:{})});
    }catch(e){json(res,400,{error:e.message});}
  });
  for(const server of [mcp,control])server.requestTimeout=15000;
  const listen=(s,p)=>new Promise((yes,no)=>{s.once('error',no);s.listen(p,'127.0.0.1',yes);});
  try{await listen(mcp,port);await listen(control,controlPort);}catch(e){mcp.close();control.close();throw e;}
  writeAudit({phase:'started'});
  let closed=false;
  const idleTimer=setInterval(()=>expireIdle().catch(error=>console.error('WebGPT idle cleanup:',error.message)),idleSweepMs);idleTimer.unref();
  return {mcpPort:mcp.address().port,controlPort:control.address().port,key,expireIdle,...(recoveredLock?{recoveredLock}:{}),close:async()=>{if(closed)return;closed=true;clearInterval(idleTimer);wake();await Promise.all([mcp,control].map(s=>new Promise(r=>{s.closeAllConnections();s.close(r);})));try{await terminals.stop();}finally{release();}}};
  }catch(e){release();throw e;}
}
if(process.argv[1]&&process.argv[1]!=='-'&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
  const config=configuration();
  const service=await start({dir:config.dataDir,port:config.mcpPort,controlPort:config.controlPort,publicMcp:config.publicMcp,audit:process.env.WEBGPT_AUDIT==='1'});
  console.log(JSON.stringify({ready:true,mcpPort:service.mcpPort,controlPort:service.controlPort,...(service.recoveredLock?{recoveredStaleLock:service.recoveredLock}:{})}));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>service.close().then(()=>process.exit(0)));
}
