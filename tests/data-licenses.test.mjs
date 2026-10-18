import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderToStaticMarkup} from 'react-dom/server';
const root=resolve(new URL('..',import.meta.url).pathname),temp=mkdtempSync(join(tmpdir(),'data-license-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
test('additional-data license scope is exact and separate from software and visitor text',()=>{
 const scope=JSON.parse(readFileSync('LICENSE-SCOPE.json','utf8'));
 assert.deepEqual(scope.dataFiles,['lib/presets-en-broad.ts','lib/presets-ja-broad.ts','lib/presets-broad-scopes.ts']);assert.equal(scope.dataLicense,'CC-BY-SA-4.0');assert.equal(scope.softwareLicense,'MIT');
 for(const file of scope.dataFiles)assert(readFileSync(file,'utf8').startsWith('// SPDX-License-Identifier: CC-BY-SA-4.0'));
 assert(readFileSync('lib/presets-broad-guards.ts','utf8').startsWith('// SPDX-License-Identifier: MIT'));
 const notice=readFileSync('DATA-LICENSE.md','utf8');assert.equal(readFileSync('public/licenses/DATA-LICENSE.md','utf8'),notice);
 for(const phrase of ['Princeton','NICT','Robyn Speer','description of changes','not relicense the whole application','no wordfreq frequency values'])assert(notice.includes(phrase),phrase);
});
test('license page retains all local notices, isolated external links and a native return route',async()=>{
 const result=await build({entryPoints:[join(root,'app/licenses/page.tsx')],bundle:true,format:'esm',platform:'node',jsx:'automatic',write:false,external:['react','react/jsx-runtime'],loader:{'.css':'empty'}});
 const file=join(temp,'licenses.mjs');writeFileSync(file,result.outputFiles[0].text.replaceAll('from "react/jsx-runtime"',`from ${JSON.stringify(join(root,'node_modules/react/jsx-runtime.js'))}`));
 const html=renderToStaticMarkup((await import(pathToFileURL(file))).default());
 for(const phrase of ['MIT','CC BY-SA 4.0','入力文や変換結果','Princeton','Robyn Speer','NICT','作成者：自我巨大児','Universal Dependencies r2.18','収録文をアプリの辞書に転載していません'])assert(html.includes(phrase),phrase);
 assert(html.includes('<a href="/">'));assert(!html.includes('<form'));assert(!html.includes('dangerouslySetInnerHTML'));
 for(const match of html.matchAll(/<a ([^>]+)>/g)){
  const attrs=match[1],href=attrs.match(/href="([^"]+)"/)[1];
  if(href.startsWith('/licenses/'))assert(readFileSync(join(root,'public',href)).length>0);
  if(href.startsWith('https:')){assert(attrs.includes('target="_blank"'));assert(attrs.includes('rel="noopener noreferrer"'));}
 }
 assert(readFileSync('app/page.tsx','utf8').includes('href="/licenses"'));
});
test('upstream copyright and permission notices are distributed without removal',()=>{
 for(const [file,terms]of [
 ['Princeton-WordNet-LICENSE.txt',['Princeton','copyright','Permission']],
 ['Japanese-WordNet-LICENSE.txt',['Copyright','NICT']],
 ['wordfreq-NOTICE.md',['Robyn Speer','Attribution-ShareAlike 4.0','SUBTLEX']],
 ['wordfreq-LICENSE.txt',['Apache','2.0']],
 ['SudachiPy-LICENSE.txt',['Apache','2.0']],
 ['SudachiDict-LEGAL.txt',['Copyright']],
 ['MIT-LICENSE.txt',['Copyright (c) 2026 codeswitcher','Permission is hereby granted']],
 ['UD-en-LICENSE.txt',['Creative Commons']],
 ['UD-en-README.md',['Universal Dependencies']],
 ['UD-ja-LICENSE.txt',['Creative Commons']],
 ['UD-ja-README.md',['Universal Dependencies']],
 ]){const source=readFileSync('public/licenses/'+file,'utf8');for(const term of terms)assert(source.includes(term),file+': '+term);}
});
