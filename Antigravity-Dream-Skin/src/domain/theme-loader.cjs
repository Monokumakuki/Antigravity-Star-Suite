const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
class DreamSkinThemeLoader{
 constructor(options={}){this.rootDir=options.rootDir||path.resolve(__dirname,"../..");this.wallpaperPackDir=path.join(this.rootDir,"assets/wallpapers/gemini-character-sheet-v1");try{this.manifest=JSON.parse(fs.readFileSync(path.join(this.wallpaperPackDir,"manifest.json"),"utf8"));}catch{this.manifest=null;}}
 verifyIntegrity(){
  if(!this.manifest){try{this.manifest=JSON.parse(fs.readFileSync(path.join(this.wallpaperPackDir,"manifest.json"),"utf8"));}catch{throw new Error("壁纸清单缺失或损坏，请恢复完整资源包");}}
  if(!this.manifest||typeof this.manifest.file!=="string")throw new Error("无效壁纸路径");
  const p=path.resolve(this.wallpaperPackDir,this.manifest.file);
  if(!p.startsWith(this.wallpaperPackDir+path.sep)||path.extname(p)!==".png")throw new Error("无效壁纸路径");
  let b;try{b=fs.readFileSync(p);}catch{throw new Error("壁纸图片无法读取，请恢复完整资源包");}
  const hash=crypto.createHash("sha256").update(b).digest("hex");
  if(hash!==this.manifest.sha256)throw new Error("壁纸校验失败，原文件可能被更改");
  return{...this.manifest,file:p,verified:true};
 }
 payload(settings){const m=this.verifyIntegrity();return{version:2,outputMode:settings.outputMode==="glass"?"glass":"transparent",positionX:Math.max(0,Math.min(100,settings.positionX??50)),positionY:Math.max(0,Math.min(100,settings.positionY??50)),zoom:Math.max(1,Math.min(2,settings.zoom??1)),opacity:Math.max(0,Math.min(100,settings.opacity??55))/100,fit:["cover","contain","adaptive"].includes(settings.fit)?settings.fit:"adaptive",scrim:Math.max(0,Math.min(60,settings.scrim??12))/100,image:"data:image/png;base64,"+fs.readFileSync(m.file).toString("base64")};}
}
module.exports={DreamSkinThemeLoader};
