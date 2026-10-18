import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderToStaticMarkup} from 'react-dom/server';
const root=resolve(new URL('..',import.meta.url).pathname);
const temporary=mkdtempSync(join(tmpdir(),'scrambler-client-'));
after(()=>rmSync(temporary,{recursive:true,force:true}));
const source=readFileSync(join(root,'app/page.tsx'),'utf8');
const names=[...source.matchAll(/\[(\w+),\w+\]=useState/g)].map(m=>m[1]);
const hook=`export const names=${JSON.stringify(names)};export const state={};export const effects=[];let cursor=0;export function reset(values={}){cursor=0;effects.length=0;for(const k of Object.keys(state))delete state[k];Object.assign(state,values);}export function renderAgain(){cursor=0;effects.length=0;}export function useState(initial){const n=names[cursor++];if(!(n in state))state[n]=initial;return[state[n],v=>state[n]=typeof v==='function'?v(state[n]):v];}export function useEffect(fn){effects.push(fn);}export function useRef(){return {current:null}}`;
const result=await build({stdin:{contents:source+'\nexport {state,reset,renderAgain,effects} from "test-hooks";',resolveDir:join(root,'app'),loader:'tsx'},bundle:true,mainFields:['module','main'],format:'esm',platform:'node',target:'es2022',jsx:'automatic',write:false,plugins:[{name:'hooks',setup(b){b.onResolve({filter:/^test-hooks$/},()=>({path:'hooks',namespace:'test'}));b.onResolve({filter:/^react$/},args=>args.importer.endsWith('<stdin>')?({path:'hooks',namespace:'test'}):({path:join(root,'node_modules/react/index.js'),external:true}));b.onResolve({filter:/^react\/(jsx-runtime|jsx-dev-runtime)$/},args=>({path:join(root,'node_modules',args.path+'.js'),external:true}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='hooks'?hook:`import {createElement} from 'react';export default function Link(props){return createElement('a',props,props.children)}`,loader:'js'}));}}]});
const fixture=join(temporary,'fixture.mjs');writeFileSync(fixture,result.outputFiles[0].text);const app=await import(pathToFileURL(fixture));
function find(node,pred){if(!node)return null;if(Array.isArray(node)){for(const n of node){const r=find(n,pred);if(r)return r;}return null;}if(typeof node==='object'){if(pred(node))return node;return find(node.props?.children,pred);}return null;}
const text='Please review the document before the meeting.';
const dummyKey='gsk_DUMMY_CLIENT_TEST_DO_NOT_USE_20261018';
const diagnostic={code:'PROVIDER_NETWORK_ERROR',stage:'provider_fetch',httpStatus:502,requestId:'12345678-1234-4234-8234-123456789abc',version:'2026.10.18-r7',timestamp:'2026-10-18T03:00:00.000Z'};
function initial(extra={}){return{text,mode:'ai',apiKey:dummyKey,keyConsent:true,diagnosticPreferenceReady:true,diagnosticConsent:false,...extra};}
function rerender(){app.renderAgain();return app.default();}
function errorIsUnderInput(tree){const input=find(tree,n=>n.type==='section'&&n.props.className==='editor-panel');const output=find(tree,n=>n.type==='section'&&String(n.props.className).includes('result-panel'));assert(find(input,n=>n.props?.id==='input-error'));assert(!find(output,n=>n.props?.id==='input-error'));const html=renderToStaticMarkup(tree);assert(html.indexOf('</textarea>')<html.indexOf('id="input-error"'));assert(html.indexOf('id="input-error"')<html.indexOf('class="editor-meta"'));const details=find(input,n=>n.type==='details'&&n.props.className==='diagnostic-panel');if(app.state.diagnostic){assert(details);assert(!details.props.open);}assert.equal(find(input,n=>n.type==='textarea').props['aria-describedby'],'source-text-hint input-error');}
async function rewrite(extra={},response){globalThis.fetch=async()=>{if(response instanceof Error)throw response;return response;};app.reset(initial(extra));const tree=app.default();await find(tree,n=>n.type==='button'&&n.props.className==='primary-button').props.onClick();return rerender();}
test('server error and collapsed report diagnostics occur immediately below input textarea',async()=>{const tree=await rewrite({},Response.json({error:'接続できませんでした',diagnostic},{status:502}));errorIsUnderInput(tree);assert.equal(app.state.diagnostic.code,'PROVIDER_NETWORK_ERROR');assert.equal(app.state.text,text);});
test('all validation errors use the input error panel without an API request',async()=>{for(const extra of [{text:''},{text:'短い'},{text:'a '.repeat(1600)},{apiKey:''},{keyConsent:false}]){let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};app.reset(initial(extra));const tree=app.default();await find(tree,n=>n.type==='button'&&n.props.className==='primary-button').props.onClick();assert(app.state.error);assert.equal(calls,0);errorIsUnderInput(rerender());}});
test('network and nonJSON failures preserve input and show the same nearby panel',async()=>{for(const response of [new Error('unsafe raw details'),new Response('<html>bad gateway</html>',{status:502})]){const tree=await rewrite({},response);errorIsUnderInput(tree);assert.equal(app.state.text,text);assert(!app.state.error.includes('unsafe'));}});
test('error announcement scrolls into view without moving keyboard focus; repeated errors get a new revision',async()=>{const tree=await rewrite({},new Error('network'));let scrolls=0;let focus=0;const panel=find(tree,n=>n.props?.className==='input-feedback');panel.props.ref.current={scrollIntoView(options){assert.equal(options.block,'nearest');scrolls++;},focus(){focus++;}};for(const effect of app.effects)effect();assert.equal(scrolls,1);assert.equal(focus,0);assert.equal(find(tree,n=>n.props?.id==='input-error').props.role,'alert');const revision=app.state.errorRevision;await find(tree,n=>n.type==='button'&&n.props.className==='primary-button').props.onClick();assert(app.state.errorRevision>revision);});
test('closing an error removes its diagnostic and successful operations do not scroll the error panel',async()=>{let tree=await rewrite({},Response.json({error:'エラー',diagnostic},{status:502}));find(tree,n=>n.type==='button'&&n.props['aria-label']==='エラーを閉じる').props.onClick();tree=rerender();assert(!find(tree,n=>n.props?.id==='input-error'));assert.equal(app.state.diagnostic,null);let scrolled=0;find(tree,n=>n.props?.className==='input-feedback').props.ref.current={scrollIntoView(){scrolled++;}};for(const effect of app.effects)effect();assert.equal(scrolled,0);});
test('successful API output leaves error feedback empty and preserves result behavior',async()=>{const valid={original:text,rewritten:text,style:{label:'丁寧',features:[],explanation:''},edits:[],notes:[],totalWords:8,changedWords:0,ratio:0};const tree=await rewrite({},Response.json(valid));assert.equal(app.state.error,'');assert.equal(app.state.result.rewritten,text);assert(!find(tree,n=>n.props?.id==='input-error'));let scrolled=0;find(tree,n=>n.props?.className==='input-feedback').props.ref.current={scrollIntoView(){scrolled++;}};for(const effect of app.effects)effect();assert.equal(scrolled,0);});
test('client timeout is announced below input; cancelling stays silent',async()=>{const originalTimer=globalThis.setTimeout;try{globalThis.setTimeout=(callback,delay,...args)=>delay===75000?(queueMicrotask(callback),0):originalTimer(callback,delay,...args);globalThis.fetch=async(_url,options)=>new Promise((_resolve,reject)=>{if(options.signal.aborted)reject(new Error('aborted'));else options.signal.addEventListener('abort',()=>reject(new Error('aborted')));});app.reset(initial());const tree=app.default();await find(tree,n=>n.type==='button'&&n.props.className==='primary-button').props.onClick();assert.equal(app.state.diagnostic.code,'CLIENT_TIMEOUT');errorIsUnderInput(rerender());}finally{globalThis.setTimeout=originalTimer;}});
test('AI mode is initial and precedes the optional simple dictionary mode',()=>{app.reset();const tree=app.default();assert.equal(app.state.mode,'ai');const html=renderToStaticMarkup(tree);assert(html.indexOf('AI変換')<html.indexOf('辞書変換（簡易）'));assert(html.includes('キーの取得・使用手順'));});

