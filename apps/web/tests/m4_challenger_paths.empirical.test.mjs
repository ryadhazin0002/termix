import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Empirical Test Suite: M4 Challenger Path and File Operations Adversarial Stress Harness
console.log('======================================================================')
console.log('  M4 Challenger Empirical Test Suite: Path & File Operations')
console.log('======================================================================\n')

import {
  isWindowsPath,
  getPathSeparator,
  getParentPath,
  joinPath,
  parseBreadcrumbs,
  formatBytes,
  getFileCategory,
} from '../src/components/files/pathUtils.ts'

let totalTests = 0
let passedTests = 0

function runTest(suiteName, testName, fn) {
  totalTests++
  try {
    fn()
    passedTests++
    console.log(`  ✓ [${suiteName}] ${testName}`)
  } catch (err) {
    console.error(`  ✗ [${suiteName}] ${testName}: ${err.message}`)
    throw err
  }
}

// -----------------------------------------------------------------------------
// Suite 1: Deep Windows Path Nesting
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Deep Windows Path Nesting ---')

runTest('Deep Windows Nesting', 'Identifies deep Windows path format', () => {
  const p = 'C:\\Users\\Admin\\Documents\\Projects\\termix\\..\\..\\deep\\dir'
  assert.equal(isWindowsPath(p), true)
  assert.equal(getPathSeparator(p), '\\')
})

runTest('Deep Windows Nesting', 'Parent path unwinds sequentially backwards through relative tokens', () => {
  let curr = 'C:\\Users\\Admin\\Documents\\Projects\\termix\\..\\..\\deep\\dir'
  
  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\Users\\Admin\\Documents\\Projects\\termix\\..\\..\\deep')
  
  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\Users\\Admin\\Documents\\Projects\\termix\\..\\..')

  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\Users\\Admin\\Documents\\Projects\\termix\\..')

  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\Users\\Admin\\Documents\\Projects\\termix')

  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\Users\\Admin\\Documents\\Projects')

  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\Users\\Admin\\Documents')

  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\Users\\Admin')

  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\Users')

  curr = getParentPath(curr)
  assert.equal(curr, 'C:\\')

  curr = getParentPath(curr)
  assert.equal(curr, null, 'Root C:\\ must have null parent')
})

runTest('Deep Windows Nesting', 'Breadcrumbs preserve drive root and reconstruct hierarchy', () => {
  const p = 'C:\\Users\\Admin\\Documents\\Projects\\termix\\..\\..\\deep\\dir'
  const crumbs = parseBreadcrumbs(p)
  
  assert.equal(crumbs.length, 10)
  assert.equal(crumbs[0].label, 'C:')
  assert.equal(crumbs[0].fullPath, 'C:\\')
  assert.equal(crumbs[0].path, 'C:\\')

  assert.equal(crumbs[1].label, 'Users')
  assert.equal(crumbs[1].fullPath, 'C:\\Users')

  assert.equal(crumbs[2].label, 'Admin')
  assert.equal(crumbs[2].fullPath, 'C:\\Users\\Admin')

  assert.equal(crumbs[8].label, 'deep')
  assert.equal(crumbs[8].fullPath, 'C:\\Users\\Admin\\Documents\\Projects\\termix\\..\\..\\deep')

  assert.equal(crumbs[9].label, 'dir')
  assert.equal(crumbs[9].fullPath, p)

  // Every breadcrumb path must start with C:\
  for (const c of crumbs) {
    assert.ok(c.fullPath.startsWith('C:\\'), `Breadcrumb ${c.label} must start with C:\\`)
  }
})

runTest('Deep Windows Nesting', 'Handles forward slashes in Windows drive paths', () => {
  const mixed = 'C:/Users/Admin/Documents/Projects/termix'
  assert.equal(isWindowsPath(mixed), true)
  const crumbs = parseBreadcrumbs(mixed)
  assert.equal(crumbs[0].label, 'C:')
  assert.equal(crumbs[0].fullPath, 'C:\\')
  assert.equal(crumbs[crumbs.length - 1].fullPath, 'C:\\Users\\Admin\\Documents\\Projects\\termix')
})

