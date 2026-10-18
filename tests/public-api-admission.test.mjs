import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,seed,limits,sqlNow} from './fixture.mjs';
for(const [category,[minute,hour]] of Object.entries(limits)){
 test(`${category}: real Workerd/D1 atomic minute cap across isolates`,async()=>{
  const f=await fixture({workers:2});try{
   if(category==='rewrite'){
    for(let n=0;n<minute;n++){const r=await f.send('/__admit/'+category,{}, {worker:0});assert.equal(r.status,201);const {handle}=await r.json();await f.send('/__release/'+handle,{}, {worker:0});}
    assert.equal((await f.send('/__admit/'+category)).status,429);
   }else{
    const rs=await Promise.all(Array.from({length:minute+12},()=>f.send('/__admit/'+category)));
    assert.equal(rs.filter(r=>r.status===201).length,minute);assert(rs.every(r=>[201,429].includes(r.status)));
   }
   assert.equal((await f.rows()).length,minute);
  }finally{await f.close();}
 });
 test(`${category}: durable hour cap counts released requests`,async()=>{
  const f=await fixture();try{
   await seed(f.db,category,hour-1);
   assert.equal((await f.send('/__admit/'+category)).status,201);
   assert.equal((await f.send('/__admit/'+category)).status,429);
   assert.equal((await f.rows()).length,hour);
  }finally{await f.close();}
 });
}
test('rewrite: two global active leases under contention; idempotent release retains attempt',async()=>{
 const f=await fixture({workers:2});try{
  const rs=await Promise.all(Array.from({length:18},(_,n)=>f.send('/__admit/rewrite',{}, {worker:n%2})));
  assert.equal(rs.filter(r=>r.status===201).length,2);assert(rs.every(r=>[201,429].includes(r.status)));
  let rows=await f.rows();assert.equal(rows.length,2);assert(rows.every(r=>r.active_lease_until-r.created_at===90000));
  const winner=rs.findIndex(r=>r.status===201),{handle}=await rs[winner].json();
  for(let i=0;i<2;i++)assert.equal((await f.send('/__release/'+handle,{}, {worker:winner%2})).status,200);
  assert.equal((await f.send('/__admit/rewrite')).status,201);
  rows=await f.rows();assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.active_lease_until!==null).length,2);
 }finally{await f.close();}
});
test('expiry frees crash-abandoned active slot without deleting hourly attempt',async()=>{
 const f=await fixture();try{
  const handles=[];for(let i=0;i<2;i++){const r=await f.send('/__admit/rewrite');handles.push((await r.json()).handle);}
  assert.equal((await f.send('/__admit/rewrite')).status,429);
  await f.db.prepare(`UPDATE public_api_admissions SET active_lease_until=${sqlNow}`).run();
  assert.equal((await(await f.send('/__timeout/'+handles[0])).json()).timeout,null);
  assert.equal((await f.send('/__admit/rewrite')).status,201);assert.equal((await f.rows()).length,3);
 }finally{await f.close();}
});
test('D1 lease recheck bounds provider timeout and rejects near-expiry lease',async()=>{
 const f=await fixture();try{
  const {handle}=await(await f.send('/__admit/rewrite')).json();
  assert.equal((await(await f.send('/__timeout/'+handle)).json()).timeout,60000);
  await f.db.prepare(`UPDATE public_api_admissions SET active_lease_until=${sqlNow}+4000`).run();
  assert.equal((await(await f.send('/__timeout/'+handle)).json()).timeout,null);
 }finally{await f.close();}
});
test('cleanup removes old records; never evicts hourly attempts to bypass caps',async()=>{
 const f=await fixture();try{
  await seed(f.db,'contact',30,3601000);
  assert.equal((await f.send('/__admit/contact')).status,201);assert.equal((await f.rows()).length,1);
  await seed(f.db,'diagnostics',999);assert.equal((await f.rows()).length,1000);
  assert.equal((await f.send('/__admit/error_reports')).status,429);assert.equal((await f.rows()).length,1000);
 }finally{await f.close();}
});
test('cleanup bounded to 1000; malformed route cannot reach persistence',async()=>{
 const f=await fixture();try{
  await seed(f.db,'diagnostics',2200,3601000);
  assert.equal((await f.send('/__admit/contact')).status,429);assert.equal((await f.rows()).length,1200);
  assert.equal((await f.send('/__admit/contact')).status,201);assert.equal((await f.rows()).length,201);
  assert.equal((await f.send('/__admit/not_a_route')).status,503);
  assert.equal((await f.send('/__admit/toString')).status,503);assert.equal((await f.rows()).length,201);
 }finally{await f.close();}
});
test('schema has exactly four content-free fields and rejects invalid routes/leases',async()=>{
 const f=await fixture();try{
  const columns=(await f.db.prepare('PRAGMA table_info(public_api_admissions)').all()).results.map(r=>r.name);
  assert.deepEqual(columns,['request_id','route','created_at','active_lease_until']);
  for(const [route,created,lease] of [['headers',0,null],['contact',0,100],['rewrite',0,90001],['rewrite',-1,null]])await assert.rejects(()=>f.db.prepare('INSERT INTO public_api_admissions VALUES (?,?,?,?)').bind(crypto.randomUUID(),route,created,lease).run());
  await assert.rejects(()=>f.db.prepare('INSERT INTO public_api_admissions VALUES (?,?,?,?)').bind('private text','rewrite',0,null).run());
 }finally{await f.close();}
});
