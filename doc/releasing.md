# 发布与分支迁移

## 目前状态与待决策

默认分支为 master，原 main 与完整历史保留，仓库为 private。源码采用 MIT。普通 CI 仅测试/类型/lint/必要编译/安全检查；只有 master 归属的版本标签进入生产打包和发布。首版按当前一致元数据准备，实际已发布版本以 GitHub Releases 为准。

`THIRD_PARTY_NOTICES.txt` 包含发布目标依赖的完整条款、原始版权/NOTICE、精确版本源码链接及 MPL 源码获取说明。`legal/notice-manifest.json` 校验其覆盖与锁文件/全文哈希。LICENSE 与第三方全文同时作为应用资源和下载附件；缺失或篡改使质量/发布守卫失败。

没有 Developer ID / 公证或 Windows 发布者签名，故自动 Release 固定 `prerelease: true`，标题明确 unsigned preview。普通 `vX.Y.Z` 标签用于跨 Tauri/Windows 安装器的一致版本；稳定版和预览通道不混称。未来正式稳定分发需要维护者另行批准签名/验收方案并审查修改工作流。

## 分支维护

master 已从原 main 的 e056eb1 创建并设为默认分支，main 保留；未强推或丢弃历史。新 PR 以 master 为目标。维护者按需配置 PR 审查、必要检查、禁止强推/删除及 v* 标签规则，本次不扩大仓库可见性或删除分支。

## 发布前清单

- 项目 LICENSE 与 SPDX 元数据已明确；许可证清单随锁文件刷新，第三方 LICENSE / NOTICE 快照与锁文件一致，并校验应用资源打包内容。
- master 的待发布提交已审查，所有检查通过；更改版本时同步 package.json、package-lock 根/包根、Cargo.toml、Cargo.lock 根包与 tauri.conf.json。
- `npm run check`、原生测试/构建、依赖审计通过；签名、macOS 13/Intel、Windows 11、WebView2、托盘/热键/凭据、清洁安装/卸载的未验证项如实列出。
- 自动预览无签名凭据。不得在 repo、Actions、输出或截图中放入用户 API Key。无自动付费服务测试。
- 更新 CHANGELOG 与 release notes。版本仅接受无前缀零的 `X.Y.Z`，对应唯一 `vX.Y.Z` 标签，不能覆盖旧版本。

获得发布授权后，发布负责人在 master 的准确已验证提交上创建并 push 版本标签；本文不提供自动执行或批量打标签脚本。标签本身没有“所在分支”的属性，因此工作流重新获取**远端准确 master 与 tag**，校验 tag 解析的 commit 等于事件 SHA/checkout SHA，并是 origin/master 的祖先。仅标签名或 `target_commitish` 不能代替该检查。

## 工作流与产物

1. `guard`：严格版本、标签/事件/checkout 一致、远端 master 归属、明确 LICENSE。任何失败不创建 Release。
2. `quality`：复用轻量 CI，仅测试、类型、lint、必要 Rust 编译与安全检查；不打包、不上传安装器，无需 secrets。PR / 构建 jobs 仅 `contents: read`，checkout 不保留 git 凭据；Actions 固定完整 SHA。
3. **仅通过守卫的版本 tag** 才进入发布专用 `bundle` job。三个独立 runner 构建目标：macos-14 生成 Apple Silicon DMG，macos-15-intel 原生生成 Intel DMG，windows-2022 生成 x64 NSIS / MSI。显式 Cargo `--locked`、固定 Node/Rust；macOS ad-hoc、未公证，Windows 未签名。
4. 发布工作流上传每个平台**指定后缀的唯一安装器**与 manifest 为临时 Actions artifact（保留 7 天），仅供最终发布组装。Windows 检查应用 PE32+ x64 GUI 头；macOS `hdiutil verify` 检查 DMG 容器，二者都不是运行验收。同 run 重跑允许覆盖临时 artifact，不覆盖 GitHub Release。普通 PR / push CI 不运行此矩阵或完整安装包汇总 job。
5. 全部完成后，独立 `publish` job 获 `contents: write`，下载本次 run 的三份 artifact，验证目标数、源码 SHA/版本、文件清单、大小、哈希与签名声明。拒绝缺失、额外文件与篡改。
6. 再次获取远端 tag/master 并复查。创建 draft，上传**全部**附件，最后一步才公开 prerelease、`latest=false`。已有 release/draft 不覆盖；任何上传失败留 draft，不公开残缺正式版本。

