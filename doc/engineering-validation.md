# 工程化验证记录

日期：2026-10-23。源码从 `e056eb1756f0748dd4b1f8c2ed7c28a06778dd39` 开始，云端 `/workspace/patent-quick-search`；未访问用户 Mac 或真实 API Key。未发现适用的 AGENTS.md 或 `.agents/skills` 指引。

## 本地检查

| 检查 | 实际结果 |
|---|---|
| checkout / 远端 | 基线 e056eb1，main/private，无 master；工作区最初干净 |
| npm ci | 修复 12 个内网 HTTP registry 地址后从公开 npm 安装成功 |
| npm run check | 通过：仓库一致性、lint、类型、76 Vitest、10 Node 发布工具测试、Vite 生产构建 |
| npm audit（包含开发依赖） | 0 漏洞；修复了原有 4 个受影响包 |
| Rust 1.90.0 fmt | 通过 |
| cargo-audit 0.22.2 | Tokio 升至 1.54.1 后 0 漏洞，保留 proc-macro-error / Linux glib 两项 informational 警告 |
| actionlint 1.7.11 | 通过；二进制 SHA-256 与官方 checksums 匹配 |
| git diff --check / 新文档相对链接 | 通过 |
| Cargo metadata / 许可证元数据 | 277 npm 锁条目、472 Rust 包，均有声明；锁文件哈希一致 |
| Linux cargo test / Tauri 生产构建 | 已执行但失败：缺 glib-2.0.pc、GTK / WebKit 平台开发库；不算 Rust 测试通过 |

本地使用 Node 24.19.0 / npm 11.9.0；CI 固定 Node 22.22.2。Rust 工具链与审计工具装在 `/tmp`，未配置持久凭据。原始命令输出在云端 `/tmp/patent-*.log`，不提交机器日志，也不将它们视为跨机器持久证据。

## GitHub 验证

[draft PR #1](https://github.com/duanzheng/patent-quick-search/pull/1)，最初基线 main，获批迁移后改为 master；工作分支 `chore/open-source-ci-release`；未 merge。

早期 [run 39885562510](https://github.com/duanzheng/patent-quick-search/actions/runs/39885562510) 暴露 actionlint 安装器不支持该工具，已修复为固定版本与 SHA-256 的官方二进制。中间实验曾在普通 CI 打包并得到 Apple Silicon DMG 与 43 项 Rust 测试结果；用户随后明确要求普通 CI 只检查、仅 master 版本 tag 构建生产包，因此已移除普通 CI 的打包矩阵、安装器上传及完整包汇总 job。旧重型 run 被新提交的并发策略取消，不作为最终轻量 CI 的通过证据。

最终工作流：普通 PR / main/master push 执行前端测试、类型、lint、版本/许可证元数据、Rust fmt/clippy/test、Windows 必要编译检查及安全审计，不构建安装器；只有通过 master 归属守卫的版本 tag 才执行三平台生产 bundle、完整性校验与 Release。准确最终 head / run 状态见 draft PR #1 最新检查。

## 首版发布准备与验收边界

默认分支现为 master，main 与历史保留。用户已授权合并与首版标签，实际源码提交、标签及发布状态以 PR #1 / GitHub Releases 为准；历史“尚未授权”仅代表先前阶段。首发发现全文许可缺口后，补齐 THIRD_PARTY_NOTICES 与锁文件哈希/覆盖校验，新增缺失/篡改法律附件的发布回归测试。

普通 CI 不生成安装包；tag 发布构建只证明编译、容器/PE 头、法律资源与哈希检查，不证明 Windows 11/macOS 13、中文输入法、托盘/热键、配置 ACL 或清洁安装/卸载。无真实 Key 或付费 API 测试，不扩展检索质量结论；无发布者签名/Apple 公证，自动版本明确 prerelease。
