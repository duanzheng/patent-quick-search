> **Fetch404只读诊断更新**：未发现客户端路径/方法/JSON/URL转换错误；现有脱敏字段无法区分路由404与目标资源404。新增URL传递、成功正文、404保留摘要和脱敏歧义回归；前端37+Rust23共60项、lint/类型/clippy通过。本轮无窗口/权限/密钥操作，无新增真实API调用，生产逻辑与现有包不变。详见[fetch-404-diagnosis.md](fetch-404-diagnosis.md)。

> **2026-10-22续记优先**：用户已解锁并保存Key。真实Search两次200合并19条、余额成功；四次Fetch404且未重试，正文成功未验证。由此修复旧式日本公开号识别及错误说明；前端34项+既有Rust22项共56项通过，双Mac包/DMG已必要更新。最新包进程已启动，窗口控制超时，用户确认有系统提示正在自行处理。详见[native-validation-2026-10-22.md](native-validation-2026-10-22.md)。下文2026-10-21内容为前阶段证据，缺Key/锁屏描述不再代表当前状态。

# 0.1 最终开发状态与验证报告

日期：2026-10-21。执行人：本任务Codex。项目：`/Users/duanzheng/Documents/private-code/patent-quick-search`。实际设备：macOS26.7.1 arm64、Xcode27.1；Node22.22.2，Rust1.99.1（任务专用工具链）。本轮没有重新安装/下载工具链。

原始PRD与验收清单保留未改。项目起初只有两份未提交文档，没有代码/测试、没有AGENTS.md或项目技能。现有源码、锁文件、运行说明、双Mac架构开发包均已落在指定项目；全部仍未提交，未执行发布/推送/部署。

## 本轮修复已实际合入

| 问题 | 修改与验证 |
|---|---|
| 手动Fetch后顶层状态仍是complete | `src/engine.ts`排队时即进入reading；D2在传输完成前断言reading，完成后complete |
| 开始新任务把已完成旧历史改成stopped | stop只把仍在运行的任务标为停止，已结束终态保留；D2检查旧任务最后持久化状态 |
| 恢复运行中历史快照会一直显示读取中 | 只读恢复时searching/reading转stopped，queued/loading转cancelled，不重新开放预算；D2验证无新API |
| 注册失败后保存同一快捷键可能误报成功 | `update_settings`在错误状态下也执行注册，失败保留旧配置/提示；取消原组合只发生在确实更换时。编译/静态检查通过，原生冲突仍未验证 |
| 首次收起说明随窗口隐藏，可能看不到 | 改为先显示一次原生返回/退出说明，确认后隐藏。新原生提示尚未因锁屏得到运行验收 |
| 余额迟到响应与同代际请求识别 | 生产状态机按credential_generation和request_id同时校验，R3测试旧代际/旧请求不覆盖新loading/余额；401去旧值、429默认30秒冷却、重复请求合并 |
| 凭据读取可能阻塞余额截止 | HTTP前凭据读取放到阻塞工作线程，受外层取消/截止约束；begin_run仅建任务，不读取凭据或发请求。系统凭据实际成功/失败仍需原生验收 |
| 正文安全检查缺实际组件证据 | 提取真实使用的ContentText，仍只渲染文本；D3验证script/img/iframe、危险链接均不变成相应节点，字面查找按原文转义 |

合入前先验证Git补丁上下文；后续审查修复以逐文件SHA-256确认目标未被外部修改，再只写7个明确文件。没有把整个任务工作区覆盖回项目。原始待同步补丁现已合入，其旧文件只作历史记录，不要再次apply。

## 当前检查结果

| 命令 | 结果 |
|---|---|
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm test` | 4个文件，32项通过：Engine18、规则7、实际文本组件2、Windows头校验5 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml` | 已格式化 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | 通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 22项通过：核心/缓存/余额9，传输4，生产状态/磁盘7，文件替换2 |
| `npm run tauri build -- --debug --bundles app` | 成功，arm64 app约46.25 MiB |
| `npm run tauri build -- --debug --target x86_64-apple-darwin --bundles app` | 成功，Intel app约44.55 MiB |

两种构建按顺序完成，没有并发重复构建；Cargo设置离线，复用此前工具链和依赖。原始检查/构建输出与最终资源SHA-256见[evidence](evidence/build-manifest.json)、[检查日志](evidence/final-checks.log)、[构建日志](evidence/final-build.log)。两个更新后的DMG均由hdiutil verify确认VALID。签名查询实际为arm64 linker ad-hoc（Info.plist未绑定、资源未封装），Intel未签名；查询Intel时退出1。这是明确的签名状态，不是DMG创建/完整性失败，也没有为此重复构建或绕过系统防护。开发包不能当作正式分发包。

测试使用合成公开内容与本地HTTP socket，不使用真实密钥，也没有把运行应用替换成mock。54项自动化通过只证明列出的规则/状态，不能冒充真实DeepSeek、OS凭据或跨平台运行通过。

## 验收逐项结论

见[64项逐项证据矩阵](acceptance-results.md)：AC01–AC52、PF01–PF06、PV01–PV06逐项列出本轮限定检查、完整验收状态、证据和缺口。完整跨平台验收目前没有足够证据通过；AC38的Windows安装包交付缺项明确未通过；没有把缺设备或凭据记为不适用。原清单不勾选。

