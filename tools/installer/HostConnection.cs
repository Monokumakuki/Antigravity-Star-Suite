using System;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
using System.Net;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using System.Security.Cryptography;
using Microsoft.Win32;

internal static class HostConnection {
 static string Store=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"AntigravityStarSuite","HostConnection");
 static string Manifest {get{return Path.Combine(Store,"shortcuts.xml");}}
 static string DesktopLink {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"Antigravity（星语连接）.lnk");}}
 static bool IsHost(string file){return !String.IsNullOrEmpty(file)&&File.Exists(file)&&String.Equals(Path.GetFileName(file),"Antigravity.exe",StringComparison.OrdinalIgnoreCase);}
 static Process[] Hosts(){return Process.GetProcessesByName("Antigravity").Where(p=>{try{return p.SessionId==Process.GetCurrentProcess().SessionId;}catch{p.Dispose();return false;}}).ToArray();}
 static bool Running(){var all=Hosts();try{return all.Length>0;}finally{foreach(var p in all)p.Dispose();}}
 static string Locate(){
  var all=Hosts();try{foreach(var p in all)try{if(IsHost(p.MainModule.FileName))return p.MainModule.FileName;}catch{}}finally{foreach(var p in all)p.Dispose();}
  foreach(var hive in new[]{Registry.CurrentUser,Registry.LocalMachine})using(var key=hive.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Antigravity.exe")){string file=key==null?null:key.GetValue("") as string;if(IsHost(file))return file;}
  foreach(var folder in new[]{Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)})foreach(var rel in new[]{"Programs/antigravity/Antigravity.exe","Antigravity/Antigravity.exe"}){string file=Path.Combine(folder,rel);if(IsHost(file))return file;}
  if(File.Exists(Path.Combine(Store,"host.txt"))){string file=File.ReadAllText(Path.Combine(Store,"host.txt")).Trim();if(IsHost(file))return file;}
  foreach(var shortcut in Links())try{dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic link=shell.CreateShortcut(shortcut);string file=link.TargetPath;if(IsHost(file))return file;}catch{}
  using(var dialog=new OpenFileDialog{Title="请选择 Antigravity.exe（通常在 Antigravity 安装目录）",Filter="Antigravity 程序|Antigravity.exe",CheckFileExists=true})return dialog.ShowDialog()==DialogResult.OK&&IsHost(dialog.FileName)?dialog.FileName:null;
 }
 static System.Collections.Generic.IEnumerable<string> Links(){
  foreach(var folder in new[]{Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Environment.GetFolderPath(Environment.SpecialFolder.Programs),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar")}){
   string[] files;try{files=Directory.GetFiles(folder,"*.lnk",SearchOption.AllDirectories);}catch{continue;}foreach(var file in files)yield return file;
  }
 }
 public static string ConnectedArguments(string args){
  args=Regex.Replace(args??"",@"(?:^|\s)--remote-debugging-(?:port|address)(?:=(?:""[^""]*""|\S+)|\s+(?:""[^""]*""|\S+))?", "",RegexOptions.IgnoreCase).Trim();
  return (args.Length>0?args+" ":"")+"--remote-debugging-address=127.0.0.1 --remote-debugging-port=0";
 }
 static void Configure(string host,System.Collections.Generic.IEnumerable<string> paths,string dedicated){
  using(var mutex=new Mutex(false,"Local\\StarSuiteHostConnection")){try{if(!mutex.WaitOne(10000))throw new Exception("另一个连接设置正在运行，请稍后重试。");}catch(AbandonedMutexException){}try{ConfigureCore(host,paths,dedicated);}finally{mutex.ReleaseMutex();}}
 }
 static void ConfigureCore(string host,System.Collections.Generic.IEnumerable<string> paths,string dedicated){
  Directory.CreateDirectory(Store);var doc=File.Exists(Manifest)?XDocument.Load(Manifest):new XDocument(new XElement("Shortcuts"));
  dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
  foreach(string file in paths.Concat(new[]{dedicated}).Distinct(StringComparer.OrdinalIgnoreCase)){
   try{
    bool exists=File.Exists(file);dynamic link=shell.CreateShortcut(file);if(exists&&!String.Equals((string)link.TargetPath,host,StringComparison.OrdinalIgnoreCase))continue;
    var entry=doc.Root.Elements("Shortcut").FirstOrDefault(x=>String.Equals((string)x.Attribute("path"),file,StringComparison.OrdinalIgnoreCase));
    if(entry==null){
     string backup=Path.Combine(Store,Guid.NewGuid().ToString("N")+".lnk");if(exists)File.Copy(file,backup);
     entry=new XElement("Shortcut",new XAttribute("path",file),new XAttribute("backup",exists?backup:""));doc.Root.Add(entry);
    }
    string args=ConnectedArguments(exists?(string)link.Arguments:"");
    entry.SetAttributeValue("target",host);entry.SetAttributeValue("applied",args);
    // Persist backup ownership before changing the shortcut, so interrupted setup remains reversible.
    doc.Save(Manifest);link.TargetPath=host;link.Arguments=args;if(!exists){link.WorkingDirectory=Path.GetDirectoryName(host);link.IconLocation=host+",0";}link.Save();
   }catch{ /* Keep the dedicated writable desktop entry as fallback for locked shortcuts. */ }
  }
  if(!File.Exists(dedicated))throw new Exception("无法创建连接入口，请检查桌面文件夹权限。");
  dynamic created=shell.CreateShortcut(dedicated);if(!String.Equals((string)created.TargetPath,host,StringComparison.OrdinalIgnoreCase)||(string)created.Arguments!=ConnectedArguments((string)created.Arguments))throw new Exception("桌面存在无法更新的同名入口，请重命名后重试连接。");
  File.WriteAllText(Path.Combine(Store,"host.txt"),host);
 }
 static int Restore(){
  using(var mutex=new Mutex(false,"Local\\StarSuiteHostConnection")){try{if(!mutex.WaitOne(10000))throw new Exception("另一个连接设置正在运行，请稍后重试。");}catch(AbandonedMutexException){}try{return RestoreCore();}finally{mutex.ReleaseMutex();}}
 }
 static int RestoreCore(){
  if(!File.Exists(Manifest))return 0;int restored=0;var doc=XDocument.Load(Manifest);dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
  foreach(var entry in doc.Root.Elements("Shortcut").ToArray()){
   string file=(string)entry.Attribute("path"),backup=(string)entry.Attribute("backup");
   try{
    if(File.Exists(file)){dynamic link=shell.CreateShortcut(file);if(!String.Equals((string)link.TargetPath,(string)entry.Attribute("target"),StringComparison.OrdinalIgnoreCase)||(string)link.Arguments!=(string)entry.Attribute("applied"))continue;
     if(String.IsNullOrEmpty(backup))File.Delete(file);else if(File.Exists(backup))File.Copy(backup,file,true);else continue;
    }
    if(File.Exists(backup))File.Delete(backup);entry.Remove();restored++;
   }catch{}
  }
  doc.Save(Manifest);return restored;
 }
 static bool Available(){
  string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"Antigravity/DevToolsActivePort");
  try{int port=Int32.Parse(File.ReadLines(file).First());if(port<1||port>65535)return false;var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:"+port+"/json/list");request.Timeout=1500;request.Proxy=null;using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream())){string text=reader.ReadToEnd();return text.Contains("webSocketDebuggerUrl")&&text.Contains("127.0.0.1");}}catch{return false;}
 }
 static void StartHost(string host){var info=new ProcessStartInfo(host,ConnectedArguments("")){WorkingDirectory=Path.GetDirectoryName(host),UseShellExecute=false};info.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");Process.Start(info);}
 public static void Connect(){
  string host=Locate();if(host==null)return;Configure(host,Links(),DesktopLink);
  if(!Available()){
   if(Running()){
    if(MessageBox.Show("连接配置已保存，需要正常重启 Antigravity 一次。\n\n请先保存任务，再点“是”请求退出并重新打开；不会强制结束进程。", "保存后重启并连接",MessageBoxButtons.YesNo,MessageBoxIcon.Information)!=DialogResult.Yes)return;
    var all=Hosts();try{foreach(var p in all)try{if(p.MainWindowHandle!=IntPtr.Zero)p.CloseMainWindow();}catch{}}finally{foreach(var p in all)p.Dispose();}
    for(int i=0;i<30&&Running();i++)Thread.Sleep(300);
    if(Running()){MessageBox.Show("Antigravity 尚未完全退出。请从它的托盘或退出菜单正常退出，再点“一键连接”。\n连接配置已经保存，不会强制结束你的任务。");return;}
   }
   StartHost(host);for(int i=0;i<30&&!Available();i++)Thread.Sleep(500);
  }
  if(!Available()){MessageBox.Show("已用连接入口启动 Antigravity，暂未检测到连接。\n请等待宿主完成启动后再点“一键连接”；插件会自动重试。\n若宿主版本不支持此方式，请反馈版本信息。");return;}
  StartupSettings.StartApp(true);MessageBox.Show("连接已就绪，插件已后台启动。\n以后从桌面“Antigravity（星语连接）”打开即可；已识别的原启动快捷方式也已配置。\n宿主更新或重新固定快捷方式后，可再次点“一键连接”修复。",StartupSettings.Title);
 }
 public static void RestoreWithNotice(){MessageBox.Show("已恢复 "+Restore()+" 个自有连接入口。下次正常重启宿主后生效。\n你后来手动修改过的快捷方式会保留，不强行覆盖。");}
 public static void ReleaseIfLast(){
  string other=StartupSettings.Kind=="Widget"?"Skin":"Widget";
  using(var key=Registry.CurrentUser.OpenSubKey("Software\\AntigravityStarSuite\\"+other)){string root=key==null?null:key.GetValue("InstallPath") as string;if(!String.IsNullOrEmpty(root)&&File.Exists(Path.Combine(root,".starsuite-install")))return;}
  Restore();
 }
 public static void SelfTest(){
  string old=Store;Store=Path.Combine(Path.GetTempPath(),"StarSuite-connection-test-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(Store);
  try{
   string host=Path.Combine(Store,"Antigravity.exe"),file=Path.Combine(Store,"original.lnk"),dedicated=Path.Combine(Store,"connected.lnk");File.WriteAllText(host,"");
   StartupSettings.CreateShortcut(file,host,"--profile \"测试 用户\" --remote-debugging-port=9222");byte[] before=File.ReadAllBytes(file);
   Configure(host,new[]{file},dedicated);Configure(host,new[]{file},dedicated);
   dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic link=shell.CreateShortcut(file);string args=link.Arguments;
   if(!args.Contains("--profile \"测试 用户\"")||!args.Contains("--remote-debugging-port=0")||args.Contains("9222")||args.Split(new[]{"--remote-debugging-port"},StringSplitOptions.None).Length!=2)throw new Exception("Connection arguments test failed");
   if(Restore()!=2||!before.SequenceEqual(File.ReadAllBytes(file))||File.Exists(dedicated))throw new Exception("Connection restoration test failed");
   Configure(host,new[]{file},dedicated);link=shell.CreateShortcut(file);link.Arguments="--user-edited";link.Save();Restore();link=shell.CreateShortcut(file);if((string)link.Arguments!="--user-edited")throw new Exception("User shortcut edit overwritten");
  }finally{Directory.Delete(Store,true);Store=old;}
 }
}
