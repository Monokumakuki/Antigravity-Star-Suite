const {EventEmitter}=require('node:events'),{discover,Cdp}=require('../../../shared/host.cjs');
// Read only quota fields from the native IDE cache or Desktop Models view cache.
function readHostQuota(){
 const result={fiveHour:null,weekly:null,fetchedAt:null};
 let group=typeof pY!=='undefined'&&Array.isArray(pY)?pY.find(g=>g&&g.displayName==='Gemini Models'):null;
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
 if(typeof jFb==='number'&&Number.isFinite(jFb)&&jFb>0&&jFb<=Date.now()+60000)result.fetchedAt=jFb;
 return result;
}
class HostQuotaAdapter extends EventEmitter{
 constructor(options={}){super();this.discover=options.discover||discover;this.Client=options.Client||Cdp;this.now=options.now||Date.now;this.snapshot={fiveHour:null,weekly:null,fetchedAt:null,online:false};this.active=false;}
 start(){if(this.active)return;this.active=true;this.tick();this.timer=setInterval(()=>this.tick(),30000);}
 async tick(){if(this.busy||!this.active)return;this.busy=true;let c;
  try{const host=await this.discover();if(!host)throw new Error('offline');if(this.hostIdentity&&this.hostIdentity!==host.target.webSocketDebuggerUrl){this.snapshot={fiveHour:null,weekly:null,fetchedAt:null,online:false};this.sampleAt=null;}this.hostIdentity=host.target.webSocketDebuggerUrl;c=new this.Client(host.target.webSocketDebuggerUrl);const sample=await c.evaluate('('+readHostQuota.toString()+')()');
   if(!sample?.cacheAvailable){
    if(this.sampleAt!==null&&this.sampleAt!==undefined)this.snapshot={...this.snapshot,online:true,cached:true,stale:this.now()-this.sampleAt>=300000};
    else this.snapshot={fiveHour:null,weekly:null,fetchedAt:null,online:true};
    return;
   }
   if(typeof sample.fiveHour==='number'||typeof sample.weekly==='number')this.sampleAt=this.now();
   if(this.active)this.snapshot={fiveHour:typeof sample?.fiveHour==='number'&&sample.fiveHour>=0&&sample.fiveHour<=100?sample.fiveHour:null,weekly:typeof sample?.weekly==='number'&&sample.weekly>=0&&sample.weekly<=100?sample.weekly:null,cached:false,stale:false,observedAt:this.sampleAt,fetchedAt:typeof sample?.fetchedAt==='number'?sample.fetchedAt:null,online:true};
  }catch{if(this.active)this.snapshot={...this.snapshot,online:false,cached:true,stale:true};}
  finally{c?.close();this.busy=false;if(this.active)this.emit('change',this.snapshot);}
 }
 async openNativeQuota(){
  let c;try{const host=await this.discover();if(!host)return;c=new this.Client(host.target.webSocketDebuggerUrl);
   await c.evaluate("(()=>{if(document.querySelector('[role=dialog]'))return;[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Settings')?.click()})()");
   await new Promise(resolve=>setTimeout(resolve,350));
   await c.evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='Models')?.click()");
   await new Promise(resolve=>setTimeout(resolve,1200));await this.tick();
  }finally{c?.close();}
 }
 stop(){this.active=false;clearInterval(this.timer);}
}
module.exports={HostQuotaAdapter,readHostQuota};

