# Ruleta del Trago — arranque en la nube (Cloudflare Tunnel)
# Ejecuta el servidor y expone una URL pública para jugar desde el móvil.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "Compilando..." -ForegroundColor Cyan
npm run build

Write-Host "Iniciando servidor en puerto 3000..." -ForegroundColor Cyan
$server = Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $Root -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 3

Write-Host "Abriendo túnel Cloudflare..." -ForegroundColor Cyan
$tunnel = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel --url http://localhost:3000" -RedirectStandardOutput "$Root\tunnel.log" -RedirectStandardError "$Root\tunnel.err.log" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 8

$url = ""
if (Test-Path "$Root\tunnel.err.log") {
  $log = Get-Content "$Root\tunnel.err.log" -Raw
  if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    $url = $Matches[0]
  }
}

if ($url) {
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Green
  Write-Host "  JUEGO LISTO: $url" -ForegroundColor Yellow
  Write-Host "============================================" -ForegroundColor Green
  Write-Host "Comparte ese link con tus amigos." -ForegroundColor White
  $url | Out-File "$Root\PUBLIC_URL.txt" -Encoding utf8
} else {
  Write-Host "Túnel iniciado. Revisa tunnel.err.log para la URL." -ForegroundColor Yellow
}

Write-Host "PID servidor: $($server.Id) | PID túnel: $($tunnel.Id)" -ForegroundColor Gray
Write-Host "Para parar: Stop-Process -Id $($server.Id),$($tunnel.Id)" -ForegroundColor Gray
