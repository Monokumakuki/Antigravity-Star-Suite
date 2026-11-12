using System;using System.IO;using System.Windows.Forms;using System.Runtime.InteropServices;
internal class HostFixture {
 delegate IntPtr Proc(IntPtr w,uint message,IntPtr wp,IntPtr lp);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Class {public uint style;public Proc proc;public int clsExtra,wndExtra;public IntPtr instance,icon,cursor,background;public string menu,name;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern ushort RegisterClass(ref Class c);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex,string cls,string text,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr data);
 [DllImport("user32.dll")] static extern IntPtr DefWindowProc(IntPtr w,uint m,IntPtr wp,IntPtr lp);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr w,int command);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr w);
 [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr w);
 static Proc proc=DefWindowProc;
 [STAThread]static void Main(string[] args){
  var c=new Class{name="Chrome_WidgetWin_1",proc=proc};RegisterClass(ref c);
  var host=CreateWindowEx(0,c.name,"Controlled host for pet layers",0x10CF0000,40,40,1800,1100,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
  File.WriteAllText(args[0]+".ready",host.ToInt64().ToString());var timer=new Timer{Interval=50};string previous="";
  timer.Tick+=delegate{var cmd=File.Exists(args[0])?File.ReadAllText(args[0]).Trim():"";if(cmd==previous)return;previous=cmd;
   if(cmd=="hide")ShowWindow(host,0);else if(cmd=="minimize")ShowWindow(host,6);else if(cmd.StartsWith("show")){ShowWindow(host,9);SetForegroundWindow(host);}else if(cmd=="exit"){DestroyWindow(host);Application.Exit();}};
  timer.Start();Application.Run();GC.KeepAlive(proc);
 }
}
