# 发布与分支迁移

## 目前状态与待决策

起始远端为 main/private，基线 `e056eb1756f0748dd4b1f8c2ed7c28a06778dd39`。用户现已明确批准 MIT 与 main → master/default 迁移。已加入 MIT LICENSE 和一致元数据，从 main 的同一提交创建 master，保留 main 与完整历史，draft PR #1 已改以 master 为目标。默认分支更新尚需父线程协助：本环境没有仓库设置 API，gh 只读 API 返回 Forbidden；所需操作为 PATCH 仓库设置的 `default_branch=master`，尚未执行该写入。

工作流严格以 master 为发布来源，不自动回退 main。本次不改 private 可见性、不删除分支、不 merge、不创建正式标签或 Release。

没有 Developer ID / 公证或 Windows 发布者签名，故自动 Release 固定 `prerelease: true`，标题明确 unsigned preview。普通 `vX.Y.Z` 标签用于跨 Tauri/Windows 安装器的一致版本；稳定版和预览通道不混称。未来正式稳定分发需要维护者另行批准签名/验收方案并审查修改工作流。

## main → master 迁移与后续

1. **已完成**：从 main 的准确 e056eb1 创建 master，保留 main；draft PR #1 base 改为 master。两分支历史一致，无强推或丢弃提交。
2. **已批准、待工具执行**：将默认分支设置为 master。需有仓库管理权限的 PATCH /repos/duanzheng/patent-quick-search，仅更新 `default_branch`；创建分支不等于默认分支已更新。
3. PR 审核合并仍未授权；待维护者另行审查合并后，验证 master 上准确 SHA 的 CI。当前工程化与 MIT 变更位于 PR 工作分支，不把它们说成已进入 master。
4. 维护者按需配置保护默认分支、必须审查/通过 CI、禁止强推/删除，以及 v* 标签 ruleset；本次未修改保护规则。
5. 协作者获取 master 并更新本地跟踪。保留 main；删除旧分支和公开仓库是独立决定。CI 兼容 main/master push 与所有 PR。

若维护者选择继续使用 main，应在另一个明确批准的 PR 将发布目标改成 main，并同步守卫、测试和文档；不能静默用 main 代替用户要求。

## 发布前清单

- 项目 LICENSE 与 SPDX 元数据已明确；许可证清单随锁文件刷新，审查第三方 LICENSE / NOTICE 和安装器打包内容。
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
| 完整版本 | `build-manifest.json`、`SHA256SUMS` |

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
