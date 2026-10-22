> 当前状态与逐项证据已更新至 [development-status.md](development-status.md) 和 [acceptance-results.md](acceptance-results.md)。以下保留前阶段原文，旧的“待同步/测试计数”不代表当前状态。

# 0.1 开发与验收报告

日期：2026-10-21。执行环境：用户 Mac，Apple Silicon arm64，Xcode 27.1；原始目录仅有 PRD 与验收清单，均为用户已有未提交文件。未找到本项目或父目录 AGENTS.md、项目 .agents/skills、已有代码、测试说明。PRD 提及的 `doc/patent_search.py` 与旧 18 项测试并不存在；没有把引用当作已有实现。原始文档保持不变。

## 需求与验收映射

以下“实现位置”仅描述代码覆盖，不等于验收通过。真实 API、原生交互、跨平台和用户研究必须有独立证据。

| 需求 | 验收 ID | 实现位置与核对方式 |
|---|---|---|
| F01 托盘、唤起、收起、退出 | AC04–05、22–23、43–44 | Rust `lib.rs` tray/global-shortcut/window lifecycle；原生平台手测 |
| F02 首次入口、输入法、Unicode 与操作符 | AC01、06–08 | `main.tsx` composition/Enter，`domain.ts` normalize/validate；离线契约测试及中文输入法手测 |
| F03 官方 Search、范围、稳定去重 | AC09–12、19、27–28、35 | Rust 固定 endpoint；`domain.ts` plan/parse/identity/merge；`engine.ts` 并发返回即追加 |
| F04 自动/按需 Fetch、真实性 | AC13–16、30 | `engine.ts` 前 3 自动、最多 5 个、单次终态；`domain.ts` 200000 码点和 300 码点预览；Rust 5 MiB 读取限额 |
| F05 详情、查找、复制、打开来源 | AC17、29 | `main.tsx` 纯文本 React 转义、字面高亮、正文选区；Rust HTTP/HTTPS 校验后系统打开；CSP 禁远程资源 |
| F06 草稿、更多、重新搜索 | AC18–20、36 | `main.tsx` 草稿独立、每次显示 5 条；`engine.ts` 在途重复提交合并、结束后新 run ID |
| F07 取消、异常、预算与竞态 | AC20–28、37 | TS epoch + AbortController；Rust cancellation token + 2 semaphore；60 秒、最多 14 次尝试、一逻辑请求至多重试 1 次、Retry-After |
| F08 本地历史、清理、缓存 | AC31–33 | Rust state-v1.json，50 条/30 天、正文 24 小时/50 MiB、启动停止旧任务；删除移除 known ID，迟到持久化被拒 |
| F09 凭据、设置、说明 | AC01–03、39–44、42、52 | Rust keyring 系统原生存储、零化临时 String；无取回完整 key 命令；更换/删除撤销两类任务；保存不联网；设置只含普通字段 |
| F10 本地指标 | AC34、37 | Rust record_metric 白名单字段与导出原生保存对话框；本地事件只含随机 ID、类别、时间、耗时、计数、状态 |
| F13 余额 | AC45–52 | Rust query_balance 单独取消 token/代际、单在途、10 秒、无重试、会话缓存、429 冷却；字符串金额校验；前端独立失败/旧快照/多币种 |
| 双平台与安装 | AC38、43–44 | Tauri 2，macOS minimum 13，Windows x64 需在 Windows 构建，macOS Intel/arm64 分别验收；不以当前 Mac 代替全部环境 |
| 性能 | PF01–06 | 尚需 100 次本地操作、30 次真实查询；不把计时器单元测试作为性能实测 |
| 检索价值 | PV01–06 | 需专业用户 30 个公开任务及 5 人两周研究；本次开发无法代替 |

## 范围核实与关键阻碍

