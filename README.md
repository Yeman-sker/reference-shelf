# Reference Shelf

**Keep context in sight.** 把 Obsidian 窗口作为参考画布：同时固定多张图片，或把一张组合图裁成多个独立参考片段。图片可以放在侧栏、正文旁边、正文上方或横跨分栏，不要求正文居中，也不挤压正文的宽度和高度。

## 当前状态

v0.2.0 本地构建。已在隔离的 **macOS / Obsidian 1.13.7** 中验证真实鼠标、键盘、拖放和弹出窗口；不是浏览器仿制界面。尚未发布此版本的 GitHub Release 或上架社区插件市场。

最低声明版本为 Obsidian Desktop 1.13.0，实际验证版本为 1.13.7。Windows、Linux、第三方主题和更旧版本尚未验收。

## 使用

### 固定整图或局部

- **直接拖图**：在 Reading View 或 Live Preview 中，从正文拖动本地图片到窗口里的目标位置，松开固定。
- **右键固定**：选 **Pin image on canvas**，移动预览，再点击落点。`Esc` 取消。
- **裁切固定**：选 **Crop and pin**，在原图上拖出矩形，点 **Use selection**，再点击落点。可用 Left / Top / Width / Height 百分比输入精调。
- 同一张原图可以多次框选。例如把组合图 A 裁出放左侧，B 裁出放右侧，再滚动中间正文阅读解析。

裁切只记录原图引用和选区，**不改原图、不另存图片、不改 Markdown**。原图在笔记中保持原样。

### 操作参考图

- 拖动标题栏左侧的小把手移动；拖四角等比例缩放。只有 Pin 自身接收鼠标事件，空白处照常滚动、选字、编辑。
- 聚焦移动把手后，用方向键移动 10px；按住 Shift 微调 1px。角点也支持方向键缩放。
- 点击置顶；允许重叠，不自动重新排列。靠近窗口边缘时轻微吸附。
- 悬停或键盘聚焦后显示收起、菜单和关闭按钮。
- 菜单提供 **Adjust crop**、**Restore full image**、**View full image**、**Duplicate reference** 和 **Keep across notes**。双击图片也可临时查看完整原图。
- **Cmd+Shift+Y**（Windows/Linux 为 Ctrl+Shift+Y）隐藏／恢复本窗口所有 Pin，位置不变。可在 Obsidian 快捷键设置中修改；左侧 ribbon 图标和命令面板也可切换。
- `Esc` 取消尚未完成的放置或移动。窗口缩小时，越界的 Pin 回到可操作范围；极窄长图保留可操作的标题栏。

画布覆盖应用窗口内容区，包括侧栏和分栏之间的区域；保留顶部原生标题区域，不遮住系统窗口控制按钮。它不是无限画布，不移动或改造 Obsidian 的编辑器。

## 内容归属与生命周期

- **默认跟随笔记**：每个窗口显示其活动笔记的 Pin，不显示无关笔记的普通 Pin。点击侧栏工具不主动切换参考内容。
- 同笔记多个 tab 共享 Pin 集合、裁切、复制和关闭操作；位置、尺寸、收起和叠放顺序按 tab 独立。
- 关闭其中一个 tab 不清空；最后一个源笔记 tab 关闭后，普通 Pin 释放。同一 tab 从 A 导航到 B 也意味着它不再打开 A；历史记录不算打开的 tab。
- **Keep across notes**：明确保留的 Pin 在切换笔记、非 Markdown 页面和关闭源 tab 后仍显示。在同一 Vault 的不同窗口中共享内容，但各自保存位置和尺寸，不把不同窗口的屏幕坐标混用。
- 取消跨笔记保留后恢复笔记归属；源笔记已没有打开的 tab 时，该 Pin 会释放。
- 弹出窗口有自己的画布；移动 tab 到弹出窗口保留参考内容，关闭窗口释放其几何状态和事件。
- 所有 Pin **仅存在于本次插件会话**。禁用、重载插件或重启 Obsidian 都会清空；“跨笔记保留”不表示跨重启保存。
- 图片重命名会跟随；图片缺失或解码失败显示路径和 Retry，重新创建原路径后自动尝试恢复。

