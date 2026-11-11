# 地盘光标

桌面 DeepSeek Harness 插件。行为约定以 `README.md` 为准。

改规则、加端口或装进配置之前，读 `docs/ARCHITECTURE.md`。

核心只放纯规则。设置页和工具都显示核心给出的结果。

`territory_snapshot` 和 `territory_act` 不移动系统光标。点击走控件调用，或把按下和抬起发给目标窗口。

`desktop_step` 和 `get_screen_metrics` 的代码在本仓库，借用 dsh-desktop-tools-plugin 0.4.0 的思路（EvilOfRed，MIT，见 `NOTICE`）。不要加对那个包的运行时依赖。`desktop_click` 是真实鼠标点击，必须带屏幕坐标，光标落到目标才按下。点图标、按钮、菜单或任务栏用它，不要用按键代替。`desktop_step` 用来看画面，或对已经聚焦的输入框打字。调用前先问用户，结束后告诉用户。

两个插件同时启用会注册重复的工具名。只留一个启用。