- 已于 2026-10-21 读取官方 [Search](https://api-docs.deepseek.com/zh-cn/api/search/)、[Fetch](https://api-docs.deepseek.com/zh-cn/api/fetch/)、[Balance](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/) 文档，接口契约与 PRD 一致。
- M0 真实接口前置验证尚缺用户 API Key；不搜索读取现有秘密，不创建账号或充值。开发可先完成本地无凭据环节，真实结果质量与 Google Patents 抓取可用性仍为阻碍。
- 当前仅 Apple Silicon Mac；Windows 11 x64 与 Intel Mac 清洁安装和运行验收不能在当前设备上冒充完成。
- Rust 原环境未安装，正安装到任务隔离目录；不修改全局 PATH。npm 原配置指向内部 registry，本次安装使用官方公共 registry，不修改用户配置。
- 当前未发现会阻止本地技术实现的产品文档矛盾。按 PRD 保留全部 P0 与目标平台。

## 实际检查结果

代码检查记录包括 2026-10-21 本机控制台22:14起的一轮及后续Dock恢复处理后的必要重检；执行的是产品代码，不是旧 Python 原型。凭据和付费接口没有被替换成运行时 mock。

| 命令/检查 | 结果与证据 |
|---|---|
| `npm run lint` | 通过，0 错误；初次未使用导入已修复 |
| `npm run typecheck` | 通过 |
| `npm test` | 2 个测试文件，18 项通过；合成 transport 只用于离线测试 |
| `npm run build` | 通过；Vite 7.3.7，生产静态资源约 252.56 kB JS / gzip 80.29 kB |
| `cargo fmt --manifest-path src-tauri/Cargo.toml` | 已格式化 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | 通过；初次八参数命令警告已改为结构化 MetricInput 后通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 10 项通过，0 失败；包括本地真实 HTTP 服务的 5 MiB 限额、JSON 格式、Retry-After 与错误脱敏 |
| `npm run tauri build -- --debug --bundles app` | 通过，约 46.13 MiB，Mach-O arm64；Tauri Rust 2.12.5、CLI 2.12.4 |
| arm64 开发 DMG | hdiutil create 成功，hdiutil verify 校验 VALID；未执行清洁环境安装/卸载 |
| `npm run tauri build -- --debug --target x86_64-apple-darwin --bundles app` | 交叉构建通过，约44.44 MiB，Mach-O x86_64；Intel真机运行仍未验证 |
| 真实 DeepSeek Search / Fetch / 余额 | 未验证：没有用户在应用内配置的 API Key；没有查询其他软件中的秘密 |
| 原生键盘、中文输入法、性能及真实结果价值 | 仅下表所列实际交互有证据，其余未验证 |
| Windows 11 x64 构建/安装/运行/卸载 | 未验证且未生成 Windows 安装包：当前没有 Windows MSVC 执行环境 |
| macOS Intel / macOS 13 基线运行 | 未验证：当前实际系统为 macOS 26.7.1 arm64；不能以最低版本配置代替运行结果 |

前端测试覆盖：空白/100/101 个 Unicode 码点、受限操作符、查询计划、安全 URL、语言页去重且 A1/B2 不合并、坏条目隔离、正文截断与预览、快慢 Search 渐进展示、组合并发不超过 2、前 3 自动/最多 5 个 Fetch、在途重复提交、旧响应隔离、截止、重试等待和14次上限、无结果与失败区分、历史恢复不联网。

Rust 测试覆盖：密钥基础格式、URL 与鉴权信息拒绝、余额字符串精度/零值/缺字段/未知币种、历史30天及正文24小时清理、Search 请求约束、错误体不进入错误对象、Retry-After、5 MiB 响应拒绝、JSON 协议失败、指标不混入历史序列化。

## 原生实际验证与当前阻碍

应用版本 0.1.0，执行设备 Apple Silicon arm64，macOS 26.7.1，2026-10-21，执行人为本任务 Codex。通过电脑控制工具打开构建的 `.app`，页面 URL 为 `tauri://localhost`。

| 操作 | 实际结果 |
|---|---|
| 首次启动，无已配置密钥 | 用途、示例、范围、历史/设置入口出现；配置状态返回后“填写 DeepSeek API Key”启用。最初快照为初始化中，随后正常完成，不把工具等待时间当作应用启动性能 |
| 点击公开示例 | 输入实际变为 PRD 示例，计数显示19/100 |
| 点击填写密钥 | 打开原生“设置 · 检索服务”；此前检索词仍保留在后方；显示未配置、安全输入框及遮挡选项、费用/数据说明 |
| 未配置余额 | 查看账户余额按钮禁用；没有显示金额或虚构快照 |
| 设置面板视觉 | 已查看原生截图，面板可滚动，费用与凭据说明可见；截图观察不代表各平台缩放/键盘验收 |
| Command+W | 工具随后报告没有可用窗口，shell确认同一应用进程仍存活，支持“关闭只收起”的判断；恢复交互尚未完成 |
| 快捷键重新唤起 | 从隐藏应用绑定发送组合键返回超时，是否实际执行不确定；从另一窗口继续发送时工具明确报告 Mac 已锁定，不能自动解锁。当前没有“唤起恢复通过”的证据 |
| 托盘菜单、Command+Q、重启、密钥原生保存/删除 | 尚未验证；锁屏与缺用户密钥阻碍继续交互，不把静态代码或单测当成完成 |

**锁屏阻碍记录**：目标为用户 Mac 上正在运行的技术点快搜；待执行动作是快捷键恢复、菜单退出与重新启动。电脑控制工具报告 “The Mac is locked and automatic unlock could not unlock it”。这不是自动审批拒绝；未绕过锁屏、未继续重试。已完成源码、检查、打包、首次原生启动与上表部分操作；窗口恢复结果不确定，进程仍存活。需用户手动解锁的新证据后才能继续。

**真实接口阻碍记录**：待执行 `POST /v1/tools/search`、`POST /v1/tools/fetch`、`GET /user/balance` 的成功集成及 M0 Google Patents 可用性验证。缺少用户在本应用内主动配置的 API Key；这些成功调用尚未发起，不属于服务拒绝。已提供原生配置界面；没有创建付费账号或代为充值，也没有寻找/读取其他秘密。用户无需把 key 发到对话里。

原生应用仍在运行，窗口可能处于收起状态。为保留可能存在的密钥草稿，没有强制结束进程。最终包在后续键盘修饰键/指标 ID 小修后重新构建；锁屏前的启动交互来自前一开发构建，最终包的完整再次启动仍需解锁确认。

## 当前实现、数据和剩余风险

- P0 模块已有真实前后端实现：凭据由 keyring 原生后端保存；固定 DeepSeek 地址；Rust 的取消令牌/并发信号量与前端 epoch 双重隔离；正文纯文本渲染，不加载远程图片、脚本、iframe。
- 已实现本地50条/30天历史、正文24小时/50 MiB缓存，超限按最早使用清理；恢复不自动联网，删除撤销后续写入。完整缓存清理与删除的原生磁盘端到端测试仍待补。
- 历史为系统应用数据目录 `state-v1.json`，安全指标另存 `metrics-v1.jsonl`，后者仅白名单字段；Unix 新文件权限0600。余额不落盘，系统凭据不在这些文件中。指标记录逻辑次数和尝试，不将估算当账单。
- 余额独立代际/取消/单在途/10秒超时，严格字符串金额校验，缓存仅当前进程；成功不代表 Search/Fetch 可用。需要真实凭据验证其系统集成、429倒计时与迟到响应。
- 当前 `.app` 为 debug 开发包，adhoc/linker-signed，未设置开发者 Team、未公证；DMG只是本地开发容器。不能当作可公开分发安装包，也没有要求关闭系统防护。
- 未生成 Windows 安装包；没有 Windows/Intel/Mac13清洁环境运行记录；没有签名公证凭据。仍是第一期要求，未从范围删除。
- PF01–PF06 的100次本地操作和30次真实查询、PV01–PV06的专业任务及5人两周内测全部未执行。不得据此宣称性能目标、检索质量、省时或产品价值已达标。
- 原始验收清单 AC01–AC52 未全部勾选；本报告的“代码覆盖/离线通过/原生部分验证”与完整产品验收明确分开。

## 本机复现

```sh
cd /Users/duanzheng/Documents/private-code/patent-quick-search
export CARGO_HOME=/Users/duanzheng/Documents/Codex/2026-10-21/task/.toolchain/cargo
export RUSTUP_HOME=/Users/duanzheng/Documents/Codex/2026-10-21/task/.toolchain/rustup
export PATH="$CARGO_HOME/bin:$PATH"
npm run tauri dev
```

隔离工具链为 Rust 1.99.1，组件包含 rustfmt/clippy。Rust工具链通过 rsproxy 下载并由 rustup 校验；Cargo 镜像只配置在上述任务专用 CARGO_HOME，未修改用户全局配置。Node.js 22.22.2；npm安装本次显式使用公共 registry，package-lock.json/Cargo.lock 均已生成。

已经配置常规 Rust 的其他机器直接按 README 的标准命令运行即可，不需要使用本机绝对路径。用户还需自行在应用内填写自己的 DeepSeek Key；保存不搜索，点击确认启用后才联网。正式分发前需完成目标系统的签名、安装卸载、快捷键/菜单栏/托盘/输入法与真实API验收。

## 交付路径与继续验收

- Apple Silicon `.app`：`src-tauri/target/debug/bundle/macos/技术点快搜.app`。
- Intel `.app`：`src-tauri/target/x86_64-apple-darwin/debug/bundle/macos/技术点快搜.app`。
- 本地开发 DMG：对应架构目录的 `bundle/dmg/patent-quick-search_0.1.0_<architecture>-dev.dmg`；完整性校验与大小另有实际输出记录，不等于签名/安装验收。
- Windows 11 x64 在MSVC开发环境可运行 `./scripts/build-windows.ps1` 进行本地检查和NSIS/MSI构建。脚本尚未在Windows执行；如本机策略不允许运行脚本，逐条执行README中的相同命令，无需修改系统安全策略。
- 源码本次全部保持未提交，没有替用户 commit、push、发布或部署。项目初始Git没有任何提交；用户原有 `doc/PRD.md` 和 `doc/acceptance-checklist.md` 仍未修改。
- 下一检查点：用户手动解锁 → 检查当前窗口是否已恢复 → 通过菜单真正退出并启动最终包 → 测试快捷键/托盘/Dock/输入法 → 用户自行输入key → 真实M0与竞态/余额流程 → Windows和Intel真机安装验收 → 签名/公证方案与性能、价值内测。
