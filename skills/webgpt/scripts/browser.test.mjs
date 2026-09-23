import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, recoverPermission, sendOnce, deleteAndClose, prepareDelete, confirmDeleteAndClose, waitForReply } from './browser.mjs';
const header = url => `Browser tab: 1, Title: "Owned task", URL: "${url}".\n`;
const userTurn = text => `10 heading (level 5) You said:\n11 text ${text}\n12 heading (level 6) ChatGPT said:`;
const home = header('https://chatgpt.com/') + '3 pop up button (collapsed) 매우 높음, ID: mode\n4 text entry area (settable) Description: ChatGPT와 채팅, ID: prompt-textarea';
function tab(states) { return { id:'1', actions:[], async getAXState(options){assert.equal(options.emit,false);return states.length>1?states.shift():states[0];}, async click(i){this.actions.push(['click',i]);}, async typeText(t){this.actions.push(['type',t]);},async pressKey(k){this.actions.push(['key',k]);},async close(){this.actions.push(['close']);} }; }
test('send batches a grounded selected mode and one message, refusing retries and mismatches',async()=>{
  const t=tab([home,header('https://chatgpt.com/c/a')+userTurn('Hello')]);
  assert.equal((await sendOnce(t,'Hello')).status,'submitted');
  assert.deepEqual(t.actions,[['click',4],['type','Hello'],['key','Return']]);
  await assert.rejects(sendOnce(t,'Again'),/already sent/);
  const wrong=tab([home]);assert.equal((await sendOnce(wrong,'Hello','pro')).status,'needs_mode');assert.deepEqual(wrong.actions,[]);
});
test('cleanup accepts the deletion dialog without another consent gate, but stops on target mismatch',async()=>{
  const url='https://chatgpt.com/c/a';
  const states=[header(url)+'2 container page-header\n  5 button Description: More, ID: conversation-options-a',header(url)+'6 삭제',header(url)+'7 container 채팅을 삭제하시겠습니까?\n8 text Owned task\n9 button 삭제',header('https://chatgpt.com/')];
  const t=tab([...states]);const cua={listTabs:async()=>[]};
  assert.equal((await deleteAndClose(t,cua,'1',url)).status,'deleted_and_closed');assert.deepEqual(t.actions,[['click',5],['click',6],['click',9],['close']]);
  const changed=tab([header('https://chatgpt.com/c/other')]);assert.equal((await deleteAndClose(changed,cua,'1',url)).status,'target_changed');assert.deepEqual(changed.actions,[]);
  const wrongDialog=tab([states[0],states[1],header(url)+'7 container 채팅을 삭제하시겠습니까?\n8 text Other task\n9 button 삭제']);
  assert.equal((await deleteAndClose(wrongDialog,cua,'1',url)).status,'needs_dialog_verification');
  assert.deepEqual(wrongDialog.actions,[['click',5],['click',6]]);
});
test('delayed submission is observed once without resending; draft URL resolves only via its matching menu',async()=>{
  const draft='https://chatgpt.com/c/WEB:abc-123', saved='https://chatgpt.com/c/abc-456';
  const t=tab([home,header(draft),header(draft)+userTurn('Hello'),header(saved)+'2 container page-header\n  5 button Description: More, ID: conversation-options-WEB:abc-123',header(saved)+'6 삭제',header(saved)+'7 container 채팅을 삭제하시겠습니까?\n8 text Owned task\n9 button 삭제',header('https://chatgpt.com/')]);
  assert.equal((await sendOnce(t,'Hello')).status,'submitted');
  assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
  assert.equal((await deleteAndClose(t,{listTabs:async()=>[]},'1',draft)).status,'deleted_and_closed');
  const other=tab([header(saved)+'2 container page-header\n  5 button Description: More, ID: conversation-options-WEB:other']);
  assert.equal((await deleteAndClose(other,{listTabs:async()=>[]},'1',draft)).status,'target_changed');
  assert.deepEqual(other.actions,[]);
});

test('composer text, arbitrary echoes, empty composer and unknown turn formats cannot prove submission',async()=>{
  for (const content of [
    '4 text entry area (settable) Hello, ID: prompt-textarea',
    '4 text entry area (settable) Description: ChatGPT와 채팅, ID: prompt-textarea',
    '10 heading (level 6) ChatGPT said:\n11 text Hello',
    '10 container Hello',
    '10 text Hello',
    '10 heading (level 5) You said:\n4 text entry area Hello, ID: prompt-textarea',
  ]) {
    const t=tab([home,header('https://chatgpt.com/c/a')+content]);
    assert.equal((await sendOnce(t,'Hello')).status,'submission_unconfirmed');
    await assert.rejects(sendOnce(t,'Hello'),/already sent/);
    assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
  }
});
test('simultaneous attempts lock before preflight and send exactly once',async()=>{
  const t=tab([home,header('https://chatgpt.com/c/a')+userTurn('Hello')]);
  const results=await Promise.allSettled([sendOnce(t,'Hello'),sendOnce(t,'Hello')]);
  assert.equal(results[0].value.status,'submitted');
  assert.match(results[1].reason.message,/in flight/);
  assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
});
test('explicit new tasks can follow up only on the expected conversation and need a new matching user turn',async()=>{
  const url='https://chatgpt.com/c/a';
  const controls=home.slice(home.indexOf('3 pop up'));
  const t=tab([home,header(url)+userTurn('Hello')]);
  assert.equal((await sendOnce(t,'Hello','xh',{taskId:'first'})).status,'submitted');
  let states=[header(url)+userTurn('Hello')+'\n'+controls,header(url)+userTurn('Hello')+'\n'+userTurn('Follow up')];
  t.getAXState=async()=>states.length>1?states.shift():states[0];
  assert.equal((await sendOnce(t,'Follow up','xh',{taskId:'second',expectedUrl:url})).status,'submitted');
  await assert.rejects(sendOnce(t,'Follow up','xh',{taskId:'second',expectedUrl:url}),/already sent/);
  states=[header(url)+userTurn('Hello')+'\n'+controls];
  assert.equal((await sendOnce(t,'Hello','xh',{taskId:'third',expectedUrl:url})).status,'submission_unconfirmed');
  const wrong=tab([header('https://chatgpt.com/c/other')+controls]);
  assert.equal((await sendOnce(wrong,'Follow up','xh',{taskId:'new',expectedUrl:url})).status,'target_changed');
  assert.deepEqual(wrong.actions,[]);
  await assert.rejects(sendOnce(wrong,'Follow up','xh',{expectedUrl:url}),/requires taskId/);
});
test('mutation failure consumes an attempt but preflight failure can be corrected',async()=>{
  const t=tab([home]);
  t.typeText=async()=>{throw Error('disconnected');};
  await assert.rejects(sendOnce(t,'Hello'),/disconnected/);
  await assert.rejects(sendOnce(t,'Hello'),/already sent/);
  const fixable=tab([home]);
  assert.equal((await sendOnce(fixable,'Hello','pro')).status,'needs_mode');
  fixable.getAXState=async()=>home.replace('매우 높음','Pro');
  assert.equal((await sendOnce(fixable,'Hello','pro')).status,'submission_unconfirmed');
});

test('observed Korean AX user action container identifies a submitted message without speaker heading',async()=>{
  const prompt='Task description\nSecond line';
  const observed=`46 container thread
  47 container
    48 heading 4
    49 container
      50 text ${prompt}
      51 container 내 메시지 작업
        52 button 메시지 복사
        53 button 프롬프트 공유
        54 button 메시지 편집`;
  const t=tab([home,header('https://chatgpt.com/c/a')+observed]);
  assert.equal((await sendOnce(t,prompt)).status,'submitted');
  for (const content of [
    observed.replace('container 내 메시지 작업','container 응답 작업'),
    observed.replace('50 text','50 text entry area'),
    observed.replace('51 container 내 메시지 작업','51 heading 4\n52 container 내 메시지 작업'),
  ]) {
    const unknown=tab([home,header('https://chatgpt.com/c/a')+content]);
    assert.equal((await sendOnce(unknown,prompt)).status,'submission_unconfirmed');
  }
});
test('speaker heading can encode depth as a trailing AX Value',async()=>{
  for(const speaker of ['You said:','나의 말:']) {
    const t=tab([home,header('https://chatgpt.com/c/a')+`48 heading ${speaker}, Value: 5\n50 text Hello`]);
    assert.equal((await sendOnce(t,'Hello')).status,'submitted');
  }
});

