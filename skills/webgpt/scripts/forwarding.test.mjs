import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {forwardingOrigin,request,openProject} from './client.mjs';

const oldOrigin='https://old-test.trycloudflare.com',newOrigin='https://new-test.trycloudflare.com';
function fixture(run) {
  const dataDir=mkdtempSync(join(tmpdir(),'webgpt-forwarding-'));
  const config={dataDir,publicOrigin:oldOrigin};
  const save=value=>writeFileSync(join(dataDir,'tunnel.json'),JSON.stringify(value));
  return Promise.resolve().then(()=>run(config,save)).finally(()=>rmSync(dataDir,{recursive:true,force:true}));
}
test('legacy and verified managed connections need no network preflight',()=>fixture((config,save)=>{
  assert.equal(forwardingOrigin(config),oldOrigin);
  save({version:1,status:'running',origin:oldOrigin,pid:process.pid});
  assert.equal(forwardingOrigin(config),oldOrigin);
}));
test('changed origin blocks registration before controller credentials or mutation',()=>fixture(async(config,save)=>{
  save({version:1,status:'running',origin:newOrigin,pid:process.pid});
  await assert.rejects(request('register',{},config),/connection_needs_repair/);
  assert.equal(forwardingOrigin(config,{requireVerified:false}),newOrigin);
  config.publicOrigin=newOrigin;
  assert.equal(forwardingOrigin(config),newOrigin);
}));
test('unavailable and corrupt managed states fail closed including open mode',()=>fixture(async(config,save)=>{
  for(const state of [null,{}, {version:1,status:'starting',pid:process.pid},
    {version:1,status:'stopped',origin:oldOrigin,pid:process.pid},
    {version:1,status:'running',origin:oldOrigin,pid:2147483647},
    {version:1,status:'running',origin:oldOrigin+'/secret',pid:process.pid}]) {
    save(state);
    await assert.rejects(request('register',{},config),/tunnel_unavailable/);
    await assert.rejects(openProject(config.dataDir,config),/tunnel_unavailable/);
  }
  writeFileSync(join(config.dataDir,'tunnel.json'),'{');
  assert.throws(()=>forwardingOrigin(config),/tunnel_state_invalid/);
}));

test('open follows a changed managed origin without renewing or replacing its lease',async()=>{
  const {start}=await import('./worker.mjs');
  await fixture(async(config,save)=>{
    const service=await start({dir:config.dataDir,port:0,controlPort:0});
    Object.assign(config,{mcpPort:service.mcpPort,controlPort:service.controlPort});
    try {
      save({version:1,status:'running',origin:oldOrigin,pid:process.pid});
      const first=await openProject(config.dataDir,config);
      save({version:1,status:'running',origin:newOrigin,pid:process.pid});
      const next=await openProject(config.dataDir,config);
      assert.equal(next.id,first.id);
      assert.equal(next.idleExpiresAt,first.idleExpiresAt);
      assert.notEqual(next.connectionName,first.connectionName);
      assert.equal(next.connectionUrl,newOrigin+first.connectionPath);
      assert.equal(config.publicOrigin,oldOrigin);
      await request('cancel',{id:first.id},config);
    } finally {await service.close();}
  });
});