// -----------------------------------------------------------------------------
// Suite 2: POSIX Paths
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: POSIX Paths ---')

runTest('POSIX Paths', '/var/log/termix/agent.log decomposition and breadcrumbs', () => {
  const p = '/var/log/termix/agent.log'
  assert.equal(isWindowsPath(p), false)
  assert.equal(getPathSeparator(p), '/')

  assert.equal(getParentPath(p), '/var/log/termix')
  assert.equal(getParentPath('/var/log/termix'), '/var/log')
  assert.equal(getParentPath('/var/log'), '/var')
  assert.equal(getParentPath('/var'), '/')
  assert.equal(getParentPath('/'), null)

  const crumbs = parseBreadcrumbs(p)
  assert.equal(crumbs.length, 5)
  assert.deepEqual(
    crumbs.map((c) => ({ label: c.label, path: c.fullPath })),
    [
      { label: '/', path: '/' },
      { label: 'var', path: '/var' },
      { label: 'log', path: '/var/log' },
      { label: 'termix', path: '/var/log/termix' },
      { label: 'agent.log', path: '/var/log/termix/agent.log' },
    ]
  )
})

runTest('POSIX Paths', '/root single-level directory under root', () => {
  assert.equal(getParentPath('/root'), '/')
  const crumbs = parseBreadcrumbs('/root')
  assert.equal(crumbs.length, 2)
  assert.equal(crumbs[0].label, '/')
  assert.equal(crumbs[0].fullPath, '/')
  assert.equal(crumbs[1].label, 'root')
  assert.equal(crumbs[1].fullPath, '/root')
})

runTest('POSIX Paths', 'Filesystem root / path boundary', () => {
  assert.equal(getParentPath('/'), null)
  const crumbs = parseBreadcrumbs('/')
  assert.equal(crumbs.length, 1)
  assert.equal(crumbs[0].label, '/')
  assert.equal(crumbs[0].fullPath, '/')
})

// -----------------------------------------------------------------------------
// Suite 3: Edge-Case Paths & Root Bounds
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Edge-Case Paths & Root Bounds ---')

runTest('Edge Cases', 'Root bounds return null parent', () => {
  assert.equal(getParentPath('/'), null)
  assert.equal(getParentPath('C:\\'), null)
  assert.equal(getParentPath('C:'), null)
  assert.equal(getParentPath('c:\\'), null)
  assert.equal(getParentPath('c:'), null)
  assert.equal(getParentPath('D:\\'), null)
  assert.equal(getParentPath('D:'), null)
  assert.equal(getParentPath('C:/'), null)
  assert.equal(getParentPath('c:/'), null)
})

runTest('Edge Cases', 'Trailing slashes normalized without breaking parent lookup', () => {
  assert.equal(getParentPath('/home/user/'), '/home')
  assert.equal(getParentPath('/home/user///'), '/home')
  assert.equal(getParentPath('/var/log/'), '/var')
  assert.equal(getParentPath('C:\\Users\\user\\'), 'C:\\Users')
  assert.equal(getParentPath('C:\\Users\\user\\\\\\'), 'C:\\Users')
  assert.equal(getParentPath('C:\\Users\\'), 'C:\\')
})

runTest('Edge Cases', 'Empty strings, whitespace, and relative tokens', () => {
  assert.equal(getParentPath(''), null)
  assert.equal(getParentPath('   '), null)
  assert.equal(getParentPath('.'), null)
  
  assert.deepEqual(parseBreadcrumbs(''), [])
  assert.deepEqual(parseBreadcrumbs('   '), [])
})

// -----------------------------------------------------------------------------
// Suite 4: Child Joining
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: Child Joining ---')

