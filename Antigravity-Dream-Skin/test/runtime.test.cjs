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
    state={themed:true,owner:payload.owner,rev:12};
    return {applied:true};
   }
   if(expression.includes("touch?.()")){
    return true;
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

test('custom mp4 and image media settings persist, clamp rate, and deduplicate recentMedia',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'dream-media-set-')),'settings.json'),s=new DreamSkinSettings(file);
 assert.equal(s.get('mediaType'),'preset');
 s.update({
  mediaType:'video',
  customMediaPath:'C:\\wallpapers\\loop.mp4',
  recentMedia:['C:\\wallpapers\\a.png','C:\\wallpapers\\loop.mp4','C:\\wallpapers\\a.png'],
  videoMuted:false,
  videoPlaybackRate:3.5,
  videoPaused:true
 });
 const reloaded=new DreamSkinSettings(file);
 assert.equal(reloaded.get('mediaType'),'video');
 assert.equal(reloaded.get('customMediaPath'),'C:\\wallpapers\\loop.mp4');
 assert.deepEqual(reloaded.get('recentMedia'),['C:\\wallpapers\\a.png','C:\\wallpapers\\loop.mp4']);
 assert.equal(reloaded.get('videoMuted'),false);
 assert.equal(reloaded.get('videoPlaybackRate'),2);
 assert.equal(reloaded.get('videoPaused'),true);
 reloaded.update({mediaType:'invalid-kind',videoPlaybackRate:0.01});
 assert.equal(reloaded.get('mediaType'),'preset');
 assert.equal(reloaded.get('videoPlaybackRate'),0.25);
});

test('LocalMediaServer streams byte ranges with token auth and blocks unapproved paths',async t=>{
 const http=require('node:http');
 const {LocalMediaServer,detectMediaKind}=require('../src/domain/media-server.cjs');
 assert.equal(detectMediaKind('clip.MP4'),'video');
 assert.equal(detectMediaKind('art.webp'),'image');
 assert.equal(detectMediaKind('evil.exe'),null);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dream-srv-'));
 const mp4=path.join(dir,'sample.mp4'),secret=path.join(dir,'secret.txt');
 fs.writeFileSync(mp4,Buffer.from('0123456789ABCDEF'));
 fs.writeFileSync(secret,'topsecret');
 const srv=new LocalMediaServer();
 await srv.start();
 t.after(()=>srv.stop());
 const url=srv.register(mp4);
 const unauth=await fetch(url.replace(/token=[^&]+/,'token=wrong'));
 assert.equal(unauth.status,401);
 const blocked=await fetch(`${srv.baseUrl}/media?token=${srv.token}&path=${encodeURIComponent(secret)}`);
 assert.equal(blocked.status,403);
 const partial=await fetch(url,{headers:{Range:'bytes=2-7'}});
 assert.equal(partial.status,206);
 assert.equal(partial.headers.get('content-type'),'video/mp4');
 assert.equal(partial.headers.get('content-range'),'bytes 2-7/16');
 assert.equal(await partial.text(),'234567');
});

test('DreamSkinThemeLoader resolves custom video and image via LocalMediaServer',async t=>{
 const {LocalMediaServer}=require('../src/domain/media-server.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dream-ldr-'));
 const mp4=path.join(dir,'bg.mp4'),jpg=path.join(dir,'bg.jpg');
 fs.writeFileSync(mp4,Buffer.from('fake-mp4-bytes'));
 fs.writeFileSync(jpg,Buffer.from('fake-jpg-bytes'));
 const srv=new LocalMediaServer();
 await srv.start();
 t.after(()=>srv.stop());
 const loader=new DreamSkinThemeLoader({mediaServer:srv});
 const vPayload=loader.payload({mediaType:'video',customMediaPath:mp4,videoMuted:true,videoPlaybackRate:1.25,scrim:10,opacity:60,fit:'cover',positionX:50,positionY:50,zoom:1});
 assert.equal(vPayload.mediaKind,'video');
 assert(vPayload.mediaUrl.startsWith(srv.baseUrl));
 assert.equal(vPayload.videoPlaybackRate,1.25);
 const iPayload=loader.payload({mediaType:'image',customMediaPath:jpg,scrim:0,fit:'contain'});
 assert.equal(iPayload.mediaKind,'image');
 assert(iPayload.mediaUrl.startsWith(srv.baseUrl));
 assert.throws(()=>loader.payload({mediaType:'video',customMediaPath:path.join(dir,'missing.mp4')}),/无法读取|不存在/);
});

