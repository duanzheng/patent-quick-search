# 高级查询语法现状核查 · 2026-10-22

结论：仅部分可用，需手输；没有完整高级搜索UI。本轮仅调查，没有放开/改写任何语法限制，validateInput与plan函数体同变更前完全一致。

## 官方与应用对照

依据[官方指南](https://api-docs.deepseek.com/zh-cn/guides/search/)的搜索语法与[reference](https://api-docs.deepseek.com/zh-cn/api/search/)（本轮只读核对，不发真实Search）：

| 语法 | 本应用现状 | 输入/操作示例 |
|---|---|---|
| 双引号精确短语 | 可手输，客户端原样传递 | `"弹性夹爪"` |
| 减号排除关键词 | 可手输，原样传递 | `夹爪 -塑料` |
| 减号加双引号排除短语 | 可手输，原样传递 | `夹爪 -"release notes"` |
| site: | 校验主动禁止手输；范围下拉框内部追加Google Patents条件 | `夹爪 site:example.com`被拦截 |
| -site: | 主动禁止，当前无排除站点UI | `夹爪 -site:example.com`被拦截 |
| lang: | 主动禁止，当前无语言UI | `夹爪 lang:zh,en`被拦截 |
| after:/before: | 主动禁止，当前无日期UI | `夹爪 after:2025 before:2026`被拦截 |
| OR | 字样未单独过滤；官方明确用例是多个site:组合，而site:被本应用拦截，故该组合当前不可用 | 不把普通`夹爪 OR 弹簧`透传承诺为通用布尔检索支持 |

“可手输”只表示客户端允许透传及官方列出该操作符，不代表本轮实测了每一种服务端搜索效果。普通未列出的操作符也没有被逐个过滤，但其含义没有支持承诺，不按其他搜索引擎语法推断。

## 具体代码与构造

- `src/domain.ts:3` normalize：CRLF/换行及Unicode行分隔符转空格、首尾trim；不自动生成或转义查询语法，不把中文弯引号改为ASCII双引号。
- `src/domain.ts:4–9` validateInput：最多100个Unicode码点；第8行正则禁止边界处的`site/-site/lang/before/after:`，大小写不敏感。它不是语法解析器；例如`"lang:zh"`这种带引号的文字也会命中限制。对输入做限制判断，不偷偷删除操作符后提交。
- `src/domain.ts:11–15` plan：总会构造`q + " site:patents.google.com"`；混合另发原始q，仅专利只发定向q。附加后每条≤128。没有额外转义/括号重写。
- `src/domain.ts:26` parseHits：仅专利模式还要求识别为Google Patents文献路径；混合接受网页，公开号语言页合并但保留首个原始URL。
- `src/engine.ts:68` request：按JSON传query、ori_question（规范化输入）、count=50、need_content=false；不传localization，也没有page/offset/cursor。
- `src/App.tsx` search-options/select：唯一相关UI是“专利与技术资料 / 仅专利·Google Patents”范围选择，没有站点/语言/日期高级表单。设置中也没有这些筛选。
- `src-tauri/src/core.rs:46` valid_payload：校验长度/固定count/need_content=false；查询原样放JSON请求体。输入限制主要在前端，Rust没有再解释高级运算符。

例：输入`"弹性夹爪" -塑料`，混合会发`"弹性夹爪" -塑料 site:patents.google.com`和`"弹性夹爪" -塑料`；仅专利只发前者。用户无需也不能额外手输site来实现当前范围。

## 分页边界

官方请求字段只有query/count(1–50)/ori_question/localization/need_content，结果只有results数组，没有公开的page/offset/cursor、next_cursor或has_more；指南明确未知字段被忽略。不能编造cursor或不断改写查询冒充下一页。

本轮保持原查询条件/到达顺序，每条请求count由10改50，前端每批5条、接近底部显示更多已收到候选。仅专利≤50；混合两请求合计≤100，按原身份去重后可能更少。不增加分页网络请求，不代表可取得第51/101条之外的新服务结果。相关回归和正常应用验证见滚动显示交付记录。
