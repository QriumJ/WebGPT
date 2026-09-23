// Pure helpers over the caller's documented CUA tab API; no browser transport or private APIs.
const attempts = new WeakMap();
const inFlight = new WeakSet();
const dispatching = new WeakSet();
const dispatchKey = Symbol();
const receipts = new WeakMap();
const observe = tab => tab.getAXState({ emit: false, disableDiffing: true });
const lines = state => state.split('\n').map(line => line.trim());
const one = (state, predicate) => {
  const matches = lines(state).filter(predicate).map(line => Number(line.match(/^(\d+) /)?.[1]));
  return matches.length === 1 && Number.isInteger(matches[0]) ? matches[0] : null;
};
const location = state => state.match(/Browser tab: .*?URL: "([^"]+)"/)?.[1];
const title = state => state.match(/Browser tab: .*?Title: "([^"]*)"/)?.[1];
const workSurface = state => {
  // Observed surface selector: radio button Work, Value: 1. Text mentions are not controls.
  if(lines(state).some(line => /^\d+ radio button Work, Value: 1$/.test(line)))return true;
  try { return new URL(location(state)).searchParams.getAll('surface').includes('work'); }
  catch { return false; }
};
const modeAliases = new Map([['xh','xh'],['xhigh','xh'],['h','h'],['high','h'],['m','m'],['medium','m'],['p','pro'],['pro','pro']]);
const modeLabels = {xh:/^(?:매우 높음|Extra High)$/i,h:/^(?:높음|High)$/i,m:/^(?:중간|Medium|표준|Standard)$/i,pro:/^Pro$/i};
const modeLine = mode => modeLabels[mode];
const modeRank = text => [/^(?:낮음|Light)$/i,modeLabels.m,modeLabels.h,modeLabels.xh,modeLabels.pro].findIndex(pattern=>pattern.test(text));
const modeControl = text => /^(?:추론 수준|Reasoning effort|Reasoning level)$/i.test(text) || modeRank(text)>=0;
const label = line => line.replace(/^\d+ (?:pop up )?button(?: \([^)]*\))? (?:Description: )?/, '').split(/, (?:ID:|Secondary Actions:)/)[0];

const conversationUrl = url => /^https:\/\/chatgpt\.com\/c\/[^/?#]+$/.test(url ?? '');
function pageHeader(state) {
  const rows = state.split('\n');
  const headers = rows.map((line, index) => /^\s*\d+ container page-header$/.test(line) ? index : -1).filter(index => index >= 0);
  if (headers.length !== 1) return '';
  const start = headers[0];
  const depth = rows[start].match(/^\s*/)[0].length;
  let end = start + 1;
  while (end < rows.length && rows[end].trim() && rows[end].match(/^\s*/)[0].length > depth) end++;
  return rows.slice(start + 1, end).join('\n');
}
// Only the active conversation menu can link a draft to its saved URL. Sidebar
// links, repeated message text and a changed URL alone are not ownership evidence.
function resolveConversation(state, expectedUrl) {
  const url = location(state);
  if (!conversationUrl(expectedUrl)) return null;
  if (url === expectedUrl) return url;
  const draft = expectedUrl.match(/\/c\/(WEB:[a-zA-Z0-9-]+)$/)?.[1];
  const menu = one(pageHeader(state), line => /^\d+ button/.test(line)
    && line.match(/(?:, )?ID: conversation-options-([^,\s]+)/)?.[1] === draft);
  return draft && menu !== null && /^https:\/\/chatgpt\.com\/c\/[a-f0-9-]+$/.test(url ?? '') ? url : null;
}
const normalize = text => text.replace(/\s+/g, ' ').trim();
// Evidence is a speaker-labelled user turn, or an observed message section with
// ChatGPT's own user-message action container. Text or URL changes alone are not enough.
function matchingUserTurns(state, prompt) {
  const turns = [];
  let current = null;
  let inText = false;
  for (const line of lines(state)) {
    if (/^\d+ heading\b/.test(line)) {
      current = { text: [], user: /^\d+ heading(?: \([^)]*\))? (?:You said:|나의 말:)(?:, Value: \d+)?$/.test(line) };
      turns.push(current);
      inText = false;
    } else if (/^\d+ (?:text entry area|textbox)\b/.test(line)) {
      current = null;
      inText = false;
    } else if (current && /^\d+ container 내 메시지 작업$/.test(line)) {
      current.user = true;
      current = null; // The following controls are not message text.
      inText = false;
    } else if (current) {
      const text = line.match(/^\d+ (?:text|paragraph) (.+)$/)?.[1];
      if (text) {
        current.text.push(text);
        inText = true;
      } else if (inText && line && !/^\d+ /.test(line)) {
        current.text.push(line); // Multiline AX text values.
      } else {
        inText = false;
      }
    }
  }
  return turns.filter(turn => turn.user && normalize(turn.text.join(' ')) === normalize(prompt)).length;
}