test('an explicitly off diagnostic setting sends nothing during preset conversion',async()=>{let calls=0;globalThis.fetch=async()=>{calls++;throw Error('not expected')};app.reset(initial({mode:'preset'}));let tree=app.default();assert.equal(app.state.diagnosticConsent,false);await find(tree,n=>n.type==='button'&&n.props.className==='primary-button').props.onClick();assert(app.state.result);assert.equal(calls,0);assert.equal(app.state.conversion.storage,'off');assert.match(app.state.conversion.id,/^[a-f0-9-]{36}$/);});
test('opt-in preset diagnostics contains metadata only and a failed save does not discard the result',async()=>{const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({storage:'unavailable'},{status:503});};app.reset(initial({mode:'preset',diagnosticConsent:true}));let tree=app.default();await find(tree,n=>n.type==='button'&&n.props.className==='primary-button').props.onClick();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/conversion-diagnostics');const payload=JSON.parse(calls[0].options.body);assert.equal(payload.consent,true);assert.equal(payload.metrics.mode,'preset');assert(!calls[0].options.body.includes(text));assert(!calls[0].options.body.includes(dummyKey));assert(app.state.result);assert.equal(app.state.conversion.storage,'unavailable');});
test('AI diagnostic opt-in is explicit and a verified conversion receipt replaces the local ID',async()=>{const valid={original:text,rewritten:text,style:{label:'Business',features:[],explanation:''},edits:[],notes:[],totalWords:8,changedWords:0,ratio:0,conversion:{id:'12345678-1234-4234-8234-123456789abc',storage:'stored'}};for(const consent of [false,true]){const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json(valid)};app.reset(initial({diagnosticConsent:consent}));const tree=app.default();await find(tree,n=>n.type==='button'&&n.props.className==='primary-button').props.onClick();assert.equal(calls.length,1);const body=JSON.parse(calls[0].options.body);assert.equal(body.diagnosticsConsent,consent?true:undefined);assert.equal(body.diagnosticsConsentVersion,consent?'2026-10-18.3':undefined);assert.equal(app.state.conversion.id,valid.conversion.id);}});