test('cleanup verifies a settled title on the owned URL and retries a transient dialog once',async()=>{
  const url='https://chatgpt.com/c/a';
  const first=header(url)+'2 container page-header\n  5 button Description: More, ID: conversation-options-a';
  const menu=header(url)+'6 삭제';
  const dialog=header(url).replace('Owned task','Settled title')+'7 container 채팅을 삭제하시겠습니까?\n8 text Settled title\n9 button 삭제';
  for (const intermediate of [[],[header(url)+'7 container 채팅을 삭제하시겠습니까?']]) {
    const t=tab([first,menu,...intermediate,dialog,header('https://chatgpt.com/')]);
    assert.equal((await deleteAndClose(t,{listTabs:async()=>[]},'1',url)).status,'deleted_and_closed');
    assert.deepEqual(t.actions,[['click',5],['click',6],['click',9],['close']]);
  }
  const changed=tab([first,menu,dialog.replace(url,'https://chatgpt.com/c/other')]);
  assert.equal((await deleteAndClose(changed,{listTabs:async()=>[]},'1',url)).status,'needs_dialog_verification');
  assert.deepEqual(changed.actions,[['click',5],['click',6]]);
});

test('follow-up resolves a draft only through the active header menu, before or after sending',async()=>{
  const draft='https://chatgpt.com/c/WEB:abc-123', saved='https://chatgpt.com/c/abc-456';
  const controls=home.slice(home.indexOf('3 pop up'));
  const active='\t39 container page-header\n\t\t40 container conversation-header-actions\n\t\t\t44 button Description: More, ID: conversation-options-WEB:abc-123\n\t45 container thread\n';
  for (const preUrl of [draft,saved]) {
    const t=tab([header(preUrl)+active+controls,header(saved)+active+userTurn('Next')]);
    const result=await sendOnce(t,'Next','xh',{taskId:'next',expectedUrl:draft});
    assert.equal(result.status,'submitted');assert.equal(result.url,saved);
    assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
  }
  for (const invalid of [
    '2 container sidebar\n  44 button Description: More, ID: conversation-options-WEB:abc-123\n3 container page-header\n  45 button Description: More, ID: conversation-options-other\n',
    active.replace('WEB:abc-123','WEB:abc-123-extra'),
    active.replace('button Description: More','link Description: More'),
    active.replace('\t45 container thread','\t\t45 button Description: More, ID: conversation-options-WEB:abc-123\n\t46 container thread'),
  ]) {
    const t=tab([header(saved)+invalid+controls+userTurn('Next')]);
    assert.equal((await sendOnce(t,'Next','xh',{taskId:'next',expectedUrl:draft})).status,'target_changed');
    assert.deepEqual(t.actions,[]);
    assert.equal((await deleteAndClose(t,{listTabs:async()=>[]},'1',draft)).status,'target_changed');
    assert.deepEqual(t.actions,[]);
  }
});

test('submission settling observes later evidence within a bounded call and never resends',async()=>{
  const url='https://chatgpt.com/c/a';
  let reads=0;
  const t=tab([home,header(url),header(url),header(url),header(url)+userTurn('Hello')]);
  const read=t.getAXState.bind(t);t.getAXState=async opts=>{reads++;return read(opts);};
  assert.equal((await sendOnce(t,'Hello')).status,'submitted');
  assert.equal(reads,5);assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
  const unknown=tab([home,header(url)]);let unknownReads=0;
  const readUnknown=unknown.getAXState.bind(unknown);unknown.getAXState=async opts=>{unknownReads++;return readUnknown(opts);};
  assert.equal((await sendOnce(unknown,'Hello')).status,'submission_unconfirmed');
  assert.equal(unknownReads,5);
  await assert.rejects(sendOnce(unknown,'Hello'),/already sent/);
  assert.equal(unknown.actions.filter(a=>a[0]==='key').length,1);
});

test('follow-up stops observing on an unproven conversation change after a single send',async()=>{
  const url='https://chatgpt.com/c/a', other='https://chatgpt.com/c/b';
  const controls=home.slice(home.indexOf('3 pop up'));
  const t=tab([header(url)+controls,header(other)+userTurn('Next')]);let reads=0;
  const read=t.getAXState.bind(t);t.getAXState=async opts=>{reads++;return read(opts);};
  assert.equal((await sendOnce(t,'Next','xh',{taskId:'next',expectedUrl:url})).status,'submission_unconfirmed');
  assert.equal(reads,2);assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
});

test('a new send pins its first observed draft and rejects an unrelated saved chat',async()=>{
  const draft='https://chatgpt.com/c/WEB:abc-123';
  const t=tab([home,header(draft),header('https://chatgpt.com/c/abc-456')+userTurn('Hello')]);
  assert.equal((await sendOnce(t,'Hello')).status,'submission_unconfirmed');
  assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
});

test('cleanup revalidates a draft transition after opening its menu before selecting Delete',async()=>{
  const draft='https://chatgpt.com/c/WEB:abc-123', saved='https://chatgpt.com/c/abc-456';
  const active='2 container page-header\n  5 button Description: More, ID: conversation-options-WEB:abc-123\n';
  const t=tab([header(draft)+active,header(saved)+active+'6 삭제',header(saved)+'7 container 채팅을 삭제하시겠습니까?\n8 text Owned task\n9 button 삭제',header('https://chatgpt.com/')]);
  assert.equal((await deleteAndClose(t,{listTabs:async()=>[]},'1',draft)).status,'deleted_and_closed');
  assert.deepEqual(t.actions,[['click',5],['click',6],['click',9],['close']]);
  for (const menu of ['6 삭제',active.replace('WEB:abc-123','WEB:other')+'6 삭제']) {
    const changed=tab([header(draft)+active,header(saved)+menu]);
    assert.equal((await deleteAndClose(changed,{listTabs:async()=>[]},'1',draft)).status,'target_changed');
    assert.deepEqual(changed.actions,[['click',5]]);
  }
});

test('an active or stopping response prevents any send and does not consume the follow-up attempt',async()=>{
  const url='https://chatgpt.com/c/a';
  for (const stop of ['5 button Description: 답변 중지, ID: composer-submit-button','5 button (disabled) Description: 답변 중지, ID: composer-submit-button','5 button Stop generating']) {
    const t=tab([header(url)+home.slice(home.indexOf('3 pop up'))+'\n'+stop]);
    const options={taskId:'next',expectedUrl:url};
    assert.equal((await sendOnce(t,'Next','xh',options)).status,'response_in_progress');
    assert.deepEqual(t.actions,[]);
    let states=[header(url)+home.slice(home.indexOf('3 pop up')),header(url)+userTurn('Next')];
    t.getAXState=async()=>states.length>1?states.shift():states[0];
    assert.equal((await sendOnce(t,'Next','xh',options)).status,'submitted');
    assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
  }
});

