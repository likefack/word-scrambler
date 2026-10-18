// Synthetic-key React handler tests, not a real browser lifecycle test.
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
const text='Please review the document before the meeting.',dummyKey='gsk_DUMMY_SECURITY_CLIENT_NOT_A_REAL_KEY';
const initial=(extra={})=>({text,mode:'ai',apiKey:dummyKey,keyConsent:true,diagnosticPreferenceReady:true,diagnosticConsent:false,...extra});
const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
after(()=>{globalThis.fetch=originalFetch;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;});
const primary=tree=>find(tree,n=>n.type==='button'&&n.props.className==='primary-button');
const success=(extra={})=>({original:text,rewritten:text,style:{label:'Plain',features:[],explanation:''},edits:[],notes:[],totalWords:8,changedWords:0,ratio:0,...extra});
function mount(){globalThis.window=new EventTarget();app.reset(initial());const tree=app.default();const field=find(tree,n=>n.props?.id==='api-key');field.props.ref.current={value:dummyKey};const cleanups=app.effects.map(effect=>effect()).filter(v=>typeof v==='function');return{tree,field,cleanups};}
test('browser key-bearing POST rejects redirects and opts out of caching',async()=>{let options;globalThis.fetch=async(url,value)=>{assert.equal(url,'/api/rewrite');options=value;return Response.json(success());};app.reset(initial());await primary(app.default()).props.onClick();assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(JSON.parse(options.body).apiKey,dummyKey);});
test('pagehide clears state and input DOM and aborts pending rewrite',async()=>{
 let notify;const started=new Promise(resolve=>{notify=resolve;});let signal;
 globalThis.fetch=async(_url,options)=>{signal=options.signal;notify();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));};
 const {tree,field,cleanups}=mount();const pending=primary(tree).props.onClick();await started;window.dispatchEvent(new Event('pagehide'));assert(signal.aborted);assert.equal(app.state.apiKey,'');assert.equal(app.state.keyConsent,false);assert.equal(field.props.ref.current.value,'');await pending;assert.equal(app.state.busy,false);for(const cleanup of cleanups)cleanup();
});
test('restored pageshow clears a retained credential but ordinary pageshow does not',()=>{
 const {field,cleanups}=mount();const initialShow=new Event('pageshow');Object.defineProperty(initialShow,'persisted',{value:false});window.dispatchEvent(initialShow);assert.equal(app.state.apiKey,dummyKey);
 const restored=new Event('pageshow');Object.defineProperty(restored,'persisted',{value:true});window.dispatchEvent(restored);assert.equal(app.state.apiKey,'');assert.equal(app.state.keyConsent,false);assert.equal(field.props.ref.current.value,'');for(const cleanup of cleanups)cleanup();
});
test('route cleanup clears credential and unregisters lifecycle listeners',()=>{const {field,cleanups}=mount();for(const cleanup of cleanups)cleanup();assert.equal(app.state.apiKey,'');assert.equal(field.props.ref.current.value,'');app.state.apiKey='replacement-fixture';window.dispatchEvent(new Event('pagehide'));assert.equal(app.state.apiKey,'replacement-fixture');});
test('provider text and user source render as escaped text, never executable HTML',async()=>{
 const payload='<img src=x onerror="fixtureAttack()">',source=text;
 globalThis.fetch=async()=>Response.json(success({style:{label:payload,features:[payload],explanation:payload},notes:[payload]}));app.reset(initial());await primary(app.default()).props.onClick();app.renderAgain();const html=renderToStaticMarkup(app.default());assert(!html.includes(payload));assert(html.includes('&lt;img'));
 app.reset(initial({text:payload+' please review this text',mode:'preset'}));const rawHtml=renderToStaticMarkup(app.default());assert(!rawHtml.includes(payload));assert(rawHtml.includes('&lt;img'));assert.equal(source,text);
});

test('explicit key clear wipes the DOM and state and revokes send consent',()=>{
 const {tree,field,cleanups}=mount();const clear=find(tree,n=>n.type==='button'&&n.props.children==='キーを消去');assert(clear);clear.props.onClick();assert.equal(app.state.apiKey,'');assert.equal(app.state.keyConsent,false);assert.equal(field.props.ref.current.value,'');for(const cleanup of cleanups)cleanup();
});
test('key-handling disclosure is initially closed and matches transmission and persistence boundaries',()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected')};app.reset(initial());const tree=app.default();const details=find(tree,n=>n.type==='details'&&n.props.className==='key-handling');assert(details);assert(!details.props.open);const html=renderToStaticMarkup(details);assert(html.includes('ブラウザ → このサイトの中継サーバー → Groq'));assert(html.includes('隠す仕組みではありません'));assert(html.includes('永続保存領域'));assert(html.includes('APIキー欄の値を付け加えることはありません'));assert(html.includes('href="/privacy#api-key"'));assert(!html.includes(dummyKey));assert.equal(calls,0);
 const input=find(tree,n=>n.props?.id==='api-key');input.props.onChange({target:{value:'gsk_fixture_paste_not_real'}});const consent=find(tree,n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked===true);consent.props.onChange({target:{checked:true}});assert.equal(calls,0);
});
