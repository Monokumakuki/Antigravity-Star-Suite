const test=require('node:test'),assert=require('node:assert/strict');
const {Personality}=require('../src/renderer/personality.js');
const {hostPlacement,ForegroundMonitor}=require('../src/domain/host-visibility.cjs');
test('native heartbeat stays live while stationary and stale helper is replaced',async()=>{
 const monitor=new ForegroundMonitor();try{
  const next=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('heartbeat timeout')),3500);monitor.once('change',s=>{clearTimeout(timer);resolve(s);});});
  let waiting=next();monitor.start();await waiting;
  const child=monitor.child;await next();assert.equal(monitor.child,child);
  monitor.lastReport=Date.now()-6000;waiting=next();monitor.start();await waiting;assert.notEqual(monitor.child,child);
 }finally{monitor.stop();}
});
test('click reactions have a 15 percent chance without ambient startup or three-minute lockout',()=>{
 const c={enabled:true,hidden:false,busy:false,state:'idle'};let hits=0;
 for(let i=0;i<100;i++){const p=new Personality({},()=>i/100,()=>0);if(p.reaction(c,false,true))hits++;}
 assert.equal(hits,15);
 const p=new Personality({},()=>0,()=>0);assert.equal(p.reaction(c,false,true),'proud');assert.equal(p.reaction(c,false,true),'proud');
 assert.equal(p.reaction({...c,busy:true},false,true),null);
});
test('both bottom corners attract within 120 DIP without snapping distant positions',()=>{
 const {snapToEdges}=require('../src/domain/host-visibility.cjs');const area={x:100,y:50,width:1200,height:900};
 assert.deepEqual(snapToEdges(area,220,524,220,306),{visualX:100,y:426});
 assert.deepEqual(snapToEdges(area,220,524,960,306),{visualX:1080,y:426});
 assert.deepEqual(snapToEdges(area,220,524,950,296),{visualX:950,y:296});
});
test('Chinese quips do not repeat; rare reactions respect cooldown, busy and hidden states',()=>{
 let now=0;const p=new Personality({idle:['甲','乙']},()=>0,()=>now);
 assert.equal(p.say('idle'),'甲');assert.equal(p.say('idle'),'乙');
 const c={enabled:true,hidden:false,busy:false,state:'idle'};
 assert.equal(p.reaction(c),null);now=60000;assert.equal(p.reaction(c),'proud');assert.equal(p.reaction(c),null);
 for(const patch of [{busy:true},{hidden:true},{enabled:false},{state:'thinking'},{state:'warning'}])assert.equal(p.reaction({...c,...patch},true),null);
 now=240000;assert.equal(p.reaction(c),'proud');
});
test('host placement fits negative-coordinate workspaces and hides small or inactive hosts',()=>{
 for(const scale of [140,220,360]){const area={x:-1200,y:20,width:1100,height:800},p=hostPlacement({kind:'host',bounds:area},scale);assert(p);assert(p.bounds.x>=area.x&&p.bounds.y>=area.y);assert(p.bounds.x+p.bounds.width<=area.x+area.width);assert(p.bounds.y+p.bounds.height<=area.y+area.height);}
 assert.equal(hostPlacement({kind:'other',bounds:null},220),null);
 assert.equal(hostPlacement({kind:'host',bounds:{x:0,y:0,width:350,height:400}},220),null);
});
test('native foreground helper returns bounded metadata without interacting with windows',async()=>{
 const monitor=new ForegroundMonitor();try{const state=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('helper timeout')),5000);monitor.once('change',s=>{clearTimeout(timer);resolve(s);});monitor.start();});assert(['host','self','other','unknown'].includes(state.kind));}finally{monitor.stop();}
});

test('five-hour and weekly manual quotas persist independently; fifty new quips are available',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{SettingsManager}=require('../src/domain/settings.cjs');
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'gemini-windows-')),'settings.json'),s=new SettingsManager(file);
 s.update({manualQuota:true,manualPercent:0,manualWeeklyPercent:68});const restored=new SettingsManager(file);
 assert.equal(restored.get('manualPercent'),0);assert.equal(restored.get('manualWeeklyPercent'),68);
 s.update({manualWeeklyPercent:101});assert.equal(s.get('manualWeeklyPercent'),100);assert.equal(s.get('manualPercent'),0);
 const lines=require('../assets/dialogue/zh-CN.json').lines.idle;assert(lines.length>=64);assert.equal(new Set(lines).size,lines.length);
});

test('native quota cache reads Gemini windows only, preserves zero and rejects invalid fractions',()=>{
 const vm=require('node:vm'),{readHostQuota}=require('../src/adapters/host-quota.cjs');
 const result=vm.runInNewContext('('+readHostQuota.toString()+')()',{pY:[{displayName:'Other',buckets:[{bucketId:'gemini-5h',remaining:{case:'remainingFraction',value:1}}]},{displayName:'Gemini Models',buckets:[{bucketId:'gemini-5h',remaining:{case:'remainingFraction',value:0}},{bucketId:'gemini-weekly',remaining:{case:'remainingFraction',value:.68}}]}],jFb:1000});
 assert.equal(result.fiveHour,0);assert.equal(result.weekly,68);assert.equal(result.fetchedAt,1000);
 const missing=vm.runInNewContext('('+readHostQuota.toString()+')()');assert.equal(missing.fiveHour,null);
});

test('Desktop Models quota cache is read without calling services',()=>{
 const vm=require('node:vm'),{readHostQuota}=require('../src/adapters/host-quota.cjs');
 const groups=[{displayName:'Gemini Models',buckets:[{bucketId:'gemini-5h',remaining:{case:'remainingFraction',value:.42}},{bucketId:'gemini-weekly',remaining:{case:'remainingFraction',value:0}}]}];
 const el={};el['__reactFiber'+String.fromCharCode(36)+'test']={memoizedState:{memoizedState:groups,next:null},return:null};
 const sample=vm.runInNewContext('('+readHostQuota.toString()+')()',{document:{querySelectorAll:()=>[el]}});
 assert.equal(sample.fiveHour,42);assert.equal(sample.weekly,0);assert.equal(sample.fetchedAt,null);assert.equal(sample.cacheAvailable,true);
});

test('visual drag reaches host corners continuously and survives reflow without a release jump',()=>{
 const {characterPlacement,hostPlacement}=require('../src/domain/host-visibility.cjs');
 const area={x:100,y:50,width:1200,height:800},size=220,dim={width:360,height:524};
 let previous=null;
 for(let left=area.x;left<=area.x+area.width-size;left+=10){
  const p=characterPlacement(area,size,dim,left,area.y+area.height-dim.height);
  assert.equal(p.bounds.x+(dim.width-size)/2+p.artShift,left);
  if(previous!==null)assert.equal(p.visualX-previous,10);previous=p.visualX;
  const restored=hostPlacement({kind:'host',bounds:area},size,area.x+area.width-p.visualX-size,0);
  assert.equal(restored.visualX,p.visualX);assert.equal(restored.artShift,p.artShift);
 }
 const right=characterPlacement(area,size,dim,99999,99999);assert.equal(right.visualX+size,area.x+area.width);assert.equal(right.bounds.y+dim.height,area.y+area.height);
});

test('explicit host docking stays at the same side after resizing',()=>{
 for(const side of ['left','right'])for(const width of [700,1100]){
 const area={x:30,y:50,width,height:800},p=hostPlacement({kind:'host',bounds:area},220,400,0,side);
 assert.equal(side==='left'?p.visualX:p.visualX+p.scale,side==='left'?area.x:area.x+area.width);
 }
});
