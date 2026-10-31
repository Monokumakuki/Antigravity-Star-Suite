const fs=require("node:fs"),path=require("node:path");
function readJson(file,fallback){try{const value=JSON.parse(fs.readFileSync(file,"utf8"));return value&&typeof value==="object"&&!Array.isArray(value)?value:structuredClone(fallback);}catch{return structuredClone(fallback);}}
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+".tmp",JSON.stringify(value,null,2)+"\n",{mode:0o600});fs.renameSync(file+".tmp",file);}
const finite=(v,f,min,max)=>typeof v==="number"&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):f;
const bool=(v,f)=>typeof v==="boolean"?v:f;
module.exports={readJson,writeJson,finite,bool};
