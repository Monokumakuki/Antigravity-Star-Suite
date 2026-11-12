const {app,BrowserWindow}=require('electron');
app.setPath('userData',require('path').join(__dirname,'../evidence/layer-fixture/cover-profile'));
app.whenReady().then(()=>{const w=new BrowserWindow({width:900,height:650,title:'Widget layer fixture',skipTaskbar:true});w.loadURL('data:text/html,<body style="background:%23ddd">Layer test</body>');w.show();w.focus();});
app.on('window-all-closed',()=>app.quit());
