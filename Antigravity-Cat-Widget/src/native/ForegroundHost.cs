using System;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;

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
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr w,IntPtr after,int x,int y,int cx,int cy,uint flags);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr w,out Rect rect);
    private delegate void WinEvent(IntPtr hook,uint ev,IntPtr w,int obj,int child,uint thread,uint time);
    [DllImport("user32.dll")] private static extern IntPtr SetWinEventHook(uint first,uint last,IntPtr module,WinEvent callback,uint pid,uint tid,uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(IntPtr hook);
    [StructLayout(LayoutKind.Sequential)] private struct Message {public IntPtr Window;public uint Id;public UIntPtr WParam;public IntPtr LParam;public uint Time;public Point Point;public uint Private;}
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Message msg,IntPtr w,uint first,uint last,uint remove);
    private static volatile bool stopping;
    private static bool IsHost(IntPtr window) {
        try { uint pid; GetWindowThreadProcessId(window,out pid); using(var p=Process.GetProcessById((int)pid))return String.Equals(p.ProcessName,"Antigravity",StringComparison.OrdinalIgnoreCase) && GetWindow(window,4)==IntPtr.Zero; } catch {return false;}
    }
    private static IntPtr FindHost() {
        IntPtr result=IntPtr.Zero;long largest=0;
        EnumWindows(delegate(IntPtr w,IntPtr data){Rect r;if(IsWindowVisible(w)&&IsHost(w)&&GetClientRect(w,out r)){long area=(long)(r.Right-r.Left)*(r.Bottom-r.Top);if(area>largest){largest=area;result=w;}}return true;},IntPtr.Zero);
        return result;
    }
    private static void Main(string[] args) {
        int parentId;
        if (args.Length < 1 || !Int32.TryParse(args[0], out parentId)) return;
        EnablePhysicalCoordinates();
        long widgetValue=0;if(args.Length>1)Int64.TryParse(args[1],out widgetValue);
        IntPtr widget=new IntPtr(widgetValue);
        if(widget!=IntPtr.Zero)new Thread(delegate(){try{Console.ReadLine();}catch{}stopping=true;}){IsBackground=true}.Start();
        try {
            using (var parent = Process.GetProcessById(parentId)) {
                IntPtr lastHost = IntPtr.Zero,previousForeground=IntPtr.Zero; string previous = null;
                IntPtr trackedHost=IntPtr.Zero;Point hostPoint=new Point();var heartbeat=Stopwatch.StartNew();bool hostWasAvailable=false,raised=false;int restoreGeneration=0;
                Action followHost=delegate(){
                    if(widget==IntPtr.Zero||trackedHost==IntPtr.Zero||IsIconic(trackedHost))return;
                    var next=new Point();Rect widgetRect;
                    if(ClientToScreen(trackedHost,ref next)&&GetWindowRect(widget,out widgetRect)){
                        int dx=next.X-hostPoint.X,dy=next.Y-hostPoint.Y;hostPoint=next;
                        if(dx!=0||dy!=0)SetWindowPos(widget,IntPtr.Zero,widgetRect.Left+dx,widgetRect.Top+dy,0,0,0x0015);
                    }
                };
                WinEvent locationChanged=delegate(IntPtr hook,uint ev,IntPtr w,int obj,int child,uint thread,uint time){if(w==trackedHost&&obj==0)followHost();};
                IntPtr locationHook=widget==IntPtr.Zero?IntPtr.Zero:SetWinEventHook(0x800B,0x800B,IntPtr.Zero,locationChanged,0,0,0);
                do {
                    Message queued;while(PeekMessage(out queued,IntPtr.Zero,0,0,1)){}
                    string kind = "unknown", bounds = null;
                    try {
                        IntPtr window = GetForegroundWindow(); uint pid;
                        GetWindowThreadProcessId(window, out pid);
                        if(widget!=IntPtr.Zero){
                            if(window!=previousForeground&&IsHost(window))lastHost=window;
                            if(!IsWindow(lastHost))lastHost=FindHost();
                            if(trackedHost!=lastHost){trackedHost=lastHost;hostPoint=new Point();ClientToScreen(lastHost,ref hostPoint);}
                            if(GetWindow(widget,4)!=IntPtr.Zero)SetWindowLongPtr(widget,-8,IntPtr.Zero);
                            if(window==lastHost&&window!=previousForeground)SetWindowPos(widget,IntPtr.Zero,0,0,0,0,0x0013);
                            previousForeground=window;
                            bool available=lastHost!=IntPtr.Zero&&IsWindowVisible(lastHost)&&!IsIconic(lastHost);
                            // Owned transparent windows can remain below the host after shell restoration.
                            // Raise only while the host (or widget itself) is foreground, never over another app.
                            uint hostPid=0;GetWindowThreadProcessId(lastHost,out hostPid);
                            bool shouldRaise=available&&(pid==hostPid||window==widget);
                            if(shouldRaise!=raised||(shouldRaise&&heartbeat.ElapsedMilliseconds>=1000)){

                                SetWindowPos(widget,new IntPtr(shouldRaise?-1:-2),0,0,0,0,0x0013);
                                raised=shouldRaise;
                            }
                            if(available&&!hostWasAvailable){
                                hostPoint=new Point();ClientToScreen(lastHost,ref hostPoint);

                                SetWindowPos(widget,new IntPtr(shouldRaise?-1:-2),0,0,0,0,0x0013);
                                restoreGeneration++;
                            }
                            hostWasAvailable=available;
                            if(available)followHost();
                            bounds=available?Bounds(lastHost):null;kind=bounds==null?"other":"host";
                            
                        }else{
                            if(IsHost(window))lastHost=window;
                            bounds=Bounds(lastHost);kind=bounds==null?"other":(pid==parentId?"self":"host");
                        }
                    } catch { lastHost = IntPtr.Zero; }
                    string message = "{\"restoreGeneration\":" + restoreGeneration + ",\"kind\":\"" + kind + "\",\"bounds\":" + (bounds ?? "null") + ",\"attached\":" + ((widget!=IntPtr.Zero&&lastHost!=IntPtr.Zero)?"true":"false") + ",\"widgetVisible\":" + ((widget!=IntPtr.Zero&&IsWindowVisible(widget))?"true":"false") + ",\"hostId\":\"" + lastHost.ToInt64() + "\",\"nativeFollowing\":" + ((widget!=IntPtr.Zero)?"true":"false") + "}";
                    if (message != previous || heartbeat.ElapsedMilliseconds>=1000) { Console.WriteLine(message); Console.Out.Flush(); previous = message; heartbeat.Restart(); }
                } while (!stopping && !parent.WaitForExit(8));
                if(locationHook!=IntPtr.Zero)UnhookWinEvent(locationHook);
                if(widget!=IntPtr.Zero&&IsWindow(widget))SetWindowPos(widget,new IntPtr(-2),0,0,0,0,0x0013);
                GC.KeepAlive(locationChanged);
                if(widget!=IntPtr.Zero&&IsWindow(widget))SetWindowLongPtr(widget,-8,IntPtr.Zero);
            }
        } catch { }
    }
}
