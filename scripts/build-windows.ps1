[CmdletBinding()]
param(
    [switch]$PreflightOnly,
    [switch]$ChecksOnly,
    [switch]$SkipInstall,
    [switch]$IncludeMsi
)
# Existing Windows 11 x64 / MSVC environment only. Never installs system tools,
# enables optional OS features, creates a VM/CI job, runs an installer or reads a key.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT' -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    throw 'Use 64-bit PowerShell on an existing Windows 11 x64 machine.'
}
$patentBuildNumber = [Environment]::OSVersion.Version.Build
if ($patentBuildNumber -lt 22000) { throw 'The product acceptance baseline is Windows 11 (build 22000 or later).' }
$patentProjectRoot = Split-Path -Parent $PSScriptRoot
$patentPreviousLocation = Get-Location
$patentPreviousTarget = $env:CARGO_TARGET_DIR
function Resolve-Tool([string]$Name) {
    $tool = Get-Command $Name -CommandType Application -ErrorAction Stop
    return $tool.Source
}
function Invoke-Checked([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $File" }
}
try {
    Set-Location $patentProjectRoot
    $patentNode = Resolve-Tool 'node.exe'
    $patentNpm = Resolve-Tool 'npm.cmd'
    $patentRustc = Resolve-Tool 'rustc.exe'
    $patentCargo = Resolve-Tool 'cargo.exe'
    $patentRustup = Resolve-Tool 'rustup.exe'
    # Run from an x64 Native Tools/Developer PowerShell; do not auto-change system setup.
    $patentCl = Resolve-Tool 'cl.exe'
    $patentLink = Resolve-Tool 'link.exe'
    $patentRc = Resolve-Tool 'rc.exe'
    $patentNodeText = & $patentNode --version
    if ($LASTEXITCODE -ne 0 -or [version]($patentNodeText.TrimStart('v')) -lt [version]'22.12.0') { throw 'Node.js 22.12+ is required (22.22.2 was tested on Mac).' }
    $patentRustText = & $patentRustc --version
    if ($LASTEXITCODE -ne 0) { throw 'Cannot determine installed Rust compiler version.' }
    $patentRustMatch = [regex]::Match($patentRustText, '^rustc (\d+\.\d+\.\d+)')
    if (-not $patentRustMatch.Success) { throw 'Cannot determine installed Rust compiler version.' }
    if ([version]$patentRustMatch.Groups[1].Value -lt [version]'1.90.0') { throw 'Locked Tauri dependencies require Rust 1.90+; this project was checked with 1.99.1.' }
    $patentTargets = & $patentRustup target list --installed
    if ($LASTEXITCODE -ne 0 -or $patentTargets -notcontains 'x86_64-pc-windows-msvc') { throw 'The existing toolchain lacks x86_64-pc-windows-msvc. Ask the environment owner to provide it; this script will not install it.' }
    Write-Host "Preflight: Windows build $patentBuildNumber; $patentNodeText; $patentRustText"
    Write-Host "Existing compiler/linker/resource compiler: $patentCl; $patentLink; $patentRc"
    if ($PreflightOnly) { return }
    # This process only; restore the caller's setting in finally.
    $env:CARGO_TARGET_DIR = Join-Path $patentProjectRoot 'src-tauri/target'
    if (-not $SkipInstall) { Invoke-Checked $patentNpm @('ci','--registry=https://registry.npmjs.org','--no-fund','--no-audit') }
    elseif (-not (Test-Path -LiteralPath (Join-Path $patentProjectRoot 'node_modules'))) { throw '-SkipInstall requires existing project dependencies.' }
    Invoke-Checked $patentNpm @('run','lint')
    Invoke-Checked $patentNpm @('run','typecheck')
    Invoke-Checked $patentNpm @('test')
    Invoke-Checked $patentNpm @('run','build')
    Invoke-Checked $patentCargo @('fmt','--manifest-path','src-tauri/Cargo.toml','--','--check')
    Invoke-Checked $patentCargo @('clippy','--locked','--target','x86_64-pc-windows-msvc','--manifest-path','src-tauri/Cargo.toml','--','-D','warnings')
    Invoke-Checked $patentCargo @('test','--locked','--target','x86_64-pc-windows-msvc','--manifest-path','src-tauri/Cargo.toml')
    if ($ChecksOnly) { return }
    $patentBundles = 'nsis'
    if ($IncludeMsi) { $patentBundles = 'nsis,msi' }
    Invoke-Checked $patentNpm @('run','tauri','build','--','--target','x86_64-pc-windows-msvc','--bundles',$patentBundles)
    $patentVerify = @('scripts/verify-windows-artifacts.mjs')
    if ($IncludeMsi) { $patentVerify += '--include-msi' }
    Invoke-Checked $patentNode $patentVerify
    Write-Host 'Local package files and payload headers verified. Runtime, clean installation, credentials, real API, tray, shortcuts and uninstall remain UNVERIFIED.'
} finally {
    $env:CARGO_TARGET_DIR = $patentPreviousTarget
    Set-Location $patentPreviousLocation
}
