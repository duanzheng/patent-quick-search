# 变更记录

## Unreleased

- 增加开发、贡献、安全、许可、分支迁移/发布说明和 issue / PR 模板。
- 首发补齐完整第三方许可/NOTICE、精确源码链接及锁文件/全文哈希守卫，随应用与 Release 分发。
- 经维护者明确批准采用 MIT，并从 main 同提交创建 master、保留 main；PR 目标为 master。
- 清除 npm 锁文件内网 HTTP registry 地址，升级受安全公告影响的测试依赖。
- 增加 PR / 主分支 push 的测试、类型、lint、必要 Rust 编译与供应链检查；普通 CI 不构建或上传生产安装包。
- 仅严格归属 master 的版本标签触发多平台生产打包与 GitHub Release。
- 三平台完整性、版本与 SHA-256 校验通过、附件全部上传后才公开未签名 prerelease；缺许可证阻止发行。
- 保留既有产品 UI、用户自选快捷键、Search-only 和用户级本地凭据行为。

## 0.1.0 开发基线（尚未发布）

- `e056eb1756f0748dd4b1f8c2ed7c28a06778dd39`：快捷键录制、语法帮助、统一结果选择、已有候选渐进展示。
- 仅 Search，浏览器打开原网页；Key 按用户确认明文保存至用户级本地配置。

本记录不代表存在对应 GitHub Release、正式标签或已签名安装器。
