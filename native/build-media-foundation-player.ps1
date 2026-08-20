$ErrorActionPreference = 'Stop'

$nativeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $nativeRoot 'media-foundation-player.cpp'
$outputRoot = Join-Path $nativeRoot 'bin'
$outputPath = Join-Path $outputRoot 'media-foundation-player.exe'

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Native source is missing: $sourcePath"
}
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
$gxx = Get-Command g++.exe -ErrorAction SilentlyContinue
if (-not $gxx) {
  $knownGxx = 'C:\msys64\ucrt64\bin\g++.exe'
  if (Test-Path -LiteralPath $knownGxx -PathType Leaf) {
    $gxx = Get-Item -LiteralPath $knownGxx
  }
}

if ($cl) {
  & $cl.Source /nologo /std:c++17 /EHsc /W4 /DUNICODE /D_UNICODE `
    $sourcePath `
    /link "/OUT:$outputPath" mf.lib mfplat.lib mfuuid.lib evr.lib shlwapi.lib ole32.lib propsys.lib
} elseif ($gxx) {
  # MinGW-w64's Windows SDK import libraries provide a self-contained fallback
  # for hosts without the MSVC C++ workload. Static C++ runtimes keep the helper
  # independent of the MSYS installation at runtime.
  Push-Location (Split-Path -Parent $nativeRoot)
  try {
    & $gxx.Source -std=c++20 -O2 -municode -static-libgcc -static-libstdc++ -static `
      'native\media-foundation-player.cpp' -o 'native\bin\media-foundation-player.exe' `
      -lmf -lmfplat -lmfuuid -levr -lshlwapi -lole32 -lpropsys -luser32 -lkernel32 -luuid
  } finally {
    Pop-Location
  }
} else {
  throw 'No supported C++ compiler was found. Run from a Visual Studio Developer PowerShell or install MinGW-w64 (g++).'
}
if ($LASTEXITCODE -ne 0) {
  throw "Native Media Foundation helper build failed with exit code $LASTEXITCODE"
}
Write-Output "Built $outputPath"
