# 技术点快搜 · Tauri 2

复制一个公开技术点，搜索相关专利与技术资料。真实桌面客户端：React/TypeScript 前端，Rust 调用 DeepSeek Search、余额 API；详情由默认浏览器打开原始来源，不再调用Fetch，按用户确认将 Key 明文保存在本机应用配置，启动自动加载。生产应用没有内置密钥或演示结果。

## 本地开发

需要 Node.js 22.12+、Rust≥1.90（本轮验证1.99.1）、平台原生工具链（macOS Xcode；Windows MSVC 与 WebView2）。

```sh
npm ci --registry=https://registry.npmjs.org
npm run tauri dev
```

仅 `npm run dev` 是浏览器前端，不能使用原生配置和 API，不作为原生应用验收。启动后进入设置输入自己的 DeepSeek API Key；保存不会联网。主动搜索前确认服务说明，余额仅主动查看/刷新时获取。

```sh
npm run lint
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run tauri build
```

本机隔离 Rust 的环境变量和最终构建结果见 [开发与验收报告](doc/development-status.md)。`Cargo.lock` 与 `package-lock.json` 应随源码保留。

## 数据与安全

Key 以明文保存在用户级应用配置 `private/credentials-v1.json`，不入仓库。任何能读取该文件的程序都能取得 Key；Unix 新文件0600、目录0700。启动加载到 Rust 内存，余额和检索共用，不再访问钥匙串。前端只持有正在填写的新 Key，关闭设置后清空。旧钥匙串条目不读取、不迁移、不删除，新版首次需手动再填一次。Rust 只访问固定官方 API。历史存于系统应用数据目录 `com.patentquicksearch.desktop/state-v1.json`，指标另存同目录 `metrics-v1.jsonl`，均不含密钥或余额。余额仅当前进程内存保存。历史开关控制新任务持久化；设置可清空历史，指标由用户主动选择位置导出。

关闭窗口会收起到菜单栏/托盘，菜单“退出”或 macOS Command+Q 真正退出；退出取消所有请求。全局快捷键 Mac 默认 Option+Command+Space、Windows 默认 Ctrl+Alt+Space，可从设置更改。只在用户提交后联网，唤起不读取剪贴板。

## 构建与发布边界

当前进行本地开发测试，源码提交和推送按用户明确授权执行；不部署、不发布 Release 或安装包。macOS 可通过 `npm run tauri build -- --bundles app` 构建本机架构 .app；正式 Intel / arm64 / Universal、DMG、签名与公证须在分发前完成验证。Windows x64 安装包应在 Windows MSVC 环境构建和验收；WebView2 配置为官方 bootstrapper。未签名开发构建不能视作可分发安装包，不要求用户关闭系统防护。

原始 [PRD](doc/PRD.md) 与 [验收清单](doc/acceptance-checklist.md) 是范围依据。离线测试中的合成响应只验证协议和状态，不代表真实接口与产品价值通过。

## 本地安装与移除

开发 DMG 中提供 `.app` 与 Applications 链接；当前未完成正式签名/公证或清洁安装验收，先按报告所列边界使用本地开发包。正式 macOS 包验收时需拖入 Applications、启动验证后移到废纸篓确认卸载。移除应用前可在设置清除本地 API Key、清空历史。仅删除 `.app` 不会删除用户配置或以前的钥匙串条目；应用不管理旧钥匙串条目。不要关闭系统防护来运行开发包。

Windows 后续在 Windows 11 x64/MSVC 构建 NSIS/MSI 后，须验证安装引导与 WebView2、托盘、卸载；本次没有对应安装包与运行证据。

Windows 本地检查和构建可参考 [build-windows.ps1](scripts/build-windows.ps1)，需在 Windows MSVC 环境执行；本次未运行。

## 当前验证记录

最新[托盘/帮助/快捷键录制](doc/shortcut-recorder-update.md)：76前端/43Rust及静态检查通过，两Mac普通app与开发DMG已更新；当前缺电脑控制工具，尚未切换运行进程、原生录入唤起或新截图。

最新[高级语法与统一选中交付](doc/syntax-navigation-update.md)：问号按需帮助、搜索框直接语法输入；鼠标点击行选中后可继续上下键，普通行点击不打开来源。61前端/36Rust及原生公开历史交互回归通过；未新增真实API查询。

最新[滚动显示交付](doc/scroll-results-update.md)：接近底部自动按5条显示已收到候选。每条既有查询count=50，仅专利≤50/混合≤100（去重后可更少），不是服务端下一页；不增加分页请求。高级语法现已可直接输入，问号按需显示用法；显式站点优先于范围默认值，详见[语法说明](doc/search-syntax-audit.md)。

当前为Search-only版本：没有自动/手动Fetch、内置正文阅读或正文缓存配置。结果只显示真实Search返回标题/摘要/来源，标题与“打开原网页”直接交给默认浏览器。历史和单一设置入口保留。最新[PRD](doc/PRD.md)、[验收清单](doc/acceptance-checklist.md)及[交付记录](doc/source-opening-update.md)已同步；变更前完整文档归档，旧正文故障不再是新版未完成门槛。

前端76项、Rust43项及lint/类型/clippy通过；两种Mac debug应用和DMG已更新。新版普通arm64应用真实恢复公开历史、打开默认Chrome的W3C原页面（fragment保留），本轮API增量Search0、Fetch0；R17–R19无效输入、复制、设置/历史返回焦点、Escape/CommandW/reopen通过。截图没有QA控件。

当前普通包为 `src-tauri/target/debug/bundle/macos/技术点快搜.app`。此前`home-hierarchy-ready`和`settings-icon-ready`是旧版暂存，不能用于新行为验收。新版本不新增真实Search请求，本轮复用旧公开历史；独立[旧版检索评测](doc/retrieval-evaluation-2026-10-22.md)的搜索质量结论保持原边界。

全局热键注入未取得shortcut处理器证据，托盘端到端未实测；Windows安装/运行、Intel/macOS13设备运行、正式签名公证及长期产品价值仍需验证。开发包不能当正式分发包。

## 源码上传范围

源码仓库包含产品代码、必要图标/配置、锁文件、离线测试、Windows构建脚本及项目文档。`node_modules`、`dist`、Rust `target`、开发DMG/安装器、凭据和本地用户数据不入库。原始测试/构建日志、机器产物清单和真实调用轨迹只保留在本机；见[证据目录说明](doc/evidence/README.md)。项目报告中的本地证据链接在克隆后可能不存在，可按上述命令复现检查；这不代表未验证的验收项已通过。
