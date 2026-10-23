# 依赖、安全与许可证审计

日期：2026-10-23。范围为当前源码及锁文件，不调用真实 API，不读取用户凭据。项目自身许可证仍待维护者决定，见[许可决策](licensing.md)。

## 已执行与修复

- 从干净依赖安装发现 package-lock 中 12 个公司内网 HTTP registry URL，外部环境返回 403。改为 npm 官方 HTTPS，原版本/完整性哈希不变。
- npm 全量审计（含开发依赖）最初报告 4 个受影响包：Happy DOM 高危、Vitest / Tinypool 严重、Vitest mocker 中危。升级 Happy DOM 至锁定 20.14.6、Vitest 至 4.1.12 及其受支持传递依赖，重跑审计为 **0 漏洞**。仅调整测试 mock 泛型以适配新的 Vitest 类型，不改产品行为。
- `cargo-audit 0.22.2` 最初发现 `tokio 1.54.0` 的 `RUSTSEC-2026-0384`，该版本亦已撤回。只将锁定 Tokio 更新至 1.54.1，不批量刷新无关 Rust 依赖。
- Rust 的已知上游警告另行保留，不能写成“全部依赖无风险”：`proc-macro-error 1.0.4` 未维护（RUSTSEC-2024-0370）；Linux GTK 依赖 `glib 0.18.5` 有 unsound 警告（RUSTSEC-2024-0429，修复线 >=0.20，不能单独跨主版本替换 Tauri 依赖）。目标发行仅 macOS/Windows，不发布 Linux 包，但仍记录依赖图中的此项。没有添加全局忽略，也没有伪称修复上游 GTK。

审计依据为 npm / RustSec 当时数据库，不保证发现未知漏洞。默认 CI 执行 npm `--audit-level=high` 与 Cargo audit，真实漏洞使检查失败；Cargo 的 informational 警告仍需维护者审阅，不应把退出 0 解读为无警告。Dependabot 每周检查 npm、Cargo、Actions，保持 PR 审查与无自动合并。

## 可重复命令

```sh
npm ci
npm audit --audit-level=high
cargo install cargo-audit --version 0.22.2 --locked
cargo audit --file src-tauri/Cargo.lock
npm run audit:licenses
npm run check:repository
```

许可证清单生成需 Node、Cargo、curl 与公开网络；支持代理环境，不连接公司私有 registry。Cargo metadata 只解析/获取依赖元数据，不构建 GUI。

## 许可证元数据清单

[dependency-inventory.json](dependency-inventory.json)列出所有 npm 锁定条目（包括可选平台包与开发工具）、Cargo resolved packages、版本与声明许可证，不保存机器路径或环境。锁文件 SHA-256 由仓库检查验证；依赖变动必须重新生成清单，防止审计说明悄然落后。

当前清单约 277 个 npm 条目、472 个 Rust 包（更新后以文件为准），均有上游声明的许可证。这个数量包含不同平台和构建期依赖，不等于实际安装器中的运行时代码数量。

主要为 MIT / Apache-2.0 / BSD / ISC / Zlib 等宽松许可证；还包含 MPL-2.0 文件级义务、Unicode-3.0 数据许可、CDLA-Permissive-2.0 证书数据与带 LLVM exception 的 Apache 条款。少数 Rust 包提供 MIT/Apache/LGPL 多选，不能把多选表达式误判为整个应用必须使用 LGPL。系统 WebKit/GTK 与 Windows WebView2、外部 SDK / 安装工具不在 Cargo/npm 清单内，其分发条件须另核对。

该清单是元数据审计，**不是法律意见，也不是已完成的第三方许可证全文/NOTICE 包**。在选择项目许可证、允许自动发行前，维护者须确认图标/文档/既有贡献来源、选定各多许可选项、按实际目标收集版权/许可证/NOTICE，并确保安装包和附件包含所需声明。无项目许可证时 release 守卫拒绝发行，不能以“构建通过”绕过这一步。

## 范围边界

CI 的临时 runner 只安装公开锁定依赖，不包含 Key、用户历史、真实查询或余额。产物 allowlist 不上传依赖目录、target 全目录、源日志或截图；artifact manifest 和校验和用于完整性与来源追踪，不是签名或供应链安全证明。GitHub Actions 使用上游核实的完整提交 SHA，见工作流与[发布指南](releasing.md)。