重点证据：取消/旧响应与14次预算用实际Engine测试；历史50条/30天与正文24小时/50MiB按生产函数测试，真实临时文件往返和0600权限验证；生产余额状态函数覆盖代际、请求ID、缓存、单在途、401及429。Keychain/Credential Manager、真实HTTP10秒截止和原生托盘/快捷键仍未完成系统级验收。

## 原生执行边界与阻碍

上阶段确实打开过真实 `.app`，URL为`tauri://localhost`，观察到首次用途、示例19/100、设置、遮挡入口、无key余额禁用。Command+W后工具无可用窗口，进程仍存活。随后的快捷键恢复返回超时，结果不确定；从另一窗口尝试时工具明确报告Mac已锁定。

本轮遵循“不解锁、不更改锁屏设置”：没有再调用桌面控制、没有解锁尝试，没有强行终止可能持有用户草稿的旧进程。当前最终包尚未原生重启/安装验收；旧构建局部观察不能替代新包验收。

- **待执行**：最终包重启、托盘/快捷键/冲突、首次收起说明、正常退出、复制与输入法、真实OS凭据保存/失败/删除。**目标**：用户Mac。**原因**：锁屏；当前窗口恢复结果不确定。不是审批拒绝。
- **未发起**：真实Search、Fetch和余额成功调用。**目标**：固定官方DeepSeek接口。**原因**：缺用户在本应用内主动配置的Key。没有查找其他软件的秘密；不需要把Key发到聊天。
- **未执行且交付缺失**：Windows x64安装包与运行。**原因**：当前无Windows/MSVC环境。Intel交叉构建通过但Intel/Mac13真实安装运行仍缺机器与记录。

## 14:01历史审批核查：只报告实际可见信息

主任务曾报告有14:01审批待用户确认，但未提供卡片动作、目标或审批ID。本轮发现的相关工具没有“读取审批队列”能力；只读调用 `read_thread` 读取指定主任务，工具成功返回线程元数据，但 `turns=[]`，没有该审批记录。线程idle不构成审批批准证据。

因此仍无法确定14:01卡片的具体动作和当前批准状态，不猜测它属于启动、安装或项目写入，也不把它扩展为整个开发暂停。本轮有明确继续开发指令；文件合入、检查和修复后必要构建均获得工具成功执行结果。没有对任何已知被拒绝动作重试；没有等待中的构建/安装命令。若主任务仍见审批卡，需以其动作/目标/ID进一步核对，不能把等待当作同意。

## 运行方式、范围与最小用户步骤

可从对应架构开发DMG/`.app`进行本地审阅。当前是debug开发包，未完成正式签名/公证和清洁安装验收。若原应用还在收起状态，解锁后通过菜单栏入口返回；不要为了重启丢弃未保存草稿。

```sh
cd /Users/duanzheng/Documents/private-code/patent-quick-search
export CARGO_HOME=/Users/duanzheng/Documents/Codex/2026-10-21/task/.toolchain/cargo
export RUSTUP_HOME=/Users/duanzheng/Documents/Codex/2026-10-21/task/.toolchain/rustup
export PATH="$CARGO_HOME/bin:$PATH"
npm run tauri dev
```

已有普通Rust环境的机器按README标准命令即可。历史在系统应用数据目录 `state-v1.json`，指标单独 `metrics-v1.jsonl`；余额仅内存，Key只走系统凭据。普通文件没有Key回退方案，前端没有读取完整已保存Key命令；正文仅文字、CSP不允许远程资源。

用户当前最小步骤：手动解锁并告知；在应用里自行配置已有DeepSeek Key，随后明确启动公开主题验证。若要确认历史审批，提供审批卡动作文字即可。完整第一期另需安排Windows和Intel/Mac13目标环境。

Windows是原PRD第一期硬范围，不能默默删除。签名/公证的技术方案和分发前门槛属于本轮文档范围，实际正式签名/公证在用户授权分发并提供权限后执行，本轮不擅自购买账号或处理其秘密。详见[发布范围与计划](release-readiness.md)。

## 本轮Windows收尾补充

已修复Windows保存时预删旧文件的数据丢失窗口；同目录临时文件sync/关闭后替换，失败保留旧文件，2项回归通过。正文复制按钮现在仅有效正文选区时启用。根据锁定Tauri依赖声明，将Cargo最低Rust版本由1.85修正到1.90；实际验证仍为已有1.99.1，未安装新工具链。

已准备带Windows11 x64/MSVC预检的构建脚本（默认NSIS，可选MSI）和实际PE32+ payload/哈希校验器。32项前端、22项Rust、lint/类型/clippy通过，必要的两Mac架构重建成功；Windows脚本未执行、Windows包未生成。原始本轮日志见evidence/windows-review-checks.log及windows-review-mac-build.log。

当前Mac仅两个Mac Rust目标；缺Windows目标、LLD/llvm-rc/NSIS/cargo-xwin/PowerShell。Podman版本可见但机器查询被查询锁文件沙箱权限阻止，未重试、未启动或创建机器；未知审批没有被视为批准。详见[Windows检查与最小环境](windows-readiness.md)及[Windows手工记录模板](windows-acceptance-record-template.md)。

当前最新容器完整性与哈希记录已更新至evidence/build-manifest.json，两架构DMG均VALID；签名仍为arm64 linker ad-hoc、Intel未签名，都未公证。当前没有待执行的编译/安装操作。未尝试解锁或读取真实密钥。