function reasoningMenu(state) {
  const rows=state.split('\n');
  const indices=rows.map((row,i)=>/^\s*\d+ menu (?:추론 수준|Reasoning effort|Reasoning level)(?:, ID:.*)?$/.test(row)?i:-1).filter(i=>i>=0);
  if(indices.length!==1)return '';
  const start=indices[0], depth=rows[start].match(/^\s*/)[0].length;
  let end=start+1;
  while(end<rows.length && rows[end].trim() && rows[end].match(/^\s*/)[0].length>depth)end++;
  return rows.slice(start+1,end).join('\n');
}

// Batch only observed, recognized reasoning controls. Unknown UI remains a caller
// decision. Every transition is re-observed, and no prompt is typed until verified.
async function prepareMode(tab, state, mode, accepts) {
  const selected = snapshot => one(snapshot, line => /^\d+ pop up button/.test(line)
    && !/\(expanded\)|\(disabled\)/.test(line) && modeLine(mode).test(label(line))) !== null;
  let blockedStatus='target_changed';
  const read = async () => {
    const next = await observe(tab);
    if(workSurface(next)){blockedStatus='needs_chat_surface';return null;}
    return accepts(next) ? next : null;
  };
  if (selected(state)) return {state};
  // New tabs can expose the composer before the saved mode label settles.
  for (const delay of [150, 350]) {
    await new Promise(resolve => setTimeout(resolve, delay));
    state = await read();
    if (!state) return {status:blockedStatus};
    if (selected(state)) return {state};
  }
  // Hydration may take longer than the first short settle. Only wait further
  // when there is no recognized mode control; never cycle an ineffective action.
  for (const delay of [1000, 2000]) {
    if (lines(state).some(line => /^\d+ pop up button/.test(line)
      && modeControl(label(line)))) break;
    await new Promise(resolve => setTimeout(resolve,delay));
    state=await read();
    if(!state)return {status:blockedStatus};
    if(selected(state))return {state};
  }
  const control = one(state, line => /^\d+ pop up button/.test(line)
    && !/\(disabled\)/.test(line)
    && modeControl(label(line)));
  if (control === null) return {status:'needs_mode',mode};
  const controlLine = lines(state).find(line => line.startsWith(control+' '));
  if (!/\(expanded\)/.test(controlLine)) {
    await tab.click(control);
    state = await read();
    if (!state) return {status:blockedStatus};
  }
  // A visible exact choice is preferred. The observed slider exposes its current
  // label and left/right instructions; never infer coordinates or private values.
  const choice = one(reasoningMenu(state), line => /^\d+ (?:menuitem(?:radio)?|radio button|button) /.test(line)
    && modeLine(mode).test(line.replace(/^\d+ (?:menuitem(?:radio)?|radio button|button)(?: \([^)]*\))? /,'')));
  if (choice !== null) {
    await tab.click(choice);
    state = await read();
    if (!state) return {status:blockedStatus};
  } else {
    const performanceControls=lines(reasoningMenu(state)).filter(line=>/^\d+ (?:성능|Performance)$/i.test(line));
    if(performanceControls.length>1)return {status:'needs_mode',mode};
    let performanceFocused=false;
    if(performanceControls.length) {
      // Keyboard navigation preserves the value. Clicking the slider or its
      // instruction text does not reliably focus it and can change the rank.
      for(let move=0;move<=2;move++) {
        const focused=lines(state).filter(line=>line.startsWith('The focused UI element is '));
        if(focused.length!==1)return {status:'needs_mode',mode};
        const focus=focused[0].slice('The focused UI element is '.length);
        const children=lines(reasoningMenu(state));
        if(children.includes(focus) && /^\d+ (?:성능|Performance)$/i.test(focus)) {
          performanceFocused=true;
          break;
        }
        const knownMenu=lines(state).includes(focus) && /^\d+ menu (?:추론 수준|Reasoning effort|Reasoning level)(?:, ID:.*)?$/.test(focus);
        const knownModel=children.includes(focus) && /^\d+ (?:\(collapsed\) )?Description: (?:모델 선택|Model selection|Select model)(?:,|$)/i.test(focus);
        if(move===2 || (!knownMenu && !knownModel))return {status:'needs_mode',mode};
        await tab.pressKey('Down');
        state=await read();
        if(!state)return {status:blockedStatus};
      }
    }
    for (let step=0;step<=4;step++) {
      const slider = lines(reasoningMenu(state)).filter(line => /^\d+ text /.test(line)
        && /(?:왼쪽\/오른쪽 화살표|left\/right arrow)/i.test(line));
      if (slider.length !== 1) break;
      const current = slider[0].replace(/^\d+ text /,'').split(',')[0];
      if (modeLine(mode).test(current)) break;
      if (step===4 || modeRank(current)<0) break;
      if(performanceFocused && !lines(state).some(line=>line==='The focused UI element is '+performanceControls[0]))return {status:'needs_mode',mode};
      if(!performanceFocused)await tab.click(Number(slider[0].match(/^\d+/)[0]));
      await tab.pressKey(modeRank(current) > {m:1,h:2,xh:3,pro:4}[mode] ? 'Left' : 'Right');
      const next = await read();
      if (!next) return {status:blockedStatus};
      if (next===state) return {status:'needs_mode',mode};
      state=next;
    }
  }
  const menuShowsTarget = lines(reasoningMenu(state)).some(line => /^\d+ text /.test(line)
    && /(?:왼쪽\/오른쪽 화살표|left\/right arrow)/i.test(line)
    && modeLine(mode).test(line.replace(/^\d+ text /,'').split(',')[0]));
  if (menuShowsTarget) {
    await tab.pressKey('Escape');
    state = await read();
    if (!state) return {status:blockedStatus};
  }
  return selected(state) ? {state} : {status:'needs_mode',mode};
}

