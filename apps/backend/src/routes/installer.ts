import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const installerRouter = Router()

// Serve standalone agent files for remote single-command installation
installerRouter.get('/agent-files/:file', (req, res) => {
  const filename = req.params.file
  const allowed = ['index.js', 'terminal.js', 'stats.js', 'fileManager.js', 'package.json']
  if (!allowed.includes(filename)) {
    return res.status(404).send('Not found')
  }

  if (filename === 'package.json') {
    const pkg = {
      name: 'termix-agent',
      version: '1.0.0',
      type: 'module',
      dependencies: {
        'socket.io-client': '^4.7.0',
        'systeminformation': '^5.22.0',
        'dotenv': '^16.4.0',
        'uuid': '^9.0.0',
      },
    }
    return res.json(pkg)
  }

  const filePath = path.resolve(__dirname, '../../../agent/dist', filename)
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/javascript')
    return res.sendFile(filePath)
  }
  res.status(404).send('File not found')
})

installerRouter.get('/install.sh', (req, res) => {
  const host = req.get('host') || 'localhost:3001'
  const protocol = req.protocol || 'http'
  const defaultServer = `${protocol}://${host}`

  const serverUrl = (req.query.server as string) || defaultServer
  const deviceId = (req.query.id as string) || ''
  const deviceToken = (req.query.token as string) || ''
  const deviceName = (req.query.name as string) || ''

  res.setHeader('Content-Type', 'text/x-shellscript')
  res.send(`#!/usr/bin/env bash
# ==============================================================================
# Termix Agent - Instant One-Line Installer (Linux / macOS)
# ==============================================================================
set -e

SERVER_URL="${serverUrl}"
DEVICE_ID="${deviceId}"
DEVICE_TOKEN="${deviceToken}"
DEVICE_NAME="${deviceName}"

# Allow overriding via command-line arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --id) DEVICE_ID="$2"; shift ;;
    --token) DEVICE_TOKEN="$2"; shift ;;
    --server) SERVER_URL="$2"; shift ;;
    --name) DEVICE_NAME="$2"; shift ;;
  esac
  shift
done

if [ -z "$DEVICE_NAME" ]; then
  DEVICE_NAME="$(hostname 2>/dev/null || echo 'linux-device')"
fi

echo "========================================================"
echo "🚀 Termix Agent Setup for: $DEVICE_NAME"
echo "🌐 Server: $SERVER_URL"
echo "========================================================"

if [ -z "$DEVICE_ID" ] || [ -z "$DEVICE_TOKEN" ]; then
  echo "❌ Error: Missing device ID or token."
  echo "Usage: curl -sSL '<URL>' | bash -s -- --id <DEVICE_ID> --token <DEVICE_TOKEN>"
  exit 1
fi

# Detect & Install Node.js if missing
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "📦 Node.js or npm not detected. Installing automatically..."
  if command -v pacman >/dev/null 2>&1; then
    echo "Detected Arch Linux. Installing nodejs & npm via pacman..."
    sudo pacman -Sy --needed --noconfirm nodejs npm
  elif command -v apt-get >/dev/null 2>&1; then
    echo "Detected Debian/Ubuntu. Installing nodejs via apt..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    echo "Detected Fedora/RHEL. Installing nodejs via dnf..."
    sudo dnf install -y nodejs npm
  elif command -v yum >/dev/null 2>&1; then
    echo "Detected CentOS/Amazon Linux. Installing nodejs via yum..."
    sudo yum install -y nodejs npm
  elif command -v zypper >/dev/null 2>&1; then
    echo "Detected openSUSE. Installing nodejs via zypper..."
    sudo zypper install -y nodejs npm
  elif command -v apk >/dev/null 2>&1; then
    echo "Detected Alpine Linux. Installing nodejs via apk..."
    sudo apk add nodejs npm
  elif command -v brew >/dev/null 2>&1; then
    echo "Detected Homebrew. Installing node..."
    brew install node
  else
    echo "⚠️ Please install Node.js (>=20) manually and rerun."
    exit 1
  fi
fi

INSTALL_DIR="$HOME/.termix-agent"
mkdir -p "$INSTALL_DIR"

# Write .env configuration
cat <<EOF > "$INSTALL_DIR/.env"
TERMIX_SERVER_URL=$SERVER_URL
TERMIX_DEVICE_ID=$DEVICE_ID
TERMIX_DEVICE_TOKEN=$DEVICE_TOKEN
TERMIX_DEVICE_NAME=$DEVICE_NAME
HEARTBEAT_INTERVAL_MS=15000
EOF

echo "✅ Configuration saved to $INSTALL_DIR/.env"

# Download standalone agent files
echo "📥 Downloading Termix Agent files from $SERVER_URL..."
curl -sSL "$SERVER_URL/api/agent-files/package.json" -o "$INSTALL_DIR/package.json"
curl -sSL "$SERVER_URL/api/agent-files/index.js" -o "$INSTALL_DIR/index.js"
curl -sSL "$SERVER_URL/api/agent-files/terminal.js" -o "$INSTALL_DIR/terminal.js"
curl -sSL "$SERVER_URL/api/agent-files/stats.js" -o "$INSTALL_DIR/stats.js"
curl -sSL "$SERVER_URL/api/agent-files/fileManager.js" -o "$INSTALL_DIR/fileManager.js"

# Install npm dependencies
cd "$INSTALL_DIR"
echo "📦 Installing agent dependencies (socket.io-client, node-pty)..."
npm install --omit=dev --no-audit --no-fund --loglevel=error

# Stop any previous instance
pkill -9 -f "node.*index\.js" 2>/dev/null || true
sleep 1

# Start agent in background
nohup node index.js > "$INSTALL_DIR/agent.log" 2>&1 &
AGENT_PID=$!

sleep 2
if kill -0 $AGENT_PID 2>/dev/null; then
  echo "========================================================"
  echo "🎉 Termix Agent is successfully installed and RUNNING! (PID: $AGENT_PID)"
  echo "📄 Logs: $INSTALL_DIR/agent.log"
  echo "🖥️ Approve the device on your Termix dashboard now."
  echo "========================================================"
else
  echo "⚠️ Agent failed to start. Showing logs from $INSTALL_DIR/agent.log:"
  cat "$INSTALL_DIR/agent.log" 2>/dev/null || true
  exit 1
fi
`)
})

