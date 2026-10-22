# 高级查询语法 · 2026-10-22 当前实现

最新用户要求已替代原先客户端禁止规则。[原核查](archive/search-syntax-audit-before-direct-syntax-2026-10-22.md)保留历史事实，不能作为当前行为说明。

依据[DeepSeek官方指南](https://api-docs.deepseek.com/zh-cn/guides/search/)与[reference](https://api-docs.deepseek.com/zh-cn/api/search/)。搜索框直接手输以下语法，旁边问号按需展示示例；没有新增筛选面板。

| 用法 | 示例 |
|---|---|
| 指定站点 / 多站点OR | `夹爪 site:github.com OR site:wikipedia.org` |
| 排除站点 | `夹爪 -site:example.com` |
| 精确短语 | `"弹性夹爪"` |
| 排除词 / 短语 | `夹爪 -塑料 -"release notes"` |
| 语言 | `夹爪 lang:zh,en` |
| 网页发布时间 | `夹爪 after:2025-01-01 before:2026` |

日期不是专利优先权日。OR仅按官方多站点写法说明，不承诺任意布尔表达式。搜索语法由DeepSeek解释；本轮用合成传输验证客户端构造，未新增真实语法搜索或声称上游效果逐条实测。

## 站点优先规则

英文双引号外出现独立`site:`或`-site:`时，仅发规范化原q一次，不再附加GP站点，也不按原“仅专利”选项过滤非GP结果。范围位置即时显示“按查询中的站点条件”；删除条件后恢复先前mixed/patents。这样不会给`-site:patents.google.com`附加相反条件，也不会把多站点OR改写为不同含义。引号内`"site:example.com"`和排除短语里的同字样按文字处理。旧历史保留原query/scope；新查询依据query计算有效范围，不新增破坏性数据迁移。

没有显式站点时沿用原规则：patents发`q site:patents.google.com`并过滤GP文献路径；mixed另发原q，最多两个Search。lang/date/引号/排除词原样保留。

## 输入和网络边界

换行转空格、首尾trim；保留100个Unicode码点的产品限制，完整请求每条≤128；超长就地报错不截断。JSON编码保留操作符/引号，不改中文弯引号为英文引号。未知语法不由客户端猜测解释。每查询count50、need_content=false，无Fetch。显式站点最多50候选；普通patents≤50/mixed≤100去重，继续每5条近底渐进显示。官方无page/offset/cursor，因此没有服务端下一页。

关键代码：`src/domain.ts`的validateInput/hasExplicitSite/plan/resultScope；`src/engine.ts` request/execute；`src/App.tsx` syntax-trigger/syntax-help与范围提示。测试见domain、engine及interaction测试；最终实际检查和原生证据见[本轮交付](syntax-navigation-update.md)。
