# 开发与验证

## 基线与工具链

源码基线为 `e056eb1756f0748dd4b1f8c2ed7c28a06778dd39`。云端核对包含快捷键录制、高级语法、Search-only、用户级本地明文凭据存储；没有恢复旧正文功能或默认快捷键。

固定 Node.js 22.22.2（`.nvmrc`）、Rust 1.90.0（`rust-toolchain.toml`，含 rustfmt / clippy）。Cargo manifest 的最低版本为 1.90；当前所有锁定 crate 的声明最低版本均不高于此版本，完整原生编译仍须平台 CI 验证。Node 24 可运行前端检查；不要将更高版本的一次成功视为最低版本测试。

平台系统依赖以 [Tauri 当前前置条件](https://v2.tauri.app/start/prerequisites/)为准：

| 环境 | 构建前置条件 | 项目验收基线 |
|---|---|---|
| macOS | Xcode Command Line Tools、Rust 对应目标 | macOS 13+，Apple Silicon 与 Intel 分别验收 |
| Windows | MSVC C++、Windows SDK，运行时 WebView2 | Windows 11 x64 |
| Linux | GLib/GTK、WebKitGTK 4.1、AppIndicator、librsvg 等开发包 | 仅开发/前端 CI，未承诺产品支持或发行 |

## 常用命令

```sh
pnpm install --frozen-lockfile
pnpm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
pnpm run tauri dev
```

`pnpm run check:ci` 执行仓库版本/公开 registry/依赖清单一致性、lint、类型、Vitest 和 Node 发布工具测试；`pnpm run check` 在此基础上额外执行本地 Vite 构建。普通 CI 不构建或上传生产安装包；macOS 运行 Rust fmt / clippy / test，Windows 仅 cargo check --all-targets。Vitest 覆盖查询、取消/竞态、结果显示/选择、热键、合成 bridge 与 URL 边界；Rust 覆盖原生传输/状态/凭据/存储/热键；发布工具测试覆盖分支归属、版本、许可证、产物缺失/篡改/夹带。它们不需要真实 Key，不发付费 API 请求。

前端本地预览 `pnpm run dev` 没有完整原生 IPC，只用于 UI 开发。实际托盘、热键、中文输入法、浏览器与操作系统权限必须运行桌面应用验证。

## 本地安装器

```sh
# 在 macOS 上，先安装对应 Rust target；分别构建两种架构
pnpm run tauri build --target aarch64-apple-darwin --bundles dmg -- --locked
pnpm run tauri build --target x86_64-apple-darwin --bundles dmg -- --locked

# 在 Windows MSVC 环境
pnpm run tauri build --target x86_64-pc-windows-msvc --bundles nsis,msi -- --locked
node scripts/verify-windows-artifacts.mjs --include-msi
```

仅版本标签发布时，macOS 打包设置临时 `APPLE_SIGNING_IDENTITY=-`，仅 ad-hoc，不做 Developer ID 签名或公证。Windows 不配置发布者签名。安装包位于 `src-tauri/target/<target>/release/bundle/`；不要提交这些文件。Windows 的 `scripts/build-windows.ps1` 是面向已有 Windows 11 开发机的辅助脚本，带系统版本预检；发布工作流直接执行跨 runner 打包命令，因为 GitHub Windows runner 是 Windows Server，不能伪称 Windows 11 用户验收。

## 依赖与安全检查

```sh
pnpm audit --audit-level=high
# 安装固定版本独立审计工具后，不编译产品即可审查 Cargo.lock
cargo install cargo-audit --version 0.22.2 --locked
cargo audit --file src-tauri/Cargo.lock
# 更新锁文件后刷新许可证元数据清单（需要 cargo 与公开 registry 网络）
pnpm run audit:licenses
```

许可证清单只保存包名、版本、许可证表达式和锁文件哈希；不含本机路径、环境或秘密，不代表已满足二进制再分发义务。见[依赖审计](dependency-audit.md)。依赖/Actions 更新由 Dependabot 提出 PR，仍须审查，不启用自动合并。

## 实机验收与记录

使用[当前清单](acceptance-checklist.md)和[Windows 模板](windows-acceptance-record-template.md)。记录源码 SHA、系统/架构、包哈希、签名情况、执行步骤、结果和未验证项。合成测试不代替真实服务质量，打包不代替安装/卸载。默认 CI 不做付费 API 测试；如后续授权人工测试，用户在应用里自行填 Key，仅记录次数/状态/耗时。

不要上传用户状态、真实 Key、搜索内容、余额、截图或整个 target。历史报告的测试计数和绝对 Mac 路径只说明当时的验证，不能复制成当前 CI 证据。

macOS CI also runs `node --test scripts/dmg-native.test.mjs`: a tiny synthetic volume exercises real hdiutil SLA cancellation, acknowledgement, read-only mounting and cleanup. It contains no executable, runs no Tauri production build, and uploads no installer. Non-macOS hosts skip this native test.

## pnpm 与依赖维护

固定使用 `packageManager` 中的 pnpm 10.34.7，与 `.nvmrc` 的 Node 22.22.2 及 Node 24 兼容。安装管理器参见 [官方 pnpm 10 指南](https://pnpm.io/10.x/installation)；已有 Corepack 可先在仓库运行 `corepack pnpm --version` 读取固定版本。日常命令的 `pnpm --version` 应一致。仓库只提交 pnpm-lock.yaml，不重新生成 npm/yarn 锁。

`pnpm-workspace.yaml` 的 `strictDepBuilds` 拒绝未经审查的依赖生命周期脚本；仅允许 `esbuild@0.28.2` 的二进制校验/安装脚本，明确禁止可选 fsevents 的脚本。新增或更新有安装脚本的依赖，先审查其准确版本，再按需修改允许清单；不要开启全局放行。CI 使用 pnpm store 缓存和 frozen-lockfile，不缓存 node_modules、用户数据或 Key。PR 的缓存写入受 GitHub 分支作用域隔离，发布不读取 PR 合并引用的缓存。

升级依赖（包括 Dependabot PR）后先审查版本、许可证与脚本，再运行 `pnpm install --frozen-lockfile`、`pnpm run dependencies:refresh`、`pnpm run check`、`pnpm audit --audit-level=high`。刷新需要 cargo-about 0.9.2、已 fetch 的 Cargo 图与公开 npm 元数据；见 [许可说明](licensing.md)。未知许可证表达式会阻止刷新，须审查后明确更新 `legal/approved-license-expressions.json`。提交锁、库存、全文及 notice manifest，并检查差异；不能把重新生成快照等同于兼容性或法律审查通过。

CI 的前端 job 始终存在。它用 PR 的固定 base/head SHA 或 push 的 before/head SHA 计算变更（包含删除与重命名前路径），原生代码、工作流、scripts 或原生 fixture 变化才启动原生检查；不可解析范围、手动运行及 tag 使用完整检查。跳过的 job 明确显示 skipped，不使用 workflow 顶层 paths 导致必须检查长期 pending；feature push 不另触发同一个 PR 的重复 CI。
