using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

/// <summary>
/// Reads the screen and posts results as one JSON object per line.
/// Pointer and key watches do not swallow input, except the stop chord Ctrl+Alt+Period.
/// </summary>
static class Host
{
    const int WH_KEYBOARD_LL = 13;
    const int WH_MOUSE_LL = 14;
    const int LLKHF_UP = 0x80;
    const int LLKHF_INJECTED = 0x10;
    const int LLMHF_INJECTED = 0x00000001;
    const int VK_CONTROL = 0x11;
    const int VK_MENU = 0x12;
    const int VK_OEM_PERIOD = 0xBE;
    const int DWMWA_CLOAKED = 14;
    const int MONITORINFOF_PRIMARY = 1;

    static JavaScriptSerializer json;
    static JavaScriptSerializer Json
    {
        get
        {
            if (json == null)
            {
                json = new JavaScriptSerializer();
                json.MaxJsonLength = 67108864;
            }
            return json;
        }
    }
    static readonly object WriteLock = new object();
    static readonly BlockingCollection<string> Lines = new BlockingCollection<string>();
    static readonly ConcurrentQueue<Dictionary<string, object>> Events = new ConcurrentQueue<Dictionary<string, object>>();
    static readonly HookProc MouseProc = OnMouse;
    static readonly HookProc KeyProc = OnKey;
    static IntPtr mouseHook;
    static IntPtr keyHook;
    static bool running = true;
    static int lastFractionSent = -1;

    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)]
    struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
    [StructLayout(LayoutKind.Sequential)]
    struct MSLLHOOKSTRUCT { public POINT pt; public int mouseData, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)]
    struct KBDLLHOOKSTRUCT { public int vk, scan, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    struct MONITORINFOEX
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public int dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szDevice;
    }

    delegate bool MonitorProc(IntPtr monitor, IntPtr hdc, ref RECT rect, IntPtr data);
    delegate bool EnumProc(IntPtr hwnd, IntPtr data);

    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr mod, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT point, uint flags);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorProc proc, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFOEX info);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr data);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr hwnd, ref POINT point);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool PeekMessage(out MSG msg, IntPtr hwnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG msg);
    [DllImport("user32.dll")] static extern int MsgWaitForMultipleObjects(int count, IntPtr handles, bool waitAll, int ms, int mask);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr process, int flags, StringBuilder name, ref int size);

    static int Main()
    {
        try { return Run(); }
        catch (Exception ex)
        {
            try
            {
                var text = ex.GetType().FullName + "\n" + ex.Message + "\n" + ex.StackTrace;
                System.IO.File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "crash.txt"), text);
            }
            catch { }
            return 1;
        }
    }

    static int Run()
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        var input = new Thread(ReadInput);
        input.IsBackground = true;
        input.Start();
        mouseHook = SetWindowsHookEx(WH_MOUSE_LL, MouseProc, IntPtr.Zero, 0);
        keyHook = SetWindowsHookEx(WH_KEYBOARD_LL, KeyProc, IntPtr.Zero, 0);
        try { Loop(); }
        finally
        {
            if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
            if (keyHook != IntPtr.Zero) UnhookWindowsHookEx(keyHook);
        }
        return 0;
    }

    static void ReadInput()
    {
        var reader = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        string line;
        while ((line = reader.ReadLine()) != null) Lines.Add(line);
        Lines.CompleteAdding();
    }

    static void Loop()
    {
        while (running)
        {
            MSG msg;
            while (PeekMessage(out msg, IntPtr.Zero, 0, 0, 1))
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }
            Dictionary<string, object> queued;
            while (Events.TryDequeue(out queued)) Write(queued);
            string line;
            while (Lines.TryTake(out line)) Handle(line);
            if (Lines.IsCompleted) break;
            MsgWaitForMultipleObjects(0, IntPtr.Zero, false, 20, 0x04FF);
        }
    }

    static void Handle(string line)
    {
        Dictionary<string, object> msg;
        try { msg = Json.Deserialize<Dictionary<string, object>>(line); }
        catch { return; }
        if (msg == null) return;
        int id = IntOf(msg, "id");
        var cmd = Str(msg, "cmd");
        try
        {
            if (cmd == "quit") { running = false; Reply(id, true, null); return; }
            if (cmd == "screens") { Reply(id, true, new Dictionary<string, object> { { "screens", Screens() } }); return; }
            if (cmd == "windows") { Reply(id, true, new Dictionary<string, object> { { "windows", Windows() } }); return; }
            if (cmd == "tree") { Reply(id, true, new Dictionary<string, object> { { "nodes", Tree(Str(msg, "hwnd"), msg) } }); return; }
            if (cmd == "invoke" || cmd == "selection" || cmd == "toggle" || cmd == "setvalue")
            {
                var error = Act(cmd, Str(msg, "hwnd"), Str(msg, "rid"), Str(msg, "value"));
                Reply(id, error == null, error == null ? null : new Dictionary<string, object> { { "error", error } });
                return;
            }
            if (cmd == "post")
            {
                var error = PostClick(Str(msg, "hwnd"), Str(msg, "rid"));
                Reply(id, error == null, error == null ? null : new Dictionary<string, object> { { "error", error } });
                return;
            }
            if (cmd == "overlay") { ApplyOverlay(msg); Reply(id, true, null); return; }
            if (cmd == "shot")
            {
                Reply(id, true, new Dictionary<string, object> { { "png", Shot(IntOf(msg, "x"), IntOf(msg, "y"), IntOf(msg, "width"), IntOf(msg, "height")) } });
                return;
            }
            if (cmd == "desktop-stop") { DesktopInput.RequestStop(); Reply(id, true, null); return; }
            if (cmd == "desktop")
            {
                var copy = new Dictionary<string, object>(msg);
                int requestId = id;
                int stamp = DesktopInput.Stamp();
                ThreadPool.QueueUserWorkItem(delegate
                {
                    Dictionary<string, object> extra;
                    bool ok = true;
                    try
                    {
                        extra = DesktopInput.Run(copy, stamp);
                        object flag;
                        if (extra != null && extra.TryGetValue("ok", out flag) && flag is bool) ok = (bool)flag;
                    }
                    catch (Exception ex)
                    {
                        ok = false;
                        extra = new Dictionary<string, object> { { "error", ex.Message } };
                    }
                    Reply(requestId, ok, extra);
                });
                return;
            }
            Reply(id, false, new Dictionary<string, object> { { "error", "unknown" } });
        }
        catch (Exception ex)
        {
            try { Console.Error.WriteLine(ex.GetType().Name); } catch { }
            Reply(id, false, new Dictionary<string, object> { { "error", "failed" } });
        }
    }

    static void ApplyOverlay(Dictionary<string, object> msg)
    {
        Overlay.Apply(
            BoolOf(msg, "visible"),
            IntOf(msg, "x"), IntOf(msg, "y"), IntOf(msg, "width"), IntOf(msg, "height"),
            IntOf(msg, "screenX"), IntOf(msg, "screenY"), IntOf(msg, "screenW"), IntOf(msg, "screenH"),
            Str(msg, "side"), Str(msg, "label"),
            IntOf(msg, "cursorX"), IntOf(msg, "cursorY"), BoolOf(msg, "cursor"));
    }

    static List<object> screenRows;
    static IntPtr cursorMonitor;

    static bool OnMonitor(IntPtr monitor, IntPtr hdc, ref RECT rect, IntPtr data)
    {
        var info = new MONITORINFOEX();
        info.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
        if (!GetMonitorInfo(monitor, ref info)) return true;
        var row = new Dictionary<string, object>();
        row["device"] = info.szDevice ?? "";
        row["x"] = info.rcMonitor.left;
        row["y"] = info.rcMonitor.top;
        row["width"] = info.rcMonitor.right - info.rcMonitor.left;
        row["height"] = info.rcMonitor.bottom - info.rcMonitor.top;
        row["primary"] = (info.dwFlags & MONITORINFOF_PRIMARY) != 0;
        row["hasCursor"] = monitor == cursorMonitor;
        screenRows.Add(row);
        return true;
    }

    static List<object> Screens()
    {
        screenRows = new List<object>();
        POINT cursor;
        GetCursorPos(out cursor);
        cursorMonitor = MonitorFromPoint(cursor, 2);
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, OnMonitor, IntPtr.Zero);
        return screenRows;
    }

    static List<object> Windows()
    {
        var rows = new List<object>();
        uint self = (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
        EnumWindows((hwnd, data) =>
        {
            if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
            int cloaked;
            if (DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;
            RECT rect;
            if (!GetWindowRect(hwnd, out rect)) return true;
            int width = rect.right - rect.left;
            int height = rect.bottom - rect.top;
            if (width <= 0 || height <= 0) return true;
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            if (pid == self) return true;
            var title = new StringBuilder(512);
            GetWindowTextW(hwnd, title, title.Capacity);
            var className = new StringBuilder(256);
            GetClassNameW(hwnd, className, className.Capacity);
            var row = new Dictionary<string, object>();
            row["hwnd"] = hwnd.ToInt64().ToString();
            row["title"] = title.ToString();
            row["className"] = className.ToString();
            row["processName"] = ProcessName(pid);
            row["x"] = rect.left;
            row["y"] = rect.top;
            row["width"] = width;
            row["height"] = height;
            row["minimized"] = false;
            row["cloaked"] = false;
            rows.Add(row);
            return true;
        }, IntPtr.Zero);
        return rows;
    }

    static string ProcessName(uint pid)
    {
        var handle = OpenProcess(0x1000, false, pid);
        if (handle == IntPtr.Zero) return "";
        try
        {
            var name = new StringBuilder(1024);
            int size = name.Capacity;
            if (!QueryFullProcessImageNameW(handle, 0, name, ref size)) return "";
            return Path.GetFileName(name.ToString());
        }
        finally { CloseHandle(handle); }
    }

    static List<object> Tree(string hwndText, Dictionary<string, object> clip)
    {
        var nodes = new List<object>();
        var root = AutomationElement.FromHandle(Hwnd(hwndText));
        if (root == null) return nodes;
        var walker = TreeWalker.ControlViewWalker;
        Walk(root, walker, nodes, 0, clip);
        return nodes;
    }

    // Same edges as pointInTerritory in lib/core/geometry.js. The divider line stays outside.
    static bool InsideClip(Dictionary<string, object> clip, int px, int py)
    {
        int width = IntOf(clip, "width");
        int height = IntOf(clip, "height");
        if (width <= 0 || height <= 0) return true;
        int x = IntOf(clip, "x");
        int y = IntOf(clip, "y");
        int right = x + width;
        int bottom = y + height;
        var kind = Str(clip, "kind");
        var side = Str(clip, "side");
        if (kind == "display") return px >= x && px < right && py >= y && py < bottom;
        if (side == "right") return px > x && px <= right && py >= y && py < bottom;
        if (side == "left") return px >= x && px < right && py >= y && py < bottom;
        if (side == "bottom") return py > y && py <= bottom && px >= x && px < right;
        return py >= y && py < bottom && px >= x && px < right;
    }

    static void Walk(AutomationElement element, TreeWalker walker, List<object> nodes, int depth, Dictionary<string, object> clip)
    {
        if (element == null || depth > 12 || nodes.Count >= 80) return;
        try
        {
            var rect = element.Current.BoundingRectangle;
            int cx = (int)(rect.X + rect.Width / 2);
            int cy = (int)(rect.Y + rect.Height / 2);
            if (rect.Width >= 1 && rect.Height >= 1 && InsideClip(clip, cx, cy))
            {
                var row = new Dictionary<string, object>();
                row["rid"] = RuntimeId(element);
                row["name"] = element.Current.Name ?? "";
                row["controlType"] = element.Current.ControlType.ProgrammaticName ?? "";
                row["className"] = element.Current.ClassName ?? "";
                row["x"] = (int)rect.X;
                row["y"] = (int)rect.Y;
                row["width"] = (int)rect.Width;
                row["height"] = (int)rect.Height;
                bool password = false;
                try { password = element.Current.IsPassword; } catch { }
                row["password"] = password;
                row["patterns"] = Patterns(element);
                if (!password)
                {
                    object valuePattern;
                    if (element.TryGetCurrentPattern(ValuePattern.Pattern, out valuePattern))
                        row["value"] = ((ValuePattern)valuePattern).Current.Value ?? "";
                }
                nodes.Add(row);
            }
        }
        catch (ElementNotAvailableException) { return; }
        AutomationElement child;
        try { child = walker.GetFirstChild(element); }
        catch (ElementNotAvailableException) { return; }
        while (child != null && nodes.Count < 80)
        {
            Walk(child, walker, nodes, depth + 1, clip);
            try { child = walker.GetNextSibling(child); }
            catch (ElementNotAvailableException) { break; }
        }
    }

    static ArrayList Patterns(AutomationElement element)
    {
        var list = new ArrayList();
        object pattern;
        if (element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) list.Add("invoke");
        if (element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern)) list.Add("selection");
        if (element.TryGetCurrentPattern(TogglePattern.Pattern, out pattern)) list.Add("toggle");
        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) list.Add("value");
        return list;
    }

    static string RuntimeId(AutomationElement element)
    {
        var parts = element.GetRuntimeId();
        var text = new StringBuilder();
        for (int i = 0; i < parts.Length; i++)
        {
            if (i > 0) text.Append(',');
            text.Append(parts[i]);
        }
        return text.ToString();
    }

    static AutomationElement Find(IntPtr hwnd, string rid)
    {
        var root = AutomationElement.FromHandle(hwnd);
        if (root == null) return null;
        return FindWalk(root, TreeWalker.ControlViewWalker, rid, 0);
    }

    static AutomationElement FindWalk(AutomationElement element, TreeWalker walker, string rid, int depth)
    {
        if (element == null || depth > 12) return null;
        try { if (RuntimeId(element) == rid) return element; }
        catch (ElementNotAvailableException) { return null; }
        AutomationElement child;
        try { child = walker.GetFirstChild(element); }
        catch (ElementNotAvailableException) { return null; }
        while (child != null)
        {
            var found = FindWalk(child, walker, rid, depth + 1);
            if (found != null) return found;
            try { child = walker.GetNextSibling(child); }
            catch (ElementNotAvailableException) { break; }
        }
        return null;
    }

    static string Act(string cmd, string hwndText, string rid, string value)
    {
        var element = Find(Hwnd(hwndText), rid);
        if (element == null) return "missing";
        try
        {
            if (cmd == "invoke") { ((InvokePattern)element.GetCurrentPattern(InvokePattern.Pattern)).Invoke(); return null; }
            if (cmd == "selection") { ((SelectionItemPattern)element.GetCurrentPattern(SelectionItemPattern.Pattern)).Select(); return null; }
            if (cmd == "toggle") { ((TogglePattern)element.GetCurrentPattern(TogglePattern.Pattern)).Toggle(); return null; }
            ((ValuePattern)element.GetCurrentPattern(ValuePattern.Pattern)).SetValue(value ?? "");
            return null;
        }
        catch { return "failed"; }
    }

    static string PostClick(string hwndText, string rid)
    {
        var top = Hwnd(hwndText);
        var element = Find(top, rid);
        if (element == null) return "missing";
        System.Windows.Rect rect;
        try { rect = element.Current.BoundingRectangle; }
        catch { return "missing"; }
        int handle = 0;
        try { handle = element.Current.NativeWindowHandle; } catch { }
        var target = handle != 0 ? new IntPtr(handle) : top;
        var point = new POINT { x = (int)(rect.X + rect.Width / 2), y = (int)(rect.Y + rect.Height / 2) };
        ScreenToClient(target, ref point);
        var packed = (IntPtr)(((point.y & 0xFFFF) << 16) | (point.x & 0xFFFF));
        PostMessage(target, 0x0201, (IntPtr)1, packed);
        PostMessage(target, 0x0202, IntPtr.Zero, packed);
        return null;
    }

    static string Shot(int x, int y, int width, int height)
    {
        if (width < 1 || height < 1 || width > 10000 || height > 10000) return "";
        Overlay.HideForShot();
        try
        {
            using (var bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb))
            {
                using (var graphics = Graphics.FromImage(bitmap))
                    graphics.CopyFromScreen(x, y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
                using (var stream = new MemoryStream())
                {
                    bitmap.Save(stream, ImageFormat.Png);
                    return Convert.ToBase64String(stream.ToArray());
                }
            }
        }
        finally { Overlay.ShowAfterShot(); }
    }

    static IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            var info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
            if ((info.flags & LLMHF_INJECTED) == 0)
            {
                int msg = wParam.ToInt32();
                string kind = null;
                string button = "";
                if (msg == 0x0200) kind = "move";
                else if (msg == 0x020A) kind = "wheel";
                else if (msg == 0x0201) { kind = "down"; button = "left"; }
                else if (msg == 0x0202) { kind = "up"; button = "left"; }
                else if (msg == 0x0204) { kind = "down"; button = "right"; }
                else if (msg == 0x0205) { kind = "up"; button = "right"; }
                else if (msg == 0x0207) { kind = "down"; button = "middle"; }
                else if (msg == 0x0208) { kind = "up"; button = "middle"; }
                else if (msg == 0x020B || msg == 0x020C)
                {
                    kind = msg == 0x020B ? "down" : "up";
                    button = (info.mouseData >> 16) == 1 ? "x1" : "x2";
                }
                if (kind != null)
                {
                    if (kind == "down" || kind == "up") Overlay.Pointer(kind, info.pt.x, info.pt.y);
                    double fraction;
                    if (kind == "move" && Overlay.TryDragFraction(info.pt.x, info.pt.y, out fraction))
                    {
                        int milli = (int)Math.Round(fraction * 1000);
                        if (milli != lastFractionSent)
                        {
                            lastFractionSent = milli;
                            QueueEvent(new Dictionary<string, object> { { "event", "divider" }, { "fraction", fraction } });
                        }
                    }
                    QueueEvent(new Dictionary<string, object> {
                        { "event", "pointer" }, { "kind", kind }, { "button", button },
                        { "x", info.pt.x }, { "y", info.pt.y }
                    });
                }
            }
        }
        return CallNextHookEx(mouseHook, code, wParam, lParam);
    }

    static IntPtr OnKey(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            var info = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            if ((info.flags & LLKHF_INJECTED) == 0)
            {
                bool up = (info.flags & LLKHF_UP) != 0;
                bool ctrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
                bool alt = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
                if (!up && info.vk == VK_OEM_PERIOD && ctrl && alt)
                {
                    DesktopInput.RequestStop();
                    QueueEvent(new Dictionary<string, object> { { "event", "stop" } });
                    return (IntPtr)1;
                }
                QueueEvent(new Dictionary<string, object> {
                    { "event", "key" }, { "kind", up ? "up" : "down" }, { "vk", info.vk }
                });
            }
        }
        return CallNextHookEx(keyHook, code, wParam, lParam);
    }

    static void QueueEvent(Dictionary<string, object> row)
    {
        object kind;
        row.TryGetValue("kind", out kind);
        if ((string)kind == "move" && Events.Count > 30) return;
        Events.Enqueue(row);
    }

    static StreamWriter output;

    static StreamWriter Out
    {
        get
        {
            if (output == null)
                output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
            return output;
        }
    }

    static void Write(object row)
    {
        lock (WriteLock) Out.WriteLine(Json.Serialize(row));
    }

    static void Reply(int id, bool ok, Dictionary<string, object> extra)
    {
        var row = extra ?? new Dictionary<string, object>();
        row["id"] = id;
        row["ok"] = ok;
        Write(row);
    }

    static IntPtr Hwnd(string text)
    {
        long value;
        if (!long.TryParse(text ?? "", out value)) return IntPtr.Zero;
        return new IntPtr(value);
    }

    static string Str(Dictionary<string, object> msg, string key)
    {
        object value;
        if (!msg.TryGetValue(key, out value) || value == null) return "";
        return Convert.ToString(value);
    }

    static int IntOf(Dictionary<string, object> msg, string key)
    {
        object value;
        if (!msg.TryGetValue(key, out value) || value == null) return 0;
        try { return Convert.ToInt32(value); }
        catch { return 0; }
    }

    static bool BoolOf(Dictionary<string, object> msg, string key)
    {
        object value;
        if (!msg.TryGetValue(key, out value) || value == null) return false;
        if (value is bool) return (bool)value;
        return Convert.ToString(value) == "true";
    }
}