test('installTheme mounts looping video element, preserves element across style updates, and cleans up on destroy',async()=>{
 const {installTheme}=require('../src/host/theme.cjs');
 function makeEl(tag){
  const attrs=new Map(),listeners=new Map(),children=[];
  const el={
   tagName:tag.toUpperCase(),
   id:'',
   children,
   isConnected:true,
   parentElement:null,
   style:{
    _props:{},
    setProperty(k,v){this._props[k]=v;},
    getPropertyValue(k){return this._props[k]||'';},
    getPropertyPriority(){return '';},
    removeProperty(k){delete this._props[k];}
   },
   playCalls:0,
   pauseCalls:0,
   loadCalls:0,
   videoWidth:1920,
   videoHeight:1080,
   naturalWidth:1672,
   naturalHeight:941,
   setAttribute(k,v){if(k==='id')el.id=v;attrs.set(k,String(v));},
   getAttribute(k){return attrs.get(k)??null;},
   hasAttribute(k){return attrs.has(k);},
   removeAttribute(k){attrs.delete(k);if(k==='src')el.src='';},
   addEventListener(evt,fn){listeners.set(evt,fn);},
   append(...nodes){for(const n of nodes){n.parentElement=el;children.push(n);}},
   prepend(...nodes){for(const n of nodes){n.parentElement=el;children.unshift(n);}},
   remove(){el.isConnected=false;if(el.parentElement){const i=el.parentElement.children.indexOf(el);if(i>=0)el.parentElement.children.splice(i,1);}},
   matches(){return false;},
   closest(){return null;},
   contains(target){return target===el||children.some(c=>c.contains?.(target));},
   querySelector(sel){if(sel==='#root')return rootEl;return null;},
   querySelectorAll(){return [];},
   getBoundingClientRect(){return {left:0,top:0,width:1280,height:720,right:1280,bottom:720};},
   play(){el.playCalls++;return Promise.resolve();},
   pause(){el.pauseCalls++;},
   load(){el.loadCalls++;},
   classList:{add(){},remove(){}}
  };
  return el;
 }
 const rootEl=makeEl('div');rootEl.id='root';
 const bodyEl=makeEl('body');bodyEl.append(rootEl);
 const headEl=makeEl('head');
 const docEl=makeEl('html');
 const origGlobals={window:global.window,document:global.document,getComputedStyle:global.getComputedStyle,MutationObserver:global.MutationObserver,ResizeObserver:global.ResizeObserver,innerWidth:global.innerWidth,innerHeight:global.innerHeight};
 try{
  global.window={};
  global.document={
   documentElement:docEl,
   head:headEl,
   body:bodyEl,
   createElement:tag=>makeEl(tag),
   querySelector:sel=>sel==='#root'?rootEl:null,
   querySelectorAll:()=>[]
  };
  global.getComputedStyle=()=>({backgroundColor:'rgb(24, 24, 34)',backgroundImage:'none'});
  global.MutationObserver=class{observe(){}disconnect(){}};
  global.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  global.innerWidth=1280;
  global.innerHeight=720;

  const videoUrl='http://127.0.0.1:45555/media?token=abc&path=demo.mp4';
  const status=await installTheme({
   owner:'test-owner',
   outputMode:'transparent',
   mediaKind:'video',
   mediaUrl:videoUrl,
   videoMuted:true,
   videoPlaybackRate:1.25,
   videoPaused:false,
   opacity:0.65,
   scrim:0.15,
   fit:'cover',
   positionX:50,
   positionY:50,
   zoom:1
  });
  assert.equal(status.applied,true);
  assert.equal(status.mediaKind,'video');
  const layer=bodyEl.children.find(c=>c.id==='agy-dream-wallpaper-v2');
  const videoEl=layer.children.find(c=>c.id==='agy-dream-media-v2');
  assert.equal(videoEl.tagName,'VIDEO');
  assert.equal(videoEl.src,videoUrl);
  assert.equal(videoEl.loop,true);
  assert.equal(videoEl.muted,true);
  assert.equal(videoEl.playbackRate,1.25);

  await installTheme({
   owner:'test-owner',
   outputMode:'glass',
   mediaKind:'video',
   mediaUrl:videoUrl,
   videoMuted:true,
   videoPlaybackRate:1.5,
   videoPaused:true,
   opacity:0.8,
   scrim:0.2,
   fit:'contain',
   positionX:40,
   positionY:60,
   zoom:1.1
  });
  const sameVideoEl=layer.children.find(c=>c.id==='agy-dream-media-v2');
  assert.equal(sameVideoEl,videoEl);
  assert.equal(sameVideoEl.playbackRate,1.5);
  assert.ok(sameVideoEl.pauseCalls>=1);

  global.window.__agyDreamSkinV2.destroy();
  assert.equal(global.window.__agyDreamSkinV2,undefined);
  assert.equal(videoEl.isConnected,false);
  assert.ok(videoEl.loadCalls>=1);
 }finally{
  Object.assign(global,origGlobals);
 }
});