test('unexpected authentication response does not introduce a sign-in requirement for a public tool',async()=>{const tree=await rewrite({},Response.json({error:'サインインが必要です',code:'AUTH_REQUIRED',diagnostic:{...diagnostic,code:'AUTH_REQUIRED',stage:'authentication',httpStatus:401}},{status:401}));const anchor=find(tree,n=>n.type==='a'&&n.props.href==='/signin-with-chatgpt?return_to=%2F');assert(!anchor);assert(app.state.error.includes('接続を確認できません'));errorIsUnderInput(tree);});
test('key onboarding uses an initially closed native disclosure with retained instructions',()=>{
 app.reset();const tree=app.default();const details=find(tree,n=>n.type==='details'&&n.props.className==='key-onboarding');assert(details);assert(!details.props.open);assert(!details.props.onClick);const summary=find(details,n=>n.type==='summary');assert.equal(summary.props.children,'APIキーを持っていない方へ');assert(!summary.props.onClick);const html=renderToStaticMarkup(details);assert(html.includes('https://console.groq.com/keys'));assert(html.includes('href="/guide"'));assert(html.includes('5〜10分'));assert(!html.includes(' open'));
});

test('failed execution offers optional attachment below input with request ID and empty result, never a previous result',async()=>{
 const old={original:'Old private source.',rewritten:'Old private result.',edits:[],notes:[],style:{label:'Plain',features:[],explanation:''},totalWords:4,changedWords:0,ratio:0};
 const tree=await rewrite({result:old},Response.json({error:'形式エラー',diagnostic:{...diagnostic,code:'PROVIDER_SCHEMA_VALIDATION'}},{status:502}));
 const input=find(tree,n=>n.type==='section'&&n.props.className==='editor-panel');
 const report=find(input,n=>typeof n.type==='function'&&n.props?.containsCurrentKey);
 assert(report);assert.equal(report.props.conversionId,diagnostic.requestId);assert.equal(report.props.original,text);assert.equal(report.props.rewritten,'');assert.equal(report.props.mode,'ai');assert.equal(report.props.initialCategory,'other');
 assert(!JSON.stringify(report.props).includes(old.rewritten));assert.equal(app.state.result,null);
 const output=find(tree,n=>n.type==='section'&&String(n.props.className).includes('result-panel'));assert(!find(output,n=>typeof n.type==='function'&&n.props?.containsCurrentKey));
});
test('failure report uses the captured execution context and editing source removes it',async()=>{
 let tree=await rewrite({},Response.json({error:'失敗',diagnostic},{status:502}));
 app.state.mode='preset';app.state.language='ja';tree=rerender();let report=find(tree,n=>typeof n.type==='function'&&n.props?.containsCurrentKey);assert.equal(report.props.mode,'ai');assert.equal(report.props.language,'en');
 find(tree,n=>n.props?.id==='source-text').props.onChange({target:{value:'A different source for a new run.'}});tree=rerender();assert.equal(app.state.execution,null);assert.equal(app.state.conversion,null);assert(!find(tree,n=>typeof n.type==='function'&&n.props?.containsCurrentKey));
});
test('nonJSON error retains a valid request header ID without optional diagnostics consent',async()=>{
 const tree=await rewrite({},new Response('<html>gateway</html>',{status:502,headers:{'X-Request-Id':diagnostic.requestId}}));
 const report=find(tree,n=>typeof n.type==='function'&&n.props?.containsCurrentKey);assert(report);assert.equal(report.props.conversionId,diagnostic.requestId);assert.equal(report.props.rewritten,'');assert.equal(app.state.conversion.storage,'off');
});

