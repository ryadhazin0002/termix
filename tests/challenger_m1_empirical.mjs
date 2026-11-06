/**
 * Milestone 1 Empirical Challenger Test Suite (R3, R4, R5)
 *
 * Verifies with mathematical precision:
 * 1. R3: Huge File Guard:
 *    - Exact sizes: 0B, 1KB, 1MB, 2MB (2,097,152), 2MB+1B (2,097,153), 5MB, 10MB
 *    - Verification that >2MB rejects without calling fs.readFile (no string buffer allocation)
 *    - Verification that non-existent file rejects with ENOENT
 * 2. R4: Filesystem Chroot and Path Boundary Guard:
 *    - Unset TERMIX_ALLOWED_DIR: homedir boundary, traversal ../../.. rejection, C:\Windows rejection, root candidates
 *    - Set TERMIX_ALLOWED_DIR: temporary sandbox, relative subpaths, dotted directories (..hidden), escaping attempts, deleting sandbox root
 *    - Root candidate strings: '/', '\\', 'C:\\', 'C:/', 'c:\\', 'c:/', '/..', 'C:\\..' throw 'Cannot delete root directory'
 * 3. R5: Batched Directory Stat and Directory Listing Cap:
 *    - 1,200 generated items
 *    - Exactly 1,000 entries returned
 *    - Concurrency capped at 50 (batching of 50) and zero EMFILE
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// Import compiled agent fileManager
import {
  resolvePath,
  getAllowedDirectory,
  listDirectory,
  readFile,
  writeFile,
  deleteFile,
  createDirectory,
  MAX_READ_FILE_SIZE_BYTES,
  MAX_DIRECTORY_ENTRIES,
  STAT_BATCH_SIZE,
} from '../apps/agent/dist/fileManager.js';

const TEST_BASE = path.resolve('tmp_challenger_m1_tests');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

async function runTest(name, fn) {
  totalTests++;
  process.stdout.write(`  [TEST ${totalTests}] ${name} ... `);
  try {
    await fn();
    passedTests++;
    console.log(`PASS`);
  } catch (err) {
    failedTests++;
    console.log(`FAIL`);
    console.error(`    Error: ${err.message}`);
    failureDetails.push({ name, error: err });
  }
}

async function main() {
  console.log(`\n================================================================`);
  console.log(`  MILENSTONE 1 EMPIRICAL CHALLENGER TEST SUITE (R3, R4, R5)`);
  console.log(`================================================================\n`);

  // Clean setup
  try {
    await fs.rm(TEST_BASE, { recursive: true, force: true });
  } catch {}
  await fs.mkdir(TEST_BASE, { recursive: true });

  const originalEnvAllowed = process.env.TERMIX_ALLOWED_DIR;

  try {
    // -------------------------------------------------------------------------
    // 1. R3: HUGE FILE GUARD
    // -------------------------------------------------------------------------
    console.log(`\n--- 1. R3: Huge File Guard (0B, 1KB, 1MB, 2MB, 2MB+1, 5MB, 10MB, ENOENT) ---`);

    const r3Sandbox = path.join(TEST_BASE, 'r3_huge_files');
    await fs.mkdir(r3Sandbox, { recursive: true });
    process.env.TERMIX_ALLOWED_DIR = r3Sandbox;

    // 1.1: 0 bytes
    await runTest('0 bytes file reads successfully as empty string', async () => {
      const p = path.join(r3Sandbox, 'file_0b.txt');
      await fs.writeFile(p, Buffer.alloc(0));
      const content = await readFile(p);
      assert.equal(content, '');
    });

    // 1.2: 1 KB (1,024 bytes)
    await runTest('1 KB (1,024 bytes) file reads successfully', async () => {
      const p = path.join(r3Sandbox, 'file_1kb.txt');
      const sample = 'A'.repeat(1024);
      await fs.writeFile(p, sample, 'utf-8');
      const content = await readFile(p);
      assert.equal(content, sample);
      assert.equal(Buffer.byteLength(content, 'utf-8'), 1024);
    });

    // 1.3: 1 MB (1,048,576 bytes)
    await runTest('1 MB (1,048,576 bytes) file reads successfully', async () => {
      const p = path.join(r3Sandbox, 'file_1mb.txt');
      const buf = Buffer.alloc(1024 * 1024, 0x62); // 'b'
      await fs.writeFile(p, buf);
      const content = await readFile(p);
      assert.equal(Buffer.byteLength(content, 'utf-8'), 1024 * 1024);
    });

    // 1.4: Exactly 2 MB (2 * 1024 * 1024 = 2,097,152 bytes)
    await runTest('Exactly 2 MB (2,097,152 bytes) file reads successfully', async () => {
      const p = path.join(r3Sandbox, 'file_exact_2mb.txt');
      const exactSize = 2 * 1024 * 1024;
      const buf = Buffer.alloc(exactSize, 0x63); // 'c'
      await fs.writeFile(p, buf);
      const content = await readFile(p);
      assert.equal(Buffer.byteLength(content, 'utf-8'), exactSize);
    });

    // 1.5: 2 MB + 1 byte (2,097,153 bytes)
    await runTest('2 MB + 1 byte (2,097,153 bytes) rejects with size limit error', async () => {
      const p = path.join(r3Sandbox, 'file_2mb_plus_1.txt');
      const overSize = 2 * 1024 * 1024 + 1;
      const buf = Buffer.alloc(overSize, 0x64); // 'd'
      await fs.writeFile(p, buf);

      await assert.rejects(
        async () => {
          await readFile(p);
        },
        (err) => {
          assert.equal(err.message, `File size (${overSize} bytes) exceeds maximum limit of 2MB`);
          return true;
        }
      );
    });

    // 1.6: 5 MB (5 * 1024 * 1024 = 5,242,880 bytes)
    await runTest('5 MB (5,242,880 bytes) rejects with size limit error', async () => {
      const p = path.join(r3Sandbox, 'file_5mb.txt');
      const size5mb = 5 * 1024 * 1024;
      const buf = Buffer.alloc(size5mb, 0x65);
      await fs.writeFile(p, buf);

      await assert.rejects(
        async () => {
          await readFile(p);
        },
        (err) => {
          assert.equal(err.message, `File size (${size5mb} bytes) exceeds maximum limit of 2MB`);
          return true;
        }
      );
    });

    // 1.7: 10 MB (10 * 1024 * 1024 = 10,485,760 bytes)
    await runTest('10 MB (10,485,760 bytes) rejects with size limit error', async () => {
      const p = path.join(r3Sandbox, 'file_10mb.txt');
      const size10mb = 10 * 1024 * 1024;
      const buf = Buffer.alloc(size10mb, 0x66);
      await fs.writeFile(p, buf);

      await assert.rejects(
        async () => {
          await readFile(p);
        },
        (err) => {
          assert.equal(err.message, `File size (${size10mb} bytes) exceeds maximum limit of 2MB`);
          return true;
        }
      );
    });

    // 1.8: Non-existent file rejects with ENOENT
    await runTest('Non-existent file rejects with ENOENT', async () => {
      const p = path.join(r3Sandbox, 'definitely_nonexistent_file_98765.txt');
      await assert.rejects(
        async () => {
          await readFile(p);
        },
        (err) => {
          assert.ok(err.message.includes('ENOENT') || err.code === 'ENOENT');
          return true;
        }
      );
    });

    // 1.9: Verification that fs.readFile is NOT called for >2MB files (no string buffer allocation)
    await runTest('fs.readFile is never invoked when file exceeds 2MB', async () => {
      const p = path.join(r3Sandbox, 'file_spy_check.txt');
      const overSize = 2 * 1024 * 1024 + 100;
      await fs.writeFile(p, Buffer.alloc(overSize, 0x7a));

      let fsReadFileCalled = false;
      const originalReadFile = fs.readFile;
      fs.readFile = async (...args) => {
        fsReadFileCalled = true;
        return originalReadFile.apply(fs, args);
      };

      try {
        await assert.rejects(async () => {
          await readFile(p);
        });
        assert.equal(fsReadFileCalled, false, 'fs.readFile should NOT be called when file > 2MB');
      } finally {
        fs.readFile = originalReadFile;
      }
    });

    // -------------------------------------------------------------------------
    // 2. R4: FILESYSTEM CHROOT AND PATH BOUNDARY GUARD
    // -------------------------------------------------------------------------
    console.log(`\n--- 2. R4: Filesystem Chroot and Path Boundary Guard ---`);

    // --- Sub-scenario 2.A: TERMIX_ALLOWED_DIR unset ---
    console.log(`\n  [2.A: TERMIX_ALLOWED_DIR unset (defaults to os.homedir())]`);
    delete process.env.TERMIX_ALLOWED_DIR;

    await runTest('getAllowedDirectory defaults to os.homedir() when unset', async () => {
      assert.equal(getAllowedDirectory(), path.resolve(os.homedir()));
    });

    await runTest('Traversing outside homedir via ../../.. throws Access denied', async () => {
      // homedir is e.g. C:\Users\mryad. ../.. points to C:\ which is outside homedir.
      const escapePath = path.resolve(os.homedir(), '..', '..');
      await assert.rejects(
        async () => {
          resolvePath(escapePath);
        },
        /Access denied: Path .* is outside allowed directory/
      );
    });

    await runTest('Absolute path to C:\\Windows throws Access denied when homedir is allowedDir', async () => {
      const winDir = process.env.SystemRoot || 'C:\\Windows';
      await assert.rejects(
        async () => {
          resolvePath(winDir);
        },
        /Access denied: Path .* is outside allowed directory/
      );
    });

    await runTest('Different drive letters throw Access denied on Windows', async () => {
      // Find an unused drive letter or pick X:\
      const crossDrive = 'X:\\unreachable_drive\\test.txt';
      await assert.rejects(
        async () => {
          resolvePath(crossDrive);
        },
        /Access denied: Path .* is outside allowed directory/
      );
    });

    // Root candidates in deleteFile with unset allowedDir
    const candidateStrings = ['/', '\\', 'C:\\', 'C:/', 'c:\\', 'c:/', '/..', 'C:\\..'];
    for (const cand of candidateStrings) {
      await runTest(`deleteFile("${cand}") throws 'Cannot delete root directory'`, async () => {
        await assert.rejects(
          async () => {
            await deleteFile(cand);
          },
          (err) => {
            assert.equal(err.message, 'Cannot delete root directory');
            return true;
          }
        );
      });
    }

    // --- Sub-scenario 2.B: TERMIX_ALLOWED_DIR set to temporary sandbox ---
    console.log(`\n  [2.B: TERMIX_ALLOWED_DIR set to temporary sandbox]`);
    const r4Sandbox = path.join(TEST_BASE, 'r4_sandbox');
    await fs.mkdir(r4Sandbox, { recursive: true });
    process.env.TERMIX_ALLOWED_DIR = r4Sandbox;

    await runTest('getAllowedDirectory returns sandbox path', async () => {
      assert.equal(getAllowedDirectory(), r4Sandbox);
    });

    await runTest('Relative subpaths resolve cleanly inside sandbox', async () => {
      const sub = 'subfolder/nested/test.txt';
      const resolved = resolvePath(sub);
      assert.equal(resolved, path.join(r4Sandbox, 'subfolder', 'nested', 'test.txt'));
    });

    await runTest('Create, write, read, and list in nested relative subpath', async () => {
      const subFile = 'data/records/file1.txt';
      await writeFile(subFile, 'hello inside sandbox');
      const content = await readFile(subFile);
      assert.equal(content, 'hello inside sandbox');

      const listRes = await listDirectory('data/records');
      assert.equal(listRes.entries.length, 1);
      assert.equal(listRes.entries[0].name, 'file1.txt');
    });

    await runTest('Dotted directory names ("..hidden") inside sandbox resolve and operate cleanly', async () => {
      const dotDir = '..hidden';
      const resolved = resolvePath(dotDir);
      assert.equal(resolved, path.join(r4Sandbox, '..hidden'));

      await createDirectory(dotDir);
      const innerFile = '..hidden/confidential.txt';
      await writeFile(innerFile, 'classified data');
      const readBack = await readFile(innerFile);
      assert.equal(readBack, 'classified data');

      const listRes = await listDirectory(dotDir);
      assert.equal(listRes.entries.length, 1);
      assert.equal(listRes.entries[0].name, 'confidential.txt');

      await deleteFile(innerFile);
      await deleteFile(dotDir);
    });

    await runTest('Path escaping attempts throw Access denied in sandbox', async () => {
      const escapeAttempts = [
        '../outside.txt',
        '../../outside.txt',
        'sub/../../outside.txt',
        '..\\outside.txt',
        path.join(r4Sandbox, '..', 'escape.txt'),
        'C:\\Windows\\System32',
      ];

      for (const attempt of escapeAttempts) {
        await assert.rejects(
          async () => {
            resolvePath(attempt);
          },
          /Access denied: Path .* is outside allowed directory/,
          `Expected escape attempt "${attempt}" to throw Access denied`
        );
      }
    });

    await runTest('Deleting the root sandbox itself throws "Cannot delete root directory"', async () => {
      // Test with exact sandbox path
      await assert.rejects(
        async () => {
          await deleteFile(r4Sandbox);
        },
        (err) => {
          assert.equal(err.message, 'Cannot delete root directory');
          return true;
        }
      );

      // Test with "."
      await assert.rejects(
        async () => {
          await deleteFile('.');
        },
        (err) => {
          assert.equal(err.message, 'Cannot delete root directory');
          return true;
        }
      );

      // Test with ""
      await assert.rejects(
        async () => {
          await deleteFile('');
        },
        (err) => {
          assert.equal(err.message, 'Cannot delete root directory');
          return true;
        }
      );

      // Test with "~"
      await assert.rejects(
        async () => {
          await deleteFile('~');
        },
        (err) => {
          assert.equal(err.message, 'Cannot delete root directory');
          return true;
        }
      );
    });

    for (const cand of candidateStrings) {
      await runTest(`deleteFile("${cand}") throws 'Cannot delete root directory' in sandbox`, async () => {
        await assert.rejects(
          async () => {
            await deleteFile(cand);
          },
          (err) => {
            assert.equal(err.message, 'Cannot delete root directory');
            return true;
          }
        );
      });
    }

    // -------------------------------------------------------------------------
    // 3. R5: BATCHED DIRECTORY STAT AND DIRECTORY LISTING CAP
    // -------------------------------------------------------------------------
    console.log(`\n--- 3. R5: Batched Directory Stat and Directory Listing Cap ---`);

    const r5Sandbox = path.join(TEST_BASE, 'r5_large_dir');
    await fs.mkdir(r5Sandbox, { recursive: true });
    process.env.TERMIX_ALLOWED_DIR = r5Sandbox;

    const TOTAL_ITEMS = 1200;
    console.log(`  Generating test directory with ${TOTAL_ITEMS} items (1,150 files + 50 directories)...`);
    const genStart = Date.now();

    // Create 1,150 files and 50 directories
    for (let i = 0; i < TOTAL_ITEMS; i++) {
      const pad = String(i).padStart(4, '0');
      if (i % 24 === 0) {
        fsSync.mkdirSync(path.join(r5Sandbox, `dir_${pad}`));
      } else {
        fsSync.writeFileSync(path.join(r5Sandbox, `file_${pad}.txt`), `Content ${i}`);
      }
    }
    console.log(`  Generated ${TOTAL_ITEMS} items in ${Date.now() - genStart}ms.`);

    await runTest('listDirectory returns exactly 1,000 entries when 1,200 exist', async () => {
      const res = await listDirectory(r5Sandbox);
      assert.equal(res.entries.length, MAX_DIRECTORY_ENTRIES);
      assert.equal(res.entries.length, 1000);
      assert.equal(res.path, r5Sandbox);
    });

    await runTest('fs.stat executes in batches of 50 with peak concurrency <= 50 and zero EMFILE', async () => {
      let activeStats = 0;
      let peakConcurrency = 0;
      let totalStatsCalled = 0;

      const originalStat = fs.stat;
      fs.stat = async (...args) => {
        activeStats++;
        totalStatsCalled++;
        if (activeStats > peakConcurrency) {
          peakConcurrency = activeStats;
        }
        // Small async yield to allow concurrency to manifest
        await new Promise((r) => setImmediate(r));
        try {
          return await originalStat.apply(fs, args);
        } finally {
          activeStats--;
        }
      };

      try {
        const res = await listDirectory(r5Sandbox);
        assert.equal(res.entries.length, 1000);
        console.log(`\n      [Empirical Stat Telemetry] Peak Concurrency: ${peakConcurrency}, Total Stats: ${totalStatsCalled}`);

        // Peak concurrency must NOT exceed STAT_BATCH_SIZE (50)
        assert.ok(
          peakConcurrency <= STAT_BATCH_SIZE,
          `Peak concurrency (${peakConcurrency}) exceeded STAT_BATCH_SIZE (${STAT_BATCH_SIZE})`
        );
        // Total stats called must equal exactly MAX_DIRECTORY_ENTRIES (1000)
        assert.equal(
          totalStatsCalled,
          MAX_DIRECTORY_ENTRIES,
          `Total stats called (${totalStatsCalled}) should equal MAX_DIRECTORY_ENTRIES (1000)`
        );
      } finally {
        fs.stat = originalStat;
      }
    });

    await runTest('Returned entries are well-formed FileEntry objects with valid metadata', async () => {
      const res = await listDirectory(r5Sandbox);
      for (const entry of res.entries.slice(0, 20)) {
        assert.ok(typeof entry.name === 'string' && entry.name.length > 0);
        assert.ok(path.isAbsolute(entry.path));
        assert.ok(typeof entry.isDirectory === 'boolean');
        assert.ok(typeof entry.size === 'number' && entry.size >= 0);
        assert.ok(!isNaN(Date.parse(entry.modifiedAt)));
      }
    });

  } finally {
    // Restore environment
    if (originalEnvAllowed !== undefined) {
      process.env.TERMIX_ALLOWED_DIR = originalEnvAllowed;
    } else {
      delete process.env.TERMIX_ALLOWED_DIR;
    }

    // Clean up temporary test files
    try {
      await fs.rm(TEST_BASE, { recursive: true, force: true });
    } catch {}
  }

  console.log(`\n================================================================`);
  console.log(`  CHALLENGER SUITE EXECUTION SUMMARY`);
  console.log(`================================================================`);
  console.log(`  Total Tests Run:  ${totalTests}`);
  console.log(`  Passed Tests:     ${passedTests}`);
  console.log(`  Failed Tests:     ${failedTests}`);
  console.log(`  Overall Result:   ${failedTests === 0 ? 'ALL PASS (100%)' : 'FAILURES DETECTED'}`);
  console.log(`================================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test harness error:', err);
  process.exit(1);
});
