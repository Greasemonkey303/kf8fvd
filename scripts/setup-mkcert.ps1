<#
Helper script to create mkcert TLS certs for local testing.

Requirements:
- Install mkcert (https://github.com/FiloSottile/mkcert)

Run from project root (PowerShell):
  .\scripts\setup-mkcert.ps1

This will create `./certs/localhost.pem` and `./certs/localhost-key.pem`.
#>

Param()

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Host "mkcert not found. Install mkcert first: https://github.com/FiloSottile/mkcert" -ForegroundColor Yellow
    exit 1
}

$certDir = Join-Path -Path $PSScriptRoot -ChildPath "..\certs" | Resolve-Path -ErrorAction SilentlyContinue
if (-not $certDir) { New-Item -ItemType Directory -Path (Join-Path -Path $PSScriptRoot -ChildPath "..\certs") | Out-Null }

$outCert = Join-Path -Path (Join-Path -Path $PSScriptRoot -ChildPath "..\certs") -ChildPath "localhost.pem"
$outKey = Join-Path -Path (Join-Path -Path $PSScriptRoot -ChildPath "..\certs") -ChildPath "localhost-key.pem"

Write-Host "Installing local CA (may require admin)..." -ForegroundColor Cyan
mkcert -install

Write-Host "Generating certs for: localhost, 127.0.0.1, ::1, 192.168.1.240" -ForegroundColor Cyan
mkcert -cert-file $outCert -key-file $outKey localhost 127.0.0.1 ::1 192.168.1.240

Write-Host "Wrote cert: $outCert" -ForegroundColor Green
Write-Host "Wrote key:  $outKey" -ForegroundColor Green
Write-Host "Start Docker Compose (will mount ./certs and Caddy will serve HTTPS on 443): docker-compose up --build" -ForegroundColor Yellow
