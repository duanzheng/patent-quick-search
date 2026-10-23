# pnpm 迁移验证（2026-10-23）

基于 master `2e0d75a263aa7a6790dff5e04c88667db79954cd`，应用版本仍为 0.1.2；本次不打标签、不创建 Release、不更改用户凭据、快捷键或产品 UI。

## 依赖与许可证

使用官方 `pnpm import` 从原 npm lock 导入并固定 `packageManager: pnpm@10.34.7`，支持仓库 Node 22.22.2 和 Node 24。原 npm lock 的 277 条路径包含 274 个唯一包；这 274 个包的版本全部保留，没有删除或升级既有包。新增 `yaml@2.9.1` 仅用于开发期读取锁文件。pnpm lock 共 275 个唯一包；Cargo lock 和 472 个 Rust 包未变。

原锁留在 Git 历史，当前仅提交 pnpm-lock.yaml。安装固定 public HTTPS registry、frozen-lockfile；strictDepBuilds 拒绝未经审查的安装脚本，仅允许当前 esbuild@0.28.2，明确禁止可选 fsevents 脚本。运行时与保守构建 helper 的完整声明仍为 311 个包、221 份去重文本，THIRD_PARTY_NOTICES.txt 内容未变。

`pnpm run dependencies:refresh` 根据 pnpm package/snapshot 图、实际安装路径及 Cargo 图生成库存和全文快照，检查 peer、可选平台和运行时覆盖。声明中的新许可证表达式需先人工审查，不能自动添加到已审查清单；仍要求完整版权、LICENSE/NOTICE 与准确源码来源。依赖更新 PR 需补充快照后再进行兼容性验证，不能只改哈希绕过门禁。

## CI 与更新节奏

PR 前端检查先执行，再根据固定 SHA 的真实 git diff 决定原生任务。纯前端、依赖锁和文档跳过无关 Mac/Windows Rust 与 Rust 审计；src-tauri、scripts、原生 fixture、工作流变化要求完整检查。删除/重命名计入原路径；无法确认范围、手动运行及版本 tag 一律完整检查。无需 pull_request_target，PR 无写权限或发布密钥，feature push 不重复触发相同 PR CI。

pnpm action 固定官方 v6 提交 `0977fd99725f1db4007ccb2928dbb4e90d06cc86`（Node 24），版本从 packageManager 读取；frontend 与 tag bundle 缓存 pnpm store，安装始终 frozen。普通 CI 无生产包和 installer artifacts；本次只在本地验证 Web 构建。

Dependabot 保留 npm 生态对 pnpm 的支持，普通更新每月、每生态最多 1 个、minor/patch 分组；major 留给人工集中升级。使用官方说明中仅影响 version updates 的 `allow.update-types`，安全更新独立分组，不关闭既有安全设置。旧自动 PR 的处置独立进行，本迁移不合入其 major 升级。

## 已执行与边界

- 从空 node_modules 执行 pnpm frozen 安装成功；离线重复 frozen 安装成功，锁未漂移。
- 完整 `pnpm run dependencies:refresh` 成功，275 / 472 包和 311 个全文声明覆盖通过。
- `pnpm run check`：版本/库存/许可守卫、ESLint、TypeScript、76 个前端测试、25 个工具测试以及 Vite Web 构建通过。真实 DMG 测试在 Linux 本地跳过，云端 macOS CI 执行。
- 新回归覆盖作用域包、peer snapshot、循环及可选运行时图、缺失 integrity/非法来源拒绝；路径选择覆盖纯前端跳过、原生触发、tag 强制、真实 git 删除/重命名及特殊文件名。
- `pnpm audit --audit-level=high`：0 已知漏洞；actionlint 及 diff 空白检查通过。
- Windows 辅助脚本已迁移为固定 pnpm + frozen 安装；CI 只解析其 PowerShell 语法，不运行 Windows 11 安装流程。

PR 的准确 head 与平台 CI 结果以 PR 页面和本次最终交付为准。此报告不声称执行了迁移后的生产安装包构建、设备安装或用户 Mac 同步；原生编译/测试由对应 CI 记录确认。

官方依据：[pnpm 10 安装与兼容](https://pnpm.io/10.x/installation)、[pnpm import](https://pnpm.io/cli/import)、[安装脚本策略](https://pnpm.io/10.x/settings#allowbuilds)、[Dependabot allow.update-types](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#update-types-allow)。
