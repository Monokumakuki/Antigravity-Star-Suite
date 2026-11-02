const test=require('node:test'),assert=require('node:assert/strict');
const {HostQuotaAdapter}=require('../src/adapters/host-quota.cjs');
test('closed Models cache and transient errors retain labelled last observation; host switch clears it',async()=>{
 let now=1000,id='ws://127.0.0.1:1/one',sample={cacheAvailable:true,fiveHour:0,weekly:76,fetchedAt:null},fail=false;
 class Client{async evaluate(){if(fail)throw Error('timeout');return sample;}close(){}}
 const a=new HostQuotaAdapter({discover:async()=>({target:{webSocketDebuggerUrl:id}}),Client,now:()=>now});a.active=true;
 await a.tick();assert.equal(a.snapshot.fiveHour,0);assert.equal(a.snapshot.stale,false);
 sample={fiveHour:null,weekly:null};now+=301000;await a.tick();assert.equal(a.snapshot.weekly,76);assert.equal(a.snapshot.stale,true);assert.equal(a.snapshot.cached,true);
 fail=true;await a.tick();assert.equal(a.snapshot.weekly,76);assert.equal(a.snapshot.online,false);
 fail=false;id='ws://127.0.0.1:1/two';await a.tick();assert.equal(a.snapshot.weekly,null);
 sample={cacheAvailable:true,fiveHour:50,weekly:60};await a.tick();assert.equal(a.snapshot.weekly,60);assert.equal(a.snapshot.stale,false);a.stop();
});
test('every startup reads immediately without opening Models, including empty caches and changed hosts',async()=>{
 let id='ws://127.0.0.1:1/a',reads=0;
 class Client{async evaluate(expression){assert(!expression.includes('.click('));reads++;return {fiveHour:null,weekly:null};}close(){}}
 const a=new HostQuotaAdapter({discover:async()=>({target:{webSocketDebuggerUrl:id}}),Client});
 a.openNativeQuota=async()=>{assert.fail('must not open Models automatically');};
 try{
  a.start();while(a.busy)await new Promise(r=>setImmediate(r));assert.equal(reads,1);
  a.start();assert.equal(reads,1);
  await a.tick();assert.equal(reads,2);
  id='ws://127.0.0.1:1/b';await a.tick();assert.equal(reads,3);
  a.stop();a.start();while(a.busy)await new Promise(r=>setImmediate(r));assert.equal(reads,4);
  await new Promise(r=>setTimeout(r,2200));assert.equal(reads,4);
 }finally{a.stop();}
});

test('updated host nY cache reads two quota windows without opening UI',()=>{
 const vm=require('node:vm'),{readHostQuota}=require('../src/adapters/host-quota.cjs');
 const sample=vm.runInNewContext('('+readHostQuota.toString()+')()',{
  nY:[{displayName:'Gemini Models',buckets:[{bucketId:'gemini-5h',remaining:{case:'remainingFraction',value:0}},{bucketId:'gemini-weekly',remaining:{case:'remainingFraction',value:.42}}]}],mFb:1000,jFb:()=>{},
 });
 assert.equal(sample.fiveHour,0);assert.equal(sample.weekly,42);assert.equal(sample.fetchedAt,1000);
});

test('background query extracts Gemini only and never opens UI or serializes credentials',async()=>{
 const vm=require('node:vm'),{queryHostQuota}=require('../src/adapters/host-quota.cjs');let calls=0;
 const el={__reactFiber$test:{memoizedProps:{value:{core:{cloudCodeService:{retrieveUserQuotaSummary:async(a,b)=>{
  calls++;assert.equal(a,undefined);assert.equal(b,false);
  return {response:{groups:[{displayName:'Gemini Models',buckets:[{bucketId:'gemini-5h',remaining:{case:'remainingFraction',value:0}},{bucketId:'gemini-weekly',remaining:{case:'remainingFraction',value:.75}},{bucketId:'other',remaining:{case:'remainingFraction',value:1}}]}]},secret:'must not leave host'};
 }}}}}}};
 const out=await vm.runInNewContext('('+queryHostQuota.toString()+')(()=>{throw Error("unexpected cache fallback")})',{document:{querySelectorAll:selector=>{assert.equal(selector,'body *');return [el];}}});
 assert.equal(calls,1);assert.equal(out.fiveHour,0);assert.equal(out.weekly,75);assert.equal(JSON.stringify(out).includes('secret'),false);
});
test('background quota query propagates service failures instead of claiming fresh data',async()=>{
 const {queryHostQuota}=require('../src/adapters/host-quota.cjs');const previous=global.document;
 global.document={querySelectorAll:()=>[{__reactFiber$test:{memoizedProps:{value:{core:{cloudCodeService:{retrieveUserQuotaSummary:async()=>{throw Error('offline');}}}}}}}]};
 try{await assert.rejects(queryHostQuota(()=>({})),/offline/);}finally{global.document=previous;}
});

test('retry backoff is bounded, success restores 30s polling and concurrent ticks are deduplicated',async()=>{
 let online=false,reads=0,release;const scheduled=[];
 class Client{async evaluate(){reads++;await new Promise(r=>release=r);return {cacheAvailable:true,fiveHour:100,weekly:0};}close(){}}
 const a=new HostQuotaAdapter({discover:async()=>online?{target:{webSocketDebuggerUrl:'ws://127.0.0.1/test'}}:null,Client,setTimer:(fn,ms)=>{scheduled.push(ms);return 1;},clearTimer:()=>{}});a.active=true;
 for(let i=0;i<6;i++)await a.tick();assert.deepEqual(scheduled,[3000,6000,12000,24000,30000,30000]);assert.equal(a.snapshot.status,'waiting-host');
 online=true;const pending=a.tick();while(!release)await new Promise(r=>setImmediate(r));await a.tick();assert.equal(reads,1);release();await pending;
 assert.equal(a.snapshot.weekly,0);assert.equal(a.snapshot.status,'ready');assert.equal(scheduled.at(-1),30000);a.stop();
});
test('late response after stop cannot overwrite or publish quota',async()=>{
 let release,events=0;class Client{async evaluate(){return await new Promise(r=>release=r);}close(){}}
 const a=new HostQuotaAdapter({discover:async()=>({target:{webSocketDebuggerUrl:'ws://127.0.0.1/test'}}),Client});a.on('change',()=>events++);a.start();while(!release)await new Promise(r=>setImmediate(r));a.stop();release({cacheAvailable:true,fiveHour:99});await new Promise(r=>setImmediate(r));assert.equal(events,0);assert.equal(a.snapshot.fiveHour,null);
});

test('stopping inside change listener cannot leave a scheduled poll',async()=>{
 let schedules=0;class Client{async evaluate(){return {cacheAvailable:true,fiveHour:100};}close(){}}
 const a=new HostQuotaAdapter({discover:async()=>({target:{webSocketDebuggerUrl:'ws://127.0.0.1/test'}}),Client,setTimer:()=>schedules++,clearTimer:()=>{}});a.once('change',()=>a.stop());a.start();while(a.busy)await new Promise(r=>setImmediate(r));assert.equal(schedules,0);
});