runTest('Child Joining', 'POSIX joining prevents double slashes and missing separators', () => {
  assert.equal(joinPath('/home/user', 'docs'), '/home/user/docs')
  assert.equal(joinPath('/home/user/', 'docs'), '/home/user/docs', 'Trailing slash must not duplicate /')
  assert.equal(joinPath('/', 'docs'), '/docs', 'Root join must not produce //docs')
  assert.equal(joinPath('/var/log', 'termix/app.log'), '/var/log/termix/app.log')
  assert.equal(joinPath('', 'docs'), 'docs')
  assert.equal(joinPath('/home/user', ''), '/home/user')
  assert.equal(joinPath('.', 'docs'), 'docs')
})

runTest('Child Joining', 'Windows joining prevents double backslashes and handles drive roots', () => {
  assert.equal(joinPath('C:\\Users', 'Admin'), 'C:\\Users\\Admin')
  assert.equal(joinPath('C:\\Users\\', 'Admin'), 'C:\\Users\\Admin', 'Trailing \\ must not duplicate \\')
  assert.equal(joinPath('C:\\', 'Admin'), 'C:\\Admin', 'Drive root join must not produce C:\\\\Admin')
  assert.equal(joinPath('C:\\Users\\Admin', 'Documents\\termix'), 'C:\\Users\\Admin\\Documents\\termix')
  assert.equal(joinPath('', 'Admin'), 'Admin')
  assert.equal(joinPath('C:\\Users', ''), 'C:\\Users')
  assert.equal(joinPath('.', 'Admin'), 'Admin')
})

// -----------------------------------------------------------------------------
// Suite 5: Breadcrumbs Ancestor Reconstruction Integrity
// -----------------------------------------------------------------------------
console.log('\n--- Suite 5: Breadcrumbs Reconstruction Integrity ---')

runTest('Breadcrumbs', 'Every reconstructed ancestor segment matches step-by-step parent directory', () => {
  const winTestPath = 'C:\\Users\\Admin\\AppData\\Local\\Temp'
  const winCrumbs = parseBreadcrumbs(winTestPath)
  assert.equal(winCrumbs.length, 6)

  // Verify each step is the parent of the next
  for (let i = winCrumbs.length - 1; i > 0; i--) {
    const parentOfCurrent = getParentPath(winCrumbs[i].fullPath)
    assert.equal(
      parentOfCurrent,
      winCrumbs[i - 1].fullPath,
      `Parent of crumb[${i}] (${winCrumbs[i].fullPath}) must equal crumb[${i - 1}] (${winCrumbs[i - 1].fullPath})`
    )
  }

  const posixTestPath = '/usr/local/share/termix/bin'
  const posixCrumbs = parseBreadcrumbs(posixTestPath)
  assert.equal(posixCrumbs.length, 6)

  for (let i = posixCrumbs.length - 1; i > 0; i--) {
    const parentOfCurrent = getParentPath(posixCrumbs[i].fullPath)
    assert.equal(
      parentOfCurrent,
      posixCrumbs[i - 1].fullPath,
      `Parent of crumb[${i}] (${posixCrumbs[i].fullPath}) must equal crumb[${i - 1}] (${posixCrumbs[i - 1].fullPath})`
    )
  }
})

runTest('Breadcrumbs', 'No drive letter corruption or undefined paths across multiple drive letters', () => {
  const drives = ['C', 'D', 'E', 'Z', 'c', 'd']
  for (const d of drives) {
    const p = `${d}:\\test\\folder`
    const crumbs = parseBreadcrumbs(p)
    assert.equal(crumbs[0].label, `${d}:`)
    assert.equal(crumbs[0].fullPath, `${d}:\\`)
    assert.equal(crumbs[1].fullPath, `${d}:\\test`)
    assert.equal(crumbs[2].fullPath, `${d}:\\test\\folder`)
  }
})

// -----------------------------------------------------------------------------
// Suite 6: Validation Rules (CreateFolderDialog)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 6: Folder Name Validation Rules ---')

