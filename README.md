# 技术点快搜

一个轻量的 Spotlight 风格桌面检索工具：输入公开技术点、关键词或公开号，发现值得继续阅读的专利与技术资料，在默认浏览器打开原网页。

基于 Tauri 2、React / TypeScript 与 Rust。当前为 `0.1.0` 内测版，目标平台 Windows 11 x64、macOS 13+（Apple Silicon / Intel）。**项目尚未选择开源许可证，目前不授予开源使用许可**；维护者确认许可证后才能正式开放协作与发行，见[许可证决策](doc/licensing.md)。

## 使用方式

1. 启动应用，在设置中填写自己的 DeepSeek API Key。保存不联网；密钥明文保存在用户级本地配置，见[安全说明](SECURITY.md)。
2. 输入公开技术描述，选择“专利与技术资料”或“仅专利”，主动提交搜索。API 用量由自己的 DeepSeek 账户承担。
3. 上下键选择候选，点击标题或“打开原网页”查看来源；点击普通结果区域只选中。可复制结果，在设置中恢复本地历史。
4. 在设置中录制、保存喜欢的全局快捷键。关闭窗口收起至托盘/菜单栏；菜单“退出”（macOS 也可 Command+Q）真正退出。

支持直接输入高级搜索语法，问号按钮按需显示帮助；显式 `site:` / `-site:` 条件优先于范围默认值。余额仅主动查看或刷新时请求。没有 Fetch 正文、内置正文阅读或自动抓取。

## 能力与限制

- Search API 没有分页；滚动只是分批展示本轮已获取结果。仅专利最多 50 条，混合最多 100 条，去重后可能更少，不是无限远端分页。
- 专利定向来源为 Google Patents，不是完整专利数据库。[既有检索评估](doc/retrieval-evaluation-2026-10-22.md)显示候选探索可用，**精确专利号命中较弱**；不能据此作出新颖性、侵权或完整检索结论。
- 查询和鉴权会发往 DeepSeek 官方接口；仅检索允许提交给外部服务的公开内容。不提供离线检索、同族/法律状态分析或专业法律结论。
- 用户已确认自选快捷键和顶部图标正常；本轮不改变设置。双平台清洁安装、卸载、最低系统与长期产品价值仍需按[验收清单](doc/acceptance-checklist.md)记录。
- 构建成功与运行验收分别记录。没有 Developer ID / Apple 公证或 Windows 发布者签名；预览不能称为已签名正式发行版，不要关闭系统防护运行。

## 开发与检查

需要 Node.js 22.22.2（`.nvmrc`）、Rust 1.90.0（`rust-toolchain.toml`）及 [Tauri 平台前置条件](https://v2.tauri.app/start/prerequisites/)。Node 24 可用于前端检查；原生构建使用仓库固定版本。

```sh
npm ci
npm run check
npm run tauri dev
```

`npm run dev` 仅启动浏览器前端，不能替代桌面 IPC、托盘、凭据或快捷键验收。默认离线测试使用合成数据，不读取真实 Key，不调用付费 API。

```sh
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --no-bundle -- --locked
```

环境、测试边界和构建方式见[开发指南](doc/development.md)，提交流程见[贡献指南](CONTRIBUTING.md)。两个锁文件必须提交，CI 使用 `npm ci` 与 Cargo `--locked`。

## CI 与标签发布

[CI](.github/workflows/ci.yml)检查每个分支 push / PR：前端 lint、类型、离线测试、构建、发布策略；macOS / Windows 分别运行 Rust 格式、clippy、测试和生产编译；另检查 npm / Rust 安全公告与工作流语法。

[标签工作流](.github/workflows/release.yml)为 `master` 的版本标签构建 Apple Silicon DMG、Intel DMG、Windows x64 NSIS / MSI，以及 SHA-256 和源码提交清单。所有检查及构建成功后先上传 draft，全部附件上传成功才公开为**未签名 prerelease**；失败不公开残缺版本。PR 无发布权限，也不使用发布密钥。

**当前默认分支仍是 `main`，尚无 `master`；发布守卫会拒绝发行。** 本次不迁移分支、不更改私有状态、不打正式标签。维护者先选择许可证、审核合并，再按[发布指南](doc/releasing.md)决定 `main → master` 迁移。发布安全、故障恢复及签名升级门槛见该指南。

## 本地数据与卸载

Key 位于用户级应用配置的 `private/credentials-v1.json`，不是系统钥匙串；平台路径见[安全说明](SECURITY.md)。历史 `state-v1.json`、诊断 `metrics-v1.jsonl` 位于应用数据目录；余额仅存进程内存。设置可清除 Key、历史及主动导出诊断。

macOS 将应用拖入 Applications，退出后移到废纸篓；Windows 通过系统应用管理卸载。**仅移除程序不会删除用户配置**。卸载前按需清除 Key 和历史；旧版钥匙串不读取、不迁移、不删除。Windows ACL、WebView2 bootstrapper 与安装/卸载仍需[实机验收](doc/windows-acceptance-record-template.md)。

## 项目资料

- [当前 PRD](doc/PRD.md)、[验收清单](doc/acceptance-checklist.md)
- [安全政策](SECURITY.md)、[依赖与许可证审计](doc/dependency-audit.md)
- [开发指南](doc/development.md)、[贡献规范](CONTRIBUTING.md)、[行为规范](CODE_OF_CONDUCT.md)
- [发布与分支迁移](doc/releasing.md)、[变更记录](CHANGELOG.md)

`doc/` 旧报告是当时环境的历史证据，Mac 路径、测试计数、旧 Fetch / 钥匙串说明和授权范围可能已过时；当前行为以 PRD、源码和本页新指南为准。原始机器日志不入库，不把缺失的本地证据链接当作当前验收通过。
