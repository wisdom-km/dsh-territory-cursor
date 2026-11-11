# dsh-territory-cursor

界面上的名字叫「地盘光标」。仓库名和安装包名都用 `dsh-territory-cursor`。

DeepSeek Harness 插件。给代理一块地盘和一颗只属于它的光标。地盘里的点击不移动你的系统鼠标。另有 `desktop_step`，借用 [dsh-desktop-tools-plugin](https://www.npmjs.com/package/dsh-desktop-tools-plugin) 0.4.0（EvilOfRed，MIT），用系统鼠标操作整块虚拟桌面。

## 当前版本

0.1.0 有两条路。设置页确认地盘：单屏默认右半边，可以改左右上下，也可以拖分界。两块及以上屏幕要先点确认，地盘是整块屏幕。地盘里的点击不移动系统鼠标。`desktop_step` 写在本仓库里，用系统鼠标操作整块虚拟桌面。

确认之后，地盘里有两个工具：`territory_snapshot` 列出中心在地盘里的窗口并截下这块矩形；`territory_act` 对一个 ref 做一次左键，或把控件的值整段换掉。这两个工具不移动系统鼠标，不注入键盘。滚动、拖拽、右键、双击都不做。点不了就说明点不了，不改走 `desktop_step`。

另外三个工具不看地盘有没有确认：`get_screen_metrics` 只读虚拟桌面；`desktop_click` 用真实系统鼠标点击一个坐标；`desktop_step` 看画面，或对已经聚焦的输入框做真实键盘输入。点图标、按钮和任务栏用 `desktop_click`，不要用按键代替。动作集合、监视区阈值、静置和画面记号跟 dsh-desktop-tools-plugin 0.4.0 相同，出处写在 `NOTICE`。调用前要先问你，结束后要告诉你。同一批最多 20 个动作，监视区最多 4 块。文字用 `SendInput` 的 Unicode 输入，不碰剪贴板。

这份 `desktop_step` 写在本仓库里，由咱们维护。`package.json` 不依赖 dsh-desktop-tools-plugin。对方停更、下架，或从本机卸掉，这个工具还在。`NOTICE` 只留下 MIT 要求的版权声明，运行时不会去加载那个包。

如果桌面配置里还启用着原来的 dsh-desktop-tools-plugin，两个插件会注册同样的工具名。只留地盘光标。

桌面配置安装：

```powershell
dsh plugin --profile desktop add github:wisdom-km/dsh-territory-cursor
```

只装进桌面配置，不要装进网页配置。装之前、更新之前，都先完全退出 DeepSeek Harness，包括托盘。

已经用 GitHub 地址装过的，退出后再执行：

```powershell
dsh plugin --profile desktop update dsh-territory-cursor
```

然后重新打开。依赖若是指向本仓库目录的 `link:`，退出再打开即可，不必再执行 `update`。打开后旁车会在源码比 `Territory.exe` 新的时候重新编译。

npm 包名 `dsh-territory-cursor` 等记事本能点下去、并且系统鼠标停在原地之后再发。

双屏时，你指定哪一块屏幕给它。单屏时，在这一块屏幕上画出一块地盘（默认右半边）。两种情况是同一套规则：地盘是一个矩形，插件只操作中心落在矩形里的窗口。

## 它保证什么

地盘里的 `territory_snapshot` 和 `territory_act`：

- 不调用 `SetCursorPos`，不用 `SendInput`。
- 不把系统光标换成空白图案。
- 不把窗口拉到前台。
- 打字写进目标控件，不往系统键盘里注入。
- 你的真鼠标在地盘里按下时，这一轮停下。只是移过去不停。
- 点不了就说明点不了，不退回真鼠标。密码框不读、不点、不写。浏览器、任务栏和 Electron 窗口会说明点不了。
- 只移动鼠标不会停下。按下鼠标键或键盘会让这一轮停下。地盘内按下时，要松开、光标离开地盘，并安静约 1.5 秒才继续。地盘外按下时，全部松开并安静约 1.5 秒即可，光标可以留在你那边。滚轮不暂停。
- Ctrl+Alt+. 和设置页里的停止是同一把锁。锁上之后，地盘动作和 `desktop_step` 都拒绝。截图仍然可以。

`desktop_step` 是另一条路。它会调用 `SetCursorPos` 和 `SendInput`。带坐标的点击、移动和滚动会把光标移到目标，落到之后才按下鼠标。打字是真实键盘逐字输入，不碰剪贴板。它不调用 `SetForegroundWindow`。光标没落到目标、提权窗口或安全桌面都会拒绝这一下，并把原因写出来。停止热键会打断正在跑的这一步。调用前先问你，结束后告诉你。要点看得见的东西时发 `click` 并带坐标，不要用按键代替这次点击。

## 地盘怎么划

第一次启用，设置页先问，问完之前不点任何窗口。

两块及以上屏幕：

- 按摆放位置列出，例如「左边这块」「右边这块」，旁边画实际分辨率。
- 预选「现在没有你鼠标的那一块」，必须你点确认才生效。
- 记住这块显示器的设备名（如 `\\.\DISPLAY2`）和当时的边界。拔掉或换位置后，设置页重新问，不按序号硬套。

只有一块屏幕：

- 默认右半边，屏幕上画出淡色分界和地盘边框，边框点得透。
- 可以改成左、右、上、下，也可以拖分界。
- 最大化会铺满整块屏幕的窗口，中心不在地盘内，插件不动它。给它用的程序用系统「靠右停靠」放到右半边。
- 横跨分界的窗口不动。弹窗的控件中心出了地盘，这一下放弃。

之后可在「设置 → 地盘光标」里改，改完下一轮才用新矩形。

## 一轮里怎么干活

1. 算出地盘矩形（虚拟屏幕坐标，允许负数，因为副屏可以在主屏左边）。
2. 只列出中心在矩形内的顶层窗口。
3. 读该窗口的控件树。截图时排除光标层和地盘边框。
4. 把光标画到要点的控件中心。光标窗口置顶、点得透、不激活。
5. 先走控件自己的调用、赋值、选择。普通未被挡住的 Win32 控件不行时，再把按下和抬起发给这个窗口的客户区坐标。
6. 你的真鼠标在地盘内出现按下，立即停。系统光标留在原地。松开并离开地盘，再安静约 1.5 秒，才接下一轮。

## 明确不做

- 全屏独占、只认硬件输入的游戏、要管理员权限而插件没有的窗口。遇到就停并写明原因。
- 不提供「点不了就改占真鼠标」的开关。占真鼠标要单独调用 `desktop_step`。

## 仓库要长成什么样

```
dsh-territory-cursor/
  package.json          # dsh.bundle，engines.dsh 用 *，运行时再核对 0.2
  cordis.patch.yml      # 挂进宿主，注册工具和设置页
  lib/core/             # 纯规则。desktop-plan.js 只计划 desktop_step
  lib/host-resolve.js   # 从正在运行的 Harness 里加载宿主包
  sidecar/Host.cs       # 屏幕、窗口、控件、截图、键鼠监视、派发 desktop
  sidecar/DesktopInput.cs  # 系统鼠标一步
  NOTICE                # desktop_step 对 dsh-desktop-tools-plugin 的许可声明
  overlay/              # 光标和单屏边框，点得透，截图时隐藏
  docs/ARCHITECTURE.md
  README.md
```

旁车用系统自带的 C# 编译器编译，不另装运行时。进程要声明按每块屏幕自己的缩放处理坐标，否则双屏缩放不一致时光标和点击会错位。

## 核对清单

下面每条都是当前行为，可以逐条核对。

1. 装进 DeepSeek Harness 0.2 的桌面配置后，设置页能打开。
2. 列出屏幕。两块屏必须点选一块才保存。一块屏画出右半边边框，拖动分界会改矩形。
3. 只列出地盘内的窗口。把一个记事本靠右停靠，它出现；最大化或在左半边，它不出现。
4. 光标只在地盘里移动，你的系统光标停在原地。截图里没有这颗光标。
5. 对记事本、资源管理器做控件调用。系统光标仍不动。
6. 控件调用不了时，把点击消息发给该窗口。仍不动系统光标。浏览器点不了就返回说明，不改用真鼠标。要占系统鼠标时，单独调用 `desktop_step`。
7. 你在地盘里按下真鼠标，当前轮停止。
8. 往一个输入框写字，你在另一块屏幕上的输入焦点还在。

## 发布到社区

官方插件市场还在筹备，现在不能直接上架。能做的是进社区目录，并登记作者意向。

1. 仓库公开，并打上 `dsh-plugin` 话题。社区目录靠这个话题收录。可安装还要有 `package.json` 里的 `dsh.bundle` 和旁边的 `cordis.patch.yml`。收录条目交到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的 `data/plugins/`，描述只写当前代码真的会做的事。
2. 在 [DeepSeek Harness 的 Show Your Plugins 讨论区](https://github.com/deepseek-ai/deepseek-harness/discussions/categories/show-your-plugins)发一帖。写明两件事：地盘里的虚拟点击不移动系统鼠标；`desktop_step` 借用 dsh-desktop-tools-plugin（EvilOfRed，MIT），会移动系统鼠标。附上仓库地址。
3. 作者扶持是一张意向表：<https://trtgsjkv6r.feishu.cn/share/base/form/shrcnkRrxNyri4bOF9n48BIYWbb>。名称写「地盘光标 / dsh-territory-cursor」。阶段按仓库里已经有的行为写，当前已有地盘点击和 `desktop_step`。

插件能在记事本上点下去、并且你的鼠标停在原地之后，再发 npm。在那之前，应用内安装走上面的 GitHub 地址。讨论帖可以先发。