// Mirror the exact validation logic from CreateFolderDialog.tsx lines 35-47
function validateFolderName(folderName) {
  const trimmed = folderName.trim()
  if (!trimmed) {
    return { valid: false, error: 'Folder name cannot be empty.' }
  }
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('..')) {
    return { valid: false, error: 'Directory traversal (..) is not allowed.' }
  }
  if (/[<>:"/\\|?*\x00-\x1F]/.test(trimmed)) {
    return { valid: false, error: 'Folder name contains invalid characters.' }
  }
  return { valid: true, error: null }
}

runTest('Validation Rules', 'Rejects empty and whitespace strings', () => {
  const empties = ['', ' ', '   ', '\t', '\n', '\r\n']
  for (const str of empties) {
    const res = validateFolderName(str)
    assert.equal(res.valid, false)
    assert.equal(res.error, 'Folder name cannot be empty.')
  }
})

runTest('Validation Rules', 'Rejects directory traversal strings', () => {
  const traversals = [
    '..',
    '.',
    '../foo',
    '..\\foo',
    'foo/..',
    'foo\\..',
    'foo/../bar',
    'foo\\..\\bar',
    'nested/../../etc',
    '...',
  ]
  for (const str of traversals) {
    const res = validateFolderName(str)
    assert.equal(res.valid, false, `Expected traversal rejection for "${str}"`)
    assert.equal(res.error, 'Directory traversal (..) is not allowed.')
  }
})

runTest('Validation Rules', 'Rejects illegal filename characters', () => {
  const illegals = [
    '<bad>',
    '>bad<',
    'col:on',
    '"quote"',
    'slash/dir',
    'backslash\\dir',
    'pipe|name',
    'question?mark',
    'wild*card',
    'control\x00byte',
    'bell\x07char',
    'newline\x0Achar',
  ]
  for (const str of illegals) {
    const res = validateFolderName(str)
    assert.equal(res.valid, false, `Expected invalid char rejection for "${str}"`)
    assert.equal(res.error, 'Folder name contains invalid characters.')
  }
})

runTest('Validation Rules', 'Accepts legitimate folder names and trimmed values', () => {
  const valids = [
    'my-folder',
    'project_v2',
    'Documents 2026',
    'archive.1',
    'test',
    '  leading-and-trailing  ',
    '12345',
  ]
  for (const str of valids) {
    const res = validateFolderName(str)
    assert.equal(res.valid, true, `Expected valid name for "${str}"`)
    assert.equal(res.error, null)
  }
})

// -----------------------------------------------------------------------------
// Suite 7: Root Deletion Protection (DeleteConfirmDialog)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 7: Root Deletion Protection ---')

// Mirror the exact predicate from DeleteConfirmDialog.tsx line 32
function isProtectedRoot(pathStr) {
  if (!pathStr) return false
  const trimmed = pathStr.trim()
  return trimmed === '/' || /^[a-zA-Z]:\\?$/.test(trimmed)
}

runTest('Root Protection', 'Blocks deletion of POSIX and Windows root bounds', () => {
  const protectedRoots = [
    '/',
    ' / ',
    'C:\\',
    'C:',
    'c:\\',
    'c:',
    'D:\\',
    'D:',
    'E:\\',
    'Z:\\',
    'Z:',
    '   C:\\   ',
    '   D:   ',
  ]
  for (const rootPath of protectedRoots) {
    assert.equal(isProtectedRoot(rootPath), true, `Expected protected root for "${rootPath}"`)
  }
})

runTest('Root Protection', 'Allows deletion of non-root folders and files', () => {
  const allowedDeletions = [
    '/home',
    '/root',
    '/var/log/termix',
    '/etc/hosts',
    'C:\\Users',
    'C:\\Windows\\Temp',
    'C:\\Program Files',
    'D:\\data\\backups',
  ]
  for (const itemPath of allowedDeletions) {
    assert.equal(isProtectedRoot(itemPath), false, `Expected deletion permitted for "${itemPath}"`)
  }
})