test('result touch swipe changes before/after while tabs and visible current label remain',()=>{
 const now=Date.now;let time=1000;Date.now=()=>time;globalThis.Element=class{};globalThis.window={innerWidth:400,getSelection:()=>({toString:()=>''})};
 try{const valid={original:text,rewritten:text,style:{label:'Plain',features:[],explanation:''},edits:[],notes:[],totalWords:8,changedWords:0,ratio:0};app.reset(initial({result:valid}));let tree=app.default();let area=find(tree,n=>n.props?.className==='result-text');const point=(x,y=200)=>({clientX:x,clientY:y});const start=(x)=>({touches:[point(x)],target:{}});const end=(x)=>({changedTouches:[point(x)],touches:[]});
 assert.equal(area.props['aria-label'],'変換後の文章');area.props.onTouchStart(start(100));time+=200;area.props.onTouchEnd(end(230));assert.equal(app.state.showOriginal,true);
 tree=rerender();area=find(tree,n=>n.props?.className==='result-text');assert.equal(area.props['aria-label'],'変換前の文章');area.props.onTouchStart(start(250));time+=200;area.props.onTouchEnd(end(100));assert.equal(app.state.showOriginal,false);
 const before=find(tree,n=>n.type==='button'&&n.props.children==='変換前');before.props.onClick();assert.equal(app.state.showOriginal,true);const after=find(tree,n=>n.type==='button'&&n.props.children==='変換後');after.props.onClick();assert.equal(app.state.showOriginal,false);
 }finally{Date.now=now;}
});
test('vertical scrolling, selection, long press, multitouch and edge gestures do not switch views',()=>{
 const now=Date.now;let time=1000,selection='';Date.now=()=>time;globalThis.Element=class{};globalThis.window={innerWidth:400,getSelection:()=>({toString:()=>selection})};
 const valid={original:text,rewritten:text,style:{label:'Plain',features:[],explanation:''},edits:[],notes:[],totalWords:8,changedWords:0,ratio:0};
 const p=(x,y=200)=>({clientX:x,clientY:y});
 try{for(const kind of ['vertical','selection','longpress','multitouch','edge','short']){app.reset(initial({result:valid}));const area=find(app.default(),n=>n.props?.className==='result-text');selection='';area.props.onTouchStart({touches:kind==='multitouch'?[p(100),p(130)]:[p(kind==='edge'?5:100)],target:{}});if(kind==='vertical')area.props.onTouchMove({touches:[p(110,250)]});if(kind==='selection')selection='selected words';time+=kind==='longpress'?900:200;area.props.onTouchEnd({changedTouches:[p(kind==='short'?130:230)],touches:[]});assert.equal(app.state.showOriginal,false,kind);}
 }finally{Date.now=now;}
});
test('result arrow keys switch views without intercepting shifted text selection',()=>{
 globalThis.window={getSelection:()=>({toString:()=>''})};const valid={original:text,rewritten:text,style:{label:'Plain',features:[],explanation:''},edits:[],notes:[],totalWords:8,changedWords:0,ratio:0};app.reset(initial({result:valid}));const area=find(app.default(),n=>n.props?.className==='result-text');let prevented=0;area.props.onKeyDown({key:'ArrowLeft',preventDefault:()=>prevented++});assert.equal(app.state.showOriginal,true);assert.equal(prevented,1);area.props.onKeyDown({key:'ArrowRight',shiftKey:true,preventDefault:()=>prevented++});assert.equal(app.state.showOriginal,true);assert.equal(prevented,1);area.props.onKeyDown({key:'ArrowRight',preventDefault:()=>prevented++});assert.equal(app.state.showOriginal,false);
});

