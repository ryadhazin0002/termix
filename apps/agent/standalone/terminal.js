import os from 'os';
import { spawn as cpSpawn, execSync } from 'child_process';
function getDefaultShell() {
    const platform = process.platform;
    if (platform === 'win32')
        return 'powershell.exe';
    if (platform === 'darwin')
        return process.env.SHELL ?? '/bin/zsh';
    return process.env.SHELL ?? '/bin/bash';
}
export class TerminalManager {
    constructor(socket) {
        this.sessions = new Map();
        this.socket = socket;
        const cleanup = () => this.closeAll();
        process.once('exit', cleanup);
        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
    }
    async createSession(sessionId, cols, rows) {
        if (this.sessions.has(sessionId))
            return;
        const shell = getDefaultShell();
        const platform = process.platform;
        let cmd = shell;
        let args = [];
        if (platform === 'win32') {
            cmd = 'powershell.exe';
            args = ['-NoLogo'];
        }
        else {
            // Allocate an authentic POSIX pseudo-terminal (PTY) using Python's built-in openpty
            // (100% pure Linux kernel PTY — zero C++ modules or npm compilation required!)
            let hasPython3 = false;
            try {
                execSync('command -v python3', { stdio: 'ignore' });
                hasPython3 = true;
            }
            catch { }
            if (hasPython3) {
                cmd = 'python3';
                // Python PTY bridge: connects slave PTY to shell and bridges master with stdio
                const pyBridge = [
                    'import os,sys,select',
                    'try:',
                    ' import termios,struct,fcntl',
                    ' m,s=os.openpty()',
                    ' try:fcntl.ioctl(s,termios.TIOCSWINSZ,struct.pack("HHHH",int(sys.argv[2]),int(sys.argv[3]),0,0))',
                    ' except:pass',
                    'except:m,s=os.openpty()',
                    'if os.fork()==0:',
                    ' os.close(m);os.setsid();os.dup2(s,0);os.dup2(s,1);os.dup2(s,2)',
                    ' if s>2:os.close(s)',
                    ' os.execlp(sys.argv[1],sys.argv[1])',
                    'os.close(s)',
                    'while True:',
                    ' try:',
                    '  r,_,_=select.select([0,m],[],[])',
                    '  if 0 in r:',
                    '   d=os.read(0,1024)',
                    '   if not d:break',
                    '   os.write(m,d)',
                    '  if m in r:',
                    '   d=os.read(m,1024)',
                    '   if not d:break',
                    '   os.write(1,d)',
                    ' except:break',
                ].join('\n');
                args = ['-c', pyBridge, shell, String(rows || 24), String(cols || 80)];
            }
            else {
                let hasScript = false;
                try {
                    execSync('command -v script', { stdio: 'ignore' });
                    hasScript = true;
                }
                catch { }
                if (hasScript) {
                    cmd = 'script';
                    args = ['-q', '-c', shell, '/dev/null'];
                }
                else {
                    cmd = shell;
                    args = ['-i'];
                }
            }
        }
        try {
            const proc = cpSpawn(cmd, args, {
                cwd: os.homedir(),
                env: {
                    ...process.env,
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                    COLUMNS: String(cols || 80),
                    LINES: String(rows || 24),
                },
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            this.sessions.set(sessionId, proc);
            proc.stdout?.on('data', (chunk) => {
                this.socket.emit('agent:terminal:output', { sessionId, data: chunk.toString() });
            });
            proc.stderr?.on('data', (chunk) => {
                this.socket.emit('agent:terminal:output', { sessionId, data: chunk.toString() });
            });
            proc.on('exit', (code) => {
                console.log(`[terminal] session ${sessionId} exited with code ${code}`);
                this.sessions.delete(sessionId);
                this.socket.emit('agent:terminal:closed', { sessionId });
            });
            proc.on('error', (err) => {
                console.error(`[terminal] session ${sessionId} process error:`, err);
                this.sessions.delete(sessionId);
                this.socket.emit('agent:terminal:closed', { sessionId });
            });
            console.log(`[terminal] spawned shell session ${sessionId} (${cmd})`);
        }
        catch (err) {
            console.error(`[terminal] failed to create session ${sessionId}:`, err);
            this.socket.emit('agent:terminal:closed', { sessionId });
        }
    }
    write(sessionId, data) {
        const proc = this.sessions.get(sessionId);
        if (proc && proc.stdin && proc.stdin.writable) {
            proc.stdin.write(data);
        }
    }
    resize(sessionId, cols, rows) {
        // Child process pipes adapt naturally
    }
    closeSession(sessionId) {
        const proc = this.sessions.get(sessionId);
        if (proc) {
            try {
                proc.kill();
            }
            catch {
                // Child process may have already exited
            }
            this.sessions.delete(sessionId);
            console.log(`[terminal] closed session ${sessionId}`);
        }
    }
    closeAll() {
        for (const [sessionId, proc] of this.sessions) {
            try {
                proc.kill();
            }
            catch {
                // Child process may have already exited or handle already closed
            }
            console.log(`[terminal] force-closed session ${sessionId}`);
        }
        this.sessions.clear();
    }
    hasSession(sessionId) {
        return this.sessions.has(sessionId);
    }
}
//# sourceMappingURL=terminal.js.map