const replyUrl='https://chatgpt.com/c/a';
const replyTurn=(prompt,reply,{stop=false,cursor=false,actions=true}={}) =>
`  10 heading 4
  11 container
    12 text ${prompt}
    13 container 내 메시지 작업
      14 button 메시지 복사
  20 heading 4
  21 container
    22 text ${reply}
${cursor?'    23 text _\n':''}${actions?'    24 container 응답 작업\n      25 button 응답 복사\n':''}${stop?'  26 button (disabled) Description: 답변 중지, ID: composer-submit-button\n':''}`;
const replyState=(prompt,reply,options)=>header(replyUrl)+'1 container thread\n'+replyTurn(prompt,reply,options);
const replyOptions={prompt:'Current prompt',maxObservations:3,intervalMs:0};
test('reply completion returns only the latest bound response without mutating the tab',async()=>{
  const t=tab([header(replyUrl)+'1 container thread\n'+replyTurn('Old prompt','Old reply')+replyTurn('Current prompt','Current reply')]);
  assert.deepEqual(await waitForReply(t,replyUrl,replyOptions),{status:'completed',text:'Current reply',url:replyUrl,observations:1,progress:'unknown'});
  assert.deepEqual(t.actions,[]);
  for(const body of [replyTurn('Old prompt','Old reply'),replyTurn('Current prompt','Old reply')+replyTurn('Newer prompt','Newer reply'),replyTurn('Current prompt','Old reply')+replyTurn('Current prompt','New reply')]) {
    const wrong=tab([header(replyUrl)+'1 container thread\n'+body]);
    assert.equal((await waitForReply(wrong,replyUrl,replyOptions)).status,'unconfirmed');
  }
});
test('reply completion rejects active or disabled stop controls and partial cursors',async()=>{
  for(const options of [{stop:true},{cursor:true}]) {
    const t=tab([replyState('Current prompt','Partial',options)]);
    const result=await waitForReply(t,replyUrl,replyOptions);
    assert.equal(result.status,'in_progress');assert.equal(result.progress,'unchanged');assert.equal(result.observations,3);
    assert.deepEqual(t.actions,[]);
  }
  const t=tab([replyState('Current prompt','Par',{stop:true}),replyState('Current prompt','Partial',{stop:true}),replyState('Current prompt','Final')]);
  const result=await waitForReply(t,replyUrl,replyOptions);
  assert.equal(result.status,'completed');assert.equal(result.progress,'changed');assert.equal(result.text,'Final');assert.equal(result.observations,3);
});
test('unknown reply formats fail closed and ownership changes end observations immediately',async()=>{
  for(const state of [header(replyUrl)+'2 text Current prompt\n3 text Reply',replyState('Current prompt','Reply',{actions:false}),replyState('Current prompt','Reply').replace('container thread','container unknown')]) {
    assert.equal((await waitForReply(tab([state]),replyUrl,replyOptions)).status,'unconfirmed');
  }
  const t=tab([replyState('Current prompt','Partial',{stop:true}),replyState('Current prompt','Reply').replaceAll(replyUrl,'https://chatgpt.com/c/other')]);
  assert.deepEqual(await waitForReply(t,replyUrl,replyOptions),{status:'target_changed',observations:2,progress:'unknown'});
  assert.deepEqual(t.actions,[]);
});
test('reply observations are bounded and validate before reading',async()=>{
  const t=tab([replyState('Current prompt','Partial',{stop:true})]);let reads=0;
  const read=t.getAXState.bind(t);t.getAXState=async opts=>{reads++;return read(opts);};
  for(const options of [{maxObservations:11},{maxObservations:0},{intervalMs:-1},{intervalMs:10001},{maxObservations:5,intervalMs:10000},{prompt:''}]) {
    await assert.rejects(waitForReply(t,replyUrl,{...replyOptions,...options}));
  }
  assert.equal(reads,0);
  const result=await waitForReply(t,replyUrl,{...replyOptions,maxObservations:2});
  assert.equal(reads,2);assert.equal(result.observations,2);assert.equal(result.progress,'unchanged');
});
test('reply observation resolves only an evidenced draft transition',async()=>{
  const draft='https://chatgpt.com/c/WEB:abc-123',saved='https://chatgpt.com/c/abc-456';
  const state=header(saved)+'2 container page-header\n  3 button Description: More, ID: conversation-options-WEB:abc-123\n1 container thread\n'+replyTurn('Current prompt','Final');
  assert.equal((await waitForReply(tab([state]),draft,replyOptions)).status,'completed');
  assert.equal((await waitForReply(tab([state.replace('WEB:abc-123','WEB:other')]),draft,replyOptions)).status,'target_changed');
});

test('reply extraction preserves multiline text and ignores nested response headings as turn boundaries',async()=>{
  const state=replyState('Current prompt','First line\nSecond line').replace('    24 container 응답 작업','    23 heading Details, Value: 2\n    24 container 응답 작업');
  const result=await waitForReply(tab([state]),replyUrl,replyOptions);
  assert.equal(result.status,'completed');assert.equal(result.text,'First line\nSecond line');
  const english=state.replace('10 heading 4','10 heading You said:, Value: 5').replace('20 heading 4','20 heading ChatGPT said:, Value: 6').replace('container 내 메시지 작업','container user actions').replace('container 응답 작업','container response actions').replace('button 응답 복사','button Copy response');
  assert.equal((await waitForReply(tab([english]),replyUrl,replyOptions)).status,'completed');
});

test('a generic Copy control in response content cannot prove completion',async()=>{
  const state=replyState('Current prompt','Partial',{actions:false}).replace('20 heading 4','20 heading ChatGPT said:, Value: 6')+'    25 button Copy\n';
  const result=await waitForReply(tab([state]),replyUrl,replyOptions);
  assert.equal(result.status,'unconfirmed');
});

test('dispatch settles a late mode label and sends without opening an already-correct mode',async()=>{
  const t=tab([home.replace('매우 높음','Loading'),home,header('https://chatgpt.com/c/a')+userTurn('Hello')]);
  assert.equal((await dispatch(t,'Hello')).status,'submitted');
  assert.deepEqual(t.actions,[['click',4],['type','Hello'],['key','Return']]);
  await assert.rejects(dispatch(t,'Hello'),/already sent/);
});
test('dispatch adjusts an observed slider, verifies the closed mode and submits once',async()=>{
  const wrong=home.replace('매우 높음','높음');
  const menu=header('https://chatgpt.com/')+'3 pop up button (expanded) 추론 수준\n5 menu 추론 수준\n  6 text 높음, 5개 중 3번째. 왼쪽/오른쪽 화살표 키로 성능을 조정합니다.';
  const t=tab([wrong,wrong,wrong,menu,menu.replace('text 높음','text 매우 높음'),home,header('https://chatgpt.com/c/a')+userTurn('Hello')]);
  assert.equal((await dispatch(t,'Hello')).status,'submitted');
  assert.deepEqual(t.actions,[['click',3],['click',6],['key','Right'],['key','Escape'],['click',4],['type','Hello'],['key','Return']]);
});
test('dispatch leaves unknown controls and changed targets unsent',async()=>{
  const wrong=home.replace('매우 높음','Unknown');
  const unknown=tab([wrong]);assert.equal((await dispatch(unknown,'Hello')).status,'needs_mode');assert.deepEqual(unknown.actions,[]);
  const changed=tab([wrong,header('https://chatgpt.com/c/other')]);
  assert.equal((await dispatch(changed,'Hello')).status,'target_changed');assert.deepEqual(changed.actions,[]);
});
test('dispatch never sends when mode transition has no effect or a response is active',async()=>{
  const wrong=home.replace('매우 높음','높음');
  const menu=header('https://chatgpt.com/')+'3 pop up button (expanded) 추론 수준\n5 menu 추론 수준\n  6 text 높음, 5개 중 3번째. 왼쪽/오른쪽 화살표 키로 성능을 조정합니다.';
  const t=tab([wrong,wrong,wrong,menu,menu]);
  assert.equal((await dispatch(t,'Hello')).status,'needs_mode');assert.equal(t.actions.filter(a=>a[0]==='type').length,0);
  assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
  const active=tab([home+'\n5 button Stop generating']);
  assert.equal((await dispatch(active,'Hello')).status,'response_in_progress');assert.deepEqual(active.actions,[]);
});
test('dispatch ignores slider-like message text outside the reasoning menu',async()=>{
  const wrong=home.replace('매우 높음','높음');
  const state=header('https://chatgpt.com/')+'3 pop up button (expanded) 추론 수준\n5 menu 추론 수준\n  7 text Unknown layout\n8 container thread\n  9 text 높음, 5개 중 3번째. 왼쪽/오른쪽 화살표 키로 성능을 조정합니다.';
  const t=tab([wrong,wrong,wrong,state]);
  assert.equal((await dispatch(t,'Hello')).status,'needs_mode');
  assert.deepEqual(t.actions,[['click',3]]);
});
test('an unselected target choice in an open menu is not selected-mode evidence',async()=>{
  const state=header('https://chatgpt.com/')+'3 pop up button (expanded) High\n4 text entry area, ID: prompt-textarea\n5 menu Reasoning effort\n  6 button Extra High';
  const legacy=tab([state]);assert.equal((await sendOnce(legacy,'Hello')).status,'needs_mode');assert.deepEqual(legacy.actions,[]);
  const t=tab([state,state,state,home,header('https://chatgpt.com/c/a')+userTurn('Hello')]);
  assert.equal((await dispatch(t,'Hello')).status,'submitted');
  assert.deepEqual(t.actions,[['click',6],['click',4],['type','Hello'],['key','Return']]);
});
test('dispatch preserves an attempted task tab across controller turns without hiding its receipt',async()=>{
  const t=tab([home,header('https://chatgpt.com/c/a')+userTurn('Hello')]);
  let marked=0;t.markHandoff=async()=>{marked++;};
  assert.equal((await dispatch(t,'Hello')).status,'submitted');assert.equal(marked,1);
  const failed=tab([home,header('https://chatgpt.com/c/a')+userTurn('Hello')]);
  failed.markHandoff=async()=>{throw Error('runtime refused');};
  assert.equal((await dispatch(failed,'Hello')).retention,'unconfirmed');
  await assert.rejects(dispatch(failed,'Hello'),/already sent/);
  const preflight=tab([home+'\n5 button Stop generating']);preflight.markHandoff=async()=>{marked++;};
  assert.equal((await dispatch(preflight,'Hello')).status,'response_in_progress');assert.equal(marked,1);
});

