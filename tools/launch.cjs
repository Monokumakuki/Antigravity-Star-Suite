const path=require("node:path"),fs=require("node:fs"),{spawn}=require("node:child_process");
const root=path.resolve(__dirname,".."),kind=process.argv[2]==="skin"?"Antigravity-Dream-Skin":"Antigravity-Cat-Widget";
let exe=path.join(root,"runtime/electron-45.1.0/electron.exe");
if(!fs.existsSync(exe)){try{exe=require(require.resolve("electron",{paths:[root]}));}catch{}}
if(!fs.existsSync(exe))throw new Error("请使用包含 runtime 的便携包，或按 README 准备 Electron 45.1.0。");
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const flags=process.argv.slice(3).filter(f=>["--enable","--disable","--quit","--background"].includes(f));
const logDir=path.join(require("node:os").homedir(),kind.includes("Cat")?".antigravity-cat-widget":".antigravity-dream-skin");fs.mkdirSync(logDir,{recursive:true});const log=fs.openSync(path.join(logDir,"startup.log"),"a");
const child=spawn(exe,[path.join(root,kind,"src/main/index.cjs"),...flags],{cwd:root,env,detached:true,stdio:["ignore",log,log],windowsHide:false});fs.closeSync(log);child.unref();
