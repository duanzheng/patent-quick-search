# 许可证与第三方声明

项目采用 [MIT 许可证](../LICENSE)，package / Cargo / Tauri 元数据一致。npm private 防止误发布 npm；GitHub 仍为 private，许可证不会自动改变仓库可见性。贡献者须有权提供其贡献并保留第三方声明。

## 随包全文

[THIRD_PARTY_NOTICES.txt](../THIRD_PARTY_NOTICES.txt) 收录发布目标（两种 macOS 架构、Windows MSVC）的 303 个 Rust 包及 8 个前端运行时/辅助包，含构建依赖作为保守覆盖；221 份去重文本保留 LICENSE、版权和 NOTICE。每个包提供准确版本的源码 archive URL；MPL 依赖未修改，全文明确提供其源码获取方式。全文随应用资源及 Release 附件分发。元数据清单 dependency-inventory.json 仍覆盖更多非发布平台，不等同于全文。

`cargo-about 0.9.2` 只确定受支持目标依赖图与条款；生成器优先保留实际发布包里的全部许可/NOTICE 文件，补充 workspace 许可时通过 .cargo_vcs_info 的准确上游 commit 匹配，来源与 SHA-256 保存在 legal/upstream-license-sources.json。部分 objc2 发布包只在原始 workspace 声明中引用 MIT、selectors 源文件只引用 MPL：原始声明/可用作者信息原样保留，并附完整所引用的标准许可条款，未虚构版权年份或归属；这些例外在 notice manifest 和全文中逐包标注。

## 更新与验证

```sh
# 仅在升级依赖并重新生成快照时需要；普通 CI 不安装此工具
cargo install cargo-about --version 0.9.2 --features cli --locked
cargo fetch --locked --manifest-path src-tauri/Cargo.toml
pnpm install --frozen-lockfile
pnpm run dependencies:refresh
pnpm run check:ci
```

生成器离线读取已获取 crate 与 node_modules，不运行付费 API。新增缺失许可会失败，维护者应先添加准确上游声明，不能用通用模板替换版权通知。提交生成的全文、manifest、上游补充文件及锁文件；普通 CI 只校验这些快照的哈希/覆盖，不打包。

macOS 发布还只读挂载最终 DMG，比较其中 .app/Contents/Resources 的两份法律文件与源码哈希；各平台 staging / 最终 assemble 均验证法律附件，拒绝缺失或篡改。Windows 由 Tauri 显式资源映射随 NSIS/MSI 安装，实际安装/卸载仍须目标设备验收。系统框架、WebView2 与 SDK 自带条款独立适用；未把元数据审计描述为法律意见。

迁移后库存 schema 2 读取 pnpm lock v9 的唯一 registry 包身份、peer snapshot 与可选平台图；运行时图用于检查前端许可覆盖。生成器通过 pnpm 的实际安装图查找隔离目录中的文本，不依赖 npm hoisting。版本更新先运行 `pnpm run dependencies:refresh`，再逐项审查快照差异；已审查表达式清单不意味着自动批准新依赖或忽略其版权/NOTICE。
