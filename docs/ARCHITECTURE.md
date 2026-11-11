# 地盘光标的结构

规则在 `lib/core`。设置页和工具只显示核心给出的状态。`lib/main.js` 是唯一的组装处。

核心文件不引用旁车、光标窗口、Harness 或 React。这条由 `npm test` 里的结构测试卡住。

`lib/session.js` 是组装。它读核心的裁决，再叫 `lib/ports/sidecar.js`。

`territory_act` 走控件自己的调用，或者把按下和抬起发给那个窗口。系统光标留在原地。

`desktop_step` 的计划在 `lib/core/desktop-plan.js`。真正移动鼠标和注入按键的代码在 `sidecar/DesktopInput.cs`。动作集合、监视区阈值和画面记号借鉴 dsh-desktop-tools-plugin 0.4.0（EvilOfRed，MIT），出处在仓库根目录的 `NOTICE`。这份实现由本仓库维护，运行时不加载那个包。`Host.cs` 只把命令派到工作线程，并在停止热键里请求停下。

| 位置 | 放什么 |
| --- | --- |
| `lib/core` | 地盘、暂停、停止、窗口过滤、一次虚拟动作、desktop_step 的计划 |
| `lib/ports/sidecar.js` | 拉起旁车，编译时带上 `DesktopInput.cs` |
| `sidecar/Host.cs` | 屏幕、窗口、控件、截图、键鼠监视、派发 desktop 命令 |
| `sidecar/DesktopInput.cs` | 系统鼠标的一步：SetCursorPos 和 SendInput |
| `overlay` | 假光标和边框 |
| `lib/tools.js` | `territory_snapshot`、`territory_act`、`desktop_step`、`get_screen_metrics` |
