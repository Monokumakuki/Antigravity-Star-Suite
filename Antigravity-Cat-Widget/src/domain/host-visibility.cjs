const {EventEmitter}=require("node:events"),{spawn}=require("node:child_process"),path=require("node:path");
function validBounds(value){return value&&["x","y","width","height"].every(key=>Number.isSafeInteger(value[key])&&Math.abs(value[key])<100000)&&value.width>0&&value.height>0;}
function characterPlacement(area,size,dimensions,left,top){
 const gap=(dimensions.width-size)/2;
 const visualX=Math.max(area.x,Math.min(area.x+area.width-size,left));
 const x=Math.round(Math.max(area.x,Math.min(area.x+area.width-dimensions.width,visualX-gap)));
 const y=Math.round(Math.max(area.y,Math.min(area.y+area.height-dimensions.height,top)));
 return{bounds:{...dimensions,x,y},artShift:visualX-x-gap,visualX};
}
function snapToEdges(area,size,height,visualX,y){
 const left=visualX-area.x,right=area.x+area.width-visualX-size,bottom=area.y+area.height-y-height;
 if(bottom<=120&&Math.min(left,right)<=120)return{visualX:left<right?area.x:area.x+area.width-size,y:area.y+area.height-height};
 return{visualX:left<40?area.x:right<40?area.x+area.width-size:visualX,y:bottom<40?area.y+area.height-height:y};
}
function hostPlacement(state,scale,offsetX=18,offsetY=18,dock=""){
 if(!["host","self"].includes(state.kind)||!validBounds(state.bounds))return null;
 const area=state.bounds;
 const effectiveScale=Math.floor(Math.min(scale,area.width-80,(area.height-340)*1372/1146));
 if(effectiveScale<140||area.width<360)return null;
 const width=Math.max(360,effectiveScale+80),height=Math.round(effectiveScale*1146/1372+340);
 return{scale:effectiveScale,...characterPlacement(area,effectiveScale,{width,height},dock==="left"?area.x:dock==="right"?area.x+area.width-effectiveScale:area.x+area.width-effectiveScale-offsetX,area.y+area.height-height-offsetY)};
}
class ForegroundMonitor extends EventEmitter{
 constructor(){super();this.state={kind:"unknown",bounds:null};this.lastReport=0;}
 start(handle){
  if(this.child&&Date.now()-this.lastReport>5000)this.stop();
  if(this.child)return;
  this.lastReport=Date.now();
  const child=spawn(path.join(__dirname,"../native/ForegroundHost.exe"),[String(process.pid),...(handle?[handle.readBigUInt64LE().toString()]:[])],{windowsHide:true,stdio:["pipe","pipe","ignore"]});this.child=child;this.bound=!!handle;
  let pending="";
  child.stdout.on("data",chunk=>{
   if(this.child!==child)return;
   this.lastReport=Date.now();pending+=chunk.toString();let index;
   while((index=pending.indexOf("\n"))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);try{const state=JSON.parse(line);if(["host","self","other","unknown"].includes(state.kind)&&(!state.bounds||validBounds(state.bounds))){this.state=state;this.emit("change",state);}}catch{}}
   if(pending.length>8192)pending="";
  });
  const ended=()=>{if(this.child!==child)return;this.child=null;this.state={kind:"unknown",bounds:null};this.emit("change",this.state);};
  child.on("error",ended);child.on("exit",ended);
 }
 stop(){const child=this.child;this.child=null;if(child&&!this.bound){child.kill();return;}if(child){child.stdin.end("detach\n");const timer=setTimeout(()=>child.kill(),1000);timer.unref();}this.state={kind:"unknown",bounds:null};}
}
module.exports={ForegroundMonitor,hostPlacement,validBounds,characterPlacement,snapToEdges};
