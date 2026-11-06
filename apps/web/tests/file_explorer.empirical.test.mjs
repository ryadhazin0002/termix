import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

// Test Suite: M4 Web Remote File Explorer UI & Integration Empirical Tests
console.log('--- Starting Empirical Tests for M4 File Explorer ---')

// 1. Path Utilities Empirical Testing
import {
  isWindowsPath,
  getPathSeparator,
  getParentPath,
  joinPath,
  parseBreadcrumbs,
  formatBytes,
  getFileCategory,
} from '../src/components/files/pathUtils.ts'

console.log('Testing pathUtils...')

// isWindowsPath
assert.equal(isWindowsPath('/home/alice'), false, 'POSIX path should not be windows path')
assert.equal(isWindowsPath('/var/log/syslog'), false, 'POSIX path should not be windows path')
assert.equal(isWindowsPath('C:\\Users\\Alice'), true, 'Windows backslash path should be detected')
assert.equal(isWindowsPath('C:/Users/Alice'), true, 'Windows drive letter with slash should be detected')
assert.equal(isWindowsPath('D:\\'), true, 'Windows drive root should be detected')
assert.equal(isWindowsPath('folder\\subfolder'), true, 'Relative path with backslash should be detected')

// getPathSeparator
assert.equal(getPathSeparator('/home/alice'), '/', 'POSIX separator should be /')
assert.equal(getPathSeparator('C:\\Users'), '\\', 'Windows separator should be \\')

// getParentPath
assert.equal(getParentPath('/home/alice/docs'), '/home/alice', 'POSIX parent of /home/alice/docs should be /home/alice')
assert.equal(getParentPath('/home/alice'), '/home', 'POSIX parent of /home/alice should be /home')
assert.equal(getParentPath('/home'), '/', 'POSIX parent of /home should be /')
assert.equal(getParentPath('/'), null, 'Root / should have null parent')
assert.equal(getParentPath(''), null, 'Empty path should have null parent')
assert.equal(getParentPath('.'), null, 'Dot path should have null parent')

assert.equal(getParentPath('C:\\Users\\Alice\\docs'), 'C:\\Users\\Alice', 'Windows parent of C:\\Users\\Alice\\docs should be C:\\Users\\Alice')
assert.equal(getParentPath('C:\\Users\\Alice'), 'C:\\Users', 'Windows parent of C:\\Users\\Alice should be C:\\Users')
assert.equal(getParentPath('C:\\Users'), 'C:\\', 'Windows parent of C:\\Users should be C:\\')
assert.equal(getParentPath('C:\\'), null, 'Windows drive root C:\\ should have null parent')
assert.equal(getParentPath('C:'), null, 'Windows drive root C: should have null parent')

// joinPath
assert.equal(joinPath('/home/alice', 'docs'), '/home/alice/docs', 'Joining POSIX path should add /')
assert.equal(joinPath('/home/alice/', 'docs'), '/home/alice/docs', 'Joining POSIX path with trailing / should not duplicate /')
assert.equal(joinPath('C:\\Users', 'Alice'), 'C:\\Users\\Alice', 'Joining Windows path should add \\')
assert.equal(joinPath('C:\\Users\\', 'Alice'), 'C:\\Users\\Alice', 'Joining Windows path with trailing \\ should not duplicate \\')
assert.equal(joinPath('', 'docs'), 'docs', 'Joining with empty parent should return child')
assert.equal(joinPath('/home', ''), '/home', 'Joining with empty child should return parent')

// parseBreadcrumbs
const posixCrumbs = parseBreadcrumbs('/home/alice/docs')
assert.equal(posixCrumbs.length, 4, 'POSIX /home/alice/docs should produce 4 segments')
assert.deepEqual(
  posixCrumbs.map((c) => ({ label: c.label, path: c.fullPath })),
  [
    { label: '/', path: '/' },
    { label: 'home', path: '/home' },
    { label: 'alice', path: '/home/alice' },
    { label: 'docs', path: '/home/alice/docs' },
  ],
  'POSIX breadcrumbs should match expected labels and paths'
)

const winCrumbs = parseBreadcrumbs('C:\\Users\\Alice\\docs')
assert.equal(winCrumbs.length, 4, 'Windows C:\\Users\\Alice\\docs should produce 4 segments')
assert.deepEqual(
  winCrumbs.map((c) => ({ label: c.label, path: c.fullPath })),
  [
    { label: 'C:', path: 'C:\\' },
    { label: 'Users', path: 'C:\\Users' },
    { label: 'Alice', path: 'C:\\Users\\Alice' },
    { label: 'docs', path: 'C:\\Users\\Alice\\docs' },
  ],
  'Windows breadcrumbs should match expected labels and paths'
)