// A bounded startup pass shares submission verification with permission handling.
// Only the exact named connector's observed permission controls are supported.
async function startup(tab, receipt, options) {
  const {connectorName, authorizeConversation=false, permissionScope='always', maxObservations=4, intervalMs=2000}=options;
  let expectedUrl=receipt.expectedUrl, submitted=receipt.submitted, lastState;
  const choiceLabel=`Allow ${connectorName} for this conversation`;
  const permissionHeading=state=>lines(state).some(line=>{
    const text=line.replace(/^\d+ heading /,'').replace(/, Value: \d+$/,'');
    return /^\d+ heading /.test(line) && [
      `ChatGPT가 ${connectorName}을(를) 사용하도록 허용할까요?`,
      `Allow ChatGPT to use ${connectorName}?`,
    ].includes(text);
  });
  const scopedChoice=state=>{
    const rows=state.split('\n');
    const found=rows.map((row,i)=>row.trim().replace(/^\d+ menu /,'').split(', ID:')[0]===choiceLabel?i:-1).filter(i=>i>=0);
    if(found.length!==1)return null;
    const at=found[0],depth=rows[at].match(/^\s*/)[0].length;let end=at+1;
    while(end<rows.length && rows[end].trim() && rows[end].match(/^\s*/)[0].length>depth)end++;
    return one(rows.slice(at+1,end).join('\n'),line=>line.replace(/^\d+ (?:(?:menuitem|button) )?/,'')===choiceLabel);
  };
  // Native permission popups can replace the entire AX tree. Accept only this
  // observed menu-only shape after fresh prompt proof in the preceding snapshot.
  const menuOnly=state=>{
    if(scopedChoice(state)===null)return false;
    const rows=lines(state).filter(Boolean);
    if(rows.filter(line=>/^Browser tab: /.test(line)).length!==1
      ||rows.filter(line=>/^\d+ AXWebArea /.test(line)).length!==1)return false;
    const menuLine=line=>/^\d+ menu /.test(line)
      && line.replace(/^\d+ menu /,'').split(', ID:')[0]===choiceLabel;
    if(rows.filter(menuLine).length!==1)return false;
    return rows.every(line=>/^Browser tab: /.test(line)||/^\d+ AXWebArea .+, URL: .+$/.test(line)
      || /^\d+ container$/.test(line)||menuLine(line)
      || line.replace(/^\d+ /,'')===choiceLabel
      || line.replace(/^\d+ text /,'')===choiceLabel
      || (line.startsWith('The focused UI element is ')&&menuLine(line.slice('The focused UI element is '.length))));
  };
  for(let observations=1;observations<=maxObservations;observations++) {
    if(observations>1 && intervalMs)await new Promise(resolve=>setTimeout(resolve,intervalMs));
    let state=await observe(tab);
    lastState=state;
    if(workSurface(state))return {status:'needs_chat_surface',observations};
    const resolved=resolveConversation(state,expectedUrl);
    if(!resolved)return {status:'target_changed',observations};
    expectedUrl=resolved;
    const submissionEvidence = snapshot => receipt.verifySubmission
      ? receipt.verifySubmission(snapshot) : matchingUserTurns(snapshot,receipt.prompt)>receipt.previousMatches;
    submitted = receipt.verifySubmission ? submissionEvidence(state) : submitted || submissionEvidence(state);
    if(permissionHeading(state)) {
      if(!submitted)return {status:'submission_unconfirmed',url:expectedUrl,permission:'not_attempted',observations};
      if(!authorizeConversation)return {status:'submitted',url:expectedUrl,permission:'needs_authorization',observations};
      if(permissionScope==='always') {
        // Bind the observed Always allow button to this exact connector heading,
        // stopping before another heading or an ancestor/sibling outside its card.
        const rows=state.split('\n');
        const headings=rows.map((row,i)=>permissionHeading(row.trim())?i:-1).filter(i=>i>=0);
        let card='';
        if(headings.length===1) {
          const start=headings[0],depth=rows[start].match(/^\s*/)[0].length;
          let end=start+1;
          while(end<rows.length&&(!rows[end].trim()||(!/^\s*\d+ heading\b/.test(rows[end])&&rows[end].match(/^\s*/)[0].length>=depth)))end++;
          card=rows.slice(start+1,end).join('\n');
        }
        const always=one(card,line=>/^\d+ button/.test(line)&&!/\(disabled\)/.test(line)&&/^(?:항상 허용|Always allow)$/.test(label(line)));
        if(always===null)return {status:'submitted',url:expectedUrl,permission:'needs_ui',observations};
        await tab.click(always);
        state=await observe(tab);
        if(workSurface(state))return {status:'needs_chat_surface',observations};
        const finalUrl=resolveConversation(state,expectedUrl);
        if(!finalUrl)return {status:'target_changed',observations};
        expectedUrl=finalUrl;
        return {status:'submitted',url:expectedUrl,permission:permissionHeading(state)||!submissionEvidence(state)?'unconfirmed':'always_selected',observations};
      }
      const control=one(state,line=>/^\d+ pop up button/.test(line) && !/\(disabled\)/.test(line) && label(line)===choiceLabel);
      if(control===null)return {status:'submitted',url:expectedUrl,permission:'needs_ui',observations};
      await tab.click(control);
      state=await observe(tab);
      if(workSurface(state))return {status:'needs_chat_surface',observations};
      const menuUrl=resolveConversation(state,expectedUrl);
      if(!menuUrl)return {status:'target_changed',observations};
      expectedUrl=menuUrl;
      if(receipt.verifySubmission&&!submissionEvidence(state)&&!menuOnly(state))return {status:'submission_unconfirmed',url:expectedUrl,permission:'not_attempted',observations};
      const choice=scopedChoice(state);
      if(choice===null)return {status:'submitted',url:expectedUrl,permission:'needs_ui',observations};
      await tab.click(choice);
      state=await observe(tab);
      if(workSurface(state))return {status:'needs_chat_surface',observations};
      const finalUrl=resolveConversation(state,expectedUrl);
      if(!finalUrl)return {status:'target_changed',observations};
      expectedUrl=finalUrl;
      return {status:'submitted',url:location(state),permission:permissionHeading(state)||scopedChoice(state)!==null||!submissionEvidence(state)?'unconfirmed':'conversation_selected',observations};
    }
  }
  const result={status:submitted?'submitted':'submission_unconfirmed',url:expectedUrl,permission:'not_observed',observations:maxObservations};
  if(receipt.verifySubmission) {
    const reply=replySnapshot(lastState,receipt.prompt);
    const text=reply?.text??'',marker='\n… [truncated] …\n',budget=1500-marker.length;
    const truncated=text.length>1500;
    result.replyObservation={status:reply?.status??'unknown',
      text:truncated?text.slice(0,Math.ceil(budget/2))+marker+text.slice(-Math.floor(budget/2)):text,
      truncated,originalChars:text.length};
  }
  return result;
}

