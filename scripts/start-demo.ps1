param(
  [switch]$NoInstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$demoSeed = Join-Path $root "server\demo\workingbeam.demo.json"
$dataDir = Join-Path $root "server\data"
$dataFile = Join-Path $dataDir "workingbeam.json"

if (-not (Test-Path -LiteralPath $demoSeed)) {
  throw "Demo seed not found at $demoSeed"
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Copy-Item -LiteralPath $demoSeed -Destination $dataFile -Force

Write-Host "Loaded populated WorkingBeam demo data into server\data\workingbeam.json"
Write-Host "Demo accounts use password: Password123!"
Write-Host "Freelancer: adeng@mail.com"
Write-Host "Client: bol.client@mail.com"

if (-not $NoInstall) {
  npm install
  Push-Location (Join-Path $root "server")
  npm install
  Pop-Location
  Push-Location (Join-Path $root "client")
  npm install
  Pop-Location
}

npm run dev