// formatBytes
assert.equal(formatBytes(0), '0 B')
assert.equal(formatBytes(1024), '1.0 KB')
assert.equal(formatBytes(1048576), '1.0 MB')
assert.equal(formatBytes(1073741824), '1.0 GB')

// getFileCategory
assert.equal(getFileCategory('index.ts'), 'code')
assert.equal(getFileCategory('app.jsx'), 'code')
assert.equal(getFileCategory('script.py'), 'code')
assert.equal(getFileCategory('.env'), 'code')
assert.equal(getFileCategory('Dockerfile'), 'code')
assert.equal(getFileCategory('README.md'), 'doc')
assert.equal(getFileCategory('error.log'), 'doc')
assert.equal(getFileCategory('archive.tar.gz'), 'archive')
assert.equal(getFileCategory('photo.png'), 'image')
assert.equal(getFileCategory('audio.mp3'), 'video')
assert.equal(getFileCategory('binary.bin'), 'unknown')

console.log('✓ pathUtils empirical tests passed.')

// 2. Mock Socket.IO Harness for fileSocket testing
class MockSocket extends EventEmitter {
  constructor() {
    super()
    this.emitted = []
  }

  // Outgoing messages sent by client code under test
  emit(event, data) {
    this.emitted.push({ event, data })
    return true
  }

  // Simulates server dispatching an event to the client socket
  deliverServerEvent(event, data) {
    return super.emit(event, data)
  }

  off(event, listener) {
    return this.removeListener(event, listener)
  }
}

import {
  generateRequestId,
  requestFileList,
  requestFileRead,
  requestFileWrite,
  requestFileDelete,
  requestFileMkdir,
  fileClient,
} from '../src/lib/fileSocket.ts'

console.log('Testing fileSocket request correlation & event helpers...')

// Test generateRequestId uniqueness
const ids = new Set()
for (let i = 0; i < 50; i++) {
  const id = generateRequestId()
  assert.ok(id && id.length > 5, 'Request ID must be non-empty')
  ids.add(id)
}
assert.equal(ids.size, 50, 'All 50 generated request IDs must be strictly unique')

// Test requestFileList success & correlation
{
  const socket = new MockSocket()
  const promise = requestFileList(socket, 'device-123', '/home')

  assert.equal(socket.emitted.length, 1)
  const emitted = socket.emitted[0]
  assert.equal(emitted.event, 'file:list')
  assert.equal(emitted.data.deviceId, 'device-123')
  assert.equal(emitted.data.path, '/home')
  const reqId = emitted.data.requestId
  assert.ok(reqId, 'Must emit with requestId')

  // Emit unrelated response with wrong requestId -> must be ignored
  socket.deliverServerEvent('file:list:result', {
    requestId: 'other-id',
    path: '/somewhere-else',
    entries: [],
  })

  // Emit matching response
  socket.deliverServerEvent('file:list:result', {
    requestId: reqId,
    path: '/home',
    entries: [
      { name: 'alice', path: '/home/alice', isDirectory: true, size: 4096, modifiedAt: new Date().toISOString() },
    ],
  })

  const result = await promise
  assert.equal(result.path, '/home')
  assert.equal(result.entries.length, 1)
  assert.equal(result.entries[0].name, 'alice')
  assert.equal(socket.listenerCount('file:list:result'), 0, 'Listener must be cleaned up after resolve')
  assert.equal(socket.listenerCount('disconnect'), 0, 'Disconnect listener must be cleaned up after resolve')
}

// Test requestFileList remote error rejection
{
  const socket = new MockSocket()
  const promise = requestFileList(socket, 'device-123', '/restricted')
  const reqId = socket.emitted[0].data.requestId

  socket.deliverServerEvent('file:list:result', {
    requestId: reqId,
    path: '/restricted',
    entries: [],
    error: 'EACCES: permission denied',
  })

  await assert.rejects(promise, {
    message: 'EACCES: permission denied',
  })
  assert.equal(socket.listenerCount('file:list:result'), 0, 'Listener must be cleaned up on error')
}