test('DreamSkinSettings sanitizes glass regions, themeStyle, radius, veil, font colors, and merges partial updates cleanly',()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'dream-glass-set-')),'settings.json');
 const s=new DreamSkinSettings(file);
 assert.equal(s.getAll().glass.themeStyle,'star-neko');
 assert.equal(s.getAll().glass.radius,16);
 s.update({
  widgetHideTray:true,
  glass:{
   themeStyle:'official',
   tint:'#38BDF8',
   veil:120,
   radius:99,
   regions:{sidebar:{fill:88,blur:10},overlay:{fill:-5,blur:99}}
  },
  font:{
   accent:'#6366F1',
   darkSeparate:true,
   colors:{main:'#FBF9F9',secondary:'invalid',muted:'#FDFDFD',faint:'#FFFFFF'},
   colorsDark:{main:'#EAEBF1',secondary:'#A8A9B2'}
  }
 });
 s.update({glass:{veil:35,radius:12},font:{colors:{secondary:'#E2E8F0'}}});
 const reloaded=new DreamSkinSettings(file).getAll();
 assert.equal(reloaded.widgetHideTray,true);
 assert.equal(reloaded.glass.themeStyle,'official');
 assert.equal(reloaded.glass.tint,'#38bdf8');
 assert.equal(reloaded.glass.veil,35);
 assert.equal(reloaded.glass.radius,12);
 assert.equal(reloaded.glass.regions.sidebar.fill,88);
 assert.equal(reloaded.glass.regions.sidebar.blur,10);
 assert.equal(reloaded.glass.regions.overlay.fill,0);
 assert.equal(reloaded.glass.regions.overlay.blur,40);
 s.update({glass:{radius:2}});
 assert.equal(s.getAll().glass.radius,8);
 assert.equal(reloaded.font.accent,'#6366f1');
 assert.equal(reloaded.font.darkSeparate,true);
 assert.equal(reloaded.font.colors.main,'#fbf9f9');
 assert.equal(reloaded.font.colors.secondary,'#e2e8f0');
 assert.equal(reloaded.font.colorsDark.main,'#eaebf1');
});

