# 安全政策

目前仅维护 `0.1.x` 开发线，尚无稳定版或响应时限承诺。历史快照不保证回补安全修复。

## 报告漏洞

不要在公开 issue / PR 粘贴密钥、个人数据、完整用户状态、搜索内容或可利用细节。如果启用了 GitHub 私密漏洞报告，使用 Security → Report a vulnerability；若不可用，先通过[维护者主页](https://github.com/duanzheng)索取私下渠道，也可开一个仅请求安全联系方式、不含漏洞细节的 issue。尚未声明专用安全邮箱或 bug bounty。

报告可包含版本/提交、操作系统、脱敏复现、影响及建议修复，使用合成 Key 与公开虚构输入。泄漏 Key 应立即在服务商撤销/轮换；删除工作区文件无法撤销历史、日志或其他副本中的泄漏。

## 凭据与数据

Key **明文**存于 Tauri `app_config_dir()` 下 `private/credentials-v1.json`。应用标识 `com.patentquicksearch.desktop`；通常 macOS 为 `~/Library/Application Support/com.patentquicksearch.desktop/`，Windows 为 `%APPDATA%\com.patentquicksearch.desktop\`，Linux 开发环境为 `$XDG_CONFIG_HOME/com.patentquicksearch.desktop/`（默认 `~/.config/…`）。具体由系统与 Tauri 决定。不要将这些目录复制进仓库、支持包、截图或 CI。

这不是加密保险箱：拥有文件读取权限的程序、备份或同一系统账户可取得 Key。Unix 新建目录 `0700`、文件 `0600`，读取拒绝过宽文件权限与符号链接；Windows 依赖用户目录 ACL，仍需实机验收。Rust 在内存使用 Key，前端不回填已保存完整 Key；关闭设置清空未保存草稿。旧钥匙串不读取、不迁移、不删除。

历史保存查询、标题、摘要、原始 URL，虽不含 Key 也可能敏感。余额仅在进程内存；诊断默认本地、不自动上传，不记录 Key、余额或检索内容。主动导出也应先审阅。卸载应用不等于删除用户数据。

## 网络与桌面边界

用户主动提交搜索或查看/刷新余额才访问固定 DeepSeek 官方接口。不运行 Fetch；来源在默认浏览器打开。前后端验证 URL 协议、控制字符、内嵌凭据；Rust 使用独立参数打开来源。结果按普通文字显示，CSP 限制远程内容，远程网页没有桌面 IPC 权限。

只向外部服务提交公开、获准处理的内容。默认测试不调用付费 API、不使用环境里的真实 Key。GUI 自动化或截图也可能读取用户数据，不能自动视为无风险。

## CI 与发布

PR 使用 `contents: read`，无签名密钥或仓库 secrets，无 `pull_request_target`。依赖安装和编译会执行第三方代码，应仅用临时 runner。Actions 固定完整 SHA，依赖锁定；不可信 PR 不得接触发布环境。

只有标签通过 `master` 归属、版本、许可证和质量门槛才构建发布；最终单独 job 获得 `contents: write`。只上传允许的安装器、公开元数据与校验和，不上传用户目录、整个 target、日志或截图。不生成或配置持久签名凭据；macOS 仅 ad-hoc、未公证，Windows 未签名，自动版本标记 prerelease。见[发布指南](doc/releasing.md)。
