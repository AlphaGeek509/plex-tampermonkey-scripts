# Ensures deps, starts tests, builds dev userscript
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot\..\

if (!(Test-Path .\node_modules)) {
  Write-Host "Installing Node deps (npm ci)..." -ForegroundColor Cyan
  npm ci
}

Write-Host "Starting Vitest..." -ForegroundColor Cyan
Start-Process -NoNewWindow powershell -ArgumentList "npm run test:watch"

# Build common helpers only if you need them today. Comment out if not needed.
#Write-Host "Starting build:common:watch..." -ForegroundColor Cyan
#Start-Process -NoNewWindow powershell -ArgumentList "npm run build:common:watch"

Write-Host "Building QT10 dev userscript..." -ForegroundColor Cyan
npm run build:qt10:dev

Write-Host "Done. If TamperHost is running, open:" -ForegroundColor Yellow
Write-Host "  http://localhost:5000/QT10.dev.user.js" -ForegroundColor Yellow

Pop-Location
