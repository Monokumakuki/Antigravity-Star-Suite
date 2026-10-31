const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),{EventEmitter}=require("node:events");
class TranscriptAdapter extends EventEmitter{
 constructor(options={}){super();this.appDataDir=options.appDataDir||path.join(os.homedir(),".gemini/antigravity");this.filePath=options.filePath||null;this.cursors=new Map();this.timer=null;this.pollMs=options.pollMs||2000;}
 files(){if(this.filePath)return fs.existsSync(this.filePath)?[this.filePath]:[];const brain=path.join(this.appDataDir,"brain");let files=[];try{for(const d of fs.readdirSync(brain,{withFileTypes:true})){if(!d.isDirectory())continue;const p=path.join(brain,d.name,".system_generated/logs/transcript_full.jsonl");try{files.push({p,mtime:fs.statSync(p).mtimeMs});}catch{}}}catch{}return files.sort((a,b)=>b.mtime-a.mtime).slice(0,64).map(f=>f.p);}
 resolveTranscriptPath(){return this.files()[0]||null;}
 scan(){
  const files=this.files();let newest=0,readable=0;
  const active=new Set(files);for(const file of this.cursors.keys())if(!active.has(file))this.cursors.delete(file);
  for(const file of files)try{
   const stat=fs.statSync(file);if(!stat.isFile())continue;let c=this.cursors.get(file);
   if(!c||stat.size<c.offset)c={offset:0,pending:Buffer.alloc(0),seen:new Map(),baselineSize:stat.size};
   const fd=fs.openSync(file,"r");
   try{let budget=8*1024*1024;while(c.offset<stat.size&&budget>0){
    const b=Buffer.alloc(Math.min(262144,stat.size-c.offset,budget)),n=fs.readSync(fd,b,0,b.length,c.offset);if(!n)break;c.offset+=n;budget-=n;c.pending=Buffer.concat([c.pending,b.subarray(0,n)]);
    let end;while((end=c.pending.indexOf(10))>=0){
     const line=c.pending.subarray(0,end);c.pending=c.pending.subarray(end+1);if(c.discarding){c.discarding=false;continue;}if(line.length>4194304)continue;let s;try{s=JSON.parse(line.toString("utf8"));}catch{continue;}
     if(!Number.isSafeInteger(s.step_index)||s.source!=="MODEL"||s.type!=="PLANNER_RESPONSE")continue;const signature=[s.status,s.input_tokens,s.cache_read_tokens,s.output_tokens].join("|");if(c.seen.get(s.step_index)===signature)continue;c.seen.set(s.step_index,signature);
     const sessionId=path.basename(path.resolve(file,"../../.."));
     if(c.seen.size>10000)c.seen.delete(c.seen.keys().next().value);
     const event={sessionId,step_index:s.step_index,created_at:s.created_at,status:s.status,source:s.source,type:s.type,input_tokens:s.input_tokens??null,cache_read_tokens:s.cache_read_tokens??null,output_tokens:s.output_tokens??null,historical:c.offset-c.pending.length<=c.baselineSize};
     if(s.source==="MODEL"&&s.type==="PLANNER_RESPONSE"){this.emit("step",event);if(s.status==="DONE")this.emit("turnDone",event);else if(s.status==="ERROR")this.emit("turnError",{sessionId,stepIndex:s.step_index,historical:event.historical});else if(s.status==="RUNNING")this.emit("turnRunning",{sessionId,stepIndex:s.step_index,historical:event.historical});}
    }if(c.pending.length>4194304){c.pending=Buffer.alloc(0);c.discarding=true;}
   }}finally{fs.closeSync(fd);}
   this.cursors.set(file,c);readable++;newest=Math.max(newest,stat.mtimeMs);
  }catch{}
  this.emit("status",{online:readable>0,source:"本机 Antigravity 日志",coverage:"最近 64 份会话 · 模型步骤",files:readable,lastUpdated:newest?new Date(newest).toISOString():null});
 }
 start(){if(this.timer)return;this.scan();this.timer=setInterval(()=>this.scan(),this.pollMs);}
 stop(){clearInterval(this.timer);this.timer=null;}
}
module.exports={TranscriptAdapter};