const startupName='WebGPT Test';
const startupUrl='https://chatgpt.com/c/abc-123';
const startupLabel=`Allow ${startupName} for this conversation`;
const permissionState=header(startupUrl)+`1 container thread
  10 heading ChatGPT가 ${startupName}을(를) 사용하도록 허용할까요?, Value: 2
  11 button 항상 허용
  12 button 이번만 허용
  13 pop up button (collapsed) Description: ${startupLabel}, ID: permission`;
const permissionMenu=header(startupUrl)+`1 menu ${startupLabel}, ID: menu
  2 ${startupLabel}
    3 text ${startupLabel}`;
const startupOptions={startup:{connectorName:startupName,authorizeConversation:true,permissionScope:'conversation',maxObservations:2,intervalMs:0}};
const submittedState=header(startupUrl)+userTurn('Hello');
test('dispatch batches an explicitly authorized exact conversation-scoped permission',async()=>{
  const t=tab([home,submittedState,permissionState,permissionMenu,submittedState]);
  const result=await dispatch(t,'Hello','xh',startupOptions);
  assert.equal(result.status,'submitted');assert.equal(result.permission,'conversation_selected');
  assert.deepEqual(t.actions,[['click',4],['type','Hello'],['key','Return'],['click',13],['click',2]]);
});
test('startup confirms a late user turn in the same chat without resending',async()=>{
  const empty=header(startupUrl);
  const t=tab([home,empty,empty,empty,empty,submittedState]);
  const result=await dispatch(t,'Hello','xh',startupOptions);
  assert.equal(result.status,'submitted');assert.equal(result.permission,'not_observed');assert.equal(result.reason,undefined);
  assert.equal(t.actions.filter(a=>a[0]==='key').length,1);
});
test('startup never grants without explicit authorization or confirmed submission',async()=>{
  const t=tab([home,submittedState,permissionState]);
  const result=await dispatch(t,'Hello','xh',{startup:{...startupOptions.startup,authorizeConversation:false}});
  assert.equal(result.permission,'needs_authorization');assert.equal(t.actions.length,3);
  const empty=header(startupUrl);const missing=tab([home,empty,empty,empty,empty,permissionState]);
  assert.equal((await dispatch(missing,'Hello','xh',startupOptions)).status,'submission_unconfirmed');
  assert.equal(missing.actions.length,3);
});
test('explicit conversation scope rejects mismatched connector controls, unknown menus, and persistent choices',async()=>{
  for(const wrong of [permissionState.replaceAll(startupName,'Other'),permissionState.replace(startupLabel,'Always allow WebGPT Test')]) {
    const t=tab([home,submittedState,wrong]);const result=await dispatch(t,'Hello','xh',startupOptions);
    assert.notEqual(result.permission,'conversation_selected');assert.equal(t.actions.length,3);
  }
  for(const wrong of [permissionMenu.replaceAll(startupName,'Other'),permissionMenu.replace(`  2 ${startupLabel}`,'  2 Always allow'),permissionMenu+`\n  4 ${startupLabel}`]) {
    const t=tab([home,submittedState,permissionState,wrong]);
    assert.equal((await dispatch(t,'Hello','xh',startupOptions)).permission,'needs_ui');
    assert.deepEqual(t.actions.at(-1),['click',13]);
  }
});
test('startup stops on navigation before either permission mutation and reports uncleared prompts',async()=>{
  const other=header('https://chatgpt.com/c/other');
  for(const states of [[home,submittedState,other],[home,submittedState,permissionState,permissionMenu.replace(header(startupUrl),other)]]) {
    const t=tab(states);assert.equal((await dispatch(t,'Hello','xh',startupOptions)).status,'target_changed');
    assert.equal(t.actions.some(a=>a[0]==='click'&&a[1]===2),false);
  }
  const t=tab([home,submittedState,permissionState,permissionMenu,permissionState]);
  assert.equal((await dispatch(t,'Hello','xh',startupOptions)).permission,'unconfirmed');
});
test('startup bounds validate before sending and submission diagnostics do not contain prompts',async()=>{
  const t=tab([home]);
  for(const invalid of [{connectorName:''},{connectorName:'Name\nInjected'},{maxObservations:7},{intervalMs:5000},{authorizeConversation:'yes'}]) {
    await assert.rejects(dispatch(t,'Hello','xh',{startup:{...startupOptions.startup,...invalid}}),/invalid startup/);
  }
  assert.deepEqual(t.actions,[]);
  const missing=tab([home,header(startupUrl)]);
  const result=await sendOnce(missing,'Private prompt');
  assert.equal(result.reason,'turn_not_observed');assert.equal(result.observations,4);assert.equal(JSON.stringify(result).includes('Private prompt'),false);
});
test('dispatch lock includes startup permission transitions',async()=>{
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  const t=tab([home,submittedState,permissionState,permissionMenu,submittedState]);
  const click=t.click.bind(t);t.click=async i=>{await click(i);if(i===13){enter();await gate;}};
  const pending=dispatch(t,'Hello','xh',startupOptions);await entered;
  await assert.rejects(dispatch(t,'Other'),/in flight/);await assert.rejects(sendOnce(t,'Other'),/in flight/);
  release();assert.equal((await pending).permission,'conversation_selected');
});
test('startup pins a verified saved URL during permission-menu navigation',async()=>{
  const draft='https://chatgpt.com/c/WEB:abc-123';
  const active='4 container page-header\n  5 button Description: More, ID: conversation-options-WEB:abc-123\n';
  const t=tab([home,submittedState.replace(startupUrl,draft),permissionState.replace(startupUrl,draft),permissionMenu.replace('1 menu',active+'1 menu'),submittedState]);
  const result=await dispatch(t,'Hello','xh',startupOptions);
  assert.equal(result.permission,'conversation_selected');assert.equal(result.url,startupUrl);
});
test('a blank or error page after selecting permission cannot claim a verified startup transition',async()=>{
  for(const after of [header(startupUrl),header(startupUrl)+'9 text Failed to load']) {
    const t=tab([home,submittedState,permissionState,permissionMenu,after]);
    const result=await dispatch(t,'Hello','xh',startupOptions);
    assert.equal(result.permission,'unconfirmed');assert.equal(t.actions.length,5);
  }
});
test('cleanup settles delayed dialog and redirect without repeating either mutation',async()=>{
  const url='https://chatgpt.com/c/a';
  const initial=header(url)+'2 container page-header\n  5 button Description: More, ID: conversation-options-a';
  const menu=header(url)+'6 Delete';
  const pending=header(url)+'7 container Delete chat?';
  const dialog=pending+'\n8 text Owned task\n9 button Delete';
  const t=tab([initial,menu,pending,pending,dialog,dialog,dialog,header('https://chatgpt.com/')]);
  const result=await deleteAndClose(t,{listTabs:async()=>[]},'1',url);
  assert.equal(result.status,'deleted_and_closed');
  assert.deepEqual(t.actions,[['click',5],['click',6],['click',9],['close']]);
});
test('cleanup never confirms a mismatched dialog or closes an unrelated redirect',async()=>{
  const url='https://chatgpt.com/c/a';
  const initial=header(url)+'2 container page-header\n  5 button Description: More, ID: conversation-options-a';
  const menu=header(url)+'6 Delete';
  const wrong=header(url)+'7 container Delete chat?\n8 text Other chat\n9 button Delete';
  const t=tab([initial,menu,wrong]);
  assert.equal((await deleteAndClose(t,{listTabs:async()=>[]},'1',url)).status,'needs_dialog_verification');
  assert.equal(t.actions.some(a=>a[1]===9),false);
  const dialog=wrong.replace('Other chat','Owned task');
  const other=tab([initial,menu,dialog,header('https://chatgpt.com/c/other')]);
  assert.equal((await deleteAndClose(other,{listTabs:async()=>[]},'1',url)).status,'deletion_unconfirmed');
  assert.equal(other.actions.some(a=>a[0]==='close'),false);
});

