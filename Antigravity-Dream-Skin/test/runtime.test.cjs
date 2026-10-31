const{test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const{DreamSkinSettings}=require("../src/domain/settings.cjs"),{DreamSkinThemeLoader}=require("../src/domain/theme-loader.cjs");
test("output glass mode persists, validates and reaches host payload",()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"dream-output-")),"settings.json"),s=new DreamSkinSettings(file);
 assert.equal(s.get("outputMode"),"transparent");s.update({outputMode:"glass"});assert.equal(new DreamSkinSettings(file).get("outputMode"),"glass");
 assert.equal(new DreamSkinThemeLoader().payload(s.getAll()).outputMode,"glass");s.update({outputMode:"invalid"});assert.equal(s.get("outputMode"),"transparent");
});
test("missing or corrupt wallpaper resources leave the loader available for recovery",()=>{
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),"dream-missing-"));
 const loader=new DreamSkinThemeLoader({rootDir});
 assert.throws(()=>loader.verifyIntegrity(),/清单缺失或损坏/);
 fs.mkdirSync(loader.wallpaperPackDir,{recursive:true});
 fs.writeFileSync(path.join(loader.wallpaperPackDir,"manifest.json"),JSON.stringify({file:"wallpaper.png",sha256:"invalid"}));
 assert.throws(()=>loader.verifyIntegrity(),/图片无法读取/);
 fs.writeFileSync(path.join(loader.wallpaperPackDir,"wallpaper.png"),"damaged");
 assert.throws(()=>loader.verifyIntegrity(),/校验失败/);
});
test("disabled by default, zero scrim survives reload, protection cannot be disabled",()=>{const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"dream-test-")),"settings.json"),s=new DreamSkinSettings(file);assert.equal(s.get("enabled"),false);s.update({scrim:0,fit:"cover",protectEditor:false});assert.equal(new DreamSkinSettings(file).get("scrim"),0);assert.equal(s.get("protectEditor"),true);});
test("wallpaper hash and safe path verified, payload contains original image",()=>{const l=new DreamSkinThemeLoader(),v=l.verifyIntegrity();assert.equal(v.width,1672);assert.equal(v.height,941);assert(l.payload({scrim:0,fit:"contain"}).image.startsWith("data:image/png;base64,"));assert.equal(l.payload({scrim:0}).scrim,0);l.manifest.file="../escape.png";assert.throws(()=>l.verifyIntegrity(),/无效壁纸路径/);});

const {HostController}=require("../src/domain/host-controller.cjs");
function fixture(){
 let state={themed:false},blockSnapshot=null,blockApply=null;
 const applied=[],writes=[];
 const client={
  closed:false,
  async evaluate(expression){
   if(expression.startsWith("({ready:")){
    if(blockSnapshot){const gate=blockSnapshot;blockSnapshot=null;await gate;}
    return {...state};
   }
   if(expression.startsWith("(async function installTheme")){
    const payload=JSON.parse(expression.slice(expression.lastIndexOf(")({")+2,-1));
    applied.push(payload);
    if(blockApply){const gate=blockApply;blockApply=null;await gate;}
    state={themed:true,owner:payload.owner};
    return {applied:true};
   }
   if(expression.includes("destroy()")){
    if(!expression.includes("===")||state.owner===controller.owner){writes.push("destroy");state={themed:false};}
    return null;
   }
   throw new Error("Unexpected operation");
  },
  close(){this.closed=true;}
 };
 const controller=new HostController(
  {payload:settings=>({...settings,image:"data:image/png;base64,fixture"})},
  ()=>{},
  {discover:async()=>({target:{webSocketDebuggerUrl:"ws://127.0.0.1:1/test"}}),createClient:()=>client}
 );
 return {controller,applied,writes,setState:v=>state=v,holdSnapshot:p=>blockSnapshot=p,holdApply:p=>blockApply=p};
}
const nextTask=()=>new Promise(resolve=>setImmediate(resolve));

test("latest disabled setting drains an in-flight connection before update resolves",async()=>{
 const f=fixture();let release;f.holdSnapshot(new Promise(resolve=>release=resolve));
 const first=f.controller.update({enabled:true,fit:"contain",scrim:12});
 await nextTask();
 const last=f.controller.update({enabled:false,fit:"cover",scrim:0});
 release();await Promise.all([first,last]);
 assert.equal(f.applied.length,0);
 assert.equal(f.controller.status.applied,false);
 assert.equal(f.controller.settings.scrim,0);
 await f.controller.stop();
});

test("an update during apply is flushed and caller mutations cannot change a queued setting",async()=>{
 const f=fixture();let release;f.holdApply(new Promise(resolve=>release=resolve));
 const settings={enabled:true,fit:"contain",scrim:12};
 const first=f.controller.update(settings);settings.fit="invalid-caller-mutation";
 await nextTask();
 const final=f.controller.update({enabled:true,fit:"cover",scrim:0});
 release();await Promise.all([first,final]);
 assert.equal(f.applied[0].fit,"contain");
 assert.equal(f.applied.at(-1).fit,"cover");
 assert.equal(f.applied.at(-1).scrim,0);
 await f.controller.stop();assert.equal(f.writes.length,1);
});

test("another owner's skin remains untouched and status never falsely claims it was restored",async()=>{
 const f=fixture();f.setState({themed:true,owner:"other-owner"});
 await f.controller.update({enabled:false});
 assert.match(f.controller.status.message,/另一个/);
 await f.controller.update({enabled:true,fit:"contain",scrim:12});
 assert.equal(f.controller.status.connected,true);
 assert.equal(f.controller.status.applied,false);
 assert.equal(f.applied.length,0);
 await f.controller.stop();assert.equal(f.writes.length,0);
});

test("a local peer that never upgrades to WebSocket has a bounded handshake",async t=>{
 const net=require("node:net"),{Cdp}=require("../../shared/host.cjs"),sockets=new Set();
 const server=net.createServer(socket=>{sockets.add(socket);socket.on("close",()=>sockets.delete(socket));});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});
 const client=new Cdp("ws://127.0.0.1:"+server.address().port+"/",{handshakeTimeout:40});
 const start=Date.now();
 await assert.rejects(client.send("Runtime.evaluate"),/handshake.*timed out/i);
 client.close();assert(Date.now()-start<3000);
});

test('wallpaper positioning and zoom survive restart and clamp invalid ranges',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'dream-pan-')),'settings.json'),s=new DreamSkinSettings(file);
 s.update({positionX:12,positionY:73,zoom:1.4});const restored=new DreamSkinSettings(file);assert.equal(restored.get('positionX'),12);assert.equal(restored.get('positionY'),73);assert.equal(restored.get('zoom'),1.4);
 s.update({positionX:-1,positionY:999,zoom:99});assert.equal(s.get('positionX'),0);assert.equal(s.get('positionY'),100);assert.equal(s.get('zoom'),2);
 const payload=new DreamSkinThemeLoader().payload(restored.getAll());assert.equal(payload.positionX,12);assert.equal(payload.positionY,73);assert.equal(payload.zoom,1.4);
});