function validateStartup(setup) {
  if(!setup || (typeof setup.connectorName!=='string' || !setup.connectorName.trim()
    || (setup.permissionScope!==undefined&&!['always','conversation'].includes(setup.permissionScope))
    || /[\r\n]/.test(setup.connectorName) || (setup.authorizeConversation!==undefined && typeof setup.authorizeConversation!=='boolean')
    || !Number.isInteger(setup.maxObservations??4) || (setup.maxObservations??4)<1 || (setup.maxObservations??4)>6
    || !Number.isInteger(setup.intervalMs??2000) || (setup.intervalMs??2000)<0 || (setup.intervalMs??2000)>4000))throw Error('invalid startup options');
}

// A due check can recover a late permission card without creating another message.
// Submission is established from this observation, never from caller assertions.
export async function recoverPermission(tab, expectedUrl, options={}) {
  const {prompt}=options;
  const setup={...options,maxObservations:options.maxObservations??1,intervalMs:options.intervalMs??0};
  validateStartup(setup);
  if(!conversationUrl(expectedUrl))throw Error('invalid expectedUrl');
  if(typeof prompt!=='string'||!prompt.trim())throw Error('permission recovery requires prompt');
  if(dispatching.has(tab)||inFlight.has(tab)||cleaning.has(tab))throw Error('dispatch in flight; inspect submission, never resend');
  dispatching.add(tab);
  try {
    const verifySubmission=state=>{
      const rows=state.split('\n');
      const starts=rows.map((row,i)=>/^\s*\d+ container thread$/.test(row)?i:-1).filter(i=>i>=0);
      if(starts.length!==1)return false;
      const start=starts[0],depth=rows[start].match(/^\s*/)[0].length;
      let end=start+1;
      while(end<rows.length&&(!/^\s*\d+ /.test(rows[end])||rows[end].match(/^\s*/)[0].length>depth))end++;
      const body=rows.slice(start+1,end).join('\n');
      if(matchingUserTurns(body,prompt)!==1)return false;
      const turns=body.split(/(?=^\s*\d+ heading\b)/m).filter(turn=>
        /^\s*\d+ heading(?: \([^)]*\))? (?:You said:|나의 말:)(?:, Value: \d+)?$/m.test(turn)
        || /^\s*\d+ container 내 메시지 작업$/m.test(turn));
      return turns.length>0&&matchingUserTurns(turns.at(-1),prompt)===1;
    };
    return await startup(tab,{expectedUrl,prompt,submitted:false,verifySubmission},setup);
  } finally {dispatching.delete(tab);}
}

