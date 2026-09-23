import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {configuration,request} from './client.mjs';

const registrationId='plugin_asdk_app_6ab340531d388191a85f63964a4e335e';
async function fixture(run) {
  const root=mkdtempSync(join(tmpdir(),'webgpt-registration-'));
  let mutations=0;
  const server=createServer((req,res)=>{
    req.resume();
    if(req.method==='POST')mutations++;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({id:'test-task',token:'task-token',mode:'worker'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const file=join(root,'config.json');
  writeFileSync(file,JSON.stringify({dataDir:root,controlPort:server.address().port}));
  writeFileSync(join(root,'controller.key'),'local-key');
  const config=configuration({WEBGPT_CONFIG:file});
  const save=value=>writeFileSync(join(root,'setup.json'),JSON.stringify(value));
  try { await run({root,config,save,mutations:()=>mutations}); }
  finally { await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true}); }
}

test('register returns only validated local identity without disclosing setup secrets',()=>fixture(async({config,save,mutations})=>{
  save({connectionName:'WebGPT Worker',connectionRegistrationId:registrationId,
    connectionUrl:'https://secret.example/mcp/key',apiKey:'PRIVATE',
    chatLaunchUrl:'https://chatgpt.com/?token=PRIVATE',other:'PRIVATE'});
  const result=await request('register',{},config);
  assert.deepEqual(result.connection,{status:'ready',name:'WebGPT Worker',registrationId});
  assert.equal(result.token,'task-token');
  assert.equal(mutations(),1);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|secret\.example|chatLaunchUrl|configFile/);
}));

test('metadata aliases normalize bare registration IDs',()=>fixture(async({config,save})=>{
  for(const field of ['registrationId','connectionRegistrationId','connectorRegistrationId']) {
    save({connectorName:'WebGPT Test',[field]:registrationId.slice(7)});
    assert.deepEqual((await request('register',{},config)).connection,
      {status:'ready',name:'WebGPT Test',registrationId});
  }
}));

test('missing metadata and explicit config without profile retain successful registration',()=>fixture(async({config,save,mutations})=>{
  assert.equal((await request('register',{},config)).connection.status,'missing');
  save({connectionName:'Present profile',registrationId});
  const explicit={dataDir:config.dataDir,controlPort:config.controlPort};
  assert.deepEqual((await request('register',{},explicit)).connection,{status:'missing'});
  assert.equal(mutations(),2);
}));

test('custom configuration reads only its sibling setup and does not expose profile path',()=>fixture(async({root,config,save})=>{
  save({connectionName:'Wrong profile',registrationId});
  const nested=join(root,'custom');mkdirSync(nested);
  const file=join(nested,'other.json');
  writeFileSync(file,JSON.stringify({dataDir:root,controlPort:config.controlPort}));
  writeFileSync(join(nested,'setup.json'),JSON.stringify({connectionName:'Custom profile',registrationId}));
  const custom=configuration({WEBGPT_CONFIG:file});
  assert.equal(custom.configFile,file);
  assert.equal((await request('register',{},custom)).connection.name,'Custom profile');
  assert.equal(Object.keys(custom).includes('configFile'),false);
}));

test('invalid metadata never throws after registration or repeats the mutation',()=>fixture(async({root,config,save,mutations})=>{
  const invalid=[null,[],{}, {connectionName:'https://private.example/secret',registrationId},
    {connectionName:'Name\nPRIVATE',registrationId},{connectionName:'Name',registrationId:'PRIVATE'},
    {connectionName:'x'.repeat(201),registrationId}];
  for(const value of invalid) {
    save(value);
    const before=mutations();
    const result=await request('register',{},config);
    assert.deepEqual(result.connection,{status:'invalid'});
    assert.equal(mutations(),before+1);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private\.example/);
  }
  for(const contents of ['{PRIVATE',' '.repeat(65537)]) {
    writeFileSync(join(root,'setup.json'),contents);
    const before=mutations();
    assert.deepEqual((await request('register',{},config)).connection,{status:'invalid'});
    assert.equal(mutations(),before+1);
  }
  rmSync(join(root,'setup.json'));mkdirSync(join(root,'setup.json'));
  assert.deepEqual((await request('register',{},config)).connection,{status:'invalid'});
}));

test('open registrations and other actions receive no shared Worker selection hints',()=>fixture(async({config,save})=>{
  save({connectionName:'Shared Worker',registrationId});
  assert.equal('connection' in await request('register',{mode:'open'},config),false);
  assert.equal('connection' in await request('status',undefined,config),false);
}));
