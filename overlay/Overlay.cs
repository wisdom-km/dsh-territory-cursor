using System;
using System.Drawing;
using System.Runtime.InteropServices;

/// <summary>
/// Border and fake cursor are click-through. The divider is a thin hit target.
/// Black is the color key, so the rest of the border window stays out of the way.
/// </summary>
static class Overlay
{
    const int WS_POPUP = unchecked((int)0x80000000);
    const int WS_EX_LAYERED = 0x00080000;
    const int WS_EX_TRANSPARENT = 0x00000020;
    const int WS_EX_TOPMOST = 0x00000008;
    const int WS_EX_NOACTIVATE = 0x08000000;
    const int WS_EX_TOOLWINDOW = 0x00000080;
    const int LWA_COLORKEY = 1;
    const int SWP_NOACTIVATE = 0x0010;
    const int SWP_SHOWWINDOW = 0x0040;
    const int HWND_TOPMOST = -1;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WNDCLASS
    {
        public uint style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string lpszMenuName;
        public string lpszClassName;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int left, top, right, bottom; }

    [StructLayout(LayoutKind.Sequential)]
    struct PAINTSTRUCT
    {
        public IntPtr hdc;
        public int fErase;
        public RECT rcPaint;
        public int fRestore;
        public int fIncUpdate;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)]
        public byte[] rgbReserved;
    }

    static readonly WndProc Proc = WindowProc;
    static bool ready;
    static bool shown;
    static bool dragging;
    static IntPtr border, divider, cursor;
    static string side = "right";
    static string label = "";
    static Rectangle screen = new Rectangle(0, 0, 1, 1);
    static Rectangle territory = new Rectangle(0, 0, 1, 1);

    delegate IntPtr WndProc(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern ushort RegisterClassW(ref WNDCLASS lpWndClass);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr CreateWindowExW(int exStyle, string className, string windowName, int style,
        int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
    [DllImport("user32.dll")]
    static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint colorKey, byte alpha, uint flags);
    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")]
    static extern IntPtr DefWindowProcW(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern IntPtr BeginPaint(IntPtr hwnd, ref PAINTSTRUCT ps);
    [DllImport("user32.dll")]
    static extern bool EndPaint(IntPtr hwnd, ref PAINTSTRUCT ps);
    [DllImport("user32.dll")]
    static extern bool InvalidateRect(IntPtr hwnd, IntPtr rect, bool erase);

    public static bool Dragging { get { return dragging; } }

    public static void Ensure()
    {
        if (ready) return;
        Register("TerritoryOverlay");
        Register("TerritoryDivider");
        Register("TerritoryCursor");
        border = Make("TerritoryOverlay", WS_EX_LAYERED | WS_EX_TRANSPARENT);
        divider = Make("TerritoryDivider", 0);
        cursor = Make("TerritoryCursor", WS_EX_LAYERED | WS_EX_TRANSPARENT);
        SetLayeredWindowAttributes(border, 0, 0, LWA_COLORKEY);
        SetLayeredWindowAttributes(cursor, 0, 0, LWA_COLORKEY);
        ready = true;
    }

    static IntPtr Module()
    {
        return Marshal.GetHINSTANCE(typeof(Overlay).Module);
    }

    static void Register(string name)
    {
        var wc = new WNDCLASS();
        wc.lpfnWndProc = Marshal.GetFunctionPointerForDelegate(Proc);
        wc.hInstance = Module();
        wc.lpszClassName = name;
        RegisterClassW(ref wc);
    }

    static IntPtr Make(string name, int extra)
    {
        int ex = WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | extra;
        return CreateWindowExW(ex, name, "", WS_POPUP, 0, 0, 1, 1, IntPtr.Zero, IntPtr.Zero, Module(), IntPtr.Zero);
    }

    public static void HideForShot()
    {
        ShowWindow(border, 0);
        ShowWindow(divider, 0);
        ShowWindow(cursor, 0);
    }

    public static void ShowAfterShot()
    {
        if (shown) Place(true);
    }

    public static void Apply(bool visible, int x, int y, int width, int height, int screenX, int screenY, int screenW, int screenH, string nextSide, string nextLabel, int cursorX, int cursorY, bool cursorVisible)
    {
        Ensure();
        territory = new Rectangle(x, y, Math.Max(1, width), Math.Max(1, height));
        screen = new Rectangle(screenX, screenY, Math.Max(1, screenW), Math.Max(1, screenH));
        if (!string.IsNullOrEmpty(nextSide)) side = nextSide;
        label = nextLabel ?? "";
        shown = visible;
        if (!visible)
        {
            ShowWindow(border, 0);
            ShowWindow(divider, 0);
            ShowWindow(cursor, 0);
            return;
        }
        Place(cursorVisible);
        if (cursorVisible)
            SetWindowPos(cursor, new IntPtr(HWND_TOPMOST), cursorX - 2, cursorY - 2, 28, 28, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        else
            ShowWindow(cursor, 0);
        InvalidateRect(border, IntPtr.Zero, false);
        InvalidateRect(cursor, IntPtr.Zero, false);
        InvalidateRect(divider, IntPtr.Zero, false);
    }

    static void Place(bool cursorStays)
    {
        SetWindowPos(border, new IntPtr(HWND_TOPMOST), territory.X, territory.Y, territory.Width, territory.Height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        var band = DividerBand();
        uint flags = SWP_NOACTIVATE | SWP_SHOWWINDOW;
        if (side == "display") flags = SWP_NOACTIVATE;
        if (side == "display") ShowWindow(divider, 0);
        else SetWindowPos(divider, new IntPtr(HWND_TOPMOST), band.X, band.Y, Math.Max(band.Width, 1), Math.Max(band.Height, 1), flags);
        if (!cursorStays) ShowWindow(cursor, 0);
    }

    static Rectangle DividerBand()
    {
        if (side == "left") return new Rectangle(territory.Right - 3, territory.Y, 6, territory.Height);
        if (side == "top") return new Rectangle(territory.X, territory.Bottom - 3, territory.Width, 6);
        if (side == "bottom") return new Rectangle(territory.X, territory.Y - 3, territory.Width, 6);
        return new Rectangle(territory.X - 3, territory.Y, 6, territory.Height);
    }

    public static void Pointer(string kind, int x, int y)
    {
        if (kind == "down" && HitDivider(x, y)) dragging = true;
        if (kind == "up") dragging = false;
    }

    public static bool TryDragFraction(int x, int y, out double fraction)
    {
        fraction = 0.5;
        if (!dragging || side == "display") return false;
        double raw;
        if (side == "left") raw = (double)(x - screen.X) / screen.Width;
        else if (side == "top") raw = (double)(y - screen.Y) / screen.Height;
        else if (side == "bottom") raw = (double)(screen.Bottom - y) / screen.Height;
        else raw = (double)(screen.Right - x) / screen.Width;
        if (raw < 0.05) raw = 0.05;
        if (raw > 0.95) raw = 0.95;
        fraction = raw;
        return true;
    }

    static bool HitDivider(int x, int y)
    {
        if (side == "display") return false;
        var band = DividerBand();
        return x >= band.X && x < band.Right && y >= band.Y && y < band.Bottom;
    }

    static IntPtr WindowProc(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == 0x000F)
        {
            var ps = new PAINTSTRUCT();
            ps.rgbReserved = new byte[32];
            var hdc = BeginPaint(hwnd, ref ps);
            try
            {
                using (var g = Graphics.FromHdc(hdc))
                {
                    if (hwnd == divider)
                    {
                        g.Clear(Color.FromArgb(255, 186, 214, 236));
                    }
                    else
                    {
                        g.Clear(Color.Black);
                        if (hwnd == border)
                        {
                            using (var pen = new Pen(Color.FromArgb(255, 186, 214, 236), 3))
                                g.DrawRectangle(pen, 2, 2, Math.Max(1, territory.Width - 5), Math.Max(1, territory.Height - 5));
                            using (var font = new Font(FontFamily.GenericSansSerif, 14))
                            using (var brush = new SolidBrush(Color.FromArgb(255, 186, 214, 236)))
                                g.DrawString(label, font, brush, 12, 8);
                        }
                        else if (hwnd == cursor)
                        {
                            using (var brush = new SolidBrush(Color.FromArgb(255, 255, 176, 32)))
                                g.FillPolygon(brush, new[] {
                                    new Point(2, 2), new Point(2, 22), new Point(8, 16),
                                    new Point(14, 24), new Point(17, 22), new Point(11, 14), new Point(20, 14)
                                });
                        }
                    }
                }
            }
            finally
            {
                EndPaint(hwnd, ref ps);
            }
            return IntPtr.Zero;
        }
        if (hwnd == divider && msg == 0x0201) dragging = true;
        if (hwnd == divider && msg == 0x0202) dragging = false;
        return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
}