// Mode, one send, handoff retention and optional authorized startup in one call.
export async function dispatch(tab, prompt, mode='xh', options={}) {
  const setup=options.startup;
  if(setup)validateStartup(setup);
  if(dispatching.has(tab)||cleaning.has(tab))throw Error('dispatch in flight; inspect submission, never resend');
  dispatching.add(tab);
  try {
    let result=await sendOnce(tab,prompt,mode,{...options,prepareMode:true,[dispatchKey]:true});
    const receipt=receipts.get(result);
    if (['submitted','submission_unconfirmed'].includes(result.status) && typeof tab.markHandoff==='function') {
      try { await tab.markHandoff(); }
      catch { return {...result,retention:'unconfirmed'}; }
    }
    if(setup && receipt && !receipt.ownershipUnconfirmed && conversationUrl(receipt.expectedUrl)) {
      result={...result,...await startup(tab,receipt,setup)};
      if(result.status==='submitted')delete result.reason;
    }
    return result;
  } finally {dispatching.delete(tab);}
}

// options.taskId identifies one submission attempt. An explicit expectedUrl plus
// taskId permits a user-requested follow-up in that owned conversation. Omit both
// for the default new-chat-only behavior. Ambiguous attempts are never retried.
export async function sendOnce(tab, prompt, mode = 'xh', options = {}) {
  mode=modeAliases.get(mode);
  if (!mode) throw Error('unsupported mode');
  if (typeof prompt !== 'string' || !prompt.trim()) throw Error('empty prompt');
  const { taskId } = options;
  let { expectedUrl } = options;
  if (taskId !== undefined && (typeof taskId !== 'string' || !taskId.trim())) throw Error('invalid taskId');
  if (expectedUrl !== undefined && (!taskId || !conversationUrl(expectedUrl))) throw Error('follow-up requires taskId and conversation expectedUrl');
  if (cleaning.has(tab) || inFlight.has(tab) || (dispatching.has(tab) && !options[dispatchKey])) throw Error('submission in flight; inspect submission, never resend');
  const tried = attempts.get(tab) ?? new Set();
  const key = taskId ?? null;
  if (tried.has(key) || (taskId === undefined && tried.size)) throw Error('already sent or attempted; inspect submission, never resend');
  inFlight.add(tab); // Lock before the first await, including preflight observations.
  try {
    let state = await observe(tab);
    if(workSurface(state))return {status:'needs_chat_surface'};
    const url = location(state);
    if (expectedUrl !== undefined) {
      const resolved = resolveConversation(state, expectedUrl);
      if (!resolved) return { status: 'target_changed', url };
      expectedUrl = resolved;
    } else if (!url || !/^https:\/\/chatgpt\.com\/?$/.test(url)) return { status: 'needs_new_chat', url };
    if (options.prepareMode) {
      const accepts = snapshot => !lines(snapshot).some(line => /^\d+ button/.test(line)
        && /^(?:답변 중지|응답 중지|생성 중지|Stop(?: generating| streaming| response)?)$/i.test(label(line)))
        && (expectedUrl ? Boolean(resolveConversation(snapshot,expectedUrl)) : /^https:\/\/chatgpt\.com\/?$/.test(location(snapshot)??''));
      if (!accepts(state)) return {status:'response_in_progress',url};
      const prepared = await prepareMode(tab,state,mode,accepts);
      if (!prepared.state) return prepared;
      state=prepared.state;
    }
    const chosen = one(state, line => /^\d+ pop up button/.test(line) && !/\(expanded\)|\(disabled\)/.test(line) && modeLine(mode).test(label(line)));
    if (chosen === null) return { status: 'needs_mode', mode };
    if (lines(state).some(line => /^\d+ button/.test(line)
      && /^(?:답변 중지|응답 중지|생성 중지|Stop(?: generating| streaming| response)?)$/i.test(label(line)))) {
      return { status: 'response_in_progress', url };
    }
    const composer = one(state, line => /^\d+ text entry area/.test(line) && /ID: prompt-textarea(?:,|$)/.test(line));
    if (composer === null) return { status: 'needs_composer' };
    const previousMatches = matchingUserTurns(state, prompt);
    tried.add(key);
    attempts.set(tab, tried); // Any mutation or subsequent ambiguity consumes the attempt.
    await tab.click(composer);
    await tab.typeText(prompt);
    await tab.pressKey('Return');
    let after, ownershipUnconfirmed=false, observations=0;
    // UI snapshots can precede the committed message. Keep this short read-only
    // settling inside one call; never type or press Return a second time.
    for (const delay of [0, 200, 600, 1200]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      after = await observe(tab);
      if(workSurface(after)) {
        const result={status:'submission_unconfirmed',reason:'needs_chat_surface',url:location(after),tabId:tab.id,ownershipUnconfirmed:true,observations:observations+1};
        receipts.set(result,{prompt,previousMatches,expectedUrl,submitted:false,ownershipUnconfirmed:true});
        return result;
      }
      observations++;
      if (expectedUrl !== undefined) {
        const resolved = resolveConversation(after, expectedUrl);
        if (!resolved) { ownershipUnconfirmed=true; break; } // Never verify a different chat.
        expectedUrl = resolved;
      } else if (conversationUrl(location(after))) {
        expectedUrl = location(after); // Pin the first observed conversation during settling.
      }
      if (conversationUrl(location(after)) && matchingUserTurns(after, prompt) > previousMatches) {
        const result={status:'submitted',url:location(after),tabId:tab.id};
        receipts.set(result,{prompt,previousMatches,expectedUrl,submitted:true});
        return result;
      }
    }
    const result={status:'submission_unconfirmed',url:location(after),tabId:tab.id,reason:ownershipUnconfirmed?'ownership_unconfirmed':'turn_not_observed',observations};
    receipts.set(result,{prompt,previousMatches,expectedUrl,submitted:false,ownershipUnconfirmed});
    return result;
  } finally {
    inFlight.delete(tab);
  }
}

