# 地盘光标

桌面 DeepSeek Harness 插件。行为约定以 `README.md` 为准。

改规则、加端口或装进配置之前，读 `docs/ARCHITECTURE.md`。

核心只放纯规则。设置页和工具都显示核心给出的结果。

`territory_snapshot` 和 `territory_act` 不移动系统光标。点击走控件调用，或把按下和抬起发给目标窗口。

`desktop_step` 和 `get_screen_metrics` 的代码在本仓库，借用 dsh-desktop-tools-plugin 0.4.0 的思路（EvilOfRed，MIT，见 `NOTICE`）。不要加对那个包的运行时依赖。`desktop_step` 用系统鼠标操作整块虚拟桌面。调用前先问用户，结束后告诉用户。

两个插件同时启用会注册重复的工具名。只留一个启用。
