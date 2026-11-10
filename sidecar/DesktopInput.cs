using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

/// <summary>
/// One system-mouse step over the virtual desktop.
/// The action set, SendInput usage, watch thresholds, and marks follow
/// dsh-desktop-tools-plugin 0.4.0 by EvilOfRed (MIT). See NOTICE.
/// </summary>
static class DesktopInput
{
    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }

    [StructLayout(LayoutKind.Explicit)]
    struct INPUTUNION
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public INPUTUNION u; }

    struct Diff
    {
        public double Score;
        public double Mild;
        public int Max;
    }

    delegate bool MonitorProc(IntPtr monitor, IntPtr hdc, ref RECT rect, IntPtr data);

    const uint INPUT_MOUSE = 0;
    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_WHEEL = 0x0800;
    const uint MOUSEEVENTF_HWHEEL = 0x1000;
    const ushort VK_RETURN = 0x0D;
    const ushort VK_TAB = 0x09;
    const ushort VK_SHIFT = 0x10;
    const ushort VK_CONTROL = 0x11;
    const ushort VK_MENU = 0x12;
    const ushort VK_LWIN = 0x5B;

    static int stopGeneration;

    [DllImport("user32.dll", SetLastError = true)] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll", SetLastError = true)] static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorProc proc, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern short VkKeyScan(char ch);

    public static int Stamp() { return System.Threading.Volatile.Read(ref stopGeneration); }

    public static void RequestStop() { System.Threading.Interlocked.Increment(ref stopGeneration); }

    static bool Stopped(int stamp) { return System.Threading.Volatile.Read(ref stopGeneration) != stamp; }

    public static Dictionary<string, object> Run(Dictionary<string, object> spec, int stamp)
    {
        var result = Metrics();
        result["mode"] = Str(spec, "mode");
        if (Str(spec, "mode") != "step")
        {
            result["ok"] = true;
            return result;
        }
        try
        {
            Step(spec, result, stamp);
            result["ok"] = !result.ContainsKey("code");
        }
        catch (Exception ex)
        {
            result["ok"] = false;
            result["error"] = ex.Message;
        }
        POINT after;
        if (GetCursorPos(out after)) result["cursor"] = Point(after.X, after.Y);
        result["foreground"] = ForegroundTitle();
        return result;
    }

    static Dictionary<string, object> Metrics()
    {
        int left = GetSystemMetrics(76);
        int top = GetSystemMetrics(77);
        int width = GetSystemMetrics(78);
        int height = GetSystemMetrics(79);
        var monitors = new List<object>();
        var found = new List<RECT>();
        MonitorProc callback = (IntPtr monitor, IntPtr hdc, ref RECT rect, IntPtr data) =>
        {
            found.Add(rect);
            return true;
        };
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, callback, IntPtr.Zero);
        GC.KeepAlive(callback);
        foreach (var rect in found)
        {
            monitors.Add(Rect(rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top));
        }
        POINT cursor;
        GetCursorPos(out cursor);
        return new Dictionary<string, object>
        {
            { "virtualScreen", Rect(left, top, width, height) },
            { "primaryScreen", Rect(0, 0, GetSystemMetrics(0), GetSystemMetrics(1)) },
            { "monitors", monitors },
            { "cursor", Point(cursor.X, cursor.Y) },
            { "foreground", ForegroundTitle() },
            { "dpiAwarenessApplied", true },
        };
    }

    static void Step(Dictionary<string, object> spec, Dictionary<string, object> result, int stamp)
    {
        var screen = (Dictionary<string, object>)result["virtualScreen"];
        int shotX = IntOf(screen, "x");
        int shotY = IntOf(screen, "y");
        int shotW = IntOf(screen, "width");
        int shotH = IntOf(screen, "height");
        var watch = ReadRects(spec, "watch");
        foreach (var rect in watch)
        {
            if (!RectInside(rect, screen))
            {
                result["code"] = "invalid-watch";
                result["requested"] = rect;
                return;
            }
        }
        var baseline = new List<byte[]>();
        Overlay.HideForShot();
        try
        {
            foreach (var rect in watch) baseline.Add(CaptureBytes(IntOf(rect, "x"), IntOf(rect, "y"), IntOf(rect, "width"), IntOf(rect, "height")));
            var reports = new List<object>();
            var clicks = new List<Dictionary<string, object>>();
            Dictionary<string, object> failed = null;
            var actions = ReadList(spec, "actions");
            for (int index = 0; index < actions.Count; index++)
            {
                if (Stopped(stamp)) { failed = Fail(index, "stopped"); break; }
                var action = actions[index] as Dictionary<string, object>;
                if (action == null) continue;
                try
                {
                    var report = OneAction(action, screen, stamp);
                    reports.Add(report);
                    if (report.ContainsKey("click")) clicks.Add((Dictionary<string, object>)report["click"]);
                }
                catch (Exception ex)
                {
                    failed = Fail(index, ex.Message);
                    failed["kind"] = Str(action, "kind");
                    break;
                }
            }
            result["actions"] = reports;
            if (failed != null) result["failedAction"] = failed;

            bool changed = false;
            int detectedMs = 0;
            int settledMs = 0;
            bool stable = false;
            bool timedOut = false;
            var watchReports = new List<object>();
            int timeoutMs = IntOf(spec, "timeoutMs");
            int pollMs = Math.Max(30, IntOf(spec, "pollMs"));
            if (watch.Count > 0 && timeoutMs > 0 && !Stopped(stamp))
            {
                var clock = System.Diagnostics.Stopwatch.StartNew();
                var flags = new bool[watch.Count];
                var scores = new double[watch.Count];
                var milds = new double[watch.Count];
                var maxes = new int[watch.Count];
                while (true)
                {
                    if (Stopped(stamp)) break;
                    Thread.Sleep(pollMs);
                    for (int i = 0; i < watch.Count; i++)
                    {
                        var sample = CaptureBytes(IntOf(watch[i], "x"), IntOf(watch[i], "y"), IntOf(watch[i], "width"), IntOf(watch[i], "height"));
                        var diff = DiffBytes(baseline[i], sample);
                        scores[i] = diff.Score;
                        milds[i] = diff.Mild;
                        maxes[i] = diff.Max;
                        if (diff.Score >= 0.0008 || diff.Mild >= 0.01) { flags[i] = true; changed = true; }
                    }
                    if (changed || clock.ElapsedMilliseconds >= timeoutMs) { timedOut = !changed; break; }
                }
                detectedMs = (int)clock.ElapsedMilliseconds;
                if (changed)
                {
                    var settle = System.Diagnostics.Stopwatch.StartNew();
                    int quiet = 0;
                    var previous = new List<byte[]>();
                    for (int i = 0; i < watch.Count; i++) previous.Add(CaptureBytes(IntOf(watch[i], "x"), IntOf(watch[i], "y"), IntOf(watch[i], "width"), IntOf(watch[i], "height")));
                    int budget = IntOf(spec, "settleMs");
                    while (settle.ElapsedMilliseconds < budget && quiet < 2 && !Stopped(stamp))
                    {
                        Thread.Sleep(pollMs);
                        bool moved = false;
                        var next = new List<byte[]>();
                        for (int i = 0; i < watch.Count; i++)
                        {
                            var sample = CaptureBytes(IntOf(watch[i], "x"), IntOf(watch[i], "y"), IntOf(watch[i], "width"), IntOf(watch[i], "height"));
                            next.Add(sample);
                            var diff = DiffBytes(previous[i], sample);
                            if (diff.Score > 0.0004 || diff.Mild > 0.004) moved = true;
                        }
                        quiet = moved ? 0 : quiet + 1;
                        previous = next;
                    }
                    settledMs = (int)settle.ElapsedMilliseconds;
                    stable = quiet >= 2;
                }
                for (int i = 0; i < watch.Count; i++)
                {
                    var row = new Dictionary<string, object>(watch[i]);
                    row["changed"] = flags[i];
                    row["score"] = scores[i];
                    row["mild"] = milds[i];
                    row["max"] = maxes[i];
                    watchReports.Add(row);
                }
            }
            else if (actions.Count > 0)
            {
                int fixedMs = IntOf(spec, "fixedSettleMs");
                if (fixedMs > 0 && !Stopped(stamp)) Thread.Sleep(fixedMs);
                settledMs = fixedMs;
            }
            result["watch"] = watchReports;
            result["changed"] = changed;
            result["detectedMs"] = detectedMs;
            result["settledMs"] = settledMs;
            result["stable"] = stable;
            result["timedOut"] = timedOut;
            result["fullScreen"] = true;
            bool annotate = BoolOf(spec, "annotate");
            bool grid = BoolOf(spec, "grid");
            result["annotated"] = annotate;
            result["grid"] = grid;
            POINT cursor;
            GetCursorPos(out cursor);
            result["png"] = SaveShot(shotX, shotY, shotW, shotH, watch, clicks, cursor, annotate, grid, Math.Max(40, IntOf(spec, "gridStep")));
            result["capture"] = Rect(shotX, shotY, shotW, shotH);
        }
        finally
        {
            Overlay.ShowAfterShot();
        }
    }

    static Dictionary<string, object> OneAction(Dictionary<string, object> action, Dictionary<string, object> screen, int stamp)
    {
        string kind = Str(action, "kind");
        if (kind == "move")
        {
            Move(IntOf(action, "x"), IntOf(action, "y"), IntOf(action, "durationMs"), IntOf(action, "steps"), screen, stamp);
            POINT now = Cursor();
            var report = new Dictionary<string, object> { { "kind", kind }, { "cursor", Point(now.X, now.Y) } };
            return report;
        }
        if (kind == "click")
        {
            if (BoolOf(action, "hasPoint")) Move(IntOf(action, "x"), IntOf(action, "y"), 0, 1, screen, stamp);
            bool right = BoolOf(action, "rightButton");
            int count = IntOf(action, "count");
            Click(right);
            if (count >= 2) { Thread.Sleep(40); Click(right); }
            Thread.Sleep(25);
            POINT now = Cursor();
            return new Dictionary<string, object> {
                { "kind", kind },
                { "click", new Dictionary<string, object> { { "x", now.X }, { "y", now.Y }, { "button", right ? "right" : "left" }, { "count", count } } }
            };
        }
        if (kind == "text")
        {
            TypeUnicode(Str(action, "text"));
            if (BoolOf(action, "submit")) TapKey(VK_RETURN);
            Thread.Sleep(25);
            return new Dictionary<string, object> { { "kind", kind } };
        }
        if (kind == "key")
        {
            bool ctrl = BoolOf(action, "ctrl");
            bool shift = BoolOf(action, "shift");
            bool alt = BoolOf(action, "alt");
            bool win = BoolOf(action, "win");
            int vk = IntOf(action, "vk");
            if (!BoolOf(action, "hasVk"))
            {
                short code = VkKeyScan((char)IntOf(action, "charCode"));
                if (code == -1) throw new InvalidOperationException("VkKeyScan could not map this character.");
                vk = code & 0xFF;
                int state = (code >> 8) & 0xFF;
                if ((state & 1) != 0) shift = true;
                if ((state & 2) != 0) ctrl = true;
                if ((state & 4) != 0) alt = true;
            }
            PressChord(ctrl, shift, alt, win, vk, Math.Max(1, IntOf(action, "repeat")));
            Thread.Sleep(25);
            return new Dictionary<string, object> { { "kind", kind } };
        }
        if (kind == "scroll")
        {
            if (BoolOf(action, "hasPoint")) Move(IntOf(action, "x"), IntOf(action, "y"), 0, 1, screen, stamp);
            Wheel(BoolOf(action, "horizontal"), IntOf(action, "delta"), Math.Max(1, IntOf(action, "wheelSteps")));
            Thread.Sleep(25);
            return new Dictionary<string, object> { { "kind", kind } };
        }
        if (kind == "wait")
        {
            int ms = Math.Max(0, IntOf(action, "ms"));
            int left = ms;
            while (left > 0)
            {
                if (Stopped(stamp)) throw new InvalidOperationException("stopped");
                int slice = Math.Min(50, left);
                Thread.Sleep(slice);
                left -= slice;
            }
            return new Dictionary<string, object> { { "kind", kind } };
        }
        throw new InvalidOperationException("unsupported action kind: " + kind);
    }

    static void Move(int x, int y, int durationMs, int steps, Dictionary<string, object> screen, int stamp)
    {
        if (!Inside(x, y, screen)) throw new InvalidOperationException("out-of-range point " + x + " " + y);
        if (durationMs <= 0 || steps < 2)
        {
            if (!SetCursorPos(x, y)) throw new InvalidOperationException("SetCursorPos failed");
            Thread.Sleep(25);
            return;
        }
        POINT start = Cursor();
        if (steps > 240) steps = 240;
        int per = Math.Max(1, durationMs / steps);
        for (int i = 1; i <= steps; i++)
        {
            if (Stopped(stamp)) throw new InvalidOperationException("stopped");
            int px = (int)Math.Round(start.X + ((double)(x - start.X) / steps) * i);
            int py = (int)Math.Round(start.Y + ((double)(y - start.Y) / steps) * i);
            if (!SetCursorPos(px, py)) throw new InvalidOperationException("SetCursorPos failed");
            if (i < steps) Thread.Sleep(per);
        }
    }

    static void Click(bool right)
    {
        uint down = right ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
        uint up = right ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
        Send(new[] { Mouse(down, 0) });
        Thread.Sleep(30);
        Send(new[] { Mouse(up, 0) });
    }

    static void Wheel(bool horizontal, int delta, int steps)
    {
        uint flag = horizontal ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL;
        var events = new INPUT[steps];
        for (int i = 0; i < steps; i++) events[i] = Mouse(flag, delta);
        Send(events);
    }

    static void TapKey(ushort vk)
    {
        Send(new[] { Key(vk, false), Key(vk, true) });
    }

    static void PressChord(bool ctrl, bool shift, bool alt, bool win, int vk, int repeat)
    {
        var events = new List<INPUT>();
        for (int i = 0; i < repeat; i++)
        {
            if (ctrl) events.Add(Key(VK_CONTROL, false));
            if (shift) events.Add(Key(VK_SHIFT, false));
            if (alt) events.Add(Key(VK_MENU, false));
            if (win) events.Add(Key(VK_LWIN, false));
            events.Add(Key((ushort)vk, false));
            events.Add(Key((ushort)vk, true));
            if (win) events.Add(Key(VK_LWIN, true));
            if (alt) events.Add(Key(VK_MENU, true));
            if (shift) events.Add(Key(VK_SHIFT, true));
            if (ctrl) events.Add(Key(VK_CONTROL, true));
        }
        Send(events.ToArray());
    }

    static void TypeUnicode(string text)
    {
        var events = new List<INPUT>();
        foreach (char ch in text ?? "")
        {
            if (ch == '\r') continue;
            if (ch == '\n') { events.Add(Key(VK_RETURN, false)); events.Add(Key(VK_RETURN, true)); continue; }
            if (ch == '\t') { events.Add(Key(VK_TAB, false)); events.Add(Key(VK_TAB, true)); continue; }
            events.Add(Unicode(ch, false));
            events.Add(Unicode(ch, true));
        }
        for (int offset = 0; offset < events.Count; offset += 128)
        {
            int count = Math.Min(128, events.Count - offset);
            Send(events.GetRange(offset, count).ToArray());
        }
    }

    static void Send(INPUT[] inputs)
    {
        if (inputs.Length == 0) return;
        uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (sent != inputs.Length)
        {
            throw new InvalidOperationException(
                "SendInput delivered " + sent + " of " + inputs.Length + " input events (Win32 error " + Marshal.GetLastWin32Error() + ")");
        }
    }

    static INPUT Mouse(uint flags, int data)
    {
        var input = new INPUT { type = INPUT_MOUSE };
        input.u.mi = new MOUSEINPUT { dwFlags = flags, mouseData = (uint)data };
        return input;
    }

    static INPUT Key(ushort vk, bool up)
    {
        uint flags = IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0;
        if (up) flags |= KEYEVENTF_KEYUP;
        var input = new INPUT { type = INPUT_KEYBOARD };
        input.u.ki = new KEYBDINPUT { wVk = vk, dwFlags = flags };
        return input;
    }

    static INPUT Unicode(char ch, bool up)
    {
        uint flags = KEYEVENTF_UNICODE;
        if (up) flags |= KEYEVENTF_KEYUP;
        var input = new INPUT { type = INPUT_KEYBOARD };
        input.u.ki = new KEYBDINPUT { wScan = ch, dwFlags = flags };
        return input;
    }

    static bool IsExtended(int vk)
    {
        switch (vk)
        {
            case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26: case 0x27: case 0x28:
            case 0x2D: case 0x2E: case 0x5B: case 0x5C: case 0x5D: case 0x6F: case 0x90:
                return true;
            default: return false;
        }
    }

    static Diff DiffBytes(byte[] a, byte[] b)
    {
        var result = new Diff();
        if (a == null || b == null) return result;
        int length = Math.Min(a.Length, b.Length);
        long sampled = 0, strong = 0, mild = 0;
        int maximum = 0;
        for (int i = 0; i + 3 < length; i += 4)
        {
            int dr = Math.Abs(a[i] - b[i]);
            int dg = Math.Abs(a[i + 1] - b[i + 1]);
            int db = Math.Abs(a[i + 2] - b[i + 2]);
            int delta = Math.Max(dr, Math.Max(dg, db));
            sampled++;
            if (delta > maximum) maximum = delta;
            if (delta > 24) strong++;
            if (delta > 8) mild++;
        }
        result.Max = maximum;
        result.Score = sampled == 0 ? 0 : (double)strong / sampled;
        result.Mild = sampled == 0 ? 0 : (double)mild / sampled;
        return result;
    }

    static byte[] CaptureBytes(int x, int y, int width, int height)
    {
        using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(bitmap))
                graphics.CopyFromScreen(x, y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
            var bits = bitmap.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(bits.Stride);
                var buffer = new byte[stride * height];
                Marshal.Copy(bits.Scan0, buffer, 0, buffer.Length);
                return buffer;
            }
            finally { bitmap.UnlockBits(bits); }
        }
    }

    static string SaveShot(int x, int y, int width, int height, List<Dictionary<string, object>> watch, List<Dictionary<string, object>> clicks, POINT cursor, bool annotate, bool grid, int gridStep)
    {
        using (var bitmap = new Bitmap(Math.Max(1, width), Math.Max(1, height), PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.CopyFromScreen(x, y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
                if (grid) DrawGrid(graphics, gridStep, x, y, width, height);
                if (annotate) DrawMarks(graphics, watch, clicks, cursor, x, y);
            }
            using (var stream = new MemoryStream())
            {
                bitmap.Save(stream, ImageFormat.Png);
                return Convert.ToBase64String(stream.ToArray());
            }
        }
    }

    static void DrawMarks(Graphics graphics, List<Dictionary<string, object>> watch, List<Dictionary<string, object>> clicks, POINT cursor, int offsetX, int offsetY)
    {
        using (var watchPen = new Pen(Color.FromArgb(235, 64, 52), 2))
        using (var cursorPen = new Pen(Color.FromArgb(0, 190, 220), 2))
        using (var leftPen = new Pen(Color.FromArgb(30, 190, 60), 2))
        using (var rightPen = new Pen(Color.FromArgb(245, 150, 20), 2))
        using (var brush = new SolidBrush(Color.FromArgb(220, 235, 64, 52)))
        using (var text = new SolidBrush(Color.White))
        using (var font = new Font("Consolas", 12, FontStyle.Bold))
        {
            for (int i = 0; i < watch.Count; i++)
            {
                int rx = IntOf(watch[i], "x") - offsetX;
                int ry = IntOf(watch[i], "y") - offsetY;
                graphics.DrawRectangle(watchPen, rx, ry, Math.Max(1, IntOf(watch[i], "width") - 1), Math.Max(1, IntOf(watch[i], "height") - 1));
                graphics.FillRectangle(brush, rx + 2, Math.Max(0, ry + 2), 34, 19);
                graphics.DrawString("R" + (i + 1), font, text, rx + 5, Math.Max(0, ry + 4));
            }
            foreach (var click in clicks)
            {
                int cx = IntOf(click, "x") - offsetX;
                int cy = IntOf(click, "y") - offsetY;
                var pen = Str(click, "button") == "right" ? rightPen : leftPen;
                graphics.DrawEllipse(pen, cx - 8, cy - 8, 16, 16);
                graphics.DrawLine(pen, cx - 15, cy, cx - 9, cy);
                graphics.DrawLine(pen, cx + 9, cy, cx + 15, cy);
                graphics.DrawLine(pen, cx, cy - 15, cx, cy - 9);
                graphics.DrawLine(pen, cx, cy + 9, cx, cy + 15);
            }
            int px = cursor.X - offsetX;
            int py = cursor.Y - offsetY;
            graphics.DrawEllipse(cursorPen, px - 12, py - 12, 24, 24);
            graphics.DrawLine(cursorPen, px - 20, py, px - 13, py);
            graphics.DrawLine(cursorPen, px + 13, py, px + 20, py);
            graphics.DrawLine(cursorPen, px, py - 20, px, py - 13);
            graphics.DrawLine(cursorPen, px, py + 13, px, py + 20);
        }
    }

    static void DrawGrid(Graphics graphics, int step, int offsetX, int offsetY, int width, int height)
    {
        using (var pen = new Pen(Color.FromArgb(64, 140, 140, 140), 1))
        using (var back = new SolidBrush(Color.FromArgb(190, 16, 16, 16)))
        using (var text = new SolidBrush(Color.FromArgb(230, 230, 230)))
        using (var font = new Font("Consolas", 11))
        {
            for (int x = 0; x < width; x += step)
            {
                graphics.DrawLine(pen, x, 0, x, height - 1);
                graphics.FillRectangle(back, x + 2, 2, 48, 17);
                graphics.DrawString((x + offsetX).ToString(), font, text, x + 3, 4);
            }
            for (int y = 0; y < height; y += step)
            {
                graphics.DrawLine(pen, 0, y, width - 1, y);
                graphics.FillRectangle(back, 2, y + 2, 48, 17);
                graphics.DrawString((y + offsetY).ToString(), font, text, 3, y + 4);
            }
        }
    }

    static POINT Cursor()
    {
        POINT point;
        if (!GetCursorPos(out point)) throw new InvalidOperationException("GetCursorPos failed");
        return point;
    }

    static string ForegroundTitle()
    {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return "";
        var buffer = new StringBuilder(512);
        return GetWindowText(hwnd, buffer, buffer.Capacity) > 0 ? buffer.ToString() : "";
    }

    static bool Inside(int x, int y, Dictionary<string, object> screen)
    {
        int left = IntOf(screen, "x");
        int top = IntOf(screen, "y");
        return x >= left && y >= top && x <= left + IntOf(screen, "width") - 1 && y <= top + IntOf(screen, "height") - 1;
    }

    static bool RectInside(Dictionary<string, object> rect, Dictionary<string, object> screen)
    {
        int width = IntOf(rect, "width");
        int height = IntOf(rect, "height");
        if (width <= 0 || height <= 0) return false;
        return Inside(IntOf(rect, "x"), IntOf(rect, "y"), screen)
            && Inside(IntOf(rect, "x") + width - 1, IntOf(rect, "y") + height - 1, screen);
    }

    static List<Dictionary<string, object>> ReadRects(Dictionary<string, object> spec, string key)
    {
        var rows = new List<Dictionary<string, object>>();
        foreach (var item in ReadList(spec, key))
        {
            var row = item as Dictionary<string, object>;
            if (row != null) rows.Add(row);
        }
        return rows;
    }

    static ArrayList ReadList(Dictionary<string, object> spec, string key)
    {
        object value;
        if (spec == null || !spec.TryGetValue(key, out value) || value == null) return new ArrayList();
        var list = value as ArrayList;
        return list ?? new ArrayList();
    }

    static Dictionary<string, object> Fail(int index, string message)
    {
        return new Dictionary<string, object> { { "index", index }, { "kind", "?" }, { "message", message } };
    }

    static Dictionary<string, object> Rect(int x, int y, int width, int height)
    {
        return new Dictionary<string, object> { { "x", x }, { "y", y }, { "width", width }, { "height", height } };
    }

    static Dictionary<string, object> Point(int x, int y)
    {
        return new Dictionary<string, object> { { "x", x }, { "y", y } };
    }

    static string Str(Dictionary<string, object> row, string key)
    {
        object value;
        if (row == null || !row.TryGetValue(key, out value) || value == null) return "";
        return Convert.ToString(value);
    }

    static int IntOf(Dictionary<string, object> row, string key)
    {
        object value;
        if (row == null || !row.TryGetValue(key, out value) || value == null) return 0;
        try { return Convert.ToInt32(value); } catch { return 0; }
    }

    static bool BoolOf(Dictionary<string, object> row, string key)
    {
        object value;
        if (row == null || !row.TryGetValue(key, out value) || value == null) return false;
        if (value is bool) return (bool)value;
        return Convert.ToString(value) == "true";
    }
}
