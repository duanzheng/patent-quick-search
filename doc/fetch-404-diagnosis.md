# Fetch 404独立诊断 · 2026-10-22

本轮按明确限制仅做本地/官方文档只读诊断与合成夹具回归：**没有窗口操作、权限确认、凭据读取/提取，也没有新增DeepSeek API请求**。保留此前真实Search成功及余额成功结论；**真实Fetch成功、正文原生阅读/查找/复制仍未验证**。原PRD与原清单未改。

## 结论及证据强弱

目前**不能区分这4次HTTP404是API网关/路由层404还是Fetch针对目标资源返回的404**。没有证据支持“接口不存在”“Key无Fetch权限”或“上游故障”的确定结论。静态及离线跨模块检查未发现客户端路径、方法、JSON字段或URL转换错误，但这不等于已捕获并验证实际线上请求字节。

[官方Fetch契约](https://api-docs.deepseek.com/api/fetch/)指定POST到`https://api.deepseek.com/v1/tools/fetch`，JSON对象仅需`url`，成功正文为`title`与`content`字符串。[官方Search & Fetch错误说明](https://api-docs.deepseek.com/guides/search/)将404解释为未取到可用页面内容，可能涉及不可用URL、站点策略、目标错误、内容类型或无可提取正文；这说明404并不自动意味着API路由不存在。该定义只能解释符合官方错误协议的响应，不能证明本次四条一定属于其中某种原因。

### 现有真实证据

| 证据 | 能说明什么 | 不能说明什么 |
|---|---|---|
| 两次Search成功解析、19候选 | 既有Search服务链路可用；UI及成功结果仍成立 | 不能由此推断Fetch路由、权限或正文可抓取 |
| 主动余额查询显示可用快照 | 既有余额链路成功，已与Search/Fetch状态隔离 | 不能据余额推断Fetch成功 |
| 四次Fetch错误kind=http、status=404 | Rust收到非2xx HTTP响应；不是前端正文JSON解析失败、IPC参数拒绝、截止或网络错误被伪装成404 | 日志没有响应Content-Type、错误envelope/type/code、响应体、请求追踪字段或实际网络路径，不能判定404来源层级 |
| 每条attemptIndex=0，总2Search+4Fetch=6尝试 | 已执行四个不同候选，未对404重试，未突破预算 | 快速65–180ms返回和跨域相同状态不能识别网关还是目标抓取缓存 |
| 历史中指定公开示例任务的原始URL与首次matches.url一致 | 已持久化候选未被身份去重URL替换；四个失败项无content | 历史不是线上请求包，不单独证明请求被服务端如何解析 |

[既有调用记录](evidence/native-api-attempts-1.json)保留原始脱敏指标。额外发现：生产指标当前对成功结果统一记status=200，而错误status直接来自HTTP响应；因此两Search的“200”是**成功归一化标记**，没有保存原始2xx状态码。这不撤销已观察到的真实Search成功/19候选，但不能把成功指标当完整抓包。四个404没有这个歧义，直接来自响应状态。此记录精度限制不是已发现的Fetch失败原因。

## 路径、方法、结构与URL追踪

| 环节 | 实际实现与核对 |
|---|---|
| Search接收 | `domain.ts::parseHits`读取results[].url，校验HTTP/HTTPS、host、无用户密码及长度；title/snippet/summary保持检索摘要身份。Hit.originalUrl直接保存原字符串 |
| 去重 | `identity`构建另一个canonicalKey；专利语言页合并保留首次Hit的originalUrl，matches保存全部命中。canonicalKey/公开号不替代抓取URL |
| 自动/手动排队 | `Engine.fetch`生成job.url=h.originalUrl；前三自动和后续手动均调用同一路径 |
| IPC结构 | `Engine.request`发送operation=fetch，payload恰为`{url:job.url}`。没有把目标URL拼到API路径、不双重encodeURIComponent、不把query/摘要作为Fetch正文 |
| Rust校验 | `valid_payload("fetch",payload)`再校验url字符串、8192码点、HTTP/HTTPS及用户名密码；失败返回invalid_request，不会产生HTTP404 |
| HTTP发送 | `lib.rs::api_request`固定`.post("https://api.deepseek.com/v1/tools/fetch")`、`.json(&payload)`设置JSON内容类型，Authorization按Bearer构造；端点与Search明确分支，且客户端禁止重定向。没有路径重复/v1、GET误用、request wrapper或fetch_url字段 |
| HTTP接收 | `response`先检查状态；非2xx直接构造{kind:http,status,retryAfter}，不读取错误体。404在此产生，尚未进入title/content解析。因此不能归因正文Markdown解析器 |
| 成功正文路径 | 2xx JSON到`pageContent`检查title/content类型，真实content用于正文/首段预览，空内容为empty，摘要不补成正文；ContentText继续纯文字转义。新增夹具回归证明代码路径，不冒充真实Fetch成功 |

对之前唯一公开示例任务按已知请求时间关联runId，只提取失败项的域名、路径后缀、URL hash和等值判断，未读取其他任务的内容、密钥或余额。证据：[fetch-url-audit.json](evidence/fetch-url-audit.json)。

| 候选 | URL域名/路径特征 | 原始URL=首次Search URL | 结果 |
|---|---|---|---|
| 1 | patentimages.storage.googleapis.com，路径后缀.pdf，有fragment | 是 | 404，无正文 |
| 2 | patentimages.storage.googleapis.com，路径后缀.pdf，有fragment | 是 | 404，无正文 |
| 3 | www.cqvip.com，无路径后缀，无fragment | 是 | 404，无正文 |
| 6（手动） | patents.google.com，JPH07314219A语言文档路径，有fragment | 是 | 404，无正文 |

后缀.pdf不等于已读取该资源Content-Type，不能因此确诊PDF不支持；另两条也不是.pdf路径。fragment被保留在JSON字符串中，符合原始URL保留方式，官方契约未禁止fragment。没有证据支持擅自删参数、改来源或移除fragment来“修复”；也没有重复失败请求验证这种猜测。此前JPH身份识别问题只影响分类/仅专利过滤，已修复；并未改动原Fetch URL，不能宣称它解决了404。

## 新增回归与结果

- Engine真实生产解析/去重/队列路径：合成Search的语言重复、含%2F/Unicode转义/重复参数/fragment的URL，自动及手动Fetch IPC payload均严格等于首次原始URL，未重写。
- 合成成功Fetch：正文与Markdown原样保留、预览来自正文、保存进历史，重复点击不再次抓取。
- 合成Fetch404：摘要保留，正文/预览不存在，状态partial，不重试或重复点击触发抓取。
- Rust真实本机HTTP socket分别返回合成HTML“路由404”和合成JSON“目标404”；当前生产response函数均产生完全相同的脱敏错误，证明现有记录确实无法区分两者。不是对真实服务成因的验证。

前端37项、Rust23项共60项通过；lint/类型/clippy -D warnings通过。命令和原始输出见[checks](evidence/fetch-diagnosis-checks.log)。Rust仅新增cfg(test)测试：从当前lib.rs内存移除这一个新增测试后SHA与上一包源码完全一致；生产运行逻辑未变，没有为测试/文档重复Mac打包。既有双Mac app与DMG的SHA保持不变，记录在[manifest](evidence/build-manifest.json)。

## 桌面可用后的最小真实验证方案（本轮未执行）

1. 用户先自行处理当前系统提示并确认回到主页；不代点，不取出密钥。保留既有Key，凭据仍只由应用Rust在正常调用中访问。
2. 若继续真实验收，选择一个公开、短小HTML技术文档对照目标，而非重复这4个失败目标。例如以“RFC 3986 URI fragment”为一个公开技术查询，优先观察官方文档HTML候选。当前产品没有“任意URL诊断”入口，不能假称现有过期历史可只发一次Fetch：一次新的混合任务会执行2 Search和最多3个自动Fetch；瞬态错误按现有一次重试规则最多10尝试，404不重试。不继续手动抓取，也不自动扩大为30样本。
3. 开始前如需区分路由/目标，先在受控调试路径准备**只允许固定枚举**的响应元数据（实际status、Content-Type类别、是否有官方error envelope），不保存/回传原始错误message、URL、header值或正文，更不记录Authorization。现有日志没有这些信息，不能事后补出。格式类型最多提供线索，仍不单独证明响应来源；不盲试其它API版本/方法。
4. 对照Fetch若返回非空content，再在真实原生窗口核对摘要/正文分离、正文查找与选区复制、来源时间和缓存恢复，才能推进F04/F05成功验收。若对照也404，保留响应分类，仍标“来源未知”；需官方进一步确认时先另获授权，不自动联系支持或发日志。

当前这一步仅是待验证方案，不已执行、不新增费用、不声称正文核心流程已经真实完成。完整64项验收仍0通过、1未通过（Windows包缺失）、63未验证、0不适用；系统提示待用户处理、Windows/Intel/Mac13目标环境等阻碍维持前述记录。