产物（名称固定，中文产品名不影响下载资产标识）：

| 目标 | 公开附件 |
|---|---|
| aarch64-apple-darwin | `patent-quick-search_X.Y.Z_aarch64-apple-darwin.dmg` |
| x86_64-apple-darwin | `patent-quick-search_X.Y.Z_x86_64-apple-darwin.dmg` |
| x86_64-pc-windows-msvc | `patent-quick-search_X.Y.Z_x86_64-pc-windows-msvc.exe`、同名 `.msi` |
| 完整版本 | `LICENSE`、`THIRD_PARTY_NOTICES.txt`、`build-manifest.json`、`SHA256SUMS` |

构建清单写明源码提交、架构、文件大小/哈希、未签名/未公证边界、`runtimeVerified=false`。它不是可重复二进制位完全一致的承诺：runner 镜像、编译器外部 SDK、NSIS/WiX/WebView bootstrapper 仍会更新；固定源码与依赖只提供可重跑检查与可追踪产物。

## 失败与恢复

- 质量/构建失败：不创建 Release，修复后按新提交/版本重新准备。临时 artifacts 仅在成功的平台存在，不能手工拼接旧 run 当完整版本。
- 上传失败：保留私有 draft 供维护者检查，不能标为发布成功。重跑将因已存在 draft 而停止，避免覆盖；维护者核对 tag/SHA、附件完整性后，另行决定删除该失败 draft 后重跑，或使用新版本。不得擅自删除、移动 tag 或改写公开 release。
- 发布请求结果不确定：先查看 GitHub release 状态与附件，再决定是否操作；不能直接重复写操作。
- 取消发布：并发相同 tag 串行且不自动取消在途上传，避免流程主动制造半成品。
- API token 没有 workflow 写入权限、Actions 未启用、私有仓库配额/付费额度不足、平台下载失败时，记录准确 run 与错误；不要把本地静态检查称为已运行 CI。

## 正式签名的后续门槛

由有权限负责人决定提供现有身份或其他分发方案；不自动购买账号、生成或配置持久凭据。macOS 按官方流程 Developer ID 签名、公证并 stapling/验证，Windows 使用发布者证书或批准的签名服务。敏感身份放受保护 Environment，仅经过审查的标签 job 可用，PR 永不继承；在最终下载的包上验签并在清洁机器安装/卸载，才考虑取消 prerelease。禁止要求用户关闭系统防护。

## 官方依据（2026-10-23 核对）

- [Tauri GitHub 分发](https://v2.tauri.app/distribute/pipelines/github/)：平台构建与 macOS ad-hoc 提示；本项目使用 CLI 和独立 draft 发布，避免矩阵单任务提前公开残缺 release。
- [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)、[Windows 安装器](https://v2.tauri.app/distribute/windows-installer/)、[macOS 签名/公证](https://v2.tauri.app/distribute/sign/macos/)。
- [GitHub runner 支持](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[runner 镜像清单](https://github.com/actions/runner-images)：macos-14 为 arm64，Intel 使用 macos-15-intel 原生构建；windows-2022 为 x64 Server，不替代 Windows 11 运行验收。
- [Actions 安全参考](https://docs.github.com/en/actions/reference/security/secure-use)、[Release REST API](https://docs.github.com/en/rest/releases/releases)：最小权限、固定 action SHA、先 draft 后公开。
