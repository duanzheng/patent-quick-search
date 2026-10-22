# 静默收起修复 · 2026-10-22

按用户最新要求，窗口收起直接完成，首次也没有弹窗、通知或toast。本轮未推送、未访问Key/余额、未发起真实API请求。

## 变更

旧版共享 `hide()` 在每个进程第一次收起时弹出“窗口已收起”，等待用户确认后才隐藏；重启进程会再次出现。现删除整个对话框分支和 `hidden_notice` 状态，直接 `window.hide()`，成功后仅记录不含查询/凭据的本地窗口事件，没有替换为首次提示。

全部收起路径已核对：Escape、Command+W、面板收起按钮→`hide_window`→`hide`；系统关闭按钮/CloseRequested→`hide`；托盘菜单“收起窗口”→`hide`；已聚焦窗口的全局快捷键→`hide`。重新显示仍聚焦搜索输入。

同时移除保存/清除Key、快捷键更新、历史清空、诊断导出、复制成功的浮动toast。操作结果由已有配置状态、空列表或文件选择流程呈现，不另弹成功提示。保留Key明文存储说明、外发查询/费用同意、保存/清除/复制/设置/导出失败等错误；复制时没有有效原文选区仍给出可操作错误。没有隐藏错误、改变凭据生命周期或扩展检索功能。

## 验证

- `npm run lint`、`npm run typecheck` 通过。
- `npm test`：6文件43项通过；新增2项静态交互约束回归，防止恢复收起确认和普通成功toast，并检查必要错误及同意入口仍存在。这是源码约束，不冒充原生执行。
- Rust fmt/clippy及35项测试通过。
- 最终普通arm64应用真实运行。连续5轮：首次Escape、Command+W、系统关闭按钮、面板收起按钮、再次Escape；每轮立即记录hidden事件，无需点击确认，显式重新打开应用后记录shown/reopen，搜索框聚焦，没有“窗口已收起”提示。
- 首轮隐藏后工具读取窗口返回 `noWindowsAvailable`，与实际隐藏一致；随后通过应用重新打开恢复，没有当作权限拒绝或重复安装。
- 原生证据：[5轮事件与检查结果](evidence/quiet-hide-native-results.json)、[最终重新打开截图](evidence/quiet-hide-after-reopen-native.png)。重新打开来源是应用reopen，不冒充全局快捷键或托盘唤回实测；托盘/快捷键入口仅静态核对共享静默函数。
- 两架构Mac debug应用已按修复源码重建，DMG已更新并校验VALID。arm64仍linker ad-hoc/unsealed、Intel未签名，未公证。Intel未在设备上运行。

日志：[回归](evidence/quiet-hide-checks.log)、[arm64构建](evidence/quiet-hide-arm-build.log)、[Intel构建](evidence/quiet-hide-intel-build.log)、[打包与签名状态](evidence/quiet-hide-packaging.log)。[产物哈希清单](evidence/build-manifest.json)为本轮最新。

已修复本轮明确缺陷，没有已知等待审批、安装或输入。Windows、真实Fetch成功链路及完整产品验收仍按[上一轮报告](spotlight-update.md)保留未验证，不为本次收起提示修复扩大范围。
