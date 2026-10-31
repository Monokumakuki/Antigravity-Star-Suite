const os=require("node:os"),path=require("node:path"),{readJson,writeJson,finite,bool}=require("../../../shared/storage.cjs");
const DEFAULT_SETTINGS={enabled:false,outputMode:"transparent",positionX:50,positionY:50,zoom:1,fit:"adaptive",scrim:12,opacity:55,wallpaperId:"gemini-character-sheet-v1",protectEditor:true,protectTerminal:true};
class DreamSkinSettings{
 constructor(file=path.join(os.homedir(),".antigravity-dream-skin/settings.json")){this.filePath=file;this.data=this.sanitize(readJson(file,DEFAULT_SETTINGS));}
 sanitize(v){return{...DEFAULT_SETTINGS,outputMode:v.outputMode==="glass"?"glass":"transparent",enabled:bool(v.enabled,false),positionX:finite(v.positionX,50,0,100),positionY:finite(v.positionY,50,0,100),zoom:finite(v.zoom,1,1,2),fit:["cover","contain","adaptive"].includes(v.fit)?v.fit:"adaptive",scrim:finite(v.scrim,12,0,60),opacity:finite(v.opacity,55,0,100),protectEditor:true,protectTerminal:true};}
 update(v){this.data=this.sanitize({...this.data,...v});writeJson(this.filePath,this.data);return this.getAll();}
 get(k){return this.data[k];}getAll(){return{...this.data};}
}
module.exports={DreamSkinSettings,DEFAULT_SETTINGS};
