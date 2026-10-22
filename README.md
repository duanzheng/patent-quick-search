# 技术点快搜 · Tauri 2

复制一个公开技术点，搜索相关专利与技术资料。真实桌面客户端：React/TypeScript 前端，Rust 调用 DeepSeek Search、Fetch、余额 API，系统 Keychain / Credential Manager 保存用户自己的密钥。没有内置密钥或演示结果。

## 本地开发

需要 Node.js 22.12+、Rust≥1.90（本轮验证1.99.1）、平台原生工具链（macOS Xcode；Windows MSVC 与 WebView2）。

```sh
npm ci --registry=https://registry.npmjs.org
npm run tauri dev
```

仅 `npm run dev` 是浏览器前端，不能使用系统凭据和 API，不作为原生应用验收。启动后进入设置输入自己的 DeepSeek API Key；保存不会联网。主动搜索前确认服务说明，余额仅主动查看/刷新时获取。

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

密钥只在系统凭据中保存，前端只持有用户正在填写的新密钥；Rust 只访问固定官方 API。历史存于系统应用数据目录 `com.patentquicksearch.desktop/state-v1.json`，指标另存同目录 `metrics-v1.jsonl`，均不含密钥或余额。余额仅当前进程内存保存。历史开关控制新任务持久化；设置可清除历史/正文缓存，指标由用户主动选择位置导出。

关闭窗口会收起到菜单栏/托盘，菜单“退出”或 macOS Command+Q 真正退出；退出取消所有请求。全局快捷键 Mac 默认 Option+Command+Space、Windows 默认 Ctrl+Alt+Space，可从设置更改。只在用户提交后联网，唤起不读取剪贴板。

## 构建与发布边界

当前进行本地开发测试，源码提交和推送按用户明确授权执行；不部署、不发布 Release 或安装包。macOS 可通过 `npm run tauri build -- --bundles app` 构建本机架构 .app；正式 Intel / arm64 / Universal、DMG、签名与公证须在分发前完成验证。Windows x64 安装包应在 Windows MSVC 环境构建和验收；WebView2 配置为官方 bootstrapper。未签名开发构建不能视作可分发安装包，不要求用户关闭系统防护。

原始 [PRD](doc/PRD.md) 与 [验收清单](doc/acceptance-checklist.md) 是范围依据。离线测试中的合成响应只验证协议和状态，不代表真实接口与产品价值通过。

## 本地安装与移除

开发 DMG 中提供 `.app` 与 Applications 链接；当前未完成正式签名/公证或清洁安装验收，先按报告所列边界使用本地开发包。正式 macOS 包验收时需拖入 Applications、启动验证后移到废纸篓确认卸载。移除应用前可在应用设置中删除 API Key、清空历史，避免系统凭据和本地数据被遗留。仅删除 `.app` 不等于自动删除 Keychain 数据。不要关闭系统防护来运行开发包。

Windows 后续在 Windows 11 x64/MSVC 构建 NSIS/MSI 后，须验证安装引导与 WebView2、托盘、卸载；本次没有对应安装包与运行证据。

Windows 本地检查和构建可参考 [build-windows.ps1](scripts/build-windows.ps1)，需在 Windows MSVC 环境执行；本次未运行。

## 本轮最终验证记录

两处状态补丁已合入。当前60项限定自动化检查通过（前端37、Rust23），两种Mac架构开发包与DMG已更新。详情见 [当前开发状态](doc/development-status.md)、[64项逐项验收证据](doc/acceptance-results.md) 及 [Windows/签名公证范围](doc/release-readiness.md)。

真实Mac重启保留配置、Search和余额已局部通过；4个Fetch返回404，正文成功仍未验证。由实际结果修复公开号识别及失败文案后已更新包；最终包窗口控制超时，用户正在自行处理系统提示。快捷键/托盘和完整跨平台链路仍未验收；详见[原生续记](doc/native-validation-2026-10-22.md)。Key只在应用内填写，不要发到聊天。Windows安装包和相应目标系统记录仍缺失。开发包没有正式签名公证，不能视作发行验收通过。

Windows环境准备与可复现命令见 [Windows兼容性核查](doc/windows-readiness.md) 和 [原生验收记录模板](doc/windows-acceptance-record-template.md)。可先执行 `./scripts/build-windows.ps1 -PreflightOnly`；默认构建NSIS，MSI显式可选。脚本不安装系统工具或创建环境，当前未在Windows执行。

Fetch404的路径、结构、原始URL和正文成功处理审计见[独立诊断](doc/fetch-404-diagnosis.md)；本轮未新增真实API请求，Fetch成功仍未验证。

## 源码上传范围

源码仓库包含产品代码、必要图标/配置、锁文件、离线测试、Windows构建脚本及项目文档。`node_modules`、`dist`、Rust `target`、开发DMG/安装器、凭据和本地用户数据不入库。原始测试/构建日志、机器产物清单和真实调用轨迹只保留在本机；见[证据目录说明](doc/evidence/README.md)。项目报告中的本地证据链接在克隆后可能不存在，可按上述命令复现检查；这不代表未验证的验收项已通过。