// Parse only the active thread. Top-level message headings delimit turns; nested
// response headings and sidebar text cannot become a different speaker's reply.
function replySnapshot(state, prompt) {
  const rows = state.split('\n');
  const depth = row => row.match(/^\s*/)[0].length;
  const starts = rows.map((row, i) => /^\s*\d+ container thread$/.test(row) ? i : -1).filter(i => i >= 0);
  if (starts.length !== 1) return null;
  const start = starts[0];
  let end = start + 1;
  while (end < rows.length && (!/^\s*\d+ /.test(rows[end]) || depth(rows[end]) > depth(rows[start]))) end++;
  const body = rows.slice(start + 1, end);
  const heading = body.find(row => /^\s*\d+ heading\b/.test(row));
  if (!heading) return null;
  const turnDepth = depth(heading);
  const turns = [];
  let current;
  let continuation = false;
  for (const row of body) {
    const line = row.trim();
    if (/^\d+ heading\b/.test(line) && depth(row) === turnDepth) {
      current = { text: [], user: /(?:You said:|나의 말:)/.test(line), assistant: /(?:ChatGPT said:|ChatGPT의 말:)/.test(line), actions: false, copy: false, cursor: false };
      turns.push(current);
      continuation = false;
    } else if (current) {
      if (/^\d+ container 내 메시지 작업$/.test(line)) { current.user = true; current.actions = true; }
      if (/^\d+ container 응답 작업$/.test(line)) { current.assistant = true; current.actions = true; }
      if (/^\d+ button/.test(line) && (/^(?:응답 복사|Copy response)$/.test(label(line))
        || (label(line) === 'Copy' && current.actions && current.assistant))) current.copy = true;
      const text = line.match(/^\d+ (?:text|paragraph) (.*)$/)?.[1];
      if (!current.actions && text !== undefined) {
        if (/^(?:_|▍|▋|▊|█)$/.test(text.trim())) current.cursor = true;
        else current.text.push(text);
        continuation = true;
      } else if (!current.actions && continuation && line && !/^\d+ /.test(line)) current.text.push(line);
      else continuation = false;
    }
  }
  const users = turns.map((turn, i) => turn.user ? i : -1).filter(i => i >= 0);
  const latest = users.at(-1);
  if (latest === undefined || normalize(turns[latest].text.join('\n')) !== normalize(prompt)) return null;
  // Repeated identical prompts are ambiguous without a submission receipt.
  if (users.filter(i => normalize(turns[i].text.join('\n')) === normalize(prompt)).length !== 1) return null;
  const following = turns.slice(latest + 1);
  if (following.length > 1 || following.some(turn => turn.user)) return null;
  const response = following[0];
  const stopping = lines(state).some(line => /^\d+ button/.test(line)
    && /^(?:답변 중지|응답 중지|생성 중지|Stop(?: generating| streaming| response| responding)?)$/i.test(label(line)));
  const text = response?.text.join('\n').trim() ?? '';
  const completed = response?.assistant && response.copy && text && !response.cursor && !/[▍▋▊█]$/.test(text) && !stopping;
  return { status: completed ? 'completed' : stopping || response?.cursor ? 'in_progress' : 'unconfirmed', text: response?.assistant || stopping ? text : '' };
}

