const {_electron:electron}=require('playwright'),{execFileSync,spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'evidence/layer-fixture');fs.mkdirSync(dir,{recursive:true});
 const command=path.join(dir,'command.txt'),ready=command+'.ready';try{fs.unlinkSync(ready);}catch{}
 fs.writeFileSync(command,'show');const hostExe=path.join(dir,'LayerHostFixture.exe');
 execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/r:System.Windows.Forms.dll','/out:'+hostExe,path.join(root,'tools/LayerHostFixture.cs')]);
 const host=spawn(hostExe,[command],{windowsHide:true});host.on('exit',(code,signal)=>console.log('fixture exit',code,signal));let app,cover;
 for(let i=0;i<100&&!fs.existsSync(ready);i++)await new Promise(r=>setTimeout(r,50));assert.ok(fs.existsSync(ready));const hostId=fs.readFileSync(ready,'utf8');
 const profile=path.join(dir,'profile');fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({hostWindowOnly:true,scale:250}));
 const nativeSource=path.join(dir,'ForegroundHost.cs'),nativeExe=path.join(dir,'ForegroundHost.exe');
 fs.writeFileSync(nativeSource,fs.readFileSync(path.join(root,'Antigravity-Cat-Widget/src/native/ForegroundHost.cs'),'utf8').replace('p.ProcessName,"Antigravity"','p.ProcessName,"LayerHostFixture"'));
 execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/out:'+nativeExe,nativeSource]);
 const bootstrap=path.join(dir,'bootstrap.cjs');
 fs.writeFileSync(bootstrap,`const cp=require('node:child_process'),spawn=cp.spawn;cp.spawn=function(file,...args){return spawn.call(this,file.endsWith('ForegroundHost.exe')?${JSON.stringify(nativeExe)}:file,...args);};global.layerIntervals=[];const interval=global.setInterval;global.setInterval=(fn,ms,...args)=>{global.layerIntervals.push(ms);return interval(fn,ms,...args);};require(${JSON.stringify(path.join(root,'Antigravity-Cat-Widget/src/main/index.cjs'))});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 try{
  app=await electron.launch({executablePath:(fs.existsSync(path.join(root,'runtime/electron-45.1.0/electron.exe'))?path.join(root,'runtime/electron-45.1.0/electron.exe'):require('electron')),args:[bootstrap,'--data-dir='+profile],env});
  const page=await app.firstWindow();await page.waitForFunction(()=>window.widgetApi&&document.getElementById('mascot')?.style.getPropertyValue('--agy-width'));
  const intervals=await app.evaluate(()=>global.layerIntervals);assert.ok(intervals.includes(15000));assert.ok(intervals.every(ms=>typeof ms==='number'&&ms>=1000),'No invalid or millisecond screenshot timer');
  await app.evaluate(()=>{
   const events=process.mainModule.require('node:events');const original=events.EventEmitter.prototype.emit;
   events.EventEmitter.prototype.emit=function(name,...args){
    if(this.constructor.name==='ForegroundMonitor'&&name==='change')global.layerNative=args[0];
    return original.call(this,name,...args);
   };
  });
  async function wait(predicate){let latest;for(let i=0;i<160;i++){
   latest=await app.evaluate(()=>global.layerNative);if(latest&&predicate(latest))return latest;
   await page.waitForTimeout(50);
  }throw Error('Native state '+JSON.stringify(latest)+' fixtureExit='+host.exitCode);}
  const widgetHandle=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString());
  const probeExe=path.join(dir,'LayerProbe.exe');
  execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+probeExe,path.join(root,'tools/LayerProbeFixture.cs')]);
  const visible=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html')).isVisible());
  try{
   await wait(s=>s.hostId===hostId&&s.bounds&&s.aboveHost&&!s.nativeTopmost);assert.equal(await visible(),true);
   await page.waitForTimeout(200);
   await app.evaluate(({BrowserWindow})=>{global.followLayoutWrites=0;const w=BrowserWindow.getAllWindows()[0],set=w.setBounds.bind(w);w.setBounds=(...a)=>{global.followLayoutWrites++;return set(...a);};});
   const motion=JSON.parse(execFileSync(probeExe,[hostId,widgetHandle,'0','motion'],{encoding:'utf8',windowsHide:true}));
   await page.waitForTimeout(200);assert.equal(motion.settledPx,0);
   assert.equal(await app.evaluate(()=>global.followLayoutWrites),0,'Pure native translation must not replay stale IPC coordinates');
   fs.writeFileSync(command,'hide');await wait(s=>s.hostId===hostId&&s.bounds===null);await page.waitForTimeout(200);assert.equal(await visible(),false);
   fs.writeFileSync(command,'show1');await wait(s=>s.bounds&&s.aboveHost);await page.waitForTimeout(150);assert.equal(await visible(),true);
   fs.writeFileSync(command,'minimize');await wait(s=>s.bounds===null);await page.waitForTimeout(150);assert.equal(await visible(),false);
   fs.writeFileSync(command,'show2');await wait(s=>s.bounds&&s.aboveHost);await page.waitForTimeout(150);
   await app.evaluate(({BrowserWindow})=>{global.layerEvents=[];const w=BrowserWindow.getAllWindows()[0];w.on('hide',()=>global.layerEvents.push('hide'));w.on('show',()=>global.layerEvents.push('show'));});
   cover=await electron.launch({executablePath:(fs.existsSync(path.join(root,'runtime/electron-45.1.0/electron.exe'))?path.join(root,'runtime/electron-45.1.0/electron.exe'):require('electron')),args:[path.join(root,'tools/LayerCoverFixture.cjs')],env});const coverPage=await cover.firstWindow();
   const coverHandle=await cover.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString());
   const layer=(raise)=>JSON.parse(execFileSync(probeExe,[hostId,widgetHandle,coverHandle,...(raise?[raise]:[])],{encoding:'utf8',windowsHide:true}));
   layer('normal');await wait(s=>s.bounds&&s.aboveHost&&!s.nativeTopmost);await page.waitForTimeout(150);
   assert.deepEqual(layer(),{coverAboveWidget:true,widgetAboveHost:true,widgetTopmost:false});assert.equal(await visible(),true);
   layer('topmost');await wait(s=>s.bounds&&s.aboveHost&&!s.nativeTopmost);await page.waitForTimeout(150);
   assert.deepEqual(layer(),{coverAboveWidget:true,widgetAboveHost:true,widgetTopmost:false});assert.equal(await visible(),true);
   await cover.close();cover=null;fs.writeFileSync(command,'show3');await wait(s=>s.bounds&&s.aboveHost&&!s.nativeTopmost);
   assert.deepEqual(await app.evaluate(()=>global.layerEvents),[]);
   await page.waitForTimeout(16000);
   assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString()),widgetHandle,'Scheduled health check preserves the live window');
   assert.deepEqual(await app.evaluate(()=>global.layerEvents),[]);
   const result={visualCheckTimerMs:15000,noInvalidTimer:true,healthCheckPreservesWindow:true,nativeMotionSteps:120,motionSettledPx:motion.settledPx,noJsTranslationWrites:true,hostHiddenHides:true,hostMinimizedHides:true,hostRestoreShows:true,otherAppOccludesWithoutHide:true,otherTopmostOccludes:true,noTopmost:true,noSwitchShowHide:true};
   fs.writeFileSync(path.join(root,'evidence/layer-fix-results.json'),JSON.stringify(result,null,2));console.log(result);
   await page.screenshot({path:path.join(root,'evidence/layer-fixture-renderer.png')});
  }finally{}
 }finally{if(cover)await cover.close();if(app)await app.close();fs.writeFileSync(command,'exit');setTimeout(()=>{if(host.exitCode===null)host.kill();},500).unref();}
})().catch(e=>{console.error(e);process.exitCode=1;});
