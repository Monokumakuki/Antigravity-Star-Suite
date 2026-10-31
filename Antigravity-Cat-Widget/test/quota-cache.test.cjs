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
