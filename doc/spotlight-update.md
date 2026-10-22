> **当前产品已改为Search-only**：[默认浏览器来源交付](source-opening-update.md)。下文为旧阶段记录，正文/Fetch故障不是新版未完成门槛，旧暂存包不用于新验收。

> **静默收起修复已完成**：[最新记录](quiet-hide-update.md)，前端43/Rust35通过，普通应用5轮连续隐藏/重新打开无确认。下文旧阶段测试数/提示行为保留为历史，不代表当前实现。

# Spotlight 与本机凭据更新 · 2026-10-22

本报告优先于旧阶段报告。用户最新明确要求 Spotlight 式入口，并在了解明文风险后接受本机配置保存 Key。原 PRD 和原始验收清单保持不变；涉及系统凭据的旧实现说明已被本轮要求覆盖。本轮仅本地修改、测试和打包，没有新提交、推送或发布。

## 凭据调用链与生命周期

旧代码 `bootstrap → configured → keyring.get_password`，主动余额 `query_balance → load_key → keyring.get_password`，每个 Search/Fetch 也调用 load_key；保存才调用 set_password。余额数据从来没有写入钥匙串。源码可以定位这些独立读取入口，但没有系统授权审计，不能断言用户看到的两个提示各自对应哪一次调用。

现已移除 keyring 依赖及应用层钥匙串读、写、删除入口。启动只读一次 `app_config_dir()/private/credentials-v1.json` 到 Rust 内存；余额和 Search/Fetch 都调用同一 `load_key(&AppState)`，仅复制内存缓存，不读配置文件或系统凭据。保存/清除文件使用独立锁，不阻塞检索读取缓存。成功替换后撤销旧代际、取消搜索与余额、清空旧余额；写失败保留现有文件和会话凭据。

文件按用户确认以明文存储，能读取文件的程序可取得 Key。macOS 路径为 `~/Library/Application Support/com.patentquicksearch.desktop/private/credentials-v1.json`；Windows 路径由 Tauri 用户级 app_config_dir 解析，ACL 行为未实测。新 Unix 文件0600、新目录0700；同目录唯一 create_new 临时文件写入、sync、关闭后 rename，失败不预删旧文件。拒绝符号链接/非文件目标、超大/损坏/未知版本或额外字段；缺文件视为未配置，读取失败提示重新保存并保留原文件。退出只清内存，文件保留；用户点击清除才删除新配置文件。输入草稿关闭后清空；前端没有取回已保存完整 Key 的命令。日志、历史、指标和余额不保存 Key。

**不读取、迁移或删除旧钥匙串条目。** 因此新版首次需用户在设置中再填一次，此后启动自动加载。代理没有读取真实 Key、写入真实凭据或为验证新增真实收费请求。

## 界面与操作

初始720×252紧凑面板，主输入、范围、搜索动作优先；结果与设置按需展开，尺寸和位置约束在当前屏幕工作区。已修复展开后窗口底部超出屏幕的实际截图问题。采用系统字体、细边线、圆角、克制层级，明暗自动适配；材质由CSS呈现，没有声称使用系统原生透明磨砂API。

历史、设置和收起用次级工具按钮；正文单独展开，检索摘要与抓取原文明示区分。首屏去掉调度、预算、尝试次数等工程信息；高级本地数据说明折叠。错误保留可执行动作，余额按用户主动查看才加载。结果方向键选择、Enter展开、Command+F聚焦正文查找、Esc逐层返回、Tab焦点圈定、唤起后搜索聚焦。

## 实际检查与边界

