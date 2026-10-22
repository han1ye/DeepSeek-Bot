$ErrorActionPreference = 'Stop'
if ((Split-Path -Leaf $PSScriptRoot) -ne '.dsh-test-im') {
  throw 'Run the copy inside .dsh-test-im.'
}
$taskRecords = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'pids.json') -Raw | ConvertFrom-Json).processes
if (-not $taskRecords) { throw 'No process records from this launcher.' }
$taskProcesses = foreach ($taskRecord in $taskRecords) {
  $taskProcess = Get-Process -Id $taskRecord.id -ErrorAction SilentlyContinue
  if (-not $taskProcess) { continue }
  if ($taskProcess.Path -ne $taskRecord.executable -or $taskProcess.StartTime.ToUniversalTime().Ticks -ne ([datetime]$taskRecord.started).ToUniversalTime().Ticks) {
    throw "PID $($taskRecord.id) is not the original test process; refusing to stop it."
  }
  $taskProcess
}
$taskProcesses | Stop-Process
Write-Output 'Isolated IM test processes stopped.'
