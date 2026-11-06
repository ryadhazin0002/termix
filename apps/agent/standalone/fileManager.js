import fs from 'fs/promises';
import path from 'path';
import os from 'os';
export const MAX_READ_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_DIRECTORY_ENTRIES = 1000;
export const STAT_BATCH_SIZE = 50;
/**
 * Returns the effective allowed root directory.
 * Reads TERMIX_ALLOWED_DIR from environment if non-empty; otherwise defaults to os.homedir().
 */
export function getAllowedDirectory() {
    const envDir = process.env.TERMIX_ALLOWED_DIR;
    if (envDir && envDir.trim() !== '') {
        return path.resolve(envDir.trim());
    }
    return path.resolve(os.homedir());
}
/**
 * Resolves a target path against the allowed root directory boundary.
 * Throws an Access Denied error if the resolved path escapes the allowed directory boundary.
 */
export function resolvePath(targetPath) {
    const allowedDir = getAllowedDirectory();
    let resolved;
    if (!targetPath || targetPath.trim() === '' || targetPath === '.' || targetPath === '~') {
        resolved = allowedDir;
    }
    else if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
        resolved = path.resolve(allowedDir, targetPath.slice(2));
    }
    else if (process.env.TERMIX_ALLOWED_DIR && process.env.TERMIX_ALLOWED_DIR.trim() !== '' && !path.isAbsolute(targetPath)) {
        resolved = path.resolve(allowedDir, targetPath);
    }
    else {
        resolved = path.resolve(targetPath);
    }
    // Chroot boundary check
    const rel = path.relative(allowedDir, resolved);
    if (rel === '..' ||
        rel.startsWith(`..${path.sep}`) ||
        rel.startsWith('../') ||
        path.isAbsolute(rel)) {
        throw new Error(`Access denied: Path "${resolved}" is outside allowed directory "${allowedDir}"`);
    }
    return resolved;
}
export async function listDirectory(dirPath) {
    const resolvedPath = resolvePath(dirPath);
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const cappedEntries = entries.slice(0, MAX_DIRECTORY_ENTRIES);
    const files = [];
    for (let i = 0; i < cappedEntries.length; i += STAT_BATCH_SIZE) {
        const batch = cappedEntries.slice(i, i + STAT_BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (entry) => {
            const fullPath = path.join(resolvedPath, entry.name);
            let size = 0;
            let modifiedAt = new Date().toISOString();
            let permissions = undefined;
            try {
                const stat = await fs.stat(fullPath);
                size = stat.size;
                modifiedAt = stat.mtime.toISOString();
                permissions = (stat.mode & 0o777).toString(8);
            }
            catch { }
            return {
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                size,
                modifiedAt,
                permissions,
            };
        }));
        files.push(...batchResults);
    }
    return { path: resolvedPath, entries: files };
}
export async function readFile(filePath) {
    const resolved = resolvePath(filePath);
    const stat = await fs.stat(resolved);
    if (stat.size > MAX_READ_FILE_SIZE_BYTES) {
        throw new Error(`File size (${stat.size} bytes) exceeds maximum limit of 2MB`);
    }
    return fs.readFile(resolved, 'utf-8');
}
export async function writeFile(filePath, content) {
    const resolved = resolvePath(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
}
function isRootCandidate(p) {
    if (!p)
        return false;
    try {
        const r = path.resolve(p);
        if (path.parse(r).root === r)
            return true;
    }
    catch { }
    const n = p.trim().replace(/\\/g, '/');
    return /^[a-zA-Z]:\/?(\.\.)?$/.test(n) || n === '/' || n === '/..';
}
export async function deleteFile(filePath) {
    if (isRootCandidate(filePath)) {
        throw new Error('Cannot delete root directory');
    }
    const resolved = resolvePath(filePath);
    const allowedDir = getAllowedDirectory();
    if (path.parse(resolved).root === resolved || resolved === allowedDir) {
        throw new Error('Cannot delete root directory');
    }
    await fs.rm(resolved, { recursive: true, force: true });
}
export async function createDirectory(dirPath) {
    const resolved = resolvePath(dirPath);
    await fs.mkdir(resolved, { recursive: true });
}
//# sourceMappingURL=fileManager.js.map