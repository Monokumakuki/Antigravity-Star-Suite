const{contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("widgetApi",{
 get:()=>ipcRenderer.invoke("widget:get"),save:v=>ipcRenderer.invoke("widget:settings",v),
 command:v=>ipcRenderer.send("widget:command",v),pointer:v=>ipcRenderer.invoke("widget:pointer",v),
 hit:v=>ipcRenderer.send("widget:hit",v),audio:v=>ipcRenderer.invoke("widget:audio",v),
 subscribe:callback=>{const h=(_e,data)=>callback(data);ipcRenderer.on("widget:snapshot",h);return()=>ipcRenderer.removeListener("widget:snapshot",h);},
 onStep:callback=>{const h=(_e,data)=>callback(data);ipcRenderer.on("widget:step",h);return()=>ipcRenderer.removeListener("widget:step",h);}
 ,onReaction:callback=>{const h=()=>callback();ipcRenderer.on("widget:reaction",h);return()=>ipcRenderer.removeListener("widget:reaction",h);}
});
