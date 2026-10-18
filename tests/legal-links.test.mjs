import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderToStaticMarkup} from 'react-dom/server';
const root=resolve(new URL('..',import.meta.url).pathname),temp=mkdtempSync(join(tmpdir(),'legal-links-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
async function html(path){const result=await build({entryPoints:[join(root,path)],bundle:true,format:'esm',platform:'node',jsx:'automatic',write:false,external:['react','react/jsx-runtime'],loader:{'.css':'empty'}});const file=join(temp,crypto.randomUUID()+'.mjs');writeFileSync(file,result.outputFiles[0].text.replaceAll('from "react/jsx-runtime"',`from ${JSON.stringify(join(root,'node_modules/react/jsx-runtime.js'))}`));return renderToStaticMarkup((await import(pathToFileURL(file))).default());}
test('legal .5 pages render the exact diagnostics, text-report and contact anchors',async()=>{const page=await html('app/privacy/page.tsx');for(const id of ['api-key','diagnostics','text-reports','contact'])assert.equal([...page.matchAll(new RegExp(`id="${id}"`,'g'))].length,1);assert(page.includes('2026-10-18.5'));assert(page.includes('原文・変換結果'));assert(page.includes('Gmailへ自動転送する機能は設けません'));assert(page.includes('30日以内の完全消去を保証するものではありません'));assert(page.includes('各3,000文字まで'));assert(!page.includes('dangerouslySetInnerHTML'));const terms=await html('app/terms/page.tsx');assert(terms.includes('2026-10-18.5'));assert(terms.includes('専用フォーム'));});
test('normal diagnostics and contact keep their own consent version and the report has separate .2',()=>{assert(readFileSync(join(root,'lib/conversion-diagnostics.ts'),'utf8').includes("DIAGNOSTIC_CONSENT_VERSION = '2026-10-18.3'"));assert(readFileSync(join(root,'lib/contact-intake.ts'),'utf8').includes("CONTACT_CONSENT_VERSION = '2026-10-18.1'"));assert(readFileSync(join(root,'lib/issue-reports.ts'),'utf8').includes("ISSUE_CONSENT_VERSION = '2026-10-18.2'"));const form=readFileSync(join(root,'components/issue-report.tsx'),'utf8');assert(form.includes('href="/privacy#text-reports"'));assert(form.includes('target="_blank" rel="noopener noreferrer"'));assert(!form.includes('dangerouslySetInnerHTML'));});

test('default-on is a saved setting and is separate from mandatory anonymous intake records and explicit text consent',async()=>{const p=await html('app/privacy/page.tsx');for(const phrase of ['初期設定はオン','保存済みのオフをオンに戻しません','以前の版では診断の選択を保存していなかった','診断送信の設定がオフでも','要求ごとに発行するランダムな要求ID','1時間以内の完全消去を保証','原文・変換結果の添付は初期状態ではオフ','Google Apps Scriptによる定期的な転送'])assert(p.includes(phrase),phrase);assert(!p.includes('任意診断の選択はページを読み込んだ際にはオフです'));});
test('attachment-specific retention wording does not replace error-report or contact retention explanations',()=>{
 const source=readFileSync(join(root,'app/privacy/page.tsx'),'utf8');const sections=JSON.parse(source.match(/const sections[^=]*=\s*(\[.*?\]);/s)[1]);
 for(const heading of ['4 ','8 ']){const text=sections.find(s=>s.heading.startsWith(heading)).paragraphs.join('\n');assert(text.includes('受付処理で記録を最大1,000件'));assert(!text.includes('問題報告と診断設定欄からの本文添付の記録をそれぞれ'));}
 const attachment=sections.find(s=>s.heading.startsWith('5 ')).paragraphs.join('\n');assert(attachment.includes('同じ種類の新しい報告'));assert(attachment.includes('記録をそれぞれ最大1,000件'));
});
