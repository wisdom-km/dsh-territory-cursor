# 地盘光标的结构

规则在 `lib/core`。设置页和以后的工具只显示核心给出的状态。`lib/main.js` 是唯一的组装处。

核心文件不引用旁车、光标窗口、Harness 或 React。这条由 `npm test` 里的结构测试卡住。

`lib/session.js` 是组装。它读核心的裁决，再叫 `lib/ports/sidecar.js`。点击走控件自己的调用，或者把按下和抬起发给那个窗口。系统光标留在原地。

| 位置 | 放什么 |
| --- | --- |
| `lib/core` | 地盘、暂停、停止、窗口过滤、一次动作 |
| `lib/ports/sidecar.js` | 拉起旁车 |
| `sidecar` | C#：屏幕、窗口、控件、截图、键鼠监视 |
| `overlay` | 假光标和边框 |
| `lib/tools.js` | `territory_snapshot` 和 `territory_act` |
