# 高级语法与统一结果选中 · 2026-10-22

## 本轮完成

直接在搜索框输入DeepSeek官方site/-site/lang/after/before、英文双引号精确短语、排除词/短语和官方多站点大写OR写法。移除旧客户端操作符拦截，保留空白、100 Unicode码点输入限制及完整请求128上限；超长不截断。查询通过JSON保留原运算符，不做翻译/分词/中文引号替换。日期是网页发布时间，不是专利优先权日。

明确规则：英文双引号外的独立site/-site优先，仅发送规范化原q一次，不附加Google Patents，不强制过滤非GP结果。输入时原范围位置显示“按查询中的站点条件”；删除后恢复先前范围。引号内的site字样是文字，不触发覆盖。没有显式站点时，mixed仍定向+原q两Search，patents定向一Search及GP文献过滤；lang/date/排除词在附加范围后原样保留。显式站点候选池≤50；原mixed≤100去重，渐进显示仍每5条，无服务端分页/Fetch。

小问号在搜索框旁，按需打开帮助，没有新增筛选面板或常驻说明。示例文本可选择复制；Tab可达、Enter打开、焦点留在帮助、Escape或点击外部关闭并回搜索。没有成功提示。

选中状态由鼠标/键盘共用。普通行区域点击选择/聚焦，不开浏览器；标题/打开原网页明确打开，复制只复制。行及行内按钮聚焦时上下从当前选择继续，保持单一高亮、滚入视口；到首条上移回搜索，末条不越界，可跨已有结果的显示批次。帮助/设置与其他控件不被接管，多行输入、组合键和IME方向键保留；设置关闭恢复结果上下文，帮助关闭回搜索。延迟显示使用导航代际，后来的选择/输入/弹层/新查询使旧焦点回调失效。追加结果保持原顺序/当前选择，旧历史不迁移或删除。

## 先复现再修复

普通arm64旧包，恢复公开R05历史19条：在输入Down选第1条，点第2条摘要后焦点变HTML content，高亮仍第1条，Down无变化。[旧包截图](evidence/syntax-navigation/00-bug-before.png)。原因是旧document键盘逻辑要求activeElement===input，article无onClick/onFocus选中处理。

本轮修改`src/domain.ts`的validateInput/hasExplicitSite/plan/resultScope、`src/engine.ts`有效解析范围、`src/App.tsx`问号与焦点导航、`src/style.css`局部样式；增加Happy DOM开发依赖与`tests/interaction.test.tsx`真实React DOM测试。原凭据、余额、Rust协议/安全URL实现未改，不读取/迁移Key。

## 已执行检查

| 检查 | 实际结果 |
|---|---|
| npm run lint / npm run typecheck | 通过 |
| npm test | 8文件61项通过，其中8项DOM交互；零真实服务 |
| cargo fmt --manifest-path src-tauri/Cargo.toml -- --check | 通过 |
| cargo test --manifest-path src-tauri/Cargo.toml --locked | 36项通过，隔离合成凭据/传输 |
| cargo clippy --manifest-path src-tauri/Cargo.toml --locked -- -D warnings | 通过 |
| npm run tauri build -- --debug --bundles app | arm64普通包成功 |
| npm run tauri build -- --debug --target x86_64-apple-darwin --bundles app | Intel普通包成功，未设备执行 |
| 本地DMG创建及hdiutil verify | 两份VALID；末尾codesign检查Intel未签名返回1，非构建/校验失败 |
| git diff --check | 通过；未暂存/提交/推送 |

DOM回归覆盖键盘→鼠标→键盘、鼠标首选、行内打开单次/复制、跨批次、追加保持选择、延迟回调对新选择/查询失效、帮助Tab/Escape/外部点击、设置返回选中行、表单/多行/IME组合键。domain/Engine合成测试明确site原q仅一次且专利选项下不丢非GP、JSON完整保留、need_content=false/无Fetch。

## 真实普通应用原生结果

当前普通arm64应用已退出旧进程并切换新版，无QA控件；使用原有公开RFC3986历史，不新建Search：

- 键盘第1条→鼠标第2条摘要→Down第3条，通过；AX结果行只有1条“已选中”，焦点为第3条，截图可核对。
- 重新恢复历史后鼠标首选第1条→Down第2条，通过；正常区域不会打开浏览器。
- 设置打开/Escape恢复第3条焦点，Down第4/5/6；跨显示边界5→10条，焦点第6条，通过。
- 第2条复制按钮→Down第3条，无复制错误、无打开；完整复制字节有DOM断言，本轮没有重新读取系统剪贴板。
- Tab从搜索到问号、Enter打开；帮助Tab留在关闭控件、Escape返回输入，外部点击关闭返回输入，通过。
- 显式多site草稿显示站点优先提示、隐藏范围下拉；换成引号内site文字恢复范围，通过（未提交该草稿）。
- 明确第2条标题点击，仅新开1个默认Chrome标签，真实W3C页面成功，原始URL `https://lists.w3.org/Archives/Public/public-lod/2010Mar/0124.html#1`完整保留；关闭本次新标签，未动其他标签。
- API计数85→85，Search28→28，Fetch57→57，新增全部0；57是旧版本历史请求。无余额查询/真实Key读取、历史删除。

[普通结果与问号](evidence/syntax-navigation/03-keyboard-mouse-keyboard-normal.png) · [语法帮助](evidence/syntax-navigation/01-help-normal.png) · [站点草稿](evidence/syntax-navigation/02-site-draft-normal.png) · [跨批次](evidence/syntax-navigation/04-cross-batch-normal.png)。均原始CUA截图，无真实Key/余额/QA控件；紫徽标和鼠标光晕属于控制工具。Library结果图`libfile_91c12970191881918d2f5edf48c7cb17`版本4，名称“技术点快搜-高级语法与统一选中-普通应用.png”。

## 当前包与限制

正在运行：`src-tauri/target/debug/bundle/macos/技术点快搜.app`。

- Apple Silicon DMG：`src-tauri/target/debug/bundle/dmg/patent-quick-search_0.1.0_aarch64-dev.dmg`
- Intel DMG：`src-tauri/target/x86_64-apple-darwin/debug/bundle/dmg/patent-quick-search_0.1.0_x86_64-dev.dmg`

两份为本地debug开发包；arm64 linker ad-hoc/资源未封签，Intel未签名，未公证。Windows/Intel设备、清洁安装/macOS13仍未验。没有为本轮支付查询费用逐条验证上游高级语法匹配效果，不能把客户端透传/合成测试称为真实服务检索质量通过；中文物理IME、本轮原生暗色未补测。旧冻结R19禁止site用例已由用户新需求撤销，旧评测报告原样保留，不把它当新版错误。

当前无锁屏/审批/在途构建阻碍；本轮两项局部完成，不扩展为全64项跨平台验收通过。原始日志、计数和观察保存在本机`doc/evidence/syntax-navigation/`（忽略不入Git）。
