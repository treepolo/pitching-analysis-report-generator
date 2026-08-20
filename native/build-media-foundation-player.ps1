$ErrorActionPreference = 'Stop'

$nativeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $nativeRoot 'media-foundation-player.cpp'
$outputRoot = Join-Path $nativeRoot 'bin'
$outputPath = Join-Path $outputRoot 'media-foundation-player.exe'

if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
  throw 'cl.exe was not found. Run this script from a Visual Studio Developer PowerShell with the Windows SDK C++ workload.'
}
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Native source is missing: $sourcePath"
}
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

& cl.exe /nologo /std:c++17 /EHsc /W4 /DUNICODE /D_UNICODE `
  $sourcePath `
  /link "/OUT:$outputPath" mf.lib mfplat.lib mfuuid.lib evr.lib shlwapi.lib ole32.lib propsys.lib
if ($LASTEXITCODE -ne 0) {
  throw "Native Media Foundation helper build failed with exit code $LASTEXITCODE"
}
Write-Output "Built $outputPath"
