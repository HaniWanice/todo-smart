# Registers the Windows scheduled task that refreshes the "Projets" tab every 30 minutes.
# Run once: powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1
# Remove:   Unregister-ScheduledTask -TaskName "ToDo Smart - Projets" -Confirm:$false

$script = Join-Path $PSScriptRoot 'scan-projects.mjs'
$node = (Get-Command node).Source
$log = Join-Path $env:LOCALAPPDATA 'todo-smart-scan\scan.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

# conhost --headless runs the console app without flashing a window.
$cmd = "`"$node`" `"$script`" >> `"$log`" 2>&1"
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless cmd.exe /c `"$cmd`""
$every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 30)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 25)

Register-ScheduledTask -TaskName 'ToDo Smart - Projets' -Action $action -Trigger $every, $logon -Settings $settings `
  -Description 'Scanne les sessions Claude Code (PC + Mac) et met à jour l''onglet Projets de ToDo Smart.' -Force | Out-Null
Write-Output "Tâche installée. Journal : $log"
