# ------------------------------------------------------------------------------
# Description: to gracefully close and then reopen Claude Desktop.
#
# Usage: powershell.exe -ExecutionPolicy Bypass -File .estart_claude.ps1
# ------------------------------------------------------------------------------

# UPDATE: claude exe path
$ApplicationPath = "C:\Users\jeremy.heng\AppData\Local\AnthropicClaude\Claude.exe"
$processName = "Claude"

# close claude
Write-Host "Attempting to close Claude Desktop..."
Get-Process -Name $processName -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# reopen
Write-Host "Reopening Claude Desktop..."
try {
    Start-Process -FilePath $ApplicationPath
    Write-Host "Claude Desktop reopened successfully."
}
catch {
    Write-Error "Failed to reopen Claude Desktop. Please check the ApplicationPath: '$ApplicationPath'"
    Write-Error $_.Exception.Message
}