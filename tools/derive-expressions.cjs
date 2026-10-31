const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto"),sharp=require("sharp");
const root=path.resolve(__dirname,".."),project=path.join(root,"Antigravity-Cat-Widget"),source=path.join(project,"assets/characters/gemini-bust-idle-v3.png");
async function main(){
 const original=fs.readFileSync(source),hash=crypto.createHash("sha256").update(original).digest("hex");
 assert.equal(hash,"5bef2d4fdc914b772ed5e70a1d731882b726708cdca222dcd826a13ce6deef39");
 const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true}),report={sourceSha256:hash,method:"local pixel-preserving expression compositing",variants:{}};
 const mouthRemoved=Buffer.from(data);
 for(let y=865;y<=891;y++)for(let x=600;x<=641;x++)for(let c=0;c<3;c++){const left=data[(y*info.width+596)*4+c],right=data[(y*info.width+645)*4+c];mouthRemoved[(y*info.width+x)*4+c]=Math.round(left+(right-left)*(x-596)/49);}
 const mouths={proud:'<path d="M597 874 C599 892 615 894 627 882 C641 897 659 892 663 878"/>',sad:'<path d="M607 888 Q625 865 644 889"/>'};
 for(const kind of ["proud","sad"]){
  const tears=kind==="sad"?'<defs><radialGradient id="tear" cx="35%" cy="25%"><stop stop-color="#f4fdff"/><stop offset=".4" stop-color="#a4e9ff"/><stop offset="1" stop-color="#72c8ed"/></radialGradient></defs><g fill="url(#tear)" stroke="#6bb8dc" stroke-width="4"><ellipse cx="435" cy="812" rx="24" ry="18"/><ellipse cx="878" cy="905" rx="24" ry="18"/></g><g fill="#fff" opacity=".8"><ellipse cx="428" cy="807" rx="7" ry="5"/><ellipse cx="871" cy="900" rx="7" ry="5"/></g>':"";
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+info.width+'" height="'+info.height+'"><g fill="none" stroke="#dd9587" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">'+mouths[kind]+'</g>'+tears+'</svg>');
  const edited=await sharp(mouthRemoved,{raw:info}).composite([{input:svg}]).raw().toBuffer();
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const index=(y*info.width+x)*4,allowed=(x>=585&&x<=675&&y>=852&&y<=910)||(kind==="sad"&&((x>=403&&x<=467&&y>=786&&y<=838)||(x>=846&&x<=910&&y>=879&&y<=931)));
   if(!allowed)for(let c=0;c<3;c++)edited[index+c]=data[index+c];
   edited[index+3]=data[index+3];
  }
  const filename="gemini-bust-"+kind+"-v3.png",destination=path.join(project,"assets/characters",filename);
  await sharp(edited,{raw:info}).png().toFile(destination);
  fs.copyFileSync(destination,path.join(project,"assets/character-packs/gemini-star-v1/frames",kind+"-v3.png"));
  let changed=0;for(let i=0;i<data.length;i+=4){assert.equal(edited[i+3],data[i+3]);if(edited[i]!==data[i]||edited[i+1]!==data[i+1]||edited[i+2]!==data[i+2])changed++;}
  report.variants[kind]={file:filename,changedPixels:changed,paletteOutsideExpressionUnchanged:true,alphaUnchanged:true,sha256:crypto.createHash("sha256").update(fs.readFileSync(destination)).digest("hex")};
 }
 const images=await Promise.all([source,path.join(project,"assets/characters/gemini-bust-proud-v3.png"),path.join(project,"assets/characters/gemini-bust-sad-v3.png")].map(file=>sharp(file).resize(280,234,{fit:"contain"}).png().toBuffer()));
 const labels=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><g fill="#635285" font-family="Microsoft YaHei" font-size="18" text-anchor="middle"><text x="160" y="27">当前定稿</text><text x="450" y="27">得意彩蛋</text><text x="740" y="27">委屈彩蛋</text></g></svg>');
 await sharp({create:{width:900,height:300,channels:4,background:"#f3eef9"}}).composite([...images.map((input,i)=>({input,left:20+i*290,top:54})),{input:labels,left:0,top:0}]).png().toFile(path.join(root,"evidence/expression-palette-preview.png"));
 fs.writeFileSync(path.join(root,"evidence/expression-palette-check.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
