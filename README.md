# Reference Shelf

**Keep context in sight.** 在 Obsidian 长笔记上方固定一张参考图，下面继续阅读和编辑。图片留在原文，插件不改 Markdown。

## 当前状态

v0.1.0 本地可用版。已构建安装包，并在隔离的 **macOS / Obsidian 1.13.7** 测试仓库中运行真实 UI 自动化；不是浏览器仿制界面。尚未发布 GitHub Release 或上架 Obsidian 社区插件市场。

最低声明版本为 Obsidian Desktop 1.13.0；实际验证版本为 1.13.7。Windows、Linux、第三方主题与更旧版本不在已验证范围。

## 使用

1. 在 **Reading View 或 Live Preview** 中右键本地图片，选 **Pin to Reference Shelf**；也可以将图片拖到该笔记顶部出现的 **Pin as Reference** 区域。
2. 图固定在正文上方，默认完整 Fit / contain。拖动分隔线调高度；聚焦分隔线后可以按 ↑ / ↓ 微调、Home / End 调到边界。
3. 用工具栏收起、展开或 Unpin。再次 Pin 图片直接替换当前图。Fit 按钮会展开并保持完整图像显示，不提供 Zoom/Pan。
4. 缺失或损坏的图片显示路径及 Retry；也可以直接关闭。图片重新创建后会重试，文件重命名会跟随。

只支持当前 Vault 内的 **PNG / JPG / JPEG / WEBP / SVG**，不加载远程图片，不支持 Excalidraw 原生嵌入。

## Pin 与 tab 的规则

- **按笔记共享 Reference**：同一篇笔记打开多个 tab，Pin / Replace / Unpin 同步。
- **按 tab 保存显示状态**：高度和展开／收起各自独立。
- 切换活动 tab 不清空 Pin；隐藏 tab 的 Shelf 不占其他 tab 的空间。
- 拖动 tab 到另一分栏时保留配对。关闭其中一个 tab 不清空；最后一个对应 tab 关闭后释放。
- 同一 leaf 从 A 导航到 B，意味着这个 leaf 不再打开 A；若其他 leaf 仍打开 A，A 的 Pin 保留，否则释放。历史记录不计作打开的 tab。
- 活动 Reference 仅存在于当前插件会话；禁用、重载插件或重启会清空。`data.json` 只保存最近一次手动调整的高度。
- 默认高度为可用区域的 32%；通常限制在 180px–70%。小窗口优先遵守 70% 上限，允许低于 180px。

## 安装本地构建

解压 `dist/reference-shelf-0.1.0.zip`，将整个 `reference-shelf/` 文件夹放进目标 Vault 的 `.obsidian/plugins/`，然后在 Obsidian 社区插件设置中启用 **Reference Shelf**。压缩包含 `main.js`、`manifest.json`、`styles.css` 和 LICENSE。

升级时替换上述插件文件即可；不要覆盖已有 `data.json`。移除插件前先禁用，正文和附件无需任何迁移。

## 开发与验证

Node.js 22+：

```bash
npm ci
npm run check       # 状态/解析单测 + strict TypeScript + esbuild
npm run dev         # 监听构建
npm run test:live   # 隔离的真实 Obsidian 自动化；默认使用 macOS 安装
npm run package     # 构建、生成 ZIP、解压逐字节校验、SHA256SUMS
```

真实 UI 测试通过 `scripts/live-setup.mjs` 创建临时 Vault 和独立 app profile，加载**已经安装**的 Obsidian app archive。不会复制或读写个人笔记，不会修改系统 Obsidian 安装。`OBSIDIAN_EXECUTABLE` 和 `OBSIDIAN_ASAR` 可指定其他安装路径；默认 archive 是本机已验证的 1.13.7，路径不存在时测试会直接失败，不会静默下载。

覆盖：右键与真实鼠标拖拽、Reading / Live Preview、独立滚动、Resize / Collapse、同笔记多 tab、跨分栏移动、最后 tab 关闭、文件重命名和缺失、各图片格式、4K／长图、明暗主题、禁用清理、workspace reload、Markdown SHA-256 不变。

运行证据写入忽略的 `test-results/`。没有把构建成功当作宿主兼容性证明；性能的 60fps / 300ms 目标、第三方主题和 Windows/Linux 仍需独立测量与验收。

## 代码结构与布局取舍

- `src/state.ts`：纯状态模型，按笔记共享 Pin，按 leaf 保留高度和收起状态。
- `src/image-adapter.ts`：Vault 文件解析与图片资源，保留 `ReferenceAdapter` 扩展接口。
- `src/shelf.ts`：Shelf UI、完整图片渲染、错误状态、尺寸和布局适配。
- `src/main.ts`：Obsidian 事件、tab 生命周期、右键、拖拽和清理。

Shelf 是 MarkdownView 的公开 `contentEl` 前方的独立 sibling，使用正常 flex 布局。**不包裹、不替换、不移动核心编辑器，也不以 overlay 遮挡正文。** 卸载时移除插件自己的节点、class、事件和 observer。

没有采用额外 workspace split：额外 leaf 属于独立 tab group，无法直接表达“每个源 tab 自带顶部栏”，需要同步维护第二套 tab、切换、移动和收起关系。当前实现将有限的 DOM 布局耦合集中在一个类，随原 tab 自然移动；真实宿主中已验证配对与卸载。仍然需要对 Obsidian 的布局变更和特殊主题做兼容回归。

## 隐私与边界

运行时无网络请求、遥测、AI 调用或图片上传；没有远程服务和账户。Pin / Resize / Replace / Collapse / Unpin 不修改 Markdown 或 frontmatter，不移动、删除或隐藏原图。原始 PRD 含私人截图，不纳入仓库。

v0.1 不包含 Zoom/Pan、远程图片、Excalidraw、PDF、批注、Reference History、跨重启恢复或移动端。支持的图片上会显示插件自有右键菜单，包含 Pin 和在新 tab 打开图片；其他位置保留 Obsidian 原有菜单。

License: MIT。贡献说明见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。
