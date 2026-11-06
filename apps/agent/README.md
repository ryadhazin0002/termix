# @termix/agent

The **Termix Agent** is a lightweight Node.js daemon that runs on a target machine (Windows, Linux, or macOS) and connects back to the Termix backend server to expose a real terminal session over WebSocket. It enables remote terminal access, live system stats, and future file management — all secured through device tokens issued by the dashboard.

---

## What it does

- Connects to the Termix backend via a persistent WebSocket (Socket.IO)
- Registers the device on connection (OS, hostname, agent version, system stats)
- Sends periodic **heartbeats** with live CPU, memory, disk, and network stats
- Spawns and manages **PTY terminal sessions** (`node-pty`) on demand
- Streams terminal I/O bidirectionally between the backend and the local shell
- Handles terminal resize events
- Provides helper utilities for future **file system operations** (list, read, write, delete)
- Auto-reconnects with exponential back-off if the connection drops

---

## Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **pnpm 8+** — `npm install -g pnpm`
- On **Windows**: [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (required by `node-pty` for native compilation)
- On **Linux/macOS**: `python3` and `make` (usually pre-installed)

---

## Installation

```bash
# From the monorepo root
pnpm install

# Or standalone (after cloning just this app)
cd apps/agent
pnpm install
```

Build the TypeScript source:

```bash
pnpm build
```

---

## Getting your Device ID and Token

1. Open the **Termix Dashboard** and sign in.
2. Navigate to **Devices → Add Device**.
3. Copy the generated **Device ID** and **Agent Token** — these are shown only once; store them securely.
4. The token is a secret — treat it like a password.

---

## Configuration

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# URL of your deployed Termix backend (no trailing slash)
TERMIX_SERVER_URL=https://your-backend.railway.app

# Obtained from the Termix Dashboard → Devices → Add Device
TERMIX_DEVICE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TERMIX_DEVICE_TOKEN=your-secret-agent-token

# Human-friendly name shown in the dashboard (defaults to hostname)
TERMIX_DEVICE_NAME=My Windows PC

# How often to send system stats to the server (milliseconds)
HEARTBEAT_INTERVAL_MS=15000
```

> **Never commit `.env` to version control.** The `.gitignore` excludes it by default.

---

## Running the agent

### Development (with hot-reload)

```bash
pnpm dev
```

### Production

```bash
pnpm build
pnpm start
```

Or directly:

```bash
node dist/index.js
```

You should see:

```
✅ Connected to Termix server
```

---

## Running as a background service

### Windows — pm2 (recommended)

```powershell
npm install -g pm2

# Start the agent
pm2 start dist/index.js --name termix-agent

# Save so it restarts on reboot
pm2 save
pm2 startup
```

Follow the printed instruction to register the startup hook.

### Windows — NSSM (alternative)

1. Download [NSSM](https://nssm.cc/download) and place it in a folder on your `PATH`.
2. Open an **Administrator** PowerShell and run:

```powershell
nssm install termix-agent "C:\Program Files\nodejs\node.exe" "C:\path\to\agent\dist\index.js"
nssm set termix-agent AppDirectory "C:\path\to\agent"
nssm set termix-agent AppEnvironmentExtra "TERMIX_SERVER_URL=https://..." "TERMIX_DEVICE_ID=..." "TERMIX_DEVICE_TOKEN=..."
nssm start termix-agent
```

### Linux — systemd

Create `/etc/systemd/system/termix-agent.service`:

```ini
[Unit]
Description=Termix Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=termix
WorkingDirectory=/opt/termix-agent
EnvironmentFile=/opt/termix-agent/.env
ExecStart=/usr/bin/node /opt/termix-agent/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now termix-agent
sudo journalctl -u termix-agent -f   # follow logs
```

### macOS — launchd

Create `~/Library/LaunchAgents/app.termix.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>app.termix.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/you/termix-agent/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/you/termix-agent</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TERMIX_SERVER_URL</key><string>https://your-backend.railway.app</string>
    <key>TERMIX_DEVICE_ID</key><string>your-device-id</string>
    <key>TERMIX_DEVICE_TOKEN</key><string>your-token</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/termix-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/termix-agent.err</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/app.termix.agent.plist
```

---

## Security notes

- **Device tokens are secrets.** Store them in `.env` or the system service's environment — never hard-code them or expose them in logs.
- The agent connects **outbound only** (no listening port), so no inbound firewall rules are required.
- All communication is over the encrypted WebSocket connection to your backend (HTTPS/WSS).
- The agent runs terminal sessions as the **same OS user** it is started under. Use a dedicated low-privilege service account in production environments.
- Restrict `.env` file permissions: `chmod 600 .env` on Linux/macOS.
- Rotate device tokens from the dashboard if a machine is compromised or decommissioned.
