// Verify Chromium's connection flags on an isolated Electron profile, without restarting the user's host.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'star-connection-')),profile=path.join(folder,'profile'),script=path.join(folder,'main.cjs');
fs.writeFileSync(script,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(profile)});app.whenReady().then(()=>{const w=new BrowserWindow({show:false});w.loadURL('data:text/html,connection-test');});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[script,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0'],{env,windowsHide:true,stdio:'ignore'});
(async()=>{
 try{
  const file=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(file);i++)await new Promise(r=>setTimeout(r,100));assert(fs.existsSync(file),'dynamic port file must be produced');
  const port=Number(fs.readFileSync(file,'utf8').split('\n')[0]);assert(port>0&&port<65536);
  const targets=await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port,path:'/json/list',timeout:2000},r=>{let text='';r.on('data',x=>text+=x);r.on('end',()=>resolve(JSON.parse(text)));}).on('error',reject).on('timeout',reject);});
  assert(targets.some(t=>t.type==='page'));assert(targets.every(t=>!t.webSocketDebuggerUrl||t.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:')));
  const report={checkedAt:new Date().toISOString(),result:'pass',scope:'isolated Electron Chromium flags and DevToolsActivePort; actual Antigravity restart not performed'};
  fs.writeFileSync(path.resolve(__dirname,'../evidence/connection-port-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
