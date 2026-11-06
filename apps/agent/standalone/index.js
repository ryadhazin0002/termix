#!/usr/bin/env node
import 'dotenv/config';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { io } from 'socket.io-client';
import { collectStats } from './stats.js';
import { TerminalManager } from './terminal.js';
import * as fileManager from './fileManager.js';
export function detectOS(platform) {
    if (platform.startsWith('win'))
        return 'windows';
    if (platform === 'darwin')
        return 'macos';
    if (platform === 'linux')
        return 'linux';
    return 'unknown';
}
export function detectOSDetails() {
    const platform = process.platform;
    const release = os.release();
    if (platform.startsWith('win')) {
        const parts = release.split('.').map(Number);
        const build = parts[2] || 0;
        let distro = 'Windows';
        let distroId = 'windows';
        if (parts[0] === 10) {
            if (build >= 22000) {
                distro = 'Windows 11';
                distroId = 'windows11';
            }
            else {
                distro = 'Windows 10';
                distroId = 'windows10';
            }
        }
        else if (parts[0] === 6 && parts[1] === 3) {
            distro = 'Windows 8.1';
            distroId = 'windows';
        }
        else if (parts[0] === 6 && parts[1] === 1) {
            distro = 'Windows 7';
            distroId = 'windows';
        }
        return {
            os: 'windows',
            distro,
            distroId,
            osVersion: release,
        };
    }
    if (platform === 'linux') {
        let distro = 'Linux';
        let distroId = 'linux';
        let osVersion = release;
        const osReleasePaths = ['/etc/os-release', '/usr/lib/os-release'];
        for (const p of osReleasePaths) {
            try {
                if (fs.existsSync(p)) {
                    const content = fs.readFileSync(p, 'utf-8');
                    const fields = {};
                    for (const line of content.split('\n')) {
                        const match = line.match(/^([A-Z_]+)=(?:"([^"]*)"|'([^']*)'|(.*))$/);
                        if (match) {
                            fields[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
                        }
                    }
                    if (fields.PRETTY_NAME)
                        distro = fields.PRETTY_NAME;
                    else if (fields.NAME)
                        distro = fields.NAME;
                    if (fields.ID)
                        distroId = fields.ID.toLowerCase();
                    else if (fields.ID_LIKE)
                        distroId = fields.ID_LIKE.toLowerCase().split(' ')[0];
                    if (fields.VERSION_ID)
                        osVersion = fields.VERSION_ID;
                    break;
                }
            }
            catch {
                // ignore
            }
        }
        return {
            os: 'linux',
            distro,
            distroId,
            osVersion,
        };
    }
    if (platform === 'darwin') {
        return {
            os: 'macos',
            distro: 'macOS',
            distroId: 'macos',
            osVersion: release,
        };
    }
    return {
        os: 'unknown',
        distro: 'Unknown OS',
        distroId: 'unknown',
        osVersion: release,
    };
}
export const AGENT_VERSION = '1.0.0';
export const HEARTBEAT_INTERVAL_MS = 15000;
// Termix Agent daemon entrypoint
const args = process.argv.slice(2);
const cliConfig = {};
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
            cliConfig[key] = next;
            i++;
        }
        else {
            cliConfig[key] = 'true';
        }
    }
    else if (arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('termix://')) {
        try {
            const normalized = arg.replace(/^termix:\/\//, 'http://');
            const parsed = new URL(normalized);
            cliConfig['server'] = parsed.origin;
            if (parsed.searchParams.has('id'))
                cliConfig['id'] = parsed.searchParams.get('id');
            if (parsed.searchParams.has('token'))
                cliConfig['token'] = parsed.searchParams.get('token');
            if (parsed.searchParams.has('name'))
                cliConfig['name'] = parsed.searchParams.get('name');
        }
        catch {
            // ignore
        }
    }
}
const SERVER_URL = cliConfig['server'] || cliConfig['url'] || process.env.TERMIX_SERVER_URL;
const DEVICE_ID = cliConfig['id'] || cliConfig['deviceId'] || process.env.TERMIX_DEVICE_ID;
const DEVICE_TOKEN = cliConfig['token'] || cliConfig['deviceToken'] || process.env.TERMIX_DEVICE_TOKEN;
const DEVICE_NAME = cliConfig['name'] || cliConfig['deviceName'] || process.env.TERMIX_DEVICE_NAME || os.hostname();
// If parameters were supplied via CLI flags, auto-persist to .env so future runs need zero arguments
if ((cliConfig['id'] || cliConfig['token']) && SERVER_URL && DEVICE_ID && DEVICE_TOKEN) {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        const envContent = [
            `TERMIX_SERVER_URL=${SERVER_URL}`,
            `TERMIX_DEVICE_ID=${DEVICE_ID}`,
            `TERMIX_DEVICE_TOKEN=${DEVICE_TOKEN}`,
            `TERMIX_DEVICE_NAME=${DEVICE_NAME}`,
            `HEARTBEAT_INTERVAL_MS=15000`,
        ].join('\n') + '\n';
        fs.writeFileSync(envPath, envContent, 'utf-8');
        console.log(`💾 Configuration saved to ${envPath}`);
    }
    catch {
        // ignore
    }
}
if (!SERVER_URL || !DEVICE_ID || !DEVICE_TOKEN) {
    console.error('❌ Missing connection details. Provide via:');
    console.error('  1. Environment variables (TERMIX_SERVER_URL, TERMIX_DEVICE_ID, TERMIX_DEVICE_TOKEN)');
    console.error('  2. CLI flags: node dist/index.js --server <url> --id <id> --token <token> --name <name>');
    console.error('  3. Pairing URL: node dist/index.js "http://<server>:3001?id=<id>&token=<token>"');
    process.exit(1);
}
const socket = io(`${SERVER_URL}/agent`, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    randomizationFactor: 0.5,
});
const terminalManager = new TerminalManager(socket);
async function sendRegister() {
    try {
        const stats = await collectStats();
        const osInfo = detectOSDetails();
        socket.emit('agent:register', {
            deviceId: DEVICE_ID,
            token: DEVICE_TOKEN,
            name: DEVICE_NAME,
            hostname: os.hostname(),
            os: osInfo.os,
            distro: osInfo.distro,
            distroId: osInfo.distroId,
            osVersion: osInfo.osVersion,
            agentVersion: AGENT_VERSION,
            stats,
        });
    }
    catch (err) {
        console.error('Failed to collect stats for registration:', err);
    }
}
socket.on('connect', async () => {
    console.log(`✅ Connected to Termix server`);
    await sendRegister();
});
socket.on('disconnect', (reason) => {
    console.log(`⚠️ Disconnected from server (${reason}), reconnecting...`);
});
socket.on('server:error', (payload) => {
    console.error(`⚠️ Server error: ${payload.message}`);
    setTimeout(() => {
        if (socket.connected) {
            console.log('🔄 Retrying agent registration...');
            sendRegister().catch(console.error);
        }
    }, 5000);
});
// Heartbeat
const heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? String(HEARTBEAT_INTERVAL_MS), 10);
setInterval(async () => {
    if (!socket.connected)
        return;
    const stats = await collectStats();
    socket.emit('agent:heartbeat', { deviceId: DEVICE_ID, stats });
}, heartbeatInterval);
// Terminal events
socket.on('server:terminal:create', (payload) => {
    terminalManager.createSession(payload.sessionId, payload.cols, payload.rows);
});
socket.on('server:terminal:input', (payload) => {
    terminalManager.write(payload.sessionId, payload.data);
});
socket.on('server:terminal:resize', (payload) => {
    terminalManager.resize(payload.sessionId, payload.cols, payload.rows);
});
socket.on('server:terminal:close', (payload) => {
    terminalManager.closeSession(payload.sessionId);
});
// Remote file management events
socket.on('file:list', async (payload) => {
    try {
        const result = await fileManager.listDirectory(payload.path);
        socket.emit('file:list:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: result.path,
            entries: result.entries,
        });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[fileManager] list error: ${errorMsg}`);
        socket.emit('file:list:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            entries: [],
            error: errorMsg || 'Failed to list directory',
        });
    }
});
socket.on('file:read', async (payload) => {
    try {
        const content = await fileManager.readFile(payload?.path);
        socket.emit('file:read:result', {
            requestId: payload?.requestId,
            deviceId: DEVICE_ID,
            path: payload?.path,
            content,
        });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[fileManager] read error: ${errorMsg}`);
        socket.emit('file:read:result', {
            requestId: payload?.requestId,
            deviceId: DEVICE_ID,
            path: payload?.path,
            error: errorMsg || 'Failed to read file',
        });
    }
});
socket.on('file:write', async (payload) => {
    try {
        await fileManager.writeFile(payload.path, payload.content);
        socket.emit('file:write:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: true,
        });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[fileManager] write error: ${errorMsg}`);
        socket.emit('file:write:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: false,
            error: errorMsg || 'Failed to write file',
        });
    }
});
socket.on('file:delete', async (payload) => {
    try {
        await fileManager.deleteFile(payload.path);
        socket.emit('file:delete:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: true,
        });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[fileManager] delete error: ${errorMsg}`);
        socket.emit('file:delete:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: false,
            error: errorMsg || 'Failed to delete file',
        });
    }
});
socket.on('file:mkdir', async (payload) => {
    try {
        await fileManager.createDirectory(payload.path);
        socket.emit('file:mkdir:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: true,
        });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[fileManager] mkdir error: ${errorMsg}`);
        socket.emit('file:mkdir:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: false,
            error: errorMsg || 'Failed to create directory',
        });
    }
});
function handleShutdown(signal) {
    console.log(`\n👋 Shutting down agent (${signal})...`);
    terminalManager.closeAll();
    socket.disconnect();
    process.exit(0);
}
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('exit', () => {
    terminalManager.closeAll();
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});
//# sourceMappingURL=index.js.map