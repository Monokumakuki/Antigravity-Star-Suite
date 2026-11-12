using System;using System.Runtime.InteropServices;
class LayerProbe {
 [StructLayout(LayoutKind.Sequential)]struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr w,out Rect rect);
 [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr w,uint cmd);
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")]static extern IntPtr GetWindowLongPtr(IntPtr w,int index);
 [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr w,IntPtr after,int x,int y,int cx,int cy,uint flags);
 static bool Above(IntPtr top,IntPtr lower){for(IntPtr w=GetWindow(top,2);w!=IntPtr.Zero;w=GetWindow(w,2))if(w==lower)return true;return false;}
 static void Main(string[] a){var host=new IntPtr(long.Parse(a[0]));var widget=new IntPtr(long.Parse(a[1]));var cover=new IntPtr(long.Parse(a[2]));
 if(a.Length>3&&a[3]=="motion"){
  Rect h,w;GetWindowRect(host,out h);GetWindowRect(widget,out w);int ox=w.Left-h.Left,oy=w.Top-h.Top;
  try{for(int i=0;i<120;i++){int d=i<60?i:119-i;SetWindowPos(host,IntPtr.Zero,h.Left+d*3,h.Top+d,0,0,0x0215);System.Threading.Thread.Sleep(8);}}
  finally{SetWindowPos(host,IntPtr.Zero,h.Left,h.Top,0,0,0x0215);}
  System.Threading.Thread.Sleep(150);Rect endH,endW;GetWindowRect(host,out endH);GetWindowRect(widget,out endW);
  Console.WriteLine("{\"settledPx\":"+Math.Max(Math.Abs(endW.Left-endH.Left-ox),Math.Abs(endW.Top-endH.Top-oy))+"}");return;
 }
 if(a.Length>3)SetWindowPos(cover,new IntPtr(a[3]=="topmost"?-1:0),0,0,0,0,0x0213);
 Console.WriteLine("{\"coverAboveWidget\":"+(Above(cover,widget)?"true":"false")+",\"widgetAboveHost\":"+(Above(widget,host)?"true":"false")+",\"widgetTopmost\":"+((GetWindowLongPtr(widget,-20).ToInt64()&8)!=0?"true":"false")+"}");}
}