const recoveryProof=`1 container thread
  20 heading You said:, Value: 5
    21 text Hello
  22 heading ChatGPT said:, Value: 6
`;
const recoveryCard=permissionState.replace('1 container thread\n',recoveryProof);
const recoveryMenu=permissionMenu+'\n'+recoveryProof;
const recoveryOptions={prompt:'Hello',connectorName:startupName,authorizeConversation:true,permissionScope:'conversation'};
test('late permission recovery observes its own user-turn evidence and never sends',async()=>{
  const t=tab([recoveryCard,recoveryMenu,header(startupUrl)+recoveryProof]);
  const result=await recoverPermission(t,startupUrl,recoveryOptions);
  assert.equal(result.permission,'conversation_selected');assert.equal(result.observations,1);
  assert.deepEqual(t.actions,[['click',13],['click',2]]);
});
test('late recovery refuses missing, echoed, sidebar, duplicate and wrong prompt evidence',async()=>{
  for(const proof of ['',recoveryProof.replace('You said:','ChatGPT said:'),recoveryProof.replace('container thread','container sidebar'),recoveryProof.replace('text Hello','text Other'),recoveryProof+'  23 heading You said:, Value: 5\n    24 text Hello\n']) {
    const t=tab([permissionState.replace('1 container thread\n',proof)]);
    const result=await recoverPermission(t,startupUrl,recoveryOptions);
    assert.equal(result.status,'submission_unconfirmed');assert.deepEqual(t.actions,[]);
  }
});
test('late recovery requires authorization, exact connector controls and known scoped choices',async()=>{
  const unauth=tab([recoveryCard]);
  assert.equal((await recoverPermission(unauth,startupUrl,{...recoveryOptions,authorizeConversation:false})).permission,'needs_authorization');
  assert.deepEqual(unauth.actions,[]);
  for(const card of [recoveryCard.replaceAll(startupName,'Other'),recoveryCard.replace(startupLabel,'Always allow')]) {
    const t=tab([card]);assert.notEqual((await recoverPermission(t,startupUrl,recoveryOptions)).permission,'conversation_selected');assert.deepEqual(t.actions,[]);
  }
  const wrong=tab([recoveryCard,recoveryMenu.replace(`  2 ${startupLabel}`,'  2 Always allow')]);
  assert.equal((await recoverPermission(wrong,startupUrl,recoveryOptions)).permission,'needs_ui');
  assert.deepEqual(wrong.actions,[['click',13]]);
});
test('late recovery pins canonical URLs and stops on unrelated navigation',async()=>{
  const draft='https://chatgpt.com/c/WEB:abc-123';
  const active='4 container page-header\n  5 button Description: More, ID: conversation-options-WEB:abc-123\n';
  const t=tab([recoveryCard.replace(startupUrl,draft),recoveryMenu.replace('1 menu',active+'1 menu'),header(startupUrl)+recoveryProof]);
  const result=await recoverPermission(t,draft,recoveryOptions);
  assert.equal(result.permission,'conversation_selected');assert.equal(result.url,startupUrl);
  for(const states of [[recoveryCard.replace(startupUrl,'https://chatgpt.com/c/other')],[recoveryCard,recoveryMenu.replace(startupUrl,'https://chatgpt.com/c/other')]]) {
    const changed=tab(states);assert.equal((await recoverPermission(changed,startupUrl,recoveryOptions)).status,'target_changed');
    assert.equal(changed.actions.some(a=>a[1]===2),false);
  }
});
test('late recovery shares mutation locks and releases them after exceptions',async()=>{
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  const t=tab([recoveryCard,recoveryMenu,header(startupUrl)+recoveryProof]);
  const click=t.click.bind(t);t.click=async i=>{await click(i);if(i===13){enter();await gate;}};
  const pending=recoverPermission(t,startupUrl,recoveryOptions);await entered;
  await assert.rejects(recoverPermission(t,startupUrl,recoveryOptions),/in flight/);
  await assert.rejects(dispatch(t,'Other'),/in flight/);await assert.rejects(sendOnce(t,'Other'),/in flight/);
  release();await pending;
  const failed=tab([recoveryCard]);failed.click=async()=>{throw Error('disconnected');};
  await assert.rejects(recoverPermission(failed,startupUrl,recoveryOptions),/disconnected/);
  failed.getAXState=async()=>header('https://chatgpt.com/c/other');
  assert.equal((await recoverPermission(failed,startupUrl,recoveryOptions)).status,'target_changed');
});
test('late recovery validates bounds before reads and never trusts caller submission flags',async()=>{
  const t=tab([permissionState]);let reads=0;const read=t.getAXState.bind(t);t.getAXState=async o=>{reads++;return read(o);};
  for(const invalid of [{prompt:''},{connectorName:''},{authorizeConversation:'true'},{maxObservations:7},{intervalMs:5000}])await assert.rejects(recoverPermission(t,startupUrl,{...recoveryOptions,...invalid}));
  assert.equal(reads,0);
  assert.equal((await recoverPermission(t,startupUrl,{...recoveryOptions,submitted:true,previousMatches:-1})).status,'submission_unconfirmed');
  assert.equal(reads,1);assert.deepEqual(t.actions,[]);
});

test('late recovery rejects a matching historical prompt superseded by another user turn',async()=>{
  const proof=recoveryProof+'  23 heading You said:, Value: 5\n    24 text Different assignment\n  25 heading ChatGPT said:, Value: 6\n';
  const t=tab([permissionState.replace('1 container thread\n',proof)]);
  const result=await recoverPermission(t,startupUrl,recoveryOptions);
  assert.equal(result.status,'submission_unconfirmed');assert.deepEqual(t.actions,[]);
});

