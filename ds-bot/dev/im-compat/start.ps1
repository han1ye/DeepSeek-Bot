$ErrorActionPreference = 'Stop'
if ((Split-Path -Leaf $PSScriptRoot) -ne '.dsh-test-im') {
  throw 'Copy dev/im-compat into the repository .dsh-test-im directory before running.'
}
if (Get-NetTCPConnection -State Listen -LocalPort 3099,8799 -ErrorAction SilentlyContinue) {
  throw 'Test ports 3099 and 8799 must be free.'
}
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPlugin = Join-Path $taskRoot 'ds-bot'
$taskProfile = Join-Path $PSScriptRoot 'home/profiles/web'
$taskModules = Join-Path $taskProfile 'node_modules'
foreach ($taskEntry in @(@('ds-bot', $taskPlugin), @('myagent-im-smoke', (Join-Path $PSScriptRoot 'fixture')))) {
  $taskLink = Join-Path $taskModules $taskEntry[0]
  if (-not (Test-Path -LiteralPath $taskLink)) { New-Item -ItemType Junction -Path $taskLink -Target $taskEntry[1] | Out-Null }
}
$taskManifestPath = Join-Path $taskProfile 'package.json'
$taskManifest = Get-Content -LiteralPath $taskManifestPath -Raw | ConvertFrom-Json
$taskManifest.dependencies | Add-Member -Force -NotePropertyName 'ds-bot' -NotePropertyValue ('link:' + $taskPlugin.Replace('\','/'))
$taskManifest.dependencies | Add-Member -Force -NotePropertyName 'myagent-im-smoke' -NotePropertyValue ('link:' + (Join-Path $PSScriptRoot 'fixture').Replace('\','/'))
$taskManifest.dsh.profile.bundles = @('@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','ds-bot','@xmanrui/dsh-im','myagent-im-smoke')
$taskManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskManifestPath -Encoding utf8
$env:DSH_HOME = Join-Path $PSScriptRoot 'home'
$env:DEEPSEEK_BASE_URL = 'http://127.0.0.1:8799/v1'
$env:DEEPSEEK_API_KEY = 'mock-key'
$env:MOCK_PORT = '8799'
$env:MOCK_LOG = Join-Path $PSScriptRoot 'mock.jsonl'
$env:MYAGENT_IM_PACKAGE = Join-Path $taskModules '@xmanrui/dsh-im'
$taskNode = (Get-Command node).Source
$mock = Start-Process -FilePath $taskNode -ArgumentList @('dev/mock-llm.mjs') -WorkingDirectory $taskPlugin -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'mock.out') -RedirectStandardError (Join-Path $PSScriptRoot 'mock.err') -PassThru
$web = Start-Process -FilePath $taskNode -ArgumentList @('dev/harness/node_modules/@deepseek-ai/dsh/lib/bin.js','--profile','web','--no-open','--port','3099') -WorkingDirectory $taskPlugin -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'web.log') -RedirectStandardError (Join-Path $PSScriptRoot 'web.err') -PassThru
@{ processes = @($mock, $web) | ForEach-Object { @{ id = $_.Id; started = $_.StartTime.ToUniversalTime().ToString('o'); executable = $taskNode } } } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'pids.json')
Write-Output "Isolated IM test processes started: mock $($mock.Id), web $($web.Id)"
