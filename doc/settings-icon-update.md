> **当前产品已改为Search-only**：[默认浏览器来源交付](source-opening-update.md)。下文为旧阶段记录，正文/Fetch故障不是新版未完成门槛，旧暂存包不用于新验收。

# 设置图标微调 · 2026-10-22

本轮仅修改`src/App.tsx`的设置SVG轮廓/按钮class及`src/style.css`的局部规则，未修改检索逻辑、测试数据或凭据代码，未调用真实API，未推送。

原齿轮路径轮廓不对称，现为本地对称八齿轮廓与同心圆孔，使用现有描边SVG体系：18×18px、1.5px描边、currentColor、圆角连接；按钮32×28px，图标居中，保留“设置”aria-label/title及点击功能。hover沿用面板按钮颜色，focus-visible为清晰内侧焦点框，active使用现有主题色；没有emoji、额外字体或图标依赖。

`npm run lint`、`npm run typecheck`、`npm test`通过，现有43项测试不变。本轮无Rust变更，没有重复运行Rust全套。QA原生构建与普通入口`npm run tauri build -- --debug --no-bundle`均成功；普通生产dist无视觉夹具chunk/标记。

原生验证在明确标注“视觉夹具·未连接服务”的独立检查包完成，使用真实Tauri窗口与同一个App组件：浅色/深色、hover、键盘focus的尺寸/笔画/居中/对比度可见；Shift+Tab可聚焦名称为“设置”的按钮，Enter与鼠标点击都打开设置，Escape返回。未输入Key、未查看真实余额。截图中紫色徽标/鼠标光晕属于电脑控制工具覆盖层。

- [浅色默认](evidence/settings-icon/01-light-native-qa.png)
- [浅色键盘焦点](evidence/settings-icon/02-focus-light-native-qa.png)
- [浅色hover](evidence/settings-icon/03-hover-light-native-qa.png)
- [深色默认](evidence/settings-icon/04-dark-native-qa.png)
- [深色键盘焦点](evidence/settings-icon/05-focus-dark-native-qa.png)

Library截图：`libfile_b2745c9751708191bee6c43d500e307c`，版本0，文件名`01-light-native-qa.png`；内容为独立原生视觉检查包，不是真实检索评测。其余截图保留本机。

## 与并行评测隔离

本任务没有重启、退出或覆盖普通应用包；只启动并退出独立QA包。新图标普通入口成功编译后，将原普通app未变的元数据/资源复制到独立目录，替换为本轮普通入口二进制，准备开发暂存包：

`src-tauri/target/debug/bundle/settings-icon-ready/macos/技术点快搜.app`

原普通应用包二进制SHA前后相同，新暂存包二进制SHA与本轮编译产物相同，见[evidence/settings-icon/settings-icon-delivery.json](evidence/settings-icon/settings-icon-delivery.json)。为避免干扰评测，新暂存普通包尚未启动；原生图标验证使用同组件的隔离QA包。此包仍为未正式签名/公证的arm64开发应用，Intel/Windows产物本轮不更新；原位置app/DMG仍是上轮版本，不冒称已更新图标。

**切换时机：并行检索评测结束后，正常退出旧普通应用，再打开以上暂存包。** 本轮没有要求中途重启或等待输入；实际接口能力评测由独立任务负责。

[检查日志](evidence/settings-icon/settings-icon-checks.log) · [QA构建](evidence/settings-icon/settings-icon-qa-build.log) · [普通入口构建](evidence/settings-icon/settings-icon-production-build.log) · [源码范围核验](evidence/settings-icon/settings-icon-scope.json)