test('late recovery cannot reuse an earlier sample after a newer assignment appears',async()=>{
  const newer=recoveryProof+'  23 heading You said:, Value: 5\n    24 text Different assignment\n  25 heading ChatGPT said:, Value: 6\n';
  const newerCard=permissionState.replace('1 container thread\n',newer);
  const t=tab([header(startupUrl)+recoveryProof,newerCard]);
  const result=await recoverPermission(t,startupUrl,{...recoveryOptions,maxObservations:2});
  assert.equal(result.status,'submission_unconfirmed');assert.deepEqual(t.actions,[]);
});
test('late recovery revalidates current assignment before selecting the permission menu item',async()=>{
  const newer=recoveryProof+'  23 heading You said:, Value: 5\n    24 text Different assignment\n  25 heading ChatGPT said:, Value: 6\n';
  for(const menu of [permissionMenu,permissionMenu+'\n'+newer]) {
    const t=tab([recoveryCard,menu]);
    const result=await recoverPermission(t,startupUrl,recoveryOptions);
    assert.equal(result.status,'submission_unconfirmed');assert.equal(result.permission,'not_attempted');
    assert.deepEqual(t.actions,[['click',13]]);
  }
});

test('Work surface preflight prevents dispatch, send and late permission mutations',async()=>{
  for(const url of ['https://chatgpt.com/?surface=work','https://chatgpt.com/c/abc-123?surface=work','https://chatgpt.com/c/abc-123?other=1&surface=work']) {
    for(const action of [t=>dispatch(t,'Hello'),t=>sendOnce(t,'Hello'),t=>sendOnce(t,'Next','xh',{taskId:'next',expectedUrl:startupUrl}),t=>recoverPermission(t,startupUrl,recoveryOptions)]) {
      const t=tab([home.replace('https://chatgpt.com/',url)]);
      assert.equal((await action(t)).status,'needs_chat_surface');assert.deepEqual(t.actions,[]);
    }
  }
});
test('Work transition during mode preparation prevents message submission',async()=>{
  const wrong=home.replace('매우 높음','높음');
  const work=wrong.replace('https://chatgpt.com/','https://chatgpt.com/?surface=work');
  const t=tab([wrong,wrong,wrong,work]);
  assert.equal((await dispatch(t,'Hello')).status,'needs_chat_surface');
  assert.deepEqual(t.actions,[['click',3]]);
});
test('Work transition during permission handling prevents the permission grant',async()=>{
  const workCard=recoveryCard.replace(startupUrl,startupUrl+'?surface=work');
  const workMenu=recoveryMenu.replace(startupUrl,startupUrl+'?surface=work');
  for(const states of [[workCard],[recoveryCard,workMenu]]) {
    const t=tab(states);
    assert.equal((await recoverPermission(t,startupUrl,recoveryOptions)).status,'needs_chat_surface');
    assert.equal(t.actions.some(a=>a[1]===2),false);
  }
  const t=tab([home,submittedState,permissionState,workMenu]);
  assert.equal((await dispatch(t,'Hello','xh',startupOptions)).status,'needs_chat_surface');
  assert.equal(t.actions.some(a=>a[1]===2),false);
});
test('Work transition after a send cannot trigger startup or a duplicate send',async()=>{
  const t=tab([home,submittedState.replace(startupUrl,startupUrl+'?surface=work')]);
  let handoffs=0;t.markHandoff=async()=>{handoffs++;};
  const result=await dispatch(t,'Hello','xh',startupOptions);
  assert.equal(result.status,'submission_unconfirmed');assert.equal(result.reason,'needs_chat_surface');
  assert.equal(result.ownershipUnconfirmed,true);assert.equal(handoffs,1);
  assert.deepEqual(t.actions,[['click',4],['type','Hello'],['key','Return']]);
  await assert.rejects(sendOnce(t,'Hello'),/already sent/);
});
test('selected Work radio prevents mutations even when saved URL has no surface query',async()=>{
  const selector='\n42 채팅 화면 선택\n  44 radio button Chat, Value: 0\n  45 radio button Work, Value: 1';
  for(const action of [t=>dispatch(t,'Next','xh',{taskId:'next',expectedUrl:startupUrl}),t=>sendOnce(t,'Next','xh',{taskId:'next',expectedUrl:startupUrl}),t=>recoverPermission(t,startupUrl,recoveryOptions)]) {
    const t=tab([recoveryCard+selector]);
    assert.equal((await action(t)).status,'needs_chat_surface');assert.deepEqual(t.actions,[]);
  }
  const t=tab([recoveryCard,recoveryMenu+selector]);
  assert.equal((await recoverPermission(t,startupUrl,recoveryOptions)).status,'needs_chat_surface');
  assert.deepEqual(t.actions,[['click',13]]);
});
test('Work text mentions and unselected Work radios are not surface evidence',async()=>{
  for(const mention of ['\n45 text Work, Value: 1','\n45 radio button Work, Value: 0']) {
    const t=tab([home+mention,submittedState]);
    assert.equal((await sendOnce(t,'Hello')).status,'submitted');
  }
});

test('permission recovery returns the already-observed finished help reply without leaking sidebar or prompt',async()=>{
  const prompt='Private assignment context',reply='Blocked: please reconnect the worker before I can continue.';
  const state=header(startupUrl)+'8 container sidebar\n  9 text PRIVATE SIDEBAR\n1 container thread\n'+replyTurn(prompt,reply);
  const t=tab([state]);let reads=0;const read=t.getAXState.bind(t);t.getAXState=async opts=>{reads++;return read(opts);};
  const result=await recoverPermission(t,startupUrl,{...recoveryOptions,prompt});
  assert.equal(result.permission,'not_observed');assert.equal(reads,1);
  assert.deepEqual(result.replyObservation,{status:'completed',text:reply,truncated:false,originalChars:reply.length});
  assert.equal(JSON.stringify(result).includes(prompt),false);assert.equal(JSON.stringify(result).includes('PRIVATE SIDEBAR'),false);
  assert.deepEqual(t.actions,[]);
});
test('permission recovery reports in-progress and explicitly unknown latest reply evidence',async()=>{
  const t=tab([header(startupUrl)+'1 container thread\n'+replyTurn('Hello','Working on the task',{stop:true})]);
  assert.equal((await recoverPermission(t,startupUrl,recoveryOptions)).replyObservation.status,'in_progress');
  const unknown=tab([header(startupUrl)+'2 text Unattributed secret text']);
  assert.deepEqual((await recoverPermission(unknown,startupUrl,recoveryOptions)).replyObservation,{status:'unknown',text:'',truncated:false,originalChars:0});
});
test('permission recovery bounds reply text while preserving both ends and explicit truncation',async()=>{
  const reply='START: need help. '+ 'x'.repeat(4000)+' END: connection failed.';
  const t=tab([header(startupUrl)+'1 container thread\n'+replyTurn('Hello',reply)]);
  const observation=(await recoverPermission(t,startupUrl,recoveryOptions)).replyObservation;
  assert.equal(observation.status,'completed');assert.equal(observation.truncated,true);
  assert.equal(observation.originalChars,reply.length);assert.equal(observation.text.length,1500);
  assert.equal(observation.text.startsWith('START: need help.'),true);assert.equal(observation.text.endsWith('END: connection failed.'),true);
  assert.match(observation.text,/\[truncated\]/);
});
test('reply diagnostics do not change ordinary startup output or add recovery observations',async()=>{
  const state=header(startupUrl)+'1 container thread\n'+replyTurn('Hello','Done');
  const normal=tab([home,submittedState,state]);
  assert.equal((await dispatch(normal,'Hello','xh',{startup:{...startupOptions.startup,maxObservations:1}})).replyObservation,undefined);
  const t=tab([header(startupUrl),state]);let reads=0;const read=t.getAXState.bind(t);t.getAXState=async opts=>{reads++;return read(opts);};
  const result=await recoverPermission(t,startupUrl,{...recoveryOptions,maxObservations:2});
  assert.equal(reads,2);assert.equal(result.replyObservation.text,'Done');
});

