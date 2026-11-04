using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class SetupProgram {
 static string DefaultRoot {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","AntigravityStarSuite",StartupSettings.Kind);}}
 static void Install(string destination,bool auto,bool link,bool sandbox,Action<int> progress){
  if(!Environment.Is64BitOperatingSystem)throw new Exception("此安装包需要64位Windows系统。");
  string root=Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar);
  if(root.Length<12||root==Path.GetPathRoot(root)||String.Equals(root,Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),StringComparison.OrdinalIgnoreCase))throw new Exception("请选择独立的插件安装文件夹。");
  string marker=Path.Combine(root,".starsuite-install");
  if(Directory.Exists(root)&&Directory.GetFileSystemEntries(root).Length>0&&(!File.Exists(marker)||File.ReadAllText(marker).Trim()!=StartupSettings.Kind))throw new Exception("此目录已有其他文件，请选择空文件夹或本插件原安装目录。");
  string existing=Path.Combine(root,StartupSettings.AppExe);
  if(File.Exists(existing)){
   using(var p=Process.Start(new ProcessStartInfo(existing,"--quit"){UseShellExecute=false,CreateNoWindow=true}))p.WaitForExit(5000);
   Thread.Sleep(2500);
  }
  Directory.CreateDirectory(root);
  using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)){
   int count=0;foreach(var entry in zip.Entries){
    string file=Path.GetFullPath(Path.Combine(root,entry.FullName));
    if(!file.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("安装包路径无效");
    if(entry.Name.Length==0){Directory.CreateDirectory(file);continue;}
    Directory.CreateDirectory(Path.GetDirectoryName(file));
    using(var input=entry.Open())using(var output=File.Create(file))input.CopyTo(output);
    progress(++count*100/zip.Entries.Count);
   }
  }
  File.WriteAllText(marker,StartupSettings.Kind);
  StartupSettings.Root=root;
  if(sandbox)return;
  StartupSettings.Shortcuts(true);StartupSettings.SetFlags(auto,link);
  using(var r=Registry.CurrentUser.CreateSubKey(StartupSettings.UninstallKey)){
   r.SetValue("DisplayName",StartupSettings.Title);r.SetValue("DisplayVersion","0.2.13");r.SetValue("Publisher","Antigravity Star Suite community");r.SetValue("InstallLocation",root);r.SetValue("DisplayIcon",Path.Combine(root,StartupSettings.AppExe));r.SetValue("UninstallString",StartupSettings.Quote(Path.Combine(root,"StartupSettings.exe"))+" --uninstall");r.SetValue("NoModify",1);r.SetValue("NoRepair",1);
  }
  if(auto||link)Process.Start(new ProcessStartInfo(Path.Combine(root,"StartupSettings.exe"),"--watch"){UseShellExecute=false,CreateNoWindow=true});
 }
 [STAThread] public static void Main(string[] args){
  Application.EnableVisualStyles();
  if(args.Length>=2&&args[0]=="--sandbox-install"){
   try{Install(args[1],false,false,true,x=>{});}catch(Exception e){File.WriteAllText(args[1]+"-error.txt",e.ToString());Environment.ExitCode=1;}return;
  }
  var form=new Form{Text=StartupSettings.Title+" · 安装",Width=620,Height=410,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false};
  var intro=new Label{Text="独立安装，内含运行环境，无需安装 Node.js。仅安装到当前用户。",Left=24,Top=20,Width=560,Height=30};
  var location=new TextBox{Text=DefaultRoot,Left=24,Top=62,Width=450};
  var browse=new Button{Text="选择目录",Left=484,Top=59,Width=95};browse.Click+=(s,e)=>{using(var picker=new FolderBrowserDialog{Description="选择插件的独立安装目录",SelectedPath=location.Text})if(picker.ShowDialog()==DialogResult.OK)location.Text=picker.SelectedPath;};
  var auto=new CheckBox{Text="开机登录后自动启动（可选）",Left=24,Top=108,Width=560,Checked=StartupSettings.Flag("AutoStart")};
  var link=new CheckBox{Text="打开 Antigravity 时联动启动（可选，后台检测）",Left=24,Top=144,Width=565,Checked=StartupSettings.Flag("HostLink")};
  var connect=new CheckBox{Text="安装后自动配置 Antigravity 连接（推荐，仅限本机）",Left=24,Top=180,Width=565,Checked=true};
  var notice=new Label{Text="首次连接可能需要保存任务后正常重启宿主一次。\n连接会备份并配置启动快捷方式，之后可一键恢复。",Left=24,Top=220,Width=560,Height=50};
  var progress=new ProgressBar{Left=24,Top=278,Width=555,Height=20};
  var install=new Button{Text="一键安装",Left=440,Top=318,Width=140,Height=32};
  bool installing=false;form.FormClosing+=(s,e)=>{if(installing)e.Cancel=true;};
  install.Click+=async(s,e)=>{
   installing=true;install.Enabled=browse.Enabled=location.Enabled=auto.Enabled=link.Enabled=connect.Enabled=false;
   string dest=location.Text;bool a=auto.Checked,l=link.Checked;
   try{await Task.Run(()=>Install(dest,a,l,false,x=>form.Invoke(new Action(()=>progress.Value=Math.Min(100,x)))));progress.Value=100;installing=false;
    if(connect.Checked){StartupSettings.Root=Path.GetFullPath(dest);HostConnection.Connect();}else MessageBox.Show("安装完成。以后可从开始菜单的“一键连接 Antigravity”启用额度和壁纸。",StartupSettings.Title);form.Close();
   }catch(Exception error){installing=false;MessageBox.Show("安装/连接未完成："+error.Message+"\n若程序已经安装，可在启动设置中重试连接。");install.Enabled=browse.Enabled=location.Enabled=auto.Enabled=link.Enabled=connect.Enabled=true;}
  };
  form.Controls.AddRange(new Control[]{intro,location,browse,auto,link,connect,notice,progress,install});Application.Run(form);
 }
}
