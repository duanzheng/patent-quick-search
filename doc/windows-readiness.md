# Windows兼容性与本机可构建性核查

日期：2026-10-21。核查目录为用户指定项目；不安装系统组件、不创建VM/容器/CI、不发布。本报告是源码/既有工具核查，不是Windows编译或Windows实测通过。

## 结论与最小环境

**当前这台Mac已有且已验证的工具不足以可靠生成Windows一期安装包。** 本任务没有Windows执行环境、Windows目标标准库、LLVM/LLD/资源编译器、NSIS或cargo-xwin。本轮不为了补齐它们擅自安装系统工具或创建环境。

最直接的最小需求是一台可使用的 **Windows11 x64机器**（可以是用户或测试协作者已有环境），已有：

- Node.js22.12+及固定版本 pnpm；本轮Mac使用22.22.2。
- Rust≥1.90、x86_64-pc-windows-msvc目标、rustfmt与clippy；本轮验证编译器为1.99.1，1.90最低版本只据已锁依赖声明核实，尚未实际运行。
- Visual Studio C++/MSVC x64工具与Windows SDK，在x64 Native Tools/Developer PowerShell中可发现cl.exe、link.exe、rc.exe。
- 项目依赖及打包工具缓存，或允许获取公开npm/crates/NSIS依赖的网络；脚本不会安装系统级工具或开通账号。
- 安装运行验收时的WebView2运行时；安装包已配置downloadBootstrapper，须单独测试已有及缺失运行时的安装路径。

先运行 `./scripts/build-windows.ps1 -PreflightOnly` 只核查环境；通过后默认命令构建NSIS。MSI不是PRD硬性格式，PRD只要求Windows x64安装包，因此默认不强加MSI相关的额外Windows可选功能。按需要使用`-IncludeMsi`；未授权时不自动开启系统组件。

## 当前Mac的实测工具盘点

| 检查 | 实际结果 |
|---|---|
| 系统 | Darwin arm64 |
| 任务Rust已安装目标 | aarch64-apple-darwin、x86_64-apple-darwin；没有x86_64-pc-windows-msvc |
| clang/lipo | Xcode工具存在，用于已完成的Mac两架构构建；不等于Windows链接器/SDK |
| clang-cl、lld-link、llvm-rc、cargo-xwin、makensis、wix、wine | PATH查询均未发现；已知Homebrew LLVM目录也无lld-link/llvm-rc |
| PowerShell | pwsh、powershell未发现；本轮不能实际解析/运行WindowsPS脚本 |
| 常见虚拟机 | PATH未发现prlctl/vmrun/VBoxManage/utmctl/qemu-system-x86_64；已知Applications路径未见Parallels、VMware Fusion、VirtualBox、UTM。不是对磁盘所有位置的穷举 |
| Podman | 5.4.1可执行文件存在；`podman machine list --format json`没有成功读出状态，因要创建配置目录下的查询锁文件而被沙箱阻止。未重试、未扩大目录权限、未启动或创建机器/容器；不能把Podman存在当作现成Windows环境 |

Podman查询的准确阻碍：操作为`podman machine list --format json`；目标锁文件为`/Users/duanzheng/.config/containers/podman/machine/applehv/podman-machine-default.lock`；返回operation not permitted、退出125。未得到机器状态，因此不宣称不存在VM。若以后确需进一步盘点该路线，需要针对该查询锁文件的额外权限；本轮没有取得/使用该权限。这个阻碍不阻止其他源码和本地回归工作。

首次Rust目标查询未带任务专用环境，尝试默认用户`.rustup`目录被沙箱阻止；随后改用已有CARGO_HOME/RUSTUP_HOME查询成功，没有创建全局工具链或重新下载安装。