| 检查 | 结果与证据 |
|---|---|
| lint / TypeScript | `npm run lint`、`npm run typecheck` 通过 |
| 前端回归 | `npm test`：5文件41项通过（Engine21、domain9、content2、Windows产物头5、UI4） |
| Rust | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings`、`cargo test --locked --manifest-path src-tauri/Cargo.toml`：35项通过 |
| 本地保存 | 隔离目录与虚构值测试：保存/替换/清除、损坏/缺失/版本错误、写/清除失败、原子替换注入失败、Unix权限和符号链接、缓存与文件锁隔离通过 |
| 新进程重载 | 实际派生新的Rust测试进程，经生产读取函数加载隔离虚构配置，通过；不等于真实用户Key原生重启/API验收 |
| 钥匙串移除 | 源码及锁文件无 keyring/SecItem/钥匙串调用；普通新版原生启动、打开设置没有系统凭据提示。没有执行旧条目读取/迁移/删除 |
| 普通原生界面 | 最终arm64 `.app`实际启动；真实初始输入聚焦、设置未配置/余额禁用、明文本地说明可见；无夹具数据 |
| 多状态视觉 | 独立原生QA包覆盖初始/输入/加载/结果/空结果/错误/设置/余额及明暗；橙色栏明确“视觉夹具·未连接服务”，合成余额/正文不得算真实API通过 |
| 键盘与正文 | QA原生Down/Enter展开、Command+F聚焦、设置查找值“弹性”显示1处匹配、Esc返回通过。中文值用原生setValue写入，真实中文IME输入未验证。复制选区/剪贴板内容未验证 |
| 隐藏/唤起 | 安全指标记录command hidden及reopen shown。电脑工具读取窗口会自动重新激活，因此不能据此判快捷键唤起通过。自动化Alt+Super+Space未取得source=shortcut证据，快捷键/托盘端到端仍未验证 |
| 包 | 两架构Mac debug `.app`构建成功；DMG及SHA以本机manifest/打包日志为准。Intel交叉编译不等于Intel设备运行 |

测试日志：[前端](evidence/spotlight-final-frontend.log)、[Rust与QA](evidence/spotlight-final-rust-qa-build.log)、[arm64](evidence/spotlight-final-arm-build.log)、[Intel](evidence/spotlight-final-intel-build.log)、[打包](evidence/spotlight-final-packaging.log)。生产构建没有设置VITE_VISUAL_QA，产物中没有视觉夹具chunk/标记；独立QA标识不加载用户凭据，不读写用户历史，不连接服务。

## 截图证据

截图是原生窗口原始捕获，没有裁剪、绘制或把浏览器图当原生图。左上紫色徽标为电脑控制工具覆盖层。截图目录 `evidence/spotlight-screenshots/` 本机保留，不入Git。

- `12-initial-native.png`：最终普通应用真实主页。
- `13-settings-native.png`：最终普通应用设置，未填写Key。
- `01-initial-light-qa.png`、`02-input-light-qa.png`、`03-loading-light-qa.png`、`04-empty-light-qa.png`、`05-error-light-qa.png`：原生离线视觉夹具。
- `06-results-light-qa.png`、`08-settings-light-qa.png`、`09-balance-light-qa.png`、`10-results-dark-qa.png`、`11-reader-dark-qa.png`：最终QA包原生视觉夹具；余额和正文均合成。

已上传Library：真实主页 `libfile_2d9ad964d3148191b83a0cfea8c20574`，结果夹具 `libfile_91c12970191881918d2f5edf48c7cb17`，均版本1。它们只交付安全截图，不含真实Key、真实余额或私人使用轨迹。

## 验收范围与剩余缺口

原64项完整跨平台验收仍保守记为0通过、1未通过（Windows安装包缺失）、63未验证、0不适用；这不是76项限定自动化检查失败，也不能把新UI实现直接勾成完整产品通过。AC02/39/40/41/52的系统凭据部分按最新用户要求改为本地明文策略；当前证据见本报告，旧Keychain原生成功记录仅为旧版本历史。

此前真实Search两次成功共19候选、余额成功保留为旧版本集成证据。本轮没有新增收费调用；4个Fetch404缺响应正文/MIME，不能判定一定是API路由或目标资源。真实Fetch成功→正文展示/查找/复制核心链路仍未验证；视觉夹具不能替代它。

Windows是一期必需范围，仍需既有Windows11 x64/MSVC/WebView2环境按`scripts/build-windows.ps1`构建和原生验收；当前Mac现有工具不足以可靠生成Windows安装包，未创建环境/发布CI。还缺Intel/macOS13清洁安装运行、正式签名公证、30个真实任务与用户价值验证。

14:01/02:30审批卡具体动作和当前状态在本任务不可见，不能猜获批、拒绝或扩大为全部任务阻碍。本轮有成功的检查、构建、截图工具结果；没有已知待审批动作。电脑锁屏时不解锁；未代点系统安全提示。

最小后续动作：在新版设置再填写一次Key；从其他应用手动试Option+Command+Space与菜单栏唤回；如需继续真实接口验收，再按Fetch诊断的最小公开样本方案执行。无需向对话发送Key。正式分发前需目标系统和签名公证验收。
