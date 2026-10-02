<#
.SYNOPSIS
  Installer smoke test for Windows bundles (NSIS + MSI).

.DESCRIPTION
  For each installer: silent install, verify the executable landed, launch it
  with CLIPY_SMOKE_TEST=1 (the app exits 0 once the frontend has booted and
  reported ready, non-zero on failure), then silent uninstall and verify
  removal. Exits non-zero on the first failure.

.PARAMETER BundleDir
  Path to src-tauri/target/<target>/release/bundle.
#>
param(
  [Parameter(Mandatory = $true)][string]$BundleDir,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

function Invoke-SmokeLaunch([string]$exe) {
  Write-Host "Launching $exe in smoke mode"
  $env:CLIPY_SMOKE_TEST = "1"
  try {
    $proc = Start-Process -FilePath $exe -PassThru
    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      throw "App did not report ready within $TimeoutSeconds s"
    }
    if ($proc.ExitCode -ne 0) { throw "App exited with code $($proc.ExitCode)" }
    Write-Host "Smoke launch OK"
  } finally {
    Remove-Item Env:CLIPY_SMOKE_TEST -ErrorAction SilentlyContinue
  }
}

function Find-AppExe([string]$dir) {
  $exe = Get-ChildItem -Path $dir -Filter *.exe -File |
    Where-Object { $_.Name -notmatch '^uninstall' } |
    Select-Object -First 1
  if (-not $exe) { throw "No application executable found in $dir" }
  return $exe.FullName
}

# --- NSIS (installMode: currentUser -> %LOCALAPPDATA%\Clipy) ---------------
$nsis = Get-ChildItem -Path (Join-Path $BundleDir "nsis") -Filter *-setup.exe | Select-Object -First 1
if (-not $nsis) { throw "NSIS installer not found" }
Write-Host "NSIS: $($nsis.FullName)"
Start-Process -FilePath $nsis.FullName -ArgumentList "/S" -Wait
$nsisDir = Join-Path $env:LOCALAPPDATA "Clipy"
Invoke-SmokeLaunch (Find-AppExe $nsisDir)
Start-Process -FilePath (Join-Path $nsisDir "uninstall.exe") -ArgumentList "/S" -Wait
# The NSIS uninstaller re-launches itself from %TEMP% and returns early.
for ($i = 0; $i -lt 30 -and (Test-Path (Join-Path $nsisDir "*.exe")); $i++) { Start-Sleep -Seconds 1 }
if (Test-Path (Join-Path $nsisDir "*.exe")) { throw "NSIS uninstall left executables behind in $nsisDir" }

# --- MSI (per-machine -> Program Files\Clipy) --------------------------------
$msi = Get-ChildItem -Path (Join-Path $BundleDir "msi") -Filter *.msi | Select-Object -First 1
if (-not $msi) { throw "MSI not found" }
Write-Host "MSI: $($msi.FullName)"
$log = Join-Path $env:RUNNER_TEMP "msi-install.log"
$p = Start-Process msiexec.exe -ArgumentList "/i `"$($msi.FullName)`" /qn /norestart /l*v `"$log`"" -Wait -PassThru
if ($p.ExitCode -ne 0) { Get-Content $log -Tail 50; throw "msiexec install failed: $($p.ExitCode)" }
$msiDir = Join-Path $env:ProgramFiles "Clipy"
Invoke-SmokeLaunch (Find-AppExe $msiDir)
$p = Start-Process msiexec.exe -ArgumentList "/x `"$($msi.FullName)`" /qn /norestart" -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "msiexec uninstall failed: $($p.ExitCode)" }
if (Test-Path (Join-Path $msiDir "*.exe")) { throw "MSI uninstall left executables behind in $msiDir" }

Write-Host "Windows installer smoke tests passed"