[Tauri官方Windows安装文档](https://v2.tauri.app/distribute/windows-installer/)说明：MSI须在Windows生成；Mac/Linux交叉构建NSIS有局限且验证较少，需要额外NSIS、LLVM/LLD/llvm-rc、Windows Rust目标及cargo-xwin/SDK。当前未具备这些条件。即使以后补齐并交叉构建成功，也不能记作Windows安装、Credential Manager、热键或输入法实测。未擅自创建VM、启动Podman机器、下载Windows SDK或发布CI。

## 源码、依赖与配置检查

| 项目 | 核查与结论 |
|---|---|
| 原生入口 | `main.rs` release采用windows_subsystem=windows；Mac菜单和Reopen分支有cfg保护。未发现无保护的Mac专用API被Windows主路径直接调用；尚未实际Windows编译 |
| 凭据 | keyring3.6.3启用windows-native与apple-native；包源码将Windows Credential API与Apple Security Framework按平台门控。没有普通文件回退或取回完整Key的前端命令；Windows系统集成仍未验证 |
| HTTP/TLS | reqwest使用rustls、固定官方API、禁止重定向；无平台OpenSSL安装要求。Windows DNS/TLS/代理行为未验证 |
| 热键/托盘 | tauri-plugin-global-shortcut和tray-icon使用跨平台实现；Windows默认Ctrl+Alt+Space，关闭事件收起，退出事件取消任务。实际冲突/托盘和Alt+F4未验证 |
| 外部浏览器 | Windows使用固定rundll32.exe与url.dll处理器，URL先校验HTTP/HTTPS、无用户名密码，以独立参数传入，不经cmd shell；实际浏览器及特殊URL行为未验证 |
| 资源与WebView | WindowsICO头已检查：类型1、6张图；WebView2设为downloadBootstrapper、silent=true。未生成安装器、未验证安装引导 |
| 缓存/历史文件 | 本轮修复Windows先删旧文件再rename的数据丢失窗口，见下节；真实Windows文件锁/ACL仍需验证 |
| Rust最低版本 | 旧manifest宣称1.85，但当前锁定Tauri2.12.5等依赖声明1.90；已改为1.90。实际本轮只用1.99.1检查，没有伪称1.90实测 |
| 构建配置 | 源码锁文件保留；Windows脚本明确target为x86_64-pc-windows-msvc、--locked；默认只打NSIS，MSI显式可选。配置和脚本不是Windows编译通过证据 |

## 本轮可本地修复的缺口与回归

1. 历史/设置保存原先在Windows先remove_file旧目标再rename临时文件；替换失败可能失去旧数据。已改为同目录写临时文件、sync并关闭句柄，再由std::fs::rename替换；失败清理新临时文件，不预删旧目标。[Rust官方rename说明](https://doc.rust-lang.org/std/fs/fn.rename.html)确认支持替换已存在文件并使用Windows相应重命名实现。本轮两个真实临时文件测试验证覆盖成功和注入替换失败时旧数据仍在；不是Windows原生文件系统验收。
2. 正文“复制选中原文”此前按钮一直可点，靠点击后校验拒绝无效选区。本轮改为监听正文有效选区，只有选中已获取正文才启用；保留点击时的第二次校验和来源/抓取时间附加。原生选区和剪贴板仍待解锁后验收。
3. Windows脚本增加Windows11 x64、Node/Rust/目标、MSVC/SDK工具预检；`-PreflightOnly`不安装/编译，`-ChecksOnly`不打包，`-SkipInstall`复用项目依赖；不更改系统执行策略、工具链或可选功能。PowerShell不在本机，因此脚本仅静态核对，尚未Windows执行。
4. 增加`verify-windows-artifacts.mjs`，只检查应用payload的x64 PE32+ GUI头、NSIS输出存在和非空、可选MSI及SHA-256，清单明确runtimeVerified=false。NSIS启动器本身可能是x86，验证器不错误地要求它也是x64。五项合成字节测试通过，**没有生成假安装器或把它当真实Windows构建**。[Microsoft PE规范](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)用于核对Machine、PE签名与可选头字段。

本轮最终检查：前端32项、Rust22项，lint、类型检查、clippy通过；没有Windows编译/运行结果。检查原始输出见`doc/evidence/windows-review-checks.log`。由于本轮改动确实影响历史保存和界面产物，才对Mac开发包做一次必要更新；仅脚本/说明变化不触发额外Mac打包。

## 在既有Windows环境复现

从项目根目录的64位开发者PowerShell执行：

```powershell
# 只读预检；不安装系统工具、不创建环境
./scripts/build-windows.ps1 -PreflightOnly

# 正常本地NSIS构建，含lint/类型/前端测试/前端构建/Rust检查测试/产物头与哈希
./scripts/build-windows.ps1

# 已有node_modules时可复用；可选只检查，不创建安装包
./scripts/build-windows.ps1 -SkipInstall -ChecksOnly

# 仅在需要且已具备其构建条件时额外生成MSI
./scripts/build-windows.ps1 -SkipInstall -IncludeMsi
```

默认产物：`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`。可选MSI为同级`msi/`。验证清单为`src-tauri/target/windows-verification/artifacts.json`；其中payload的SHA应与安装后的应用exe一致。脚本没有启动安装器、读取真实Key、测试真实服务或自动声明验收通过。

如果系统策略不允许运行本地脚本，请逐条执行脚本中相同命令或让环境负责人处理，不使用ExecutionPolicy Bypass、不关闭系统防护。缺失cl/rc/目标标准库等条件时脚本会停止，交给环境负责人决定提供已有环境或另行授权系统设置；不自动安装。完整手工记录见[Windows验收记录模板](windows-acceptance-record-template.md)。
