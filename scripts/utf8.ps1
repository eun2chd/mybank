[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
chcp 65001 | Out-Null

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:NPM_CONFIG_UNICODE = "true"
$env:LESSCHARSET = "utf-8"

Write-Output "PowerShell UTF-8 environment is ready."
