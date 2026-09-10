$ErrorActionPreference = "Stop"

Write-Host "[1/5] Ensuring .env exists"
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

Write-Host "[2/5] Installing backend dependencies with Bun"
Push-Location "backend"
bun install
Pop-Location

Write-Host "[3/5] Installing frontend dependencies"
Push-Location "frontend"
npm install
Pop-Location

Write-Host "[4/5] Creating Python virtual environment"
Push-Location "sim"
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

Write-Host "[5/5] Installing Python dependencies"
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
Pop-Location

Write-Host "Bootstrap complete. Next: start infra with docker compose up -d timescaledb redis kafka kafka-init"
