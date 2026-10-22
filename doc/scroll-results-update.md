# 滚动渐进显示与语法核查交付 · 2026-10-22

## 能力边界

只读核对[官方指南](https://api-docs.deepseek.com/zh-cn/guides/search/)与[reference](https://api-docs.deepseek.com/zh-cn/api/search/)：当前公开请求只有query/count(1–50)/ori_question/localization/need_content，响应没有后页标记；指南说明未知字段忽略。因而没有可依赖的服务端分页，本轮不编造page/offset/cursor、不改词/时间分片制造后页。

按本轮方案，每条原查询count从10改50，need_content=false；仅专利一查询≤50，混合两查询合计≤100，身份去重后可更少。不增加请求次数或重试预算，仍2并发/混合4次尝试/60秒，Fetch为0。客户端保留原到达顺序/身份合并/首次URL，不重新排序；服务本身新请求的排名不保证等于先前count10的返回。

这是已有有限结果池的渐进显示，不是获取新的服务页；真实“下一页”仍受当前公开API能力限制。达到收到结果数后显示“本次结果已全部显示”，不声称穷尽整个搜索引擎。

## 实现与状态

`src/result-reveal.ts`管理每批5条、单在途、代际隔离、加载状态、局部调度错误/重试及结束；不包含网络接口。`src/App.tsx`用IntersectionObserver观察列表尾部、root为结果滚动区、提前160px；无观察器时仍可键盘/点击备用按钮，成功没有弹窗。

重复观察器通知共享同一任务，最多增加5条；切换提交任务、恢复历史（含同ID）复位5条并取消旧请求结果，断开的旧观察器也不能回填。只改草稿不破坏原列表，设置打开时暂停新观察。新Search批次追加不改变已显示排序；controller仅改变slice上限。

“失败重试”指本地渲染调度异常：保留当前数量，显示可操作错误，手动重试，不发API。不存在的服务页没有伪造HTTP加载/失败；Search原有错误与整轮重新搜索仍独立保留。

## 自动化

- lint、类型检查、51项前端全部通过（Engine16/domain9/来源3/UI10/滚动控制器6/静默反馈2/Windows头5）。
- Rust fmt/clippy与36项通过；Rust固定count已同步50，未增加分页或Fetch入口。
- 新增验证：重复近底触发共享promise；帧调度注入失败后保留5条并可重试；旧查询完成不清新查询loading；总13条准确停在13；Search追加时每次仍5条；同历史ID复位及旧ID/取消后回调失效。
- 合成Search返回两批50，重叠25条，合并75条且顺序准确；请求体只有原字段、count50、need_content=false，没有分页参数或Fetch；单响应解析上限50。
- 高级语法validateInput与plan函数体同修改前逐字一致；[语法审计](search-syntax-audit.md)只调查，不改变限制，不做大量真实查询。

## 普通应用原生结果

实际启动当前普通arm64包，无QA控件。复用已有公开R05历史19条，未提交新查询：

1. 恢复后5条；向结果区滚动，自动10→15→19（一次中间滚动仍15，因为未接近下一边界），没有点击备用按钮。
2. 到19条显示结束文案、无更多按钮；继续滚动不增加。原查询“RFC 3986 URI fragment identifier secondary resource”和混合范围保持。
3. 同一条历史重新打开回到5条和列表顶部。旧历史无需迁移/删除。
4. 原生窗口内API计数保持81次历史尝试（Search24/Fetch57）；本轮增量全部0。不是把旧历史57次Fetch说成新版请求。
5. 新count50的真实上游响应本轮没有额外收费调用验证；参数能力依据官方schema和实际代码/合成回归。渲染失败/竞态的异常覆盖来自单测注入，不冒充原生服务故障。

[初始5条](evidence/scroll-results/01-initial-five-normal.png) · [自动展开后](evidence/scroll-results/02-after-automatic-reveal-normal.png) · [19条结束](evidence/scroll-results/03-all-received-results-normal.png) · [同历史复位](evidence/scroll-results/04-history-reset-normal.png)。均真实普通包公开历史，无真实Key/余额/QA控件，工具紫色覆盖徽标不是产品。

Library结果图已更新为`libfile_91c12970191881918d2f5edf48c7cb17`版本3，文件名“技术点快搜-滚动渐进显示-普通应用.png”，内容为已接收19条的结束状态，不是服务端分页。

## 构建与交接

普通arm64和Intel debug app均已更新，两DMG校验VALID。当前运行普通arm64路径`src-tauri/target/debug/bundle/macos/技术点快搜.app`；旧暂存包不用于本轮验收。仍无正式签名公证；Intel/Windows设备和完整跨平台/长期价值未验。取消正文/默认浏览器来源流程保留，没有真实Key操作、历史删除、提交或推送。

原始日志、计数差、原生观察及截图在`doc/evidence/scroll-results/`（本机忽略不入Git）。当前[PRD](PRD.md)、[清单](acceptance-checklist.md)、[验收记录](acceptance-results.md)已同步。没有在途构建/查询或权限等待；未公开的服务端分页能力是明确产品上限，不用无限扩展其它查询规避。
