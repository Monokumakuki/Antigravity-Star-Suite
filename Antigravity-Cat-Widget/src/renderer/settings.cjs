(async()=>{
 const api=window.widgetApi,$=id=>document.getElementById(id);let data=await api.get(),active=null,generation=0;
 for(const p of data.presets){const o=document.createElement("option");o.value=p.id;o.textContent=p.label;$("soundSet").append(o);}
 const keys=["hostWindowOnly","easterEggs","scale","alwaysOnTop","snap","reducedMotion","clickThrough","bubbleOn","turnCostOn","turnCostDurationMs","sound","soundSet","volume","manualQuota","manualPercent","manualWeeklyPercent"];
 const original=Object.fromEntries(keys.map(key=>[key,data.settings[key]]));let pending=Promise.resolve();
 function save(partial,message="已保存"){pending=pending.then(async()=>{try{data=await api.save(partial);stop();render();$("saved").textContent=message;}catch{$("saved").textContent="保存失败，请重试";}});return pending;}
 function render(){for(const key of keys){const el=$(key);if(document.activeElement!==el){if(el.type==="checkbox")el.checked=data.settings[key];else el.value=key==="volume"?Math.round(data.settings.volume*100):data.settings[key];}}$("scale-value").textContent=data.settings.scale+" px";$("volume-value").textContent=Math.round(data.settings.volume*100)+"%";$("source").textContent=(data.source.online?"已找到 "+data.source.files+" 份日志":"未检测到会话日志")+" · 本机只读";$("audio-note").textContent=data.settings.sound?"已启用":"已静音";}
 function stop(){generation++;active?.pause();active=null;}
 for(const key of keys)$(key).addEventListener($(key).type==="range"?"input":"change",()=>{const el=$(key),v=el.type==="checkbox"?el.checked:(el.type==="range"||el.type==="number"||key==="turnCostDurationMs")?(el.value===""?null:Number(el.value)):el.value;save({[key]:key==="volume"?v/100:v});});
 $("preview-reaction").onclick=()=>api.command("preview-reaction");
 $("undo").onclick=()=>save(original,"已恢复到打开设置时");
 $("dock-left").onclick=()=>api.command("dock-left");$("dock-right").onclick=()=>api.command("dock-right");
 $("reset").onclick=()=>api.command("reset");$("quota-refresh").onclick=()=>api.command("quota-refresh");$("refresh").onclick=()=>api.command("refresh");
 $("audition").onclick=async()=>{stop();if(!data.settings.sound||!data.settings.volume){$("audio-note").textContent="请先启用音效并提高音量";return;}const token=generation;const first=await api.audio("press");if(!first||token!==generation)return;active=new Audio(first.url);active.volume=first.effectiveVolume;active.onended=async()=>{const p=await api.audio("release");if(p&&token===generation){active=new Audio(p.url);active.volume=p.effectiveVolume;active.play().catch(()=>{});}};active.play().catch(()=>$("audio-note").textContent="播放未成功");};
 api.subscribe(next=>{if(next.settings.sound!==data.settings.sound||next.settings.volume!==data.settings.volume||next.settings.soundSet!==data.settings.soundSet)stop();data=next;render();});window.addEventListener("beforeunload",stop);render();
})();
