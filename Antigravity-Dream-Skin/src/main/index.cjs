const{app,BrowserWindow,ipcMain,Tray,Menu,nativeImage}=require("electron"),path=require("node:path"),os=require("node:os");
const{DreamSkinSettings,DEFAULT_SETTINGS}=require("../domain/settings.cjs"),{DreamSkinThemeLoader}=require("../domain/theme-loader.cjs"),{HostController}=require("../domain/host-controller.cjs");
const dataDir=process.argv.find(a=>a.startsWith("--data-dir="))?.slice(11)||path.join(os.homedir(),".antigravity-dream-skin");
app.setPath("userData",path.join(dataDir,"runtime"));app.setName("Gemini · Dream Skin");
if(!app.requestSingleInstanceLock())app.quit();
else if(process.argv.includes("--quit"))app.quit();
else{
 let win,tray,quitting=false;
 const settings=new DreamSkinSettings(path.join(dataDir,"settings.json")),loader=new DreamSkinThemeLoader();
 if(process.argv.includes("--enable"))settings.update({enabled:true});
 if(process.argv.includes("--disable"))settings.update({enabled:false});
 const controller=new HostController(loader,()=>{if(win&&!win.isDestroyed())win.webContents.send("dream:state",snapshot());});
 const snapshot=()=>{let wallpaper=null,wallpaperError=null;try{wallpaper=loader.verifyIntegrity().name;}catch(error){wallpaperError=error.message;}return{settings:settings.getAll(),defaults:DEFAULT_SETTINGS,status:controller.status,wallpaper,wallpaperError};};
 function show(){
  if(win&&!win.isDestroyed()){win.show();win.focus();return;}
  win=new BrowserWindow({width:1240,height:850,minWidth:880,minHeight:650,autoHideMenuBar:true,title:"Gemini · Dream Skin",backgroundColor:"#f6f3fb",webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.loadFile(path.join(__dirname,"../renderer/index.html"));win.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  win.webContents.on("will-navigate",e=>e.preventDefault());
  win.on("close",e=>{if(!quitting&&settings.get("enabled")){e.preventDefault();win.hide();}});win.on("closed",()=>{win=null;if(!settings.get("enabled"))app.quit();});
 }
 const trusted=e=>win&&!win.isDestroyed()&&e.sender===win.webContents;
 ipcMain.handle("dream:get",e=>trusted(e)?snapshot():null);
 ipcMain.handle("dream:save",async(e,partial)=>{if(!trusted(e))return null;const allowed=Object.fromEntries(Object.entries(partial||{}).filter(([k])=>["outputMode","enabled","fit","scrim","opacity","positionX","positionY","zoom"].includes(k)));settings.update(allowed);await controller.update(settings.getAll());return snapshot();});
 ipcMain.handle("dream:refresh",async e=>{if(!trusted(e))return null;await controller.tick();return snapshot();});
 ipcMain.on("dream:quit",e=>{if(trusted(e))app.quit();});
 app.on("second-instance",(_event,args)=>{if(args.includes("--quit")){app.quit();return;}if(args.includes("--enable")||args.includes("--disable")){settings.update({enabled:args.includes("--enable")});controller.update(settings.getAll());}if(!args.includes("--background"))show();});
 app.whenReady().then(()=>{
  if(!process.argv.includes("--background"))show();tray=new Tray(nativeImage.createFromPath(path.join(__dirname,"../../assets/app-icon.ico")));tray.setToolTip("Dream Skin");
  tray.setContextMenu(Menu.buildFromTemplate([{label:"打开皮肤设置",click:show},{label:"关闭皮肤并恢复原样",click:async()=>{settings.update({enabled:false});await controller.update(settings.getAll());}},{type:"separator"},{label:"退出并恢复原样",click:()=>app.quit()}]));tray.on("double-click",show);controller.start(settings.getAll());
 });
 app.on("before-quit",e=>{if(quitting)return;e.preventDefault();quitting=true;controller.stop().finally(()=>{tray?.destroy();app.quit();});});
 app.on("window-all-closed",()=>{if(!settings.get("enabled"))app.quit();});
}