installerRouter.get('/install.ps1', (req, res) => {
  const host = req.get('host') || 'localhost:3001'
  const protocol = req.protocol || 'http'
  const defaultServer = `${protocol}://${host}`

  const serverUrl = (req.query.server as string) || defaultServer
  const deviceId = (req.query.id as string) || ''
  const deviceToken = (req.query.token as string) || ''
  const deviceName = (req.query.name as string) || ''

  res.setHeader('Content-Type', 'text/plain')
  res.send(`# ==============================================================================
# Termix Agent - Instant One-Line Installer (Windows PowerShell)
# ==============================================================================
$ServerUrl = "${serverUrl}"
$DeviceId = "${deviceId}"
$DeviceToken = "${deviceToken}"
$DeviceName = "${deviceName}"

if (-not $DeviceName) { $DeviceName = $env:COMPUTERNAME }

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "🚀 Termix Agent Setup for: $DeviceName" -ForegroundColor Cyan
Write-Host "🌐 Server: $ServerUrl" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

if (-not $DeviceId -or -not $DeviceToken) {
  Write-Host "❌ Error: Missing device ID or token." -ForegroundColor Red
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "📦 Node.js not detected. Installing via winget..." -ForegroundColor Yellow
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  } else {
    Write-Host "⚠️ Please install Node.js from https://nodejs.org and rerun." -ForegroundColor Red
    exit 1
  }
}

$InstallDir = "$env:USERPROFILE\\.termix-agent"
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }

$EnvContent = @"
TERMIX_SERVER_URL=$ServerUrl
TERMIX_DEVICE_ID=$DeviceId
TERMIX_DEVICE_TOKEN=$DeviceToken
TERMIX_DEVICE_NAME=$DeviceName
HEARTBEAT_INTERVAL_MS=15000
"@

Set-Content -Path "$InstallDir\\.env" -Value $EnvContent -Encoding UTF8
Write-Host "✅ Configuration saved to $InstallDir\\.env" -ForegroundColor Green

Write-Host "📥 Downloading Termix Agent files..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "$ServerUrl/api/agent-files/package.json" -OutFile "$InstallDir\\package.json"
Invoke-WebRequest -Uri "$ServerUrl/api/agent-files/index.js" -OutFile "$InstallDir\\index.js"
Invoke-WebRequest -Uri "$ServerUrl/api/agent-files/terminal.js" -OutFile "$InstallDir\\terminal.js"
Invoke-WebRequest -Uri "$ServerUrl/api/agent-files/stats.js" -OutFile "$InstallDir\\stats.js"
Invoke-WebRequest -Uri "$ServerUrl/api/agent-files/fileManager.js" -OutFile "$InstallDir\\fileManager.js"

Set-Location $InstallDir
Write-Host "📦 Installing agent dependencies..." -ForegroundColor Cyan
npm install --omit=dev --no-audit --no-fund --loglevel=error

Write-Host "🚀 Starting Termix Agent..." -ForegroundColor Cyan
Start-Process node -ArgumentList "index.js" -WorkingDirectory $InstallDir -WindowStyle Hidden

Write-Host "========================================================" -ForegroundColor Green
Write-Host "🎉 Termix Agent is successfully installed and RUNNING!" -ForegroundColor Green
Write-Host "🖥️ Approve the device on your Termix dashboard now." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
`)
})
