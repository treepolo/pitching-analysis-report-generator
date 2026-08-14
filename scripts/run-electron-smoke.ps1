$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$smokeProjectRoot = Join-Path $repositoryRoot ('.tmp\electron-smoke-root-' + $PID)
$smokeUserDataPath = Join-Path $repositoryRoot ('.tmp\electron-smoke-user-data-' + $PID)
$electronCommand = Join-Path $repositoryRoot 'node_modules\.bin\electron.cmd'

New-Item -ItemType Directory -Force -Path $smokeProjectRoot | Out-Null
Remove-Item -LiteralPath $smokeUserDataPath -Recurse -Force -ErrorAction SilentlyContinue

$env:PITCHING_PROJECT_ROOT = $smokeProjectRoot
$env:PITCHING_SMOKE = '1'
& $electronCommand '--disable-gpu' "--user-data-dir=$smokeUserDataPath" '.'
$exitCode = $LASTEXITCODE

Remove-Item -LiteralPath $smokeUserDataPath -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $smokeProjectRoot -Recurse -Force -ErrorAction SilentlyContinue
exit $exitCode