const nativePermissionMenu=header(startupUrl)+`0 AXWebArea Implement Module Assignment, URL: chatgpt.com/c/abc-123
  1 container
    2 menu ${startupLabel}, ID: native-menu
      3 ${startupLabel}
        4 text ${startupLabel}

The focused UI element is 2 menu ${startupLabel}, ID: native-menu`;
test('late recovery handles the observed native menu-only AX after fresh prompt proof',async()=>{
  const t=tab([recoveryCard,nativePermissionMenu,header(startupUrl)+recoveryProof]);
  assert.equal((await recoverPermission(t,startupUrl,recoveryOptions)).permission,'conversation_selected');
  assert.deepEqual(t.actions,[['click',13],['click',3]]);
});
test('native menu-only recovery rejects extra semantic content, other menus and changed ownership',async()=>{
  for(const menu of [nativePermissionMenu+'\n9 heading Another assignment',nativePermissionMenu+'\n9 menu Other menu',nativePermissionMenu+'\n9 button Always allow',nativePermissionMenu+'\n9 container thread',nativePermissionMenu.replace(startupUrl,'https://chatgpt.com/c/other')]) {
    const t=tab([recoveryCard,menu]);
    const result=await recoverPermission(t,startupUrl,recoveryOptions);
    assert.notEqual(result.permission,'conversation_selected');assert.deepEqual(t.actions,[['click',13]]);
  }
  const noProof=tab([permissionState,nativePermissionMenu]);
  assert.equal((await recoverPermission(noProof,startupUrl,recoveryOptions)).status,'submission_unconfirmed');assert.deepEqual(noProof.actions,[]);
});

const preparedUrl='https://chatgpt.com/c/prepared';
const prepareInitial=header(preparedUrl)+'2 container page-header\n  5 button Description: More, ID: conversation-options-prepared';
const prepareMenu=header(preparedUrl)+'6 Delete';
const prepareDialog=header(preparedUrl)+'7 container Delete chat?\n8 text Owned task\n9 button Delete';
test('prepare deletion retains a serializable exact dialog without deleting or closing',async()=>{
  const t=tab([prepareInitial,prepareMenu,prepareDialog]);let handoffs=0;t.markHandoff=async()=>{handoffs++;};
  const result=await prepareDelete(t,preparedUrl);
  assert.deepEqual(result,{status:'deletion_prepared',tabId:'1',url:preparedUrl,title:'Owned task',consumed:false});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result);assert.equal(handoffs,1);
  assert.deepEqual(t.actions,[['click',5],['click',6]]);
});
test('fresh module confirms a serialized receipt only from a current exact owned dialog',async()=>{
  const t=tab([prepareInitial,prepareMenu,prepareDialog]);t.markHandoff=async()=>{};
  const serialized=JSON.stringify(await prepareDelete(t,preparedUrl));
  const fresh=await import('./browser.mjs?prepared-test');
  const resumed=tab([prepareDialog,header('https://chatgpt.com/')]);
  const receipt=JSON.parse(serialized);
  assert.equal((await fresh.confirmDeleteAndClose(resumed,{listTabs:async()=>[]},'1',receipt)).status,'deleted_and_closed');
  assert.equal(receipt.consumed,true);assert.deepEqual(resumed.actions,[['click',9],['close']]);
  assert.equal((await fresh.confirmDeleteAndClose(resumed,{listTabs:async()=>[]},'1',receipt)).status,'deletion_already_attempted');
  assert.deepEqual(resumed.actions,[['click',9],['close']]);
});
test('confirmation refuses changed tab URL title or dialog without mutations',async()=>{
  const receipt={status:'deletion_prepared',tabId:'1',url:preparedUrl,title:'Owned task',consumed:false};
  for(const state of [prepareDialog.replace('Browser tab: 1','Browser tab: 2'),prepareDialog.replace(preparedUrl,'https://chatgpt.com/c/other'),prepareDialog.replaceAll('Owned task','Other title'),header(preparedUrl)+'8 text Owned task\n9 button Delete']) {
    const t=tab([state]);assert.notEqual((await confirmDeleteAndClose(t,{},'1',{...receipt})).status,'deleted_and_closed');assert.deepEqual(t.actions,[]);
  }
  const changed=tab([prepareDialog]);changed.id='different';
  assert.equal((await confirmDeleteAndClose(changed,{},'1',receipt)).status,'target_changed');assert.deepEqual(changed.actions,[]);
});
test('ambiguous final deletion consumes the receipt and cannot be replayed',async()=>{
  const receipt={status:'deletion_prepared',tabId:'1',url:preparedUrl,title:'Owned task',consumed:false};
  const t=tab([prepareDialog]);t.click=async i=>{t.actions.push(['click',i]);throw Error('connection lost');};
  await assert.rejects(confirmDeleteAndClose(t,{},'1',receipt),/connection lost/);
  assert.equal(receipt.consumed,true);
  assert.equal((await confirmDeleteAndClose(t,{},'1',{...receipt,consumed:false})).status,'deletion_already_attempted');
  assert.equal((await prepareDelete(t,preparedUrl)).status,'deletion_already_attempted');
  assert.deepEqual(t.actions,[['click',9]]);
});
test('preparation reports failed or unsupported retention without destructive action',async()=>{
  for(const handoff of [undefined,async()=>{throw Error('retention failed');}]) {
    const t=tab([prepareInitial,prepareMenu,prepareDialog]);t.markHandoff=handoff;
    const result=await prepareDelete(t,preparedUrl);
    assert.equal(result.status,'deletion_prepared');assert.equal(result.retention,'unconfirmed');
    assert.deepEqual(t.actions,[['click',5],['click',6]]);
  }
});
test('cleanup locks prevent concurrent cleanup and message mutations',async()=>{
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  const t=tab([prepareInitial,prepareMenu,prepareDialog]);t.markHandoff=async()=>{};
  const click=t.click.bind(t);t.click=async i=>{await click(i);if(i===5){enter();await gate;}};
  const pending=prepareDelete(t,preparedUrl);await entered;
  await assert.rejects(prepareDelete(t,preparedUrl),/in flight/);
  await assert.rejects(deleteAndClose(t,{},'1',preparedUrl),/in flight/);
  await assert.rejects(confirmDeleteAndClose(t,{},'1',{}),/in flight/);
  await assert.rejects(sendOnce(t,'Hello'),/in flight/);await assert.rejects(dispatch(t,'Hello'),/in flight/);
  await assert.rejects(recoverPermission(t,preparedUrl,recoveryOptions),/in flight/);
  release();assert.equal((await pending).status,'deletion_prepared');
});

