using System;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using System.Text;

internal static class ForegroundHost {
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    private static void EnablePhysicalCoordinates() {
        try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; }
        catch (EntryPointNotFoundException) { }
        SetProcessDPIAware();
    }

    private static string Bounds(IntPtr window) {
        Rect rect; var point = new Point();
        if (!IsWindow(window) || IsIconic(window) || !GetClientRect(window, out rect) || !ClientToScreen(window, ref point)) return null;
        int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) return null;
        return "{\"x\":" + point.X + ",\"y\":" + point.Y + ",\"width\":" + width + ",\"height\":" + height + "}";
    }
    private delegate bool EnumWindow(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, IntPtr data);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr owner);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr window,StringBuilder name,int length);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr w,IntPtr after,int x,int y,int cx,int cy,uint flags);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr w,out Rect rect);
    private delegate void WinEvent(IntPtr hook,uint ev,IntPtr w,int obj,int child,uint thread,uint time);
    [DllImport("user32.dll")] private static extern IntPtr SetWinEventHook(uint first,uint last,IntPtr module,WinEvent callback,uint pid,uint tid,uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(IntPtr hook);
    [StructLayout(LayoutKind.Sequential)] private struct Message {public IntPtr Window;public uint Id;public UIntPtr WParam;public IntPtr LParam;public uint Time;public Point Point;public uint Private;}
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Message msg,IntPtr w,uint first,uint last,uint remove);
    private static volatile bool stopping;
    private static bool IsHost(IntPtr window) {
        try {
            if(!IsWindow(window)||GetWindow(window,4)!=IntPtr.Zero)return false;
            var name=new StringBuilder(128);GetClassName(window,name,name.Capacity);
            Rect rect;if(name.ToString()!="Chrome_WidgetWin_1"||!GetClientRect(window,out rect)||rect.Right-rect.Left<360||rect.Bottom-rect.Top<200)return false;
            uint pid;GetWindowThreadProcessId(window,out pid);
            using(var p=Process.GetProcessById((int)pid))return String.Equals(p.ProcessName,"Antigravity",StringComparison.OrdinalIgnoreCase);
        } catch {return false;}
    }
    private static IntPtr FindHost() {
        IntPtr result=IntPtr.Zero;long largest=0;
        EnumWindows(delegate(IntPtr w,IntPtr data){Rect r;if(IsWindowVisible(w)&&IsHost(w)&&GetClientRect(w,out r)){long area=(long)(r.Right-r.Left)*(r.Bottom-r.Top);if(area>largest){largest=area;result=w;}}return true;},IntPtr.Zero);
        return result;
    }
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr w,int attribute,out int value,int size);
    [DllImport("user32.dll")] private static extern uint MsgWaitForMultipleObjectsEx(uint count,IntPtr handles,uint milliseconds,uint mask,uint flags);
    [DllImport("winmm.dll")] private static extern uint timeBeginPeriod(uint period);
    [DllImport("winmm.dll")] private static extern uint timeEndPeriod(uint period);
    private static bool moving,preciseTimer,hasMoved;
    private static readonly Stopwatch motion=Stopwatch.StartNew();
    private static void WaitForUpdate() {
        bool fast=moving||(hasMoved&&motion.ElapsedMilliseconds<120);
        if(fast&&!preciseTimer)preciseTimer=timeBeginPeriod(1)==0;
        if(!fast&&preciseTimer){timeEndPeriod(1);preciseTimer=false;}
        // WinEvents wake immediately; short polling only bridges gaps during a drag.
        MsgWaitForMultipleObjectsEx(0,IntPtr.Zero,fast?2u:32u,0x04FF,4);
    }
    private static bool Available(IntPtr w) {
        int cloaked;
        return w!=IntPtr.Zero&&IsWindow(w)&&IsWindowVisible(w)&&!IsIconic(w)&&
            !(DwmGetWindowAttribute(w,14,out cloaked,4)==0&&cloaked!=0);
    }
    private static bool IsTopmost(IntPtr w) {return (GetWindowLongPtr(w,-20).ToInt64()&8)!=0;}
    private static void StackWithHost(IntPtr widget,IntPtr host) {
        if(widget==IntPtr.Zero||!IsWindow(widget))return;
        // Preserve Electron's ownership/visibility; never move the host's owner group.
        if(IsTopmost(widget))SetWindowPos(widget,new IntPtr(-2),0,0,0,0,0x0213);
        if(!Available(host))return;
        IntPtr above=GetWindow(host,3);
        if(above==widget)return;
        // HWND_TOP inserts only into the normal band after any topmost windows.
        if(above!=IntPtr.Zero&&IsTopmost(above))above=IntPtr.Zero;
        SetWindowPos(widget,above,0,0,0,0,0x0213);
    }
    private static void Main(string[] args) {
        int parentId;
        if(args.Length<1||!Int32.TryParse(args[0],out parentId))return;
        EnablePhysicalCoordinates();
        long widgetValue=0;if(args.Length>1)Int64.TryParse(args[1],out widgetValue);
        IntPtr widget=new IntPtr(widgetValue),trackedHost=IntPtr.Zero;
        if(widget!=IntPtr.Zero)new Thread(delegate(){try{Console.ReadLine();}catch{}stopping=true;}){IsBackground=true}.Start();
        Point hostPoint=new Point();bool hostWasAvailable=false;int restoreGeneration=0;
        Action followHost=delegate(){
            if(widget==IntPtr.Zero||!hostWasAvailable||!Available(trackedHost))return;
            var next=new Point();Rect widgetRect;
            if(ClientToScreen(trackedHost,ref next)&&GetWindowRect(widget,out widgetRect)){
                int dx=next.X-hostPoint.X,dy=next.Y-hostPoint.Y;hostPoint=next;
                if(dx!=0||dy!=0){SetWindowPos(widget,IntPtr.Zero,widgetRect.Left+dx,widgetRect.Top+dy,0,0,0x0215);hasMoved=true;motion.Restart();}
            }
        };
        WinEvent changed=delegate(IntPtr h,uint ev,IntPtr w,int obj,int child,uint thread,uint time){
            if(w==trackedHost&&ev==10)moving=true;
            if(w==trackedHost&&ev==11){moving=false;hasMoved=true;motion.Restart();followHost();}
            if(w==trackedHost&&obj==0&&ev==0x800B)followHost();
            if(ev==3||ev==0x8004)StackWithHost(widget,trackedHost);
        };
        IntPtr locationHook=SetWinEventHook(0x800B,0x800B,IntPtr.Zero,changed,0,0,0);
        IntPtr foregroundHook=SetWinEventHook(3,3,IntPtr.Zero,changed,0,0,0);
        IntPtr reorderHook=SetWinEventHook(0x8004,0x8004,IntPtr.Zero,changed,0,0,0);
        IntPtr dragHook=SetWinEventHook(10,11,IntPtr.Zero,changed,0,0,0);
        try {using(var parent=Process.GetProcessById(parentId)){
            var scan=Stopwatch.StartNew();var heartbeat=Stopwatch.StartNew();var metadata=Stopwatch.StartNew();string previous=null;
            IntPtr lastForeground=IntPtr.Zero;
            while(!stopping&&!parent.HasExited&&(widget==IntPtr.Zero||IsWindow(widget))){
                Message queued;while(PeekMessage(out queued,IntPtr.Zero,0,0,1)){}
                followHost();
                if(previous!=null&&metadata.ElapsedMilliseconds<32){WaitForUpdate();continue;}
                metadata.Restart();
                IntPtr foreground=GetForegroundWindow();uint pid;GetWindowThreadProcessId(foreground,out pid);
                // Process/class discovery is not on the per-movement path.
                if(trackedHost==IntPtr.Zero||scan.ElapsedMilliseconds>=1000||foreground!=lastForeground){
                    IntPtr candidate=GetAncestor(foreground,3);
                    if(IsHost(candidate)&&candidate!=trackedHost){trackedHost=candidate;hostWasAvailable=false;}
                    if(!IsHost(trackedHost)){trackedHost=FindHost();hostWasAvailable=false;}
                    if(!hostWasAvailable){hostPoint=new Point();ClientToScreen(trackedHost,ref hostPoint);}
                    scan.Restart();
                }
                bool available=Available(trackedHost);
                if(!available)moving=false;
                if(available&&!hostWasAvailable){
                    hostPoint=new Point();ClientToScreen(trackedHost,ref hostPoint);restoreGeneration++;
                }
                hostWasAvailable=available;lastForeground=foreground;
                if(available)followHost();
                StackWithHost(widget,trackedHost);
                string bounds=available?Bounds(trackedHost):null;
                string kind=bounds==null?"other":(pid==parentId?"self":"host");
                bool behind=false;for(IntPtr w=GetWindow(foreground,2);w!=IntPtr.Zero;w=GetWindow(w,2)){
                    if(w==widget){behind=true;break;}
                }
                string message="{\"restoreGeneration\":"+restoreGeneration+",\"kind\":\""+kind+"\",\"bounds\":"+(bounds??"null")+
                    ",\"attached\":"+(widget!=IntPtr.Zero&&trackedHost!=IntPtr.Zero?"true":"false")+
                    ",\"widgetVisible\":"+(widget!=IntPtr.Zero&&IsWindowVisible(widget)?"true":"false")+
                    ",\"aboveHost\":"+(widget!=IntPtr.Zero&&GetWindow(trackedHost,3)==widget?"true":"false")+
                    ",\"nativeTopmost\":"+(widget!=IntPtr.Zero&&IsTopmost(widget)?"true":"false")+
                    ",\"behindForeground\":"+(behind?"true":"false")+
                    ",\"hostId\":\""+trackedHost.ToInt64()+"\",\"nativeFollowing\":"+(widget!=IntPtr.Zero?"true":"false")+"}";
                if(message!=previous||heartbeat.ElapsedMilliseconds>=1000){Console.WriteLine(message);Console.Out.Flush();previous=message;heartbeat.Restart();}
                // Wake on WinEvent messages immediately instead of sleeping a whole display frame.
                WaitForUpdate();
            }
        }}catch(Exception e){Console.Error.WriteLine(e.Message);}
        finally {
            foreach(var hook in new[]{locationHook,foregroundHook,reorderHook,dragHook})if(hook!=IntPtr.Zero)UnhookWinEvent(hook);
            if(preciseTimer)timeEndPeriod(1);
            if(widget!=IntPtr.Zero&&IsWindow(widget))SetWindowPos(widget,new IntPtr(-2),0,0,0,0,0x0213);
            GC.KeepAlive(changed);
        }
    }
}