只支持当前 Vault 内的 **PNG / JPG / JPEG / WEBP / SVG**。不支持远程图片、Excalidraw 原生嵌入、PDF、批注、图片内部 Zoom/Pan 或移动端。

## 安装或升级

解压 `dist/reference-shelf-0.2.0.zip`，将 `reference-shelf/` 文件夹放入目标 Vault 的 `.obsidian/plugins/`，然后启用 **Reference Shelf**。

升级时先禁用旧版，替换 `main.js`、`manifest.json`、`styles.css`，再启用。安装包另含 LICENSE。无需迁移笔记或附件；v0.1 的旧 shelf-height 设置不再使用，已有 `data.json` 可以保留，插件不会覆盖或读取其中的旧布局。

## 开发与验证

Node.js 22+：

```bash
npm ci
npm run check       # 纯状态/解析单测 + strict TypeScript + esbuild
npm run dev         # 监听构建
npm run test:live   # 隔离的真实 Obsidian 宿主验收
npm run package     # 构建、ZIP 解压逐字节核对、SHA256SUMS
```

宿主测试通过 `scripts/live-setup.mjs` 创建临时 Vault 和独立 profile，只使用合成笔记和图片，不读取个人笔记、不修改个人 Vault 或系统安装。默认使用本机已安装的 Obsidian 1.13.7 archive；可通过 `OBSIDIAN_EXECUTABLE` 和 `OBSIDIAN_ASAR` 指定其他安装。路径不存在时直接失败，不静默下载。

覆盖内容：

- 一张 A/B 组合图裁成两张参考图，分别摆在左右，以可读字号对照完整高度的正文。
- 正文尺寸不变、独立滚动、空白处滚轮和选字、主动重叠、移动、缩放、收起、快捷键隐藏和恢复。
- 裁切调整、取消、查看全图、恢复、复制、移除；源图和 Markdown SHA-256 不变，无裁图文件生成。
- 同笔记多 tab、独立位置和收起、跨笔记保留、关闭源 tab、非 Markdown 页面、真实弹出窗口及关闭清理。
- Reading View 与 Live Preview 的右键和原生拖放，不向编辑器插入多余图片链接。
- 图片缺失、重新创建、重命名；PNG/JPG/JPEG/WEBP/SVG、4K 和极窄长图。
- 明暗主题、窗口缩小、全宽非居中文本、禁用和 workspace reload。

运行记录与截图写入忽略的 `test-results/`。功能验收与阅读体验验收分开：按钮能用不代表图文对照方便。性能帧率、第三方主题及 Windows/Linux 仍需独立测量，不将本机结果泛化为全平台兼容。

## 代码结构

- `src/state.ts`：多 Pin、归属、裁切、按 tab / window 分离的几何状态与边界约束。
- `src/image-adapter.ts`：本地资源解析；保留 `ReferenceAdapter` 扩展接口。
- `src/reference-canvas.ts`：每个窗口一个透明参考层、落点预览和显示切换。
- `src/pin-card.ts`：参考图渲染、移动缩放、工具栏和错误恢复。
- `src/crop-editor.ts`、`src/image-preview.ts`：非破坏性裁切与临时完整原图预览。
- `src/main.ts`：Obsidian 生命周期、窗口、tab、右键和拖放协调。

运行时没有网络请求、遥测、AI 调用、图片上传、账号或外部服务。SVG 作为图片资源加载，不注入 SVG markup。支持图片使用插件自己的右键菜单，另提供在新 tab 打开原图；其他位置保留 Obsidian 原有菜单。私人 PRD 和截图不纳入仓库。

License: MIT。参见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [CHANGELOG.md](CHANGELOG.md)。