test('authorized startup defaults to Always allow when both permission scopes are offered',async()=>{
  for(const button of ['항상 허용','Always allow']) {
    const t=tab([home,submittedState,permissionState.replace('항상 허용',button),submittedState]);
    const result=await dispatch(t,'Hello','xh',{startup:{connectorName:startupName,authorizeConversation:true,maxObservations:1}});
    assert.equal(result.permission,'always_selected');
    assert.deepEqual(t.actions,[['click',4],['type','Hello'],['key','Return'],['click',11]]);
  }
});
test('late recovery defaults to Always allow but preserves explicit narrower scope',async()=>{
  const t=tab([recoveryCard,header(startupUrl)+recoveryProof]);
  const result=await recoverPermission(t,startupUrl,{...recoveryOptions,permissionScope:undefined});
  assert.equal(result.permission,'always_selected');assert.deepEqual(t.actions,[['click',11]]);
  const narrow=tab([recoveryCard,recoveryMenu,header(startupUrl)+recoveryProof]);
  assert.equal((await recoverPermission(narrow,startupUrl,recoveryOptions)).permission,'conversation_selected');
  assert.deepEqual(narrow.actions,[['click',13],['click',2]]);
});
test('default Always allow never silently falls back to conversation or unrelated controls',async()=>{
  for(const card of [recoveryCard.replace('11 button 항상 허용','11 button 이번만 허용'),recoveryCard.replace('11 button 항상 허용','11 button (disabled) 항상 허용'),recoveryCard.replace('11 button 항상 허용','11 heading Another connector\n  14 button 항상 허용'),recoveryCard.replace('11 button 항상 허용','11 button 항상 허용\n  14 button Always allow')]) {
    const t=tab([card]);const result=await recoverPermission(t,startupUrl,{...recoveryOptions,permissionScope:undefined});
    assert.equal(result.permission,'needs_ui');assert.deepEqual(t.actions,[]);
  }
  const unrelated=tab([recoveryCard.replaceAll(startupName,'Other connector')]);
  assert.equal((await recoverPermission(unrelated,startupUrl,{...recoveryOptions,permissionScope:undefined})).permission,'not_observed');assert.deepEqual(unrelated.actions,[]);
});
test('Always allow requires authorization and fresh task proof and verifies its outcome',async()=>{
  for(const [card,options] of [[recoveryCard,{authorizeConversation:false}],[permissionState,{}]]) {
    const t=tab([card]);assert.notEqual((await recoverPermission(t,startupUrl,{...recoveryOptions,permissionScope:undefined,...options})).permission,'always_selected');assert.deepEqual(t.actions,[]);
  }
  for(const after of [header(startupUrl),recoveryCard]) {
    const t=tab([recoveryCard,after]);assert.equal((await recoverPermission(t,startupUrl,{...recoveryOptions,permissionScope:undefined})).permission,'unconfirmed');assert.deepEqual(t.actions,[['click',11]]);
  }
  const t=tab([recoveryCard]);await assert.rejects(recoverPermission(t,startupUrl,{...recoveryOptions,permissionScope:'unrestricted'}),/invalid startup/);assert.deepEqual(t.actions,[]);
});

test('all mode aliases accept only their exact selected labels without mode actions',async()=>{
  for(const [aliases,labels] of [
    [['xh','xhigh'],['매우 높음','Extra High']],
    [['h','high'],['높음','High']],
    [['m','medium'],['중간','Medium','표준','Standard']],
    [['p','pro'],['Pro']],
  ]) for(const alias of aliases) for(const selected of labels) for(const send of [sendOnce,dispatch]) {
    const t=tab([home.replace('매우 높음',selected),header('https://chatgpt.com/c/a')+userTurn('Hello')]);
    assert.equal((await send(t,'Hello',alias)).status,'submitted',`${alias}: ${selected}`);
    assert.deepEqual(t.actions,[['click',4],['type','Hello'],['key','Return']]);
  }
  for(const invalid of ['standard','light','unknown','toString']) {
    const t=tab([home]);
    await assert.rejects(dispatch(t,'Hello',invalid),/unsupported mode/);
    assert.deepEqual(t.actions,[]);
  }
});

test('reasoning slider moves both directions for high, medium, xhigh and pro',async()=>{
  for(const [alias,path,direction] of [
    ['h',['Extra High','High'],'Left'],
    ['medium',['High','Standard'],'Left'],
    ['high',['Medium','High'],'Right'],
    ['m',['Pro','Extra High','High','Standard'],'Left'],
    ['xhigh',['Pro','Extra High'],'Left'],
    ['p',['Light','Standard','High','Extra High','Pro'],'Right'],
    ['m',['높음','표준'],'Left'],
  ]) {
    const closed=label=>home.replace('매우 높음',label);
    const menu=label=>header('https://chatgpt.com/')+`3 pop up button (expanded) Reasoning effort\n5 menu Reasoning effort\n  6 text ${label}, use left/right arrow keys to adjust.`;
    const t=tab([closed(path[0]),closed(path[0]),closed(path[0]),...path.map(menu),closed(path.at(-1)),header('https://chatgpt.com/c/a')+userTurn('Hello')]);
    assert.equal((await dispatch(t,'Hello',alias)).status,'submitted',alias);
    assert.deepEqual(t.actions,[['click',3],...path.slice(1).flatMap(()=>[['click',6],['key',direction]]),['key','Escape'],['click',4],['type','Hello'],['key','Return']]);
  }
});

test('high and medium never send on unknown, ineffective or unverified mode changes',async()=>{
  for(const alias of ['h','m']) for(const current of ['Extra High','Unknown']) {
    const menu=header('https://chatgpt.com/')+`3 pop up button (expanded) Reasoning effort\n5 menu Reasoning effort\n  6 text ${current}, use left/right arrow keys to adjust.`;
    const t=tab([home,home,home,menu]);
    assert.equal((await dispatch(t,'Hello',alias)).status,'needs_mode');
    assert.equal(t.actions.some(action=>action[0]==='type'),false);
    assert.equal(t.actions.filter(action=>action[0]==='key').length,current==='Unknown'?0:1);
    const wrong=tab([home]);
    assert.equal((await sendOnce(wrong,'Hello',alias)).status,'needs_mode');
    assert.deepEqual(wrong.actions,[]);
  }
});


const performanceMenu=(label,focus='menu')=>{
  const control={menu:'5 menu 추론 수준, ID: radix-test',model:'8 (collapsed) Description: 모델 선택, Secondary Actions: Expand',performance:'9 성능',unknown:'20 button Other'}[focus];
  return header('https://chatgpt.com/')+`3 pop up button (expanded) 추론 수준\n5 menu 추론 수준, ID: radix-test\n  7 container\n    8 (collapsed) Description: 모델 선택, Secondary Actions: Expand\n    9 성능\n    6 text ${label}, 5개 중 4번째. 왼쪽/오른쪽 화살표 키로 성능을 조정합니다.\nThe focused UI element is ${control}`;
};
test('Performance keyboard focus is bounded, verified, and preserved across directional arrows',async()=>{
  for(const [mode,initial,path,keys] of [
    ['m','menu',['높음','중간'],['Left','Left']],
    ['h','model',['높음'],['Left']],
    ['pro','performance',['Pro'],['Right']],
  ]) {
    const focusStates=initial==='menu'?['menu','model','performance']:initial==='model'?['model','performance']:['performance'];
    const t=tab([home,home,home,...focusStates.map(focus=>performanceMenu('매우 높음',focus)),...path.map(label=>performanceMenu(label,'performance')),home.replace('매우 높음',path.at(-1)),header('https://chatgpt.com/c/a')+userTurn('Hello')]);
    assert.equal((await dispatch(t,'Hello',mode)).status,'submitted');
    assert.deepEqual(t.actions,[['click',3],...focusStates.slice(1).map(()=>['key','Down']),...keys.map(key=>['key',key]),['key','Escape'],['click',4],['type','Hello'],['key','Return']]);
  }
});
test('Performance refuses unknown, missing or ineffective focus and ineffective value transitions',async()=>{
  for(const [states,expectedKeys,status] of [
    [[performanceMenu('매우 높음','unknown')],0,'needs_mode'],
    [[performanceMenu('매우 높음').split('\nThe focused')[0]],0,'needs_mode'],
    [[performanceMenu('매우 높음')],2,'needs_mode'],
    [[performanceMenu('매우 높음'),performanceMenu('매우 높음','model'),performanceMenu('매우 높음','performance')],3,'needs_mode'],
    [[performanceMenu('매우 높음'),performanceMenu('매우 높음','model').replace('https://chatgpt.com/','https://chatgpt.com/c/other')],1,'target_changed'],
  ]) {
    const t=tab([home,home,home,...states]);
    assert.equal((await dispatch(t,'Hello','m')).status,status);
    assert.equal(t.actions.some(action=>action[0]==='type'),false);
    assert.equal(t.actions.filter(action=>action[0]==='key').length,expectedKeys);
    assert.deepEqual(t.actions.filter(action=>action[0]==='click'),[['click',3]]);
  }
});
