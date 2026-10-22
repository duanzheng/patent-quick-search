# Search-only 与默认浏览器来源交付 · 2026-10-22

按用户最新决定，取消正文抓取和内置阅读。新普通包已切换并完成本机核心原生验证；本轮没有新真实Search/Fetch/余额调用，也没有读取/输出真实Key、操作钥匙串、删除用户历史或提交/推送。

## 实现

- Engine仅调度Search，count10、need_content=false、并发2、60秒；暂时错误最多重试一次，混合最大4次尝试、仅专利2次。删除自动前三条、手动Fetch、Fetch额度与reading阶段。
- Rust在校验入口拒绝fetch/未知operation及need_content=true，删除Fetch URL、正文哈希处理、touch_cache命令和正文指标事件；根sha2直接依赖移除，Cargo.lock仅去掉根依赖，不升级其他锁版本（sha2仍可能是Tauri传递依赖）。
- UI删除内置阅读器、正文预览/状态/错误/重试/查找/选区复制及正文缓存配置；标题、选中结果Enter及“打开原网页”走同一个openOriginalSource→现有open_source。摘要只用Search snippet/summary，不额外总结。
- URL先校验HTTP/HTTPS、host、无userinfo/控制字符/首尾空白及长度，再把原字符串当独立进程参数交默认浏览器；不规范化后覆盖原URL，保留查询编码/重复参数/fragment。前后端均防危险协议。
- 历史schemaVersion1兼容。旧content/preview/fetchStatus等仍留原记录，显示投影才省略；旧reading/仅正文失败的partial按Search状态呈现，不继续抓取。既有50条/30天历史策略不变，取消正文缓存淘汰，不做专项迁移删除。原生R05记录仍19候选、2个旧content字段保留。Key存储生命周期和余额隔离保持。

## 检查与真实原生验证

`npm run lint`、`npm run typecheck`、`npm test`通过：43项（Engine15、domain8、source3、UI10、Windows头5、静默反馈2）。Rust fmt/clippy及36项通过。合成回归明确断言：有结果也不产生Fetch；重试仅Search/最多4次；恢复和反复打开来源不增加API；URL不改写；危险协议桥前拒绝；旧对象不变；Search恶意标签转义。旧正文测试已被新契约测试替换，数量变化如实记录。

使用当前 `src-tauri/target/debug/bundle/macos/技术点快搜.app`，没有用home-hierarchy-ready旧包或QA包替代。桌面交还后旧包正常Command+Q退出，新普通包启动成功，无QA控制条。

- Command+,进入设置→历史，Escape回设置聚焦“搜索历史”，再Escape返回搜索输入；保留已有查询上下文。
- 从原R05公开历史恢复19候选，无正文控件/错误/抓取状态。点击W3C结果“打开原网页”，默认Chrome新建标签739695781并加载真实页面，URL为`https://lists.w3.org/Archives/Public/public-lod/2010Mar/0124.html#1`，fragment完整。只验证来源可打开，不重复评价网页内容或检索相关性。关闭本轮新开的重复页，保留原有标签。
- 按冻结原用例原输入执行R17 `空格+Tab+换行+空格`、R18 101个“测”、R19 `site:example.com Cas9`，仅专利范围；全部显示本地错误，保留旧19条结果，101码点未截断。
- 来源复制后使用原生粘贴核对，公开标题+原始URL匹配，随后恢复RFC草稿/混合范围。浏览器工具的独立clipboard读取曾为空，不拿它判应用失败；原生copy/paste结果通过。
- Escape、Command+W静默隐藏，reopen后搜索聚焦及19条结果保留；安全指标确认hidden/command与shown/reopen。因异步落盘，在重新打开后核对了实际隐藏事件，不把提前读到的旧指标当结果。
- API基线79次历史尝试（Search22、Fetch57），原生结束仍79/22/57；本轮增量Search0、Fetch0、总0。浏览器访问来源不等于DeepSeek Fetch。截图与请求差值在evidence/search-only。

全局快捷键自动注入未取得source=shortcut事件，仍未验证；托盘菜单端到端未执行。不为这两项拖延已通过的核心交付，也没有通过绕权限/解锁补验。

## 交付与截图

当前普通arm64应用和Intel开发应用均已构建，两个DMG均hdiutil VALID。arm64 linker ad-hoc/unsealed、Intel未签名，均未公证；Intel设备和Windows未运行。当前普通arm64包正在运行，旧home-hierarchy-ready/settings-icon-ready目录为历史暂存，不再用于新行为验收。

- `src-tauri/target/debug/bundle/macos/技术点快搜.app`
- `src-tauri/target/debug/bundle/dmg/patent-quick-search_0.1.0_aarch64-dev.dmg`
- `src-tauri/target/x86_64-apple-darwin/debug/bundle/dmg/patent-quick-search_0.1.0_x86_64-dev.dmg`

[真实主页](evidence/search-only/01-home-normal-native.png) · [真实历史结果](evidence/search-only/02-public-history-search-only-normal.png) · [真实来源浏览器页](evidence/search-only/03-browser-real-original-source.png)。另有R17/R18/R19本地验证截图，均普通应用、无QA控件/真实Key/余额；左上紫标及鼠标光晕为控制工具覆盖层。

当前结果截图Library：`libfile_91c12970191881918d2f5edf48c7cb17`版本2，已改名“技术点快搜-结果-真实普通应用-Search-only.png”，替换旧夹具截图；其内容为真实普通包恢复的旧公开Search结果，不是新增真实查询或假结果。

## 文档与剩余范围

当前PRD/验收清单已按授权变更，之前完整版本位于doc/archive。旧正文故障/Fetch增量实验已撤销，不列为新版未完成；独立retrieval-evaluation-2026-10-22.md及证据完全保留。Search质量、已知号定位等结论仍按旧评测限定，不因去掉Fetch宣称检索质量改善。

仍需Windows原生安装运行、Intel/macOS13设备验证、正式签名公证、全局键/托盘端到端和完整长期价值验收。新版没有新增真实Search测试，这不阻碍本轮已验证的历史→原网页流程，但完整Search真实集成仍需后续按需要执行。没有已知审批或锁屏阻碍、没有在途构建或收费查询。