test('processing specification is closed, explains current Groq first, and leaves other controls intact',()=>{
 app.reset();const tree=app.default(),details=find(tree,n=>n.type==='details'&&n.props.id==='guide');assert(details);assert(!details.props.open);const html=renderToStaticMarkup(details);assert(html.indexOf('Groq方式')<html.indexOf('辞書方式'));for(const phrase of ['openai/gpt-oss-20b','JSON object','0から数える','最大80件','160文字','200文字','Intl.Segmenter','LCS','最大60秒'])assert(html.includes(phrase),phrase);assert(!html.includes('25%'));assert(!html.includes('BudouX'));for(const id of ['source-text','language'])assert(find(tree,n=>n.props?.id===id));assert(find(tree,n=>n.props?.className==='primary-button'));assert(find(tree,n=>n.type==='details'&&n.props?.className==='key-onboarding'));for(const href of ['/terms','/privacy','/contact'])assert(find(tree,n=>n.type==='a'&&n.props?.href===href));
});


test('unselected diagnostics default ON after preference loading; saved OFF survives reload and sends no metadata',async()=>{
 const oldWindow=globalThis.window;const entries=new Map(),writes=[];let calls=0;
 try{
  globalThis.window=new EventTarget();window.localStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>{entries.set(key,value);writes.push([key,value]);}};
  globalThis.fetch=async()=>{calls++;return Response.json({storage:'stored'});};
  app.reset(initial({mode:'preset',diagnosticPreferenceReady:false,diagnosticConsent:true}));let tree=app.default();
  assert.equal(find(tree,n=>n.props?.className==='primary-button').props.disabled,true);await find(tree,n=>n.props?.className==='primary-button').props.onClick();assert.equal(calls,0);
  const cleanups=app.effects.map(fn=>fn()).filter(x=>typeof x==='function');tree=rerender();
  assert.equal(app.state.diagnosticPreferenceReady,true);assert.equal(find(tree,n=>n.props?.id==='send-diagnostics').props.checked,true);assert.equal(writes.length,0);
  find(tree,n=>n.props?.id==='send-diagnostics').props.onChange({target:{checked:false}});assert.deepEqual(writes,[['expression-scrambler.diagnostics.v1','off']]);
  tree=rerender();await find(tree,n=>n.props?.className==='primary-button').props.onClick();assert(app.state.result);assert.equal(calls,0);for(const cleanup of cleanups)cleanup();
  app.reset(initial({mode:'preset',diagnosticPreferenceReady:false,diagnosticConsent:true}));app.default();const nextCleanups=app.effects.map(fn=>fn()).filter(x=>typeof x==='function');
  assert.equal(app.state.diagnosticConsent,false);assert.equal(app.state.diagnosticPreferenceReady,true);for(const cleanup of nextCleanups)cleanup();
 }finally{globalThis.window=oldWindow;}
});
test('unreadable saved preference fails closed and explicit in-page choice remains available without storing text or key',()=>{
 const oldWindow=globalThis.window;
 try{
  globalThis.window=new EventTarget();Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}});
  app.reset(initial({diagnosticPreferenceReady:false,diagnosticConsent:true}));app.default();const cleanups=app.effects.map(fn=>fn()).filter(x=>typeof x==='function');let tree=rerender();
  assert.equal(app.state.diagnosticConsent,false);assert.equal(app.state.diagnosticPreferenceWarning,true);assert.equal(app.state.diagnosticPreferenceReady,true);
  find(tree,n=>n.props?.id==='send-diagnostics').props.onChange({target:{checked:true}});assert.equal(app.state.diagnosticConsent,true);assert.equal(app.state.diagnosticPreferenceWarning,true);
  tree=rerender();assert(renderToStaticMarkup(tree).includes('診断設定の保存・復元を確認できません'));for(const cleanup of cleanups)cleanup();
 }finally{globalThis.window=oldWindow;}
});
function attachmentOption(tree){return find(tree,n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.id==='attach-diagnostic-text');}
function diagnosticPreview(tree){return find(tree,n=>n.props?.purpose==='diagnostic');}
test('inline text option is initially OFF and selecting it alone sends nothing',()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({storage:'stored'});};app.reset(initial({diagnosticConsent:true}));let tree=app.default();assert.equal(attachmentOption(tree).props.checked,false);assert(!diagnosticPreview(tree));attachmentOption(tree).props.onChange({target:{checked:true}});tree=rerender();assert.equal(app.state.diagnosticTextRequested,true);assert(!diagnosticPreview(tree));assert.equal(calls,0);
});
test('inline preview is bound to the new execution; quality metrics remain content-free',async()=>{
 const oldWindow=globalThis.window;globalThis.window={matchMedia:()=>({matches:true}),localStorage:{setItem(){}}};const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({storage:'stored'});};
 try{app.reset(initial({mode:'preset',diagnosticConsent:true,diagnosticTextRequested:true}));let tree=app.default();await find(tree,n=>n.props?.className==='primary-button').props.onClick();tree=rerender();const preview=diagnosticPreview(tree);assert(preview);assert.equal(preview.props.original,text);assert.equal(preview.props.rewritten,app.state.result.rewritten);assert.equal(preview.props.conversionId,app.state.conversion.id);assert.equal(preview.props.apiKey,undefined);assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/conversion-diagnostics');assert(!JSON.stringify(calls[0].body).includes(text));assert(!JSON.stringify(calls[0].body).includes(dummyKey));
  find(tree,n=>n.props?.id==='send-diagnostics').props.onChange({target:{checked:false}});tree=rerender();assert.equal(app.state.diagnosticTextRequested,false);assert.equal(app.state.execution.attachTextRequested,false);assert(!diagnosticPreview(tree));find(tree,n=>n.props?.id==='send-diagnostics').props.onChange({target:{checked:true}});attachmentOption(rerender()).props.onChange({target:{checked:true}});assert(!diagnosticPreview(rerender()));
 }finally{globalThis.window=oldWindow;}
});
test('inline text mode never revives a previous result after failed execution or source change',async()=>{
 const oldWindow=globalThis.window;globalThis.window={matchMedia:()=>({matches:true})};
 try{app.reset(initial({diagnosticConsent:true,diagnosticTextRequested:true,result:{original:'old source',rewritten:'old output',style:{label:'Plain',features:[],explanation:''},edits:[],notes:[],totalWords:2,changedWords:0,ratio:0},conversion:{id:'12345678-1234-4234-8234-123456789abc',storage:'stored'}}));globalThis.fetch=async()=>Response.json({error:'fixed error',conversion:{id:'22345678-1234-4234-8234-123456789abc',storage:'stored'},diagnostic},{status:502});let tree=app.default();await find(tree,n=>n.props?.className==='primary-button').props.onClick();tree=rerender();const preview=diagnosticPreview(tree);assert(preview);assert.equal(preview.props.original,text);assert.equal(preview.props.rewritten,'');assert(!JSON.stringify(preview.props).includes('old output'));find(tree,n=>n.type==='textarea'&&n.props.id==='source-text').props.onChange({target:{value:'A new source entered after the failure.'}});assert(!diagnosticPreview(rerender()));}
 finally{globalThis.window=oldWindow;}
});
test('saved OFF in another tab and pagehide invalidate prepared text rather than reviving it on return',()=>{
 const oldWindow=globalThis.window;try{
  for(const kind of ['storage','pagehide']){
   const events=new EventTarget();let saved='on';events.localStorage={getItem:()=>saved,setItem(){}};globalThis.window=events;
   app.reset(initial({diagnosticConsent:true,diagnosticTextRequested:true,execution:{original:text,mode:'ai',language:'en',attachTextRequested:true}}));app.default();const cleanups=app.effects.map(fn=>fn()).filter(x=>typeof x==='function');
   if(kind==='storage'){saved='off';const event=new Event('storage');event.key='expression-scrambler.diagnostics.v1';events.dispatchEvent(event);assert.equal(app.state.diagnosticConsent,false);}else events.dispatchEvent(new Event('pagehide'));
   assert.equal(app.state.diagnosticTextRequested,false);assert.equal(app.state.execution.attachTextRequested,false);for(const clean of cleanups)clean();
  }
 }finally{globalThis.window=oldWindow;}
});
test('diagnostic failure attachment uses the authoritative diagnostic request ID and never a stale successful result',async()=>{
 const oldWindow=globalThis.window;globalThis.window={matchMedia:()=>({matches:true})};try{
  let tree=await rewrite({diagnosticConsent:true,diagnosticTextRequested:true},Response.json({error:'fixed failure',diagnostic},{status:502}));const form=diagnosticPreview(tree);assert(form);assert.equal(form.props.conversionId,diagnostic.requestId);assert.equal(form.props.rewritten,'');
 }finally{globalThis.window=oldWindow;}
});

test('diagnostic settings explain data, choice and timing concisely without development notes',()=>{
 app.reset(initial({diagnosticConsent:true}));const tree=app.default();
 const notices=find(tree,n=>n.props?.className==='execution-notices');const html=renderToStaticMarkup(notices);
 for(const phrase of ['診断情報を送信する','実行時に件数や処理時間を送信します','本文・APIキーは含みません','原文・変換結果を添付する（任意）','実行後に内容を確認し、送信できます。'])assert(html.includes(phrase),phrase);
 for(const phrase of ['開発者','AIアシスタント','初期設定','専用同意','実装','開発目標'])assert(!html.includes(phrase),phrase);
 assert(html.includes('href="/privacy#diagnostics"'));assert(html.includes('href="/terms"'));assert(html.includes('href="/privacy"'));
 assert.equal(find(notices,n=>n.props?.id==='attach-diagnostic-text').props.checked,false);
 const privacy=readFileSync(join(root,'app/privacy/page.tsx'),'utf8');assert(privacy.includes('OpenAI'));assert(privacy.includes('AIアシスタント'));
});
