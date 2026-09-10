#!/usr/bin/env bash
set -euo pipefail

echo "[1/5] Ensuring .env exists"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "[2/5] Installing backend dependencies"
(cd backend && bun install)

echo "[3/5] Installing frontend dependencies"
(cd frontend && npm install)

echo "[4/5] Creating Python virtual environment"
if [ ! -d sim/.venv ]; then
  python3 -m venv sim/.venv
fi

echo "[5/5] Installing Python dependencies"
./sim/.venv/bin/python -m pip install --upgrade pip
./sim/.venv/bin/pip install -r sim/requirements.txt

echo "Bootstrap complete."