// Browser-only completion observation. All delays are bounded; no UI mutation,
// cancellation or resend. "unchanged" describes this sample, never a timeout.
export async function waitForReply(tab, expectedUrl, options = {}) {
  const { prompt, maxObservations = 4, intervalMs = 5000 } = options;
  if (!conversationUrl(expectedUrl)) throw Error('invalid expectedUrl');
  if (typeof prompt !== 'string' || !prompt.trim()) throw Error('reply observation requires prompt');
  if (!Number.isInteger(maxObservations) || maxObservations < 1 || maxObservations > 10
    || !Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 10000
    || (maxObservations - 1) * intervalMs > 30000) throw Error('invalid observation bounds');
  let previous;
  let changes = 0;
  let comparisons = 0;
  let result;
  for (let observations = 1; observations <= maxObservations; observations++) {
    if (observations > 1 && intervalMs) await new Promise(resolve => setTimeout(resolve, intervalMs));
    const state = await observe(tab);
    const url = resolveConversation(state, expectedUrl);
    if (!url) return { status: 'target_changed', observations, progress: 'unknown' };
    expectedUrl = url;
    const snapshot = replySnapshot(state, prompt);
    if (snapshot && previous !== undefined) {
      comparisons++;
      if (snapshot.text !== previous) changes++;
    }
    if (snapshot) previous = snapshot.text;
    result = { status: snapshot?.status ?? 'unconfirmed', text: snapshot?.text ?? '', url,
      observations, progress: changes ? 'changed' : comparisons && snapshot ? 'unchanged' : 'unknown' };
    if (result.status === 'completed') return result;
  }
  return result;
}

const cleaning=new WeakSet();
const deletionAttempts=new WeakMap();
const attemptedDelete=(tab,url)=>deletionAttempts.get(tab)?.has(url)??false;
const recordDelete=(tab,url)=>{const urls=deletionAttempts.get(tab)??new Set();urls.add(url);deletionAttempts.set(tab,urls);};
const matchingDeleteDialog=(state,url,expectedTitle=title(state))=>location(state)===url
  && /채팅을 삭제|Delete chat/i.test(state)&&expectedTitle&&title(state)===expectedTitle
  && lines(state).some(line=>line.replace(/^\d+ text /,'')===expectedTitle);
