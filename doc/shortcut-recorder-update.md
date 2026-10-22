# 托盘、语法帮助与快捷键录制 · 2026-10-22

本轮代码、自动化和本地Mac开发包已完成；原生操作与新截图未完成。恢复后exec已连接，但当前工具集中没有CUA/repl/browser/computer控制工具，不能退出旧进程、实际按键唤起、读取原生画面或拍图。没有用shell/AppleScript等替代方式绕过。旧Library截图v4属于前一轮，不作为本轮证据。

## 具体变化

绿色方块定位于`src-tauri/src/lib.rs`托盘创建代码：原本直接填充32×32图像的24×24绿色块，与应用顶栏设置齿轮无关。已替换为`src-tauri/src/tray_icon.rs`生成的透明抗锯齿搜索图形（圆环、短检索行、斜柄），36px资源；macOS启用`icon_as_template(true)`由系统适配明暗。对应可读向量定义`src-tauri/icons/tray-template.svg`。未大改应用图标、Dock或顶栏齿轮。18/36/54三尺寸灰阶、透明边界、覆盖比例与抗锯齿测试通过；这些是像素属性测试，不是菜单栏明暗/缩放实拍。

语法帮助已去掉夹爪等领域主题及“搜索服务决定实际匹配”等冗长文字，只说明：英文双引号精确匹配、减号排除词/短语、site后域名和多站点OR、lang语言代码及逗号、after/before年份或YYYY-MM-DD。保留网页发布时间≠专利优先权日、显式站点覆盖默认范围、100输入/128完整查询不截断规则。未改变上一轮搜索构造/结果选择/无Fetch逻辑；主页原有技术点示例仍按原产品要求保留，不是高级帮助中的示例。

快捷键设置由逐字编辑accelerator改为只读录制控件`src/HotkeyRecorder.tsx`：点击或Tab聚焦后开始；完成主键并松开后形成草稿，明确点击保存才写设置。Mac底层Super→Command/⌘、Alt→Option/⌥、Ctrl→Control/⌃、Space→空格；Windows显示Ctrl/Alt/Windows。例：Ctrl+Alt+KeyK显示⌃ ⌥ K，文字说明为Control + Option + K；旧Alt+Super+Space显示⌥ ⌘ 空格。旧配置兼容，不自动迁移或改默认。

录制态支持修改、Esc取消、取消录制、取消修改、失焦取消未完成录制、恢复默认草稿；未编辑不保存。仅修饰键不提交，忽略重复按键、IME composing/229/Process，保留正常Ctrl+Alt，避免把AltGraph文本当作快捷键。对注册/保存/恢复失败显示必要错误，没有成功弹窗。对话框内Esc录制优先，不误关设置。

录制开始通过后端临时注销本应用旧全局绑定，防止同一组合被全局处理吞掉或误唤起；结束/取消/隐藏/窗口失焦后恢复。后端处理器也检查录制态。开始失败不进入可录制状态，迟到的开始在卸载后仍触发结束，恢复失败明确提示重存/重开，不声称旧绑定可用。

`src-tauri/src/hotkey.rs`保存事务先验证和注册新组合，再原子持久化，最后注销旧组合。新组合被占用则不写配置；持久化失败撤销新组合且旧组合一直保留；注销旧组合失败会撤销新组合并回滚配置。异常清理或回滚本身失败会明确提示重开检查。等价旧拼写不重复注册。实际用户配置、Key和历史未被本轮测试改动，测试使用隔离合成传输/文件。

## 默认及冲突

默认仍为Mac ⌥⌘空格（Option+Command+Space），Windows Ctrl+Alt+Space。Apple[官方快捷键说明](https://support.apple.com/guide/mac-help/spotlight-keyboard-shortcuts-mh26783/mac)列出⌘空格为聚焦，⌥⌘空格为Finder搜索，因此旧默认存在系统冲突可能。设置给出简短可操作提醒，让用户自行录制其他组合；没有擅改为⌘空格，也没有更改系统快捷键/安全设置。注册成功不等于能覆盖所有系统保留键，实际唤起仍需原生测。

## 检查结果

| 检查 | 实际结果 |
|---|---|
| 旧Rust session57597 | 已失效，结果不可恢复；未冒认成功，重新检查已落盘代码 |
| 自动审批超时的新增测试脚本 | 恢复后文件确认不存在，随后才补齐，不把超时当批准或重复未知操作 |
| npm run lint / npm run typecheck | 通过 |
| npm test | 10文件76项通过；含5解析、10录制DOM、8前轮导航DOM |
| cargo fmt --check / cargo test --locked / cargo clippy -- -D warnings | 通过，43 Rust测试 |
| 普通arm64和x86_64 Mac app | 都构建成功；没有QA入口/控制条 |
| 两Mac开发DMG的hdiutil verify | 都VALID；脚本末尾Intel codesign未签名返回1，非打包或容器校验失败 |
| 原生录入/保存后唤起/旧组合无误触 | 未验证：当前无电脑控制工具 |
| 原生仅修饰键/Esc/失焦取消 | 未验证；React DOM有对应通过证据 |
| 实际OS注册冲突后保留旧绑定 | 未验证；注册器故障注入和App错误UI回归通过 |
| 菜单栏明暗/不同缩放实际效果 | 未验证；template及像素属性回归通过 |
| 新普通包切换与截图Library ID | 未完成：没有启动/退出进程或截图的可用UI工具 |

前端初次发现Ctrl+Alt被AltGraph误判与window blur取消失败，已修复并重跑全套通过；Rust clippy条件嵌套已修正。日志在本机`doc/evidence/recorder-update/`（忽略不提交）。此前检索/domain/来源/懒加载、凭据存储/session模块SHA与前轮一致，旧历史不删除，无Fetch/真实API/真实Key操作、提交或推送。

## 当前可用包和后续最小步骤

磁盘上的新普通arm64 app：`src-tauri/target/debug/bundle/macos/技术点快搜.app`。

Intel app：`src-tauri/target/x86_64-apple-darwin/debug/bundle/macos/技术点快搜.app`。两DMG分别在对应`bundle/dmg/`，名称`patent-quick-search_0.1.0_aarch64-dev.dmg`和`patent-quick-search_0.1.0_x86_64-dev.dmg`。

尚未通过UI退出旧进程或启动新包，不能确认当前运行版本；最后已验证运行的是上一轮高级语法/统一选中包。下一步仅需恢复本任务的电脑控制工具，再正常退出旧app、开上述普通app，记录原绑定，测试临时组合后恢复原绑定，完成上述原生项和无QA截图上传Library。无需用户提供Key、关闭防护或修改系统快捷键。不得把已有v4图当新版图，也无需重复构建无代码变化的包。

Mac两包仍为debug开发包：arm64 linker ad-hoc/资源未封签，Intel未签名，均未公证。Windows包与原生验收仍是此前独立缺口，没有因本轮通过而勾选完整64项。