test('installTheme takes over official Antigravity glass/font vars and styles slash menu cleanly without transparence leak',async()=>{
 const {installTheme}=require('../src/host/theme.cjs');
 function makeEl(tag){
  const attrs=new Map(),children=[];
  const el={
   tagName:tag.toUpperCase(),
   id:'',
   textContent:'',
   children,
   isConnected:true,
   parentElement:null,
   style:{
    _props:{},
    setProperty(k,v){this._props[k]=v;},
    getPropertyValue(k){return this._props[k]||'';},
    getPropertyPriority(){return '';},
    removeProperty(k){delete this._props[k];}
   },
   setAttribute(k,v){if(k==='id')el.id=v;attrs.set(k,String(v));},
   getAttribute(k){return attrs.get(k)??null;},
   hasAttribute(k){return attrs.has(k);},
   removeAttribute(k){attrs.delete(k);},
   addEventListener(){},
   append(...nodes){for(const n of nodes){n.parentElement=el;children.push(n);}},
   prepend(...nodes){for(const n of nodes){n.parentElement=el;children.unshift(n);}},
   remove(){el.isConnected=false;if(el.parentElement){const i=el.parentElement.children.indexOf(el);if(i>=0)el.parentElement.children.splice(i,1);}},
   matches(){return false;},
   closest(){return null;},
   contains(target){return target===el||children.some(c=>c.contains?.(target));},
   querySelector(){return null;},
   querySelectorAll(){return [];},
   getBoundingClientRect(){return {left:0,top:0,width:1280,height:720,right:1280,bottom:720};},
   classList:{add(){},remove(){},contains(){return false;}}
  };
  return el;
 }
 const rootEl=makeEl('div');rootEl.id='root';
 const bodyEl=makeEl('body');bodyEl.append(rootEl);
 const headEl=makeEl('head');
 const docEl=makeEl('html');
 const origGlobals={window:global.window,document:global.document,getComputedStyle:global.getComputedStyle,MutationObserver:global.MutationObserver,ResizeObserver:global.ResizeObserver,innerWidth:global.innerWidth,innerHeight:global.innerHeight};
 try{
  global.window={};
  global.document={documentElement:docEl,head:headEl,body:bodyEl,createElement:tag=>makeEl(tag),querySelector:sel=>sel==='#root'?rootEl:null,querySelectorAll:()=>[]};
  global.getComputedStyle=()=>({backgroundColor:'rgb(0, 0, 0)',backgroundImage:'none'});
  global.MutationObserver=class{observe(){}disconnect(){}};
  global.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  global.innerWidth=1280;
  global.innerHeight=720;

  await installTheme({
   owner:'glass-owner',
   outputMode:'glass',
   image:'data:image/png;base64,AA==',
   glass:{themeStyle:'star-neko',tint:'#ffffff',veil:50,radius:20,regions:{sidebar:{fill:0,blur:0},content:{fill:0,blur:6},overlay:{fill:0,blur:12},control:{fill:0,blur:12},header:{fill:0,blur:0},bar:{fill:0,blur:12}}},
   font:{accent:'#ea00ff',darkSeparate:false,colors:{main:'#fbf9f9',secondary:'#ffffff',muted:'#fdfdfd',faint:'#ffffff'},colorsDark:{}}
  });
  const baseCss=headEl.children.find(c=>c.id==='agy-dream-style-v2')?.textContent||'';
  const tokenCss=headEl.children.find(c=>c.id==='agy-dream-tokens-v2')?.textContent||'';
  assert.equal(rootEl.getAttribute('data-agy-theme-style'),'star-neko');
  assert.match(baseCss,/\[data-mention-menu\]/);
  assert.match(baseCss,/\[data-agy-theme-style="star-neko"\]/);
  assert.doesNotMatch(baseCss,/\.surface-composer[^\n]*\*:not\([^)]*\) \{background-color:transparent!important/);
  assert.match(baseCss,/\[data-mention-menu\][\s\S]*backdrop-filter/);
  assert.match(baseCss,/\[data-testid="sidecar-iframe-slot"\][\s\S]*backdrop-filter:\s*none\s*!important/);
  assert.match(baseCss,/\.surface-composer\s*\{[\s\S]*overflow:\s*visible\s*!important/);
  assert.match(baseCss,/\.surface-composer\s*>\s*\.surface-composer-card[\s\S]*overflow:\s*hidden\s*!important/);
  assert.match(baseCss,/\.surface-composer[\s\S]*\[data-lexical-editor="true"\][\s\S]*background-color:\s*transparent\s*!important/);
  assert.match(baseCss,/\.bg-sidebar[\s\S]*backdrop-filter:\s*none\s*!important/);
  assert.match(baseCss,/\[data-selected="true"\]/);
  assert.match(baseCss,/pre\[data-agy-dream-protect\]:has\(> \[class\*="rounded-"\]\)[\s\S]*background-color:\s*transparent\s*!important/);
  assert.match(baseCss,/\[data-split-fill-edge="left"\]:has\(> \.agy-sheet\)[\s\S]*overflow:\s*hidden\s*!important/);
  assert.match(baseCss,/\[data-main-content-body="true"\]::before/);
  assert.match(tokenCss,/--lg-filter-sidebar:\s*none/);
  assert.match(tokenCss,/--agy-glass-radius:\s*20px/);
  assert.match(tokenCss,/--agy-radius-outer:/);
  assert.match(tokenCss,/--foreground:\s*#fbf9f9/);
  assert.match(tokenCss,/--secondary-foreground:\s*#ffffff/);
  assert.match(tokenCss,/--muted-foreground:\s*#fdfdfd/);
  assert.match(tokenCss,/--placeholder:\s*#ffffff/);
  assert.match(tokenCss,/--primary:\s*#ea00ff/);
  assert.match(tokenCss,/--glass:/);
  global.window.__agyDreamSkinV2.update({
   owner:'glass-owner',
   outputMode:'glass',
   image:'data:image/png;base64,AA==',
   glass:{themeStyle:'official',tint:'#ffffff',veil:50,radius:12,regions:{sidebar:{fill:0,blur:0},content:{fill:0,blur:6},overlay:{fill:0,blur:12},control:{fill:0,blur:12},header:{fill:0,blur:0},bar:{fill:0,blur:12}}},
   font:{accent:'#ea00ff',darkSeparate:false,colors:{main:'#fbf9f9',secondary:'#ffffff',muted:'#fdfdfd',faint:'#ffffff'},colorsDark:{}}
  });
  assert.equal(rootEl.getAttribute('data-agy-theme-style'),'official');
  assert.match(headEl.children.find(c=>c.id==='agy-dream-tokens-v2')?.textContent||'',/--agy-glass-radius:\s*12px/);
  global.window.__agyDreamSkinV2.destroy();
  assert.equal(headEl.children.some(c=>c.id==='agy-dream-tokens-v2'),false);
 }finally{
  Object.assign(global,origGlobals);
 }
});

test('stale orphaned skin from crashed sidecar is reclaimed while live other owner stays untouched',async()=>{
 const f=fixture();
 f.setState({themed:true,owner:'dead-pid-owner',rev:2,stale:true});
 await f.controller.update({enabled:true,fit:'contain',scrim:12});
 assert.equal(f.writes.length,1);
 assert.equal(f.applied.length,1);
 assert.equal(f.controller.status.applied,true);
 await f.controller.stop();
});

test('LocalMediaServer supports cache ETag 304 and HEAD for smooth 4K loopback streaming',async t=>{
 const {LocalMediaServer}=require('../src/domain/media-server.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dream-cache-'));
 const mp4=path.join(dir,'冬_循环_4K60.mp4');
 fs.writeFileSync(mp4,Buffer.from('ABCDEFGHIJKLMNOP'));
 const srv=new LocalMediaServer();
 await srv.start();
 t.after(()=>srv.stop());
 const url=srv.register(mp4);
 const first=await fetch(url);
 assert.equal(first.status,200);
 assert.match(first.headers.get('cache-control')||'',/private,\s*max-age=/);
 const etag=first.headers.get('etag');
 assert.ok(etag);
 const notModified=await fetch(url,{headers:{'If-None-Match':etag}});
 assert.equal(notModified.status,304);
 const headRes=await fetch(url,{method:'HEAD'});
 assert.equal(headRes.status,200);
 assert.equal(await headRes.text(),'');
});

test('DreamSkinSettings sanitizes videoSmoothMode and chatWidth, and HostController consumes dragged chatWidth via onHostPatch',async()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'dream-chatw-')),'settings.json');
 const s=new DreamSkinSettings(file);
 assert.equal(s.get('videoSmoothMode'),true);
 assert.equal(s.get('chatWidth'),0);
 s.update({videoSmoothMode:false,chatWidth:12});
 assert.equal(s.get('videoSmoothMode'),false);
 assert.equal(s.get('chatWidth'),45);
 s.update({chatWidth:180});
 assert.equal(s.get('chatWidth'),100);
 s.update({chatWidth:0});
 assert.equal(s.get('chatWidth'),0);

 const loaderPayload=new DreamSkinThemeLoader().payload({...s.getAll(),chatWidth:88});
 assert.equal(loaderPayload.chatWidth,88);
 assert.equal(loaderPayload.videoSmoothMode,false);

 let patched=null;
 let applyCount=0;
 let state={ready:'complete',themed:true,owner:'drag-owner',rev:12,stale:false,chatWidth:91};
 const client={
  closed:false,
  async evaluate(expression){
   if(expression.startsWith('({ready:'))return {...state};
   if(expression.startsWith('(async function installTheme')){applyCount++;return {applied:true};}
   if(expression.includes('touch?.()'))return true;
   if(expression.includes('destroy()'))return null;
   throw new Error('Unexpected: '+expression);
  },
  close(){this.closed=true;}
 };
 const hc=new HostController(
  {payload:cfg=>({...cfg,image:'data:image/png;base64,AA=='})},
  ()=>{},
  {
   owner:'drag-owner',
   discover:async()=>({target:{webSocketDebuggerUrl:'ws://127.0.0.1:1/test'}}),
   createClient:()=>client,
   onHostPatch:patch=>{patched=patch;}
  }
 );
 hc.settings={enabled:true,chatWidth:0};
 hc.signature=JSON.stringify(hc.settings);
 await hc.tick();
 assert.deepEqual(patched,{chatWidth:91});
 assert.equal(applyCount,0);
 assert.equal(hc.settings.chatWidth,91);
 await hc.stop();
});

test('installTheme REV 10 eliminates black fades, slims scrollbars, optimizes 4K video blur, and applies custom chatWidth without chrome scrollbar bugs',async()=>{
 const {installTheme}=require('../src/host/theme.cjs');
 function makeEl(tag,extra={}){
  const attrs=new Map(),children=[];
  const el={
   tagName:tag.toUpperCase(),
   id:'',
   children,
   isConnected:true,
   parentElement:null,
   style:{_props:{},setProperty(k,v){this._props[k]=v;},getPropertyValue(k){return this._props[k]||'';},getPropertyPriority(){return '';},removeProperty(k){delete this._props[k];}},
   setAttribute(k,v){if(k==='id')el.id=v;attrs.set(k,String(v));},
   getAttribute(k){return attrs.get(k)??null;},
   hasAttribute(k){return attrs.has(k);},
   removeAttribute(k){attrs.delete(k);},
   addEventListener(){},
   removeEventListener(){},
   append(...nodes){for(const n of nodes){n.parentElement=el;children.push(n);}},
   prepend(...nodes){for(const n of nodes){n.parentElement=el;children.unshift(n);}},
   remove(){el.isConnected=false;if(el.parentElement){const i=el.parentElement.children.indexOf(el);if(i>=0)el.parentElement.children.splice(i,1);}},
   matches(){return false;},
   closest(sel){return extra.closestMatch&&sel.includes(extra.closestMatch)?el:null;},
   contains(target){return target===el||children.some(c=>c.contains?.(target));},
   querySelector(){return null;},
   querySelectorAll(sel){return extra.queryAll&&!String(sel).includes('.surface-composer')?extra.queryAll:[];},
   getBoundingClientRect(){return extra.rect||{left:0,top:0,width:1280,height:720,right:1280,bottom:720};},
   play(){return Promise.resolve();},
   pause(){},
   load(){},
   classList:{add(){},remove(){},contains(){return false;}}
  };
  return el;
 }
 const narrowScrollbar=makeEl('div',{closestMatch:'overlay-scrollbar-thumb',rect:{left:1270,top:10,width:6,height:500,right:1276,bottom:510}});
 const rootEl=makeEl('div',{queryAll:[narrowScrollbar]});rootEl.id='root';
 const bodyEl=makeEl('body');bodyEl.append(rootEl);
 const headEl=makeEl('head');
 const docEl=makeEl('html');
 const origGlobals={window:global.window,document:global.document,getComputedStyle:global.getComputedStyle,MutationObserver:global.MutationObserver,ResizeObserver:global.ResizeObserver,innerWidth:global.innerWidth,innerHeight:global.innerHeight};
 try{
  global.window={};
  global.document={documentElement:docEl,head:headEl,body:bodyEl,hidden:false,addEventListener(){},removeEventListener(){},createElement:tag=>makeEl(tag),querySelector:sel=>sel==='#root'?rootEl:null,querySelectorAll:()=>[]};
  global.getComputedStyle=()=>({backgroundColor:'rgb(20, 20, 28)',backgroundImage:'none'});
  global.MutationObserver=class{observe(){}disconnect(){}};
  global.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  global.innerWidth=1280;
  global.innerHeight=720;

  await installTheme({
   owner:'rev10-owner',
   outputMode:'transparent',
   mediaKind:'video',
   mediaUrl:'http://127.0.0.1:45555/media?token=abc&path=clip.mp4',
   videoSmoothMode:true,
   chatWidth:88,
   glass:{themeStyle:'star-neko',tint:'#ffffff',veil:0,radius:16,regions:{sidebar:{fill:78,blur:18},content:{fill:60,blur:22},overlay:{fill:68,blur:24},control:{fill:72,blur:14},header:{fill:84,blur:14},bar:{fill:80,blur:14}}},
   font:{accent:'',darkSeparate:false,colors:{},colorsDark:{}}
  });
  const baseCss=headEl.children.find(c=>c.id==='agy-dream-style-v2')?.textContent||'';
  const tokenCss=headEl.children.find(c=>c.id==='agy-dream-tokens-v2')?.textContent||'';
  assert.equal(global.window.__agyDreamSkinV2.rev,12);
  assert.equal(narrowScrollbar.hasAttribute('data-agy-dream-chrome'),false);
  assert.equal(rootEl.getAttribute('data-agy-chat-width'),'custom');
  assert.match(baseCss,/\[data-testid="overlay-scrollbar-thumb"\][\s\S]*width:\s*3px\s*!important/);
  assert.match(baseCss,/::-webkit-scrollbar\s*\{[\s\S]*width:\s*4px\s*!important/);
  assert.match(baseCss,/\.md-sticky-message-bleed::before/);
  assert.match(baseCss,/from-sidebar/);
  assert.match(baseCss,/\.agy-dream-width-handle\[data-mode="rail"\]/);
  assert.match(baseCss,/--agy-overview-dodge/);
  assert.match(baseCss,/z-index:\s*9999\s*!important/);
  assert.match(baseCss,/\[data-testid="title-menu-bar"\][\s\S]*z-index:\s*60\s*!important/);
  assert.doesNotMatch(baseCss,/rgba\(0,\s*0,\s*0,\s*0\.56\)/);
  assert.match(tokenCss,/--agy-chat-width:\s*clamp\(480px,\s*88%/);
  assert.match(tokenCss,/--max-conversation-width:\s*var\(--agy-chat-width\)\s*!important/);
  assert.match(tokenCss,/--lg-filter-content:\s*blur\(10px\);/);
  assert.doesNotMatch(tokenCss,/saturate\(165%\)/);

  global.window.__agyDreamSkinV2.update({
   owner:'rev10-owner',
   outputMode:'transparent',
   mediaKind:'video',
   mediaUrl:'http://127.0.0.1:45555/media?token=abc&path=clip.mp4',
   videoSmoothMode:false,
   chatWidth:0,
   glass:{themeStyle:'star-neko',tint:'#ffffff',veil:0,radius:16,regions:{sidebar:{fill:78,blur:18},content:{fill:60,blur:22},overlay:{fill:68,blur:24},control:{fill:72,blur:14},header:{fill:84,blur:14},bar:{fill:80,blur:14}}},
   font:{accent:'',darkSeparate:false,colors:{},colorsDark:{}}
  });
  const tokenFull=headEl.children.find(c=>c.id==='agy-dream-tokens-v2')?.textContent||'';
  assert.equal(rootEl.getAttribute('data-agy-chat-width'),'default');
  assert.match(tokenFull,/--lg-filter-content:\s*blur\(22px\)\s*saturate\(165%\);/);
  assert.doesNotMatch(tokenFull,/--max-conversation-width:/);
  global.window.__agyDreamSkinV2.destroy();
 }finally{
  Object.assign(global,origGlobals);
 }
});

test('HostController upgrades legacy rev 9 plugin owner while still leaving unrelated live owners untouched',async()=>{
 const applied=[];
 let destroys=0;
 let state={ready:'complete',themed:true,owner:'antigravity-star-suite-plugin',rev:9,stale:false};
 const client={
  closed:false,
  async evaluate(expression){
   if(expression.startsWith('({ready:'))return {...state};
   if(expression.startsWith('(async function installTheme')){
    const payload=JSON.parse(expression.slice(expression.lastIndexOf(')({')+2,-1));
    applied.push(payload);
    state={themed:true,owner:payload.owner,rev:12};
    return {applied:true};
   }
   if(expression.includes('destroy()')){destroys++;state={themed:false};return null;}
   return true;
  },
  close(){this.closed=true;}
 };
 const hc=new HostController(
  {payload:cfg=>({...cfg,image:'data:image/png;base64,AA=='})},
  ()=>{},
  {owner:'antigravity-star-suite-999-abc',discover:async()=>({target:{webSocketDebuggerUrl:'ws://127.0.0.1:1/test'}}),createClient:()=>client}
 );
 await hc.update({enabled:true,fit:'contain',scrim:12});
 assert.equal(destroys,1);
 assert.equal(applied.length,1);
 assert.equal(applied[0].owner,'antigravity-star-suite-999-abc');
 await hc.stop();
});
