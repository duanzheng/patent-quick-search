# 许可证待维护者决定

仓库最初没有 LICENSE，也未在 Cargo/package 元数据授予许可。目前 `package.json` 明确 `UNLICENSED`，保持 npm `private: true` 防止误发布；这不改变 GitHub 仓库的私有状态，也不替版权所有者授予权利。完成工程化不代表已成为可自由再分发的开源项目。

可供维护者选择：

| 选择 | 主要取舍 |
|---|---|
| MIT | 简短宽松，保留版权和许可声明；没有 Apache 2.0 那样的明确专利授权条款 |
| Apache-2.0 | 宽松许可，包含明确专利授权/终止条款及 NOTICE、修改声明等要求 |
| 其他（如 GPL-3.0） | 可选择共享修改的义务，但需确认与依赖、分发目标和贡献条款相容 |

这是许可决策说明，不是法律意见或替用户作出许可授权。维护者应确认源码、图标、文档和既有贡献的权利归属，再选准确 SPDX 标识与版权信息。

确认后通过单独 PR：

1. 添加维护者批准的完整 `LICENSE`（使用正式文本与正确版权信息）。
2. 同步 `package.json` / `package-lock.json`、Cargo `[package].license` 和 README；若新增元数据改变 Cargo.lock，随之提交。
3. 刷新 `npm run audit:licenses`，审核[依赖清单](dependency-inventory.json)和第三方声明，处理 MPL、Unicode、数据证书等分发义务；如要求生成并随安装包包含 LICENSE / NOTICE。
4. 明确贡献提交适用的许可，再开放外部代码贡献；单独决定何时将 GitHub 仓库从 private 公开。
5. 审查发布守卫和发布说明。缺 LICENSE 或仍是 UNLICENSED 时 `npm run check:release` 会拒绝发行，不影响普通 CI。

第三方包各自的许可不授予本项目源码的使用权。本次没有添加擅自选择的 LICENSE、修改仓库可见性或发布版本。