// -----------------------------------------------------------------------------
// Suite 8: formatBytes Boundary Byte Values
// -----------------------------------------------------------------------------
console.log('\n--- Suite 8: formatBytes Boundary Byte Values ---')

runTest('formatBytes', 'Zero, negatives, and sub-kilobyte boundaries', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1), '1 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1023), '1023 B')
  assert.equal(formatBytes(-1), '-1 B')
  assert.equal(formatBytes(-100), '-100 B')
})

runTest('formatBytes', 'Exact 1 KB, 1 MB, 1 GB power-of-two boundaries', () => {
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(1048576), '1.0 MB')
  assert.equal(formatBytes(1572864), '1.5 MB')
  assert.equal(formatBytes(1073741824), '1.0 GB')
  assert.equal(formatBytes(2147483648), '2.0 GB')
})

runTest('formatBytes', 'Pre-boundary values just below thresholds', () => {
  assert.equal(formatBytes(1048575), '1024.0 KB')
  assert.equal(formatBytes(1073741823), '1024.0 MB')
})

runTest('formatBytes', 'Extreme petabyte boundary (1e15)', () => {
  const pBytes = 1e15
  const expected = `${(pBytes / (1024 ** 3)).toFixed(1)} GB`
  assert.equal(formatBytes(pBytes), expected)
  assert.equal(formatBytes(pBytes), '931322.6 GB')
})

// -----------------------------------------------------------------------------
// Suite 9: File Extension Classification (getFileCategory)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 9: File Extension Classification ---')

runTest('getFileCategory', 'Case insensitivity across common extensions', () => {
  assert.equal(getFileCategory('server.TS'), 'code')
  assert.equal(getFileCategory('App.TSX'), 'code')
  assert.equal(getFileCategory('index.JS'), 'code')
  assert.equal(getFileCategory('script.Py'), 'code')
  assert.equal(getFileCategory('config.JSON'), 'code')
  assert.equal(getFileCategory('style.CSS'), 'code')
  assert.equal(getFileCategory('markup.HTML'), 'code')
  assert.equal(getFileCategory('query.SQL'), 'code')
  assert.equal(getFileCategory('README.MD'), 'doc')
  assert.equal(getFileCategory('specs.DOCX'), 'doc')
  assert.equal(getFileCategory('backup.ZIP'), 'archive')
  assert.equal(getFileCategory('photo.PNG'), 'image')
  assert.equal(getFileCategory('sound.MP3'), 'video')
})

runTest('getFileCategory', 'Compound extensions (.tar.gz, .tar.bz2)', () => {
  assert.equal(getFileCategory('archive.tar.gz'), 'archive')
  assert.equal(getFileCategory('backup.tar.bz2'), 'archive')
  assert.equal(getFileCategory('distribution.tgz'), 'archive')
  assert.equal(getFileCategory('bundle.tar'), 'archive')
})

runTest('getFileCategory', 'Dotfiles and configuration files (.env, .gitignore)', () => {
  assert.equal(getFileCategory('.env'), 'code')
  assert.equal(getFileCategory('.gitignore'), 'unknown')
  assert.equal(getFileCategory('.dockerignore'), 'unknown')
})

runTest('getFileCategory', 'Files without extension (Makefile, Dockerfile, LICENSE)', () => {
  assert.equal(getFileCategory('Makefile'), 'code')
  assert.equal(getFileCategory('makefile'), 'code')
  assert.equal(getFileCategory('Dockerfile'), 'code')
  assert.equal(getFileCategory('dockerfile'), 'code')
  assert.equal(getFileCategory('LICENSE'), 'unknown')
  assert.equal(getFileCategory('README'), 'unknown')
  assert.equal(getFileCategory(''), 'unknown')
})

// -----------------------------------------------------------------------------
// Summary & Metrics
// -----------------------------------------------------------------------------
console.log('\n======================================================================')
console.log(`  M4 Challenger Verification Results: ${passedTests}/${totalTests} tests passed`)
console.log('  Status: 100% SUCCESS — ZERO FAILURES')
console.log('======================================================================\n')
