const {EventEmitter}=require('node:events'),{discover,Cdp}=require('../../../shared/host.cjs');
// Read only quota fields from the native IDE cache or Desktop Models view cache.
function readHostQuota(){
 const result={fiveHour:null,weekly:null,fetchedAt:null};
 const groups=typeof nY!=='undefined'&&Array.isArray(nY)?nY:typeof pY!=='undefined'&&Array.isArray(pY)?pY:[];
 let group=groups.find(g=>g&&g.displayName==='Gemini Models');
 if(!group&&typeof document!=='undefined'){
  const seen=new Set();
  for(const el of document.querySelectorAll('[role=dialog] *')){
   let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];
   for(let i=0;fiber&&i<40;fiber=fiber.return,i++){
    if(seen.has(fiber))break;seen.add(fiber);
    for(let state=fiber.memoizedState,j=0;state&&j<80;state=state.next,j++){
     if(Array.isArray(state.memoizedState))group=state.memoizedState.find(g=>g&&g.displayName==='Gemini Models')||group;
    }
   }
   if(group)break;
  }
 }
 if(!group)return result;
 result.cacheAvailable=true;
 for(const b of group.buckets||[]){
  const key=b.bucketId==='gemini-5h'?'fiveHour':b.bucketId==='gemini-weekly'?'weekly':null;
  const value=b.remaining?.case==='remainingFraction'?b.remaining.value:null;
  if(key&&!b.disabled&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1)result[key]=value*100;
 }
 const timestamp=typeof nY!=='undefined'&&Array.isArray(nY)&&typeof mFb==='number'?mFb:typeof jFb==='number'?jFb:null;
 if(typeof timestamp==='number'&&Number.isFinite(timestamp)&&timestamp>0&&timestamp<=Date.now()+60000)result.fetchedAt=timestamp;
 return result;
}
// Uses only the logged-in host's quota service; no credentials or conversation data leave the host.
async function queryHostQuota(readCache){
 const seen=new Set();
 if(typeof document!=='undefined')for(const el of document.querySelectorAll('body *')){
  let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];
  for(;fiber&&!seen.has(fiber);fiber=fiber.return){
   seen.add(fiber);
   const service=fiber.memoizedProps?.value?.core?.cloudCodeService;
   if(typeof service?.retrieveUserQuotaSummary!=='function')continue;
   const response=await service.retrieveUserQuotaSummary(undefined,false);
   const group=response?.response?.groups?.find(g=>g?.displayName==='Gemini Models');
   if(!group)throw Error('Gemini quota group unavailable');
   const result={cacheAvailable:true,fiveHour:null,weekly:null,fetchedAt:null};
   for(const bucket of group.buckets||[]){
    const key=bucket.bucketId==='gemini-5h'?'fiveHour':bucket.bucketId==='gemini-weekly'?'weekly':null;
    const value=bucket.remaining?.case==='remainingFraction'?bucket.remaining.value:null;
    if(key&&!bucket.disabled&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1)result[key]=value*100;
   }
   return result;
  }
 }
 return readCache();
}
class HostQuotaAdapter extends EventEmitter{
 constructor(options={}){super();this.discover=options.discover||discover;this.Client=options.Client||Cdp;this.now=options.now||Date.now;this.snapshot={fiveHour:null,weekly:null,fetchedAt:null,online:false};this.active=false;this.failures=0;this.generation=0;this.setTimer=options.setTimer||setTimeout;this.clearTimer=options.clearTimer||clearTimeout;} 
 start(){if(this.active)return;this.active=true;this.generation++;this.failures=0;this.tick();}
 async tick(){if(this.busy||!this.active)return;this.busy=true;this.clearTimer(this.timer);const generation=this.generation;let c,ready=false;const current=()=>this.active&&generation===this.generation;
  try{const host=await this.discover();if(!current())return;if(!host){this.snapshot={...this.snapshot,status:'waiting-host'};throw new Error('offline');}if(this.hostIdentity&&this.hostIdentity!==host.target.webSocketDebuggerUrl){this.snapshot={fiveHour:null,weekly:null,fetchedAt:null,online:false};this.sampleAt=null;}this.hostIdentity=host.target.webSocketDebuggerUrl;c=new this.Client(host.target.webSocketDebuggerUrl);this.client=c;this.snapshot={...this.snapshot,status:'querying'};const sample=await c.evaluate('('+queryHostQuota.toString()+')('+readHostQuota.toString()+')');if(!current())return;
   if(!sample?.cacheAvailable){
    if(this.sampleAt!==null&&this.sampleAt!==undefined)this.snapshot={...this.snapshot,online:true,cached:true,stale:this.now()-this.sampleAt>=300000};
    else this.snapshot={fiveHour:null,weekly:null,fetchedAt:null,online:true};
    this.snapshot={...this.snapshot,status:'unsupported-or-initializing'};return;
   }
   ready=[sample.fiveHour,sample.weekly].some(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100);
   if(ready)this.sampleAt=this.now();
   if(current())this.snapshot={status:ready?'ready':'quota-unavailable',fiveHour:typeof sample?.fiveHour==='number'&&sample.fiveHour>=0&&sample.fiveHour<=100?sample.fiveHour:null,weekly:typeof sample?.weekly==='number'&&sample.weekly>=0&&sample.weekly<=100?sample.weekly:null,cached:false,stale:false,observedAt:this.sampleAt,fetchedAt:typeof sample?.fetchedAt==='number'?sample.fetchedAt:null,online:true};
  }catch{if(current())this.snapshot={...this.snapshot,status:this.snapshot.status==='waiting-host'?'waiting-host':'query-failed',online:false,cached:true,stale:true};}
  finally{c?.close();this.client=null;this.busy=false;if(current()){this.failures=ready?0:Math.min(this.failures+1,5);this.emit('change',this.snapshot);if(current())this.timer=this.setTimer(()=>this.tick(),ready?30000:Math.min(30000,3000*2**(this.failures-1)));}else if(this.active)this.timer=this.setTimer(()=>this.tick(),0);}
 }
 async openNativeQuota(){return this.tick();}

 stop(){this.active=false;this.generation++;this.clearTimer(this.timer);this.client?.close();}
}
module.exports={HostQuotaAdapter,readHostQuota,queryHostQuota};