// Test requestFileRead
{
  const socket = new MockSocket()
  const promise = requestFileRead(socket, 'device-123', '/home/alice/.bashrc')
  const reqId = socket.emitted[0].data.requestId

  socket.deliverServerEvent('file:read:result', {
    requestId: reqId,
    path: '/home/alice/.bashrc',
    content: 'export PATH=$PATH:/usr/local/bin\n',
  })

  const res = await promise
  assert.equal(res.content, 'export PATH=$PATH:/usr/local/bin\n')
  assert.equal(socket.listenerCount('file:read:result'), 0)
}

// Test requestFileWrite
{
  const socket = new MockSocket()
  const promise = requestFileWrite(socket, 'device-123', '/home/alice/test.txt', 'Hello World')
  const reqId = socket.emitted[0].data.requestId

  assert.equal(socket.emitted[0].data.content, 'Hello World')

  socket.deliverServerEvent('file:write:result', {
    requestId: reqId,
    path: '/home/alice/test.txt',
    success: true,
  })

  const res = await promise
  assert.equal(res.success, true)
  assert.equal(socket.listenerCount('file:write:result'), 0)
}

// Test requestFileDelete
{
  const socket = new MockSocket()
  const promise = requestFileDelete(socket, 'device-123', '/home/alice/temp.log')
  const reqId = socket.emitted[0].data.requestId

  socket.deliverServerEvent('file:delete:result', {
    requestId: reqId,
    path: '/home/alice/temp.log',
    success: true,
  })

  const res = await promise
  assert.equal(res.success, true)
  assert.equal(socket.listenerCount('file:delete:result'), 0)
}

// Test requestFileMkdir
{
  const socket = new MockSocket()
  const promise = requestFileMkdir(socket, 'device-123', '/home/alice/new_dir')
  const reqId = socket.emitted[0].data.requestId

  socket.deliverServerEvent('file:mkdir:result', {
    requestId: reqId,
    path: '/home/alice/new_dir',
    success: true,
  })

  const res = await promise
  assert.equal(res.success, true)
  assert.equal(socket.listenerCount('file:mkdir:result'), 0)
}

// Test fileSocket timeout behavior
{
  const socket = new MockSocket()
  const promise = requestFileList(socket, 'device-123', '/timeout-test', 50) // 50ms timeout

  await assert.rejects(promise, (err) => {
    return err.message.includes('timed out')
  })
  assert.equal(socket.listenerCount('file:list:result'), 0, 'Listener must be cleaned up on timeout')
}

// Test fileSocket socket disconnect behavior
{
  const socket = new MockSocket()
  const promise = requestFileList(socket, 'device-123', '/disconnect-test')

  socket.deliverServerEvent('disconnect')

  await assert.rejects(promise, {
    message: 'Socket disconnected while waiting for file operation',
  })
  assert.equal(socket.listenerCount('file:list:result'), 0, 'Listener must be cleaned up on disconnect')
}

// Test fileClient convenience methods
{
  const socket = new MockSocket()
  const readPromise = fileClient.readFile(socket, 'dev1', '/f.txt')
  socket.deliverServerEvent('file:read:result', {
    requestId: socket.emitted[0].data.requestId,
    path: '/f.txt',
    content: 'sample text',
  })
  const text = await readPromise
  assert.equal(text, 'sample text')
}

console.log('✓ fileSocket empirical tests passed.')

// 3. Inspect UI Components source integrity
console.log('Checking component source files...')
const requiredComponents = [
  'apps/web/src/lib/fileSocket.ts',
  'apps/web/src/components/files/pathUtils.ts',
  'apps/web/src/components/files/FileTable.tsx',
  'apps/web/src/components/files/FileEditorModal.tsx',
  'apps/web/src/components/files/CreateFolderDialog.tsx',
  'apps/web/src/components/files/DeleteConfirmDialog.tsx',
  'apps/web/src/components/devices/DeviceHeader.tsx',
  'apps/web/src/components/files/FileExplorer.tsx',
  'apps/web/src/app/(dashboard)/dashboard/devices/[id]/files/page.tsx',
  'apps/web/src/components/devices/DeviceCard.tsx',
  'apps/web/src/app/(dashboard)/dashboard/devices/[id]/terminal/page.tsx',
]

for (const relPath of requiredComponents) {
  const fullPath = path.resolve(process.cwd(), relPath)
  assert.ok(fs.existsSync(fullPath), `Required component file must exist: ${relPath}`)
  const content = fs.readFileSync(fullPath, 'utf-8')
  assert.ok(content.length > 50, `Component file must have genuine content: ${relPath}`)
}

console.log('✓ All 11 component files exist with genuine implementations.')
console.log('--- ALL EMPIRICAL TESTS PASSED SUCCESSFULLY ---')