async function withCleanupLock(tab,action) {
  if(cleaning.has(tab)||dispatching.has(tab)||inFlight.has(tab))throw Error('cleanup or submission in flight; inspect current state');
  cleaning.add(tab);
  try{return await action();}finally{cleaning.delete(tab);}
}
async function openDeleteDialog(tab,expectedUrl) {
  let state = await observe(tab);
  expectedUrl = resolveConversation(state, expectedUrl);
  if (!expectedUrl) return { status: 'target_changed' };
  const menu = one(pageHeader(state), line => /^\d+ button/.test(line) && /ID: conversation-options-/.test(line));
  if (menu === null) return { status: 'needs_menu' };
  await tab.click(menu);
  state = await observe(tab);
  expectedUrl = resolveConversation(state, expectedUrl);
  if (!expectedUrl) return { status: 'target_changed' };
  const remove = one(state, line => /^\d+ (?:menuitem )?(?:삭제|Delete)$/.test(line));
  if (remove === null) return { status: 'needs_delete_control' };
  await tab.click(remove);
  state = await observe(tab);
  for (const delay of [200,600,1200]) {
    if (matchingDeleteDialog(state,expectedUrl) || location(state)!==expectedUrl) break;
    await new Promise(resolve=>setTimeout(resolve,delay));
    state=await observe(tab);
  }
  if (!matchingDeleteDialog(state,expectedUrl)) return { status: 'needs_dialog_verification' };
  const confirm = one(state, line => /^\d+ button (?:삭제|Delete)$/.test(line));
  if (confirm === null) return { status: 'needs_confirmation_control' };
  return {state,url:expectedUrl};
}

async function finishDelete(tab,cua,browserId,expectedUrl,state) {
  const confirm=one(state,line=>/^\d+ button (?:삭제|Delete)$/.test(line));
  if(confirm===null)return {status:'needs_confirmation_control'};
  await tab.click(confirm);
  state = await observe(tab);
  for (const delay of [200,600,1200]) {
    if (/^https:\/\/chatgpt\.com\/?$/.test(location(state)??'') || location(state)!==expectedUrl) break;
    await new Promise(resolve=>setTimeout(resolve,delay));
    state=await observe(tab);
  }
  if (!/^https:\/\/chatgpt\.com\/?$/.test(location(state) ?? '')) return { status: 'deletion_unconfirmed' };
  await tab.close();
  const tabs = await cua.listTabs({ browser: browserId, emit: false });
  return { status: tabs.some(other => other.id === tab.id) ? 'tab_close_unconfirmed' : 'deleted_and_closed', tabId: tab.id };
}

// Caller owns authorization. This path only opens the owned dialog for runtimes
// requiring a separate action-time confirmation; a receipt is not authorization.
export async function prepareDelete(tab,expectedUrl) {
  return withCleanupLock(tab,async()=>{
    if(attemptedDelete(tab,expectedUrl))return {status:'deletion_already_attempted'};
    const opened=await openDeleteDialog(tab,expectedUrl);
    if(opened.status)return opened;
    const result={status:'deletion_prepared',tabId:String(tab.id),url:opened.url,title:title(opened.state),consumed:false};
    if(typeof tab.markHandoff!=='function')return {...result,retention:'unconfirmed'};
    try{await tab.markHandoff();}catch{return {...result,retention:'unconfirmed'};}
    return result;
  });
}

export async function confirmDeleteAndClose(tab,cua,browserId,prepared) {
  return withCleanupLock(tab,async()=>{
    if(!prepared||prepared.status!=='deletion_prepared'||typeof prepared.tabId!=='string'
      ||!conversationUrl(prepared.url)||typeof prepared.title!=='string'||!prepared.title)return {status:'invalid_preparation'};
    if(String(tab.id)!==prepared.tabId)return {status:'target_changed'};
    const key=prepared.url;
    if(prepared.consumed||attemptedDelete(tab,key))return {status:'deletion_already_attempted'};
    const state=await observe(tab);
    if(location(state)!==prepared.url||state.match(/^Browser tab: ([^,]+),/)?.[1]!==prepared.tabId)return {status:'target_changed'};
    if(!matchingDeleteDialog(state,prepared.url,prepared.title))return {status:'needs_dialog_verification'};
    if(one(state,line=>/^\d+ button (?:삭제|Delete)$/.test(line))===null)return {status:'needs_confirmation_control'};
    prepared.consumed=true;recordDelete(tab,key); // An ambiguous click must never be replayed.
    return finishDelete(tab,cua,browserId,prepared.url,state);
  });
}

// Normal authorized cleanup remains one call with the same observation sequence.
export async function deleteAndClose(tab,cua,browserId,expectedUrl) {
  return withCleanupLock(tab,async()=>{
    if(attemptedDelete(tab,expectedUrl))return {status:'deletion_already_attempted'};
    const opened=await openDeleteDialog(tab,expectedUrl);
    if(opened.status)return opened;
    const key=opened.url;
    if(attemptedDelete(tab,key))return {status:'deletion_already_attempted'};
    recordDelete(tab,key);
    return finishDelete(tab,cua,browserId,opened.url,opened.state);
  });
}
