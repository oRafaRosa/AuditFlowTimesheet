#!/usr/bin/env powershell
# Replicar exatamente o workflow do GitHub Actions
$ErrorActionPreference = "Stop"

Write-Host "=== Step 1: Install dependencies (npm ci) ===" -ForegroundColor Yellow
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci falhou com exit code $LASTEXITCODE" }

Write-Host "=== Step 2: Build ===" -ForegroundColor Yellow
npm run build --verbose
if ($LASTEXITCODE -ne 0) { throw "npm run build falhou com exit code $LASTEXITCODE" }

Write-Host "=== Build PASSOU! ===" -ForegroundColor Green
Write-Host "dist/ foi gerado com sucesso"
Get-ChildItem dist/
