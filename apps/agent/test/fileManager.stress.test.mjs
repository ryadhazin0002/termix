import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

// Import compiled agent fileManager
import {
  resolvePath,
  listDirectory,
  readFile,
  writeFile,
  deleteFile,
  createDirectory,
} from '../dist/fileManager.js';

const TEST_ROOT = path.resolve('tmp_challenger_stress_sandbox');

describe('Agent fileManager Empirical Stress & Oracle Tests', () => {
  before(async () => {
    // Clean up any leftover test directory
    try {
      await fs.rm(TEST_ROOT, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(TEST_ROOT, { recursive: true });
  });

  after(async () => {
    // Final cleanup of test sandbox
    try {
      await fs.rm(TEST_ROOT, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Path Resolution (resolvePath)', () => {
    test('resolves empty string to os.homedir()', () => {
      assert.equal(resolvePath(''), os.homedir());
    });

    test('resolves whitespace-only string to os.homedir()', () => {
      assert.equal(resolvePath('   '), os.homedir());
      assert.equal(resolvePath('\t\n'), os.homedir());
    });

    test('resolves undefined to os.homedir()', () => {
      assert.equal(resolvePath(undefined), os.homedir());
    });

    test('resolves "." to os.homedir()', () => {
      assert.equal(resolvePath('.'), os.homedir());
    });

    test('resolves "~" to os.homedir()', () => {
      assert.equal(resolvePath('~'), os.homedir());
    });

    test('resolves "~/" prefix to homedir relative path', () => {
      const expected = path.join(os.homedir(), 'subfolder/file.txt');
      assert.equal(resolvePath('~/subfolder/file.txt'), expected);
    });

    test('resolves "~\\" prefix on Windows to homedir relative path', () => {
      const expected = path.join(os.homedir(), 'subfolder\\file.txt');
      assert.equal(resolvePath('~\\subfolder\\file.txt'), expected);
    });

    test('resolves relative path to process.cwd() absolute path', () => {
      assert.equal(resolvePath('relative/path.txt'), path.resolve('relative/path.txt'));
      assert.equal(resolvePath('./nested/file.txt'), path.resolve('./nested/file.txt'));
      assert.equal(resolvePath('../sibling.txt'), path.resolve('../sibling.txt'));
    });
  });

  describe('2. Root Deletion Guards (deleteFile)', () => {
    const rootCandidates = [
      '/',
      '\\',
      'C:\\',
      'C:/',
      'c:\\',
      'c:/',
      '/..',
      'C:\\..',
    ];

    for (const rootPath of rootCandidates) {
      test(`blocks deletion attempt on root candidate: "${rootPath}"`, async () => {
        await assert.rejects(
          async () => {
            await deleteFile(rootPath);
          },
          {
            name: 'Error',
            message: 'Cannot delete root directory',
          }
        );
      });
    }

    test('does not throw root guard error on normal non-root subpaths', async () => {
      const safeDir = path.join(TEST_ROOT, 'safe_delete_test');
      await fs.mkdir(safeDir, { recursive: true });
      // deleteFile should succeed without complaining about root
      await assert.doesNotReject(async () => {
        await deleteFile(safeDir);
      });
    });
  });

  describe('3. Nested Directory Creation & Directory Listing (createDirectory & listDirectory)', () => {
    test('creates deep nested directory hierarchy (10 levels)', async () => {
      const deepPath = path.join(
        TEST_ROOT,
        'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10'
      );
      await createDirectory(deepPath);
      const stat = await fs.stat(deepPath);
      assert.equal(stat.isDirectory(), true);
    });

    test('creates and lists directories with special characters, spaces, accents, and unicode', async () => {
      const specialDirName = 'dir_sp ace_çhàr_🚀_日本語_العربية';
      const dirPath = path.join(TEST_ROOT, specialDirName);
      await createDirectory(dirPath);

      // Create a file inside it
      const filePath = path.join(dirPath, 'test_file_✨.txt');
      await writeFile(filePath, 'special content');

      // List parent directory
      const listRes = await listDirectory(TEST_ROOT);
      assert.equal(typeof listRes.path, 'string');
      const found = listRes.entries.find((e) => e.name === specialDirName);
      assert.ok(found, `Expected to find directory "${specialDirName}" in listing`);
      assert.equal(found.isDirectory, true);

      // List inside the special directory
      const innerList = await listDirectory(dirPath);
      assert.equal(innerList.entries.length, 1);
      assert.equal(innerList.entries[0].name, 'test_file_✨.txt');
      assert.equal(innerList.entries[0].isDirectory, false);
      assert.equal(innerList.entries[0].size, Buffer.byteLength('special content', 'utf8'));
    });

    test('lists empty directory correctly with entries: []', async () => {
      const emptyDir = path.join(TEST_ROOT, 'empty_dir');
      await createDirectory(emptyDir);

      const res = await listDirectory(emptyDir);
      assert.equal(res.path, emptyDir);
      assert.deepEqual(res.entries, []);
    });

    test('correctly populates FileEntry metadata (size, modifiedAt, permissions)', async () => {
      const metaDir = path.join(TEST_ROOT, 'meta_test');
      await createDirectory(metaDir);
      const filePath = path.join(metaDir, 'sample.txt');
      const content = 'Hello Metadata World!';
      await writeFile(filePath, content);

      const res = await listDirectory(metaDir);
      assert.equal(res.entries.length, 1);
      const entry = res.entries[0];
      assert.equal(entry.name, 'sample.txt');
      assert.equal(entry.path, filePath);
      assert.equal(entry.isDirectory, false);
      assert.equal(entry.size, Buffer.byteLength(content, 'utf8'));
      assert.ok(!isNaN(Date.parse(entry.modifiedAt)), 'modifiedAt should be valid ISO date');
      assert.ok(typeof entry.permissions === 'string', 'permissions should be octal string');
    });

    test('rejects with ENOENT when listing a non-existent directory', async () => {
      const nonExistent = path.join(TEST_ROOT, 'non_existent_folder_xyz_123');
      await assert.rejects(async () => {
        await listDirectory(nonExistent);
      }, /ENOENT/);
    });

    test('rejects with ENOTDIR when listing a regular file as a directory', async () => {
      const filePath = path.join(TEST_ROOT, 'file_not_dir.txt');
      await writeFile(filePath, 'some file content');
      await assert.rejects(async () => {
        await listDirectory(filePath);
      }, /ENOTDIR/);
    });
  });

  describe('4. Text File Reading & Writing (readFile & writeFile)', () => {
    test('writes and reads unicode, emojis, accents, and multiple alphabets', async () => {
      const filePath = path.join(TEST_ROOT, 'unicode_test.txt');
      const unicodeString = `
        English: The quick brown fox jumps over the lazy dog.
        Accented: Voilà, l'été déjà! Ça va bien, señorita.
        Greek: Καλημέρα κόσμε
        Cyrillic: Привет, мир! Тестирование файлов.
        Arabic: مرحبا بالعالم، هذا اختبار لترميز النصوص.
        CJK: 你好世界！日本語のテストです。한국어 테스트.
        Emojis: 🚀🎉🔥💻📁🔒🛡️⚙️🌟
        Math & Symbols: ∑(x^2 + y^2) = ∞, © ® ™ ± ÷ ≠ ≤ ≥
      `;

      await writeFile(filePath, unicodeString);
      const readBack = await readFile(filePath);
      assert.equal(readBack, unicodeString);
    });

    test('handles CRLF, LF, mixed newlines, and trailing newlines', async () => {
      const filePath = path.join(TEST_ROOT, 'newlines_test.txt');
      const contentWithNewlines = 'Line 1\r\nLine 2\nLine 3\r\n\r\nLine 5\n\n\n';
      await writeFile(filePath, contentWithNewlines);
      const readBack = await readFile(filePath);
      assert.equal(readBack, contentWithNewlines);
    });

    test('writes and reads empty file content ""', async () => {
      const filePath = path.join(TEST_ROOT, 'empty_file.txt');
      await writeFile(filePath, '');
      const readBack = await readFile(filePath);
      assert.equal(readBack, '');

      const stat = await fs.stat(filePath);
      assert.equal(stat.size, 0);
    });

    test('automatically creates parent directories recursively when writing file', async () => {
      const deepFilePath = path.join(
        TEST_ROOT,
        'auto_p1', 'auto_p2', 'auto_p3', 'nested_output.txt'
      );
      await writeFile(deepFilePath, 'auto parent creation works');
      const readBack = await readFile(deepFilePath);
      assert.equal(readBack, 'auto parent creation works');
    });

    test('overwrites existing file cleanly', async () => {
      const filePath = path.join(TEST_ROOT, 'overwrite_target.txt');
      await writeFile(filePath, 'Initial long content that should be completely replaced');
      await writeFile(filePath, 'Short');
      const readBack = await readFile(filePath);
      assert.equal(readBack, 'Short');
    });

    test('stress test: reads and writes large text file (1 MB)', async () => {
      const filePath = path.join(TEST_ROOT, 'large_stress_file.txt');
      const chunkSize = 1024;
      const chunksCount = 1024; // 1 MB
      const line = 'A'.repeat(chunkSize - 1) + '\n';
      const largeContent = line.repeat(chunksCount);

      const expectedHash = crypto.createHash('sha256').update(largeContent).digest('hex');

      await writeFile(filePath, largeContent);
      const readBack = await readFile(filePath);

      const actualHash = crypto.createHash('sha256').update(readBack).digest('hex');
      assert.equal(actualHash, expectedHash);
      assert.equal(readBack.length, largeContent.length);
    });

    test('rejects with ENOENT when reading non-existent file', async () => {
      const filePath = path.join(TEST_ROOT, 'ghost_file_missing.txt');
      await assert.rejects(async () => {
        await readFile(filePath);
      }, /ENOENT/);
    });

    test('rejects with EISDIR when writing to a path that is already a directory', async () => {
      const dirPath = path.join(TEST_ROOT, 'existing_dir_target');
      await createDirectory(dirPath);
      await assert.rejects(async () => {
        await writeFile(dirPath, 'cannot write file over directory');
      }, /EISDIR/);
    });
  });

  describe('5. Recursive Deletion (deleteFile)', () => {
    test('deletes a single standalone file', async () => {
      const filePath = path.join(TEST_ROOT, 'delete_single.txt');
      await writeFile(filePath, 'to be deleted');
      await deleteFile(filePath);
      await assert.rejects(async () => {
        await fs.stat(filePath);
      }, /ENOENT/);
    });

    test('deletes an empty directory', async () => {
      const emptyDirPath = path.join(TEST_ROOT, 'delete_empty_folder');
      await createDirectory(emptyDirPath);
      await deleteFile(emptyDirPath);
      await assert.rejects(async () => {
        await fs.stat(emptyDirPath);
      }, /ENOENT/);
    });

    test('recursively deletes a deep tree with nested files and folders', async () => {
      const treeRoot = path.join(TEST_ROOT, 'delete_tree_root');
      await writeFile(path.join(treeRoot, 'f1.txt'), 'file 1');
      await writeFile(path.join(treeRoot, 'sub1', 'f2.txt'), 'file 2');
      await writeFile(path.join(treeRoot, 'sub1', 'sub2', 'f3.txt'), 'file 3');
      await writeFile(path.join(treeRoot, 'sub1', 'sub2', 'sub3', 'f4.txt'), 'file 4');

      await deleteFile(treeRoot);

      await assert.rejects(async () => {
        await fs.stat(treeRoot);
      }, /ENOENT/);
    });

    test('recursively deletes folders containing chmod read-only files (0o444)', async () => {
      const roTree = path.join(TEST_ROOT, 'delete_chmod_ro_tree');
      const roFilePath = path.join(roTree, 'readonly_chmod.txt');
      await writeFile(roFilePath, 'chmod read-only content');
      await fs.chmod(roFilePath, 0o444);

      await assert.doesNotReject(async () => {
        await deleteFile(roTree);
      });

      await assert.rejects(async () => {
        await fs.stat(roTree);
      }, /ENOENT/);
    });

    test('recursively deletes folders containing Windows attrib +r read-only files', async () => {
      if (process.platform !== 'win32') {
        return; // Only relevant on Windows
      }
      const attribTree = path.join(TEST_ROOT, 'delete_attrib_ro_tree');
      const attribFilePath = path.join(attribTree, 'readonly_attrib.txt');
      await writeFile(attribFilePath, 'attrib read-only content');

      try {
        execSync(`attrib +r "${attribFilePath}"`);
      } catch (err) {
        console.warn('Could not run attrib +r:', err);
      }

      await assert.doesNotReject(async () => {
        await deleteFile(attribTree);
      });

      await assert.rejects(async () => {
        await fs.stat(attribTree);
      }, /ENOENT/);
    });

    test('succeeds without throwing when deleting non-existent path (force: true)', async () => {
      const nonExistent = path.join(TEST_ROOT, 'non_existent_to_delete');
      await assert.doesNotReject(async () => {
        await deleteFile(nonExistent);
      });
    });
  });

  describe('6. Concurrency & High Load Stress', () => {
    test('handles 50 parallel file writes and reads without corruption', async () => {
      const stressDir = path.join(TEST_ROOT, 'parallel_stress');
      await createDirectory(stressDir);

      const count = 50;
      const tasks = Array.from({ length: count }, async (_, i) => {
        const filePath = path.join(stressDir, `parallel_${i}.txt`);
        const payload = `Worker ${i}: ` + crypto.randomBytes(256).toString('hex');
        await writeFile(filePath, payload);
        const back = await readFile(filePath);
        assert.equal(back, payload);
      });

      await Promise.all(tasks);

      const listing = await listDirectory(stressDir);
      assert.equal(listing.entries.length, count);
    });
  });

  describe('7. Socket Event Handlers Simulation (apps/agent/src/index.ts contracts)', () => {
    // Simulate socket event handling from index.ts lines 75-184
    const DEVICE_ID = 'test-device-id';

    function createMockSocket() {
      const emitted = [];
      return {
        emitted,
        emit(event, data) {
          emitted.push({ event, data });
        },
      };
    }

    test('file:list handler returns populated entries or error result', async () => {
      const mockSocket = createMockSocket();

      // Simulated index.ts file:list handler
      const handleFileList = async (payload) => {
        try {
          const result = await listDirectory(payload.path);
          mockSocket.emit('file:list:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: result.path,
            entries: result.entries,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          mockSocket.emit('file:list:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            entries: [],
            error: errorMsg || 'Failed to list directory',
          });
        }
      };

      // Case A: success
      await handleFileList({ requestId: 'req-list-ok', path: TEST_ROOT });
      assert.equal(mockSocket.emitted.length, 1);
      assert.equal(mockSocket.emitted[0].event, 'file:list:result');
      assert.equal(mockSocket.emitted[0].data.requestId, 'req-list-ok');
      assert.equal(mockSocket.emitted[0].data.deviceId, DEVICE_ID);
      assert.ok(Array.isArray(mockSocket.emitted[0].data.entries));
      assert.equal(mockSocket.emitted[0].data.error, undefined);

      // Case B: error
      await handleFileList({ requestId: 'req-list-err', path: path.join(TEST_ROOT, 'missing_xyz') });
      assert.equal(mockSocket.emitted.length, 2);
      assert.equal(mockSocket.emitted[1].event, 'file:list:result');
      assert.equal(mockSocket.emitted[1].data.requestId, 'req-list-err');
      assert.deepEqual(mockSocket.emitted[1].data.entries, []);
      assert.ok(mockSocket.emitted[1].data.error.includes('ENOENT'));
    });

    test('file:read handler returns content or error result', async () => {
      const mockSocket = createMockSocket();
      const testFile = path.join(TEST_ROOT, 'socket_read.txt');
      await writeFile(testFile, 'read me via socket');

      const handleFileRead = async (payload) => {
        try {
          const content = await readFile(payload.path);
          mockSocket.emit('file:read:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            content,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          mockSocket.emit('file:read:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            error: errorMsg || 'Failed to read file',
          });
        }
      };

      // Success
      await handleFileRead({ requestId: 'req-read-ok', path: testFile });
      assert.equal(mockSocket.emitted[0].data.content, 'read me via socket');
      assert.equal(mockSocket.emitted[0].data.error, undefined);

      // Failure
      await handleFileRead({ requestId: 'req-read-fail', path: testFile + '.nonexistent' });
      assert.equal(mockSocket.emitted[1].data.content, undefined);
      assert.ok(mockSocket.emitted[1].data.error.includes('ENOENT'));
    });

    test('file:write handler returns success: true or success: false with error', async () => {
      const mockSocket = createMockSocket();
      const handleFileWrite = async (payload) => {
        try {
          await writeFile(payload.path, payload.content);
          mockSocket.emit('file:write:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: true,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          mockSocket.emit('file:write:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: false,
            error: errorMsg || 'Failed to write file',
          });
        }
      };

      // Success
      const targetFile = path.join(TEST_ROOT, 'socket_write.txt');
      await handleFileWrite({ requestId: 'req-write-ok', path: targetFile, content: 'written!' });
      assert.equal(mockSocket.emitted[0].data.success, true);

      // Failure (attempt to write over existing directory)
      const existingDir = path.join(TEST_ROOT, 'cannot_write_here');
      await createDirectory(existingDir);
      await handleFileWrite({ requestId: 'req-write-fail', path: existingDir, content: 'bad' });
      assert.equal(mockSocket.emitted[1].data.success, false);
      assert.ok(mockSocket.emitted[1].data.error.includes('EISDIR'));
    });

    test('file:delete handler catches root deletion and returns success: false', async () => {
      const mockSocket = createMockSocket();
      const handleFileDelete = async (payload) => {
        try {
          await deleteFile(payload.path);
          mockSocket.emit('file:delete:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: true,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          mockSocket.emit('file:delete:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: false,
            error: errorMsg || 'Failed to delete file',
          });
        }
      };

      // Root delete attempt
      await handleFileDelete({ requestId: 'req-del-root', path: '/' });
      assert.equal(mockSocket.emitted[0].data.success, false);
      assert.equal(mockSocket.emitted[0].data.error, 'Cannot delete root directory');

      // Valid delete
      const toDelete = path.join(TEST_ROOT, 'socket_del.txt');
      await writeFile(toDelete, 'delete me');
      await handleFileDelete({ requestId: 'req-del-ok', path: toDelete });
      assert.equal(mockSocket.emitted[1].data.success, true);
    });

    test('file:mkdir handler returns success: true or success: false with error', async () => {
      const mockSocket = createMockSocket();
      const handleFileMkdir = async (payload) => {
        try {
          await createDirectory(payload.path);
          mockSocket.emit('file:mkdir:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: true,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          mockSocket.emit('file:mkdir:result', {
            requestId: payload.requestId,
            deviceId: DEVICE_ID,
            path: payload.path,
            success: false,
            error: errorMsg || 'Failed to create directory',
          });
        }
      };

      // Success
      const newDir = path.join(TEST_ROOT, 'socket_mkdir_ok');
      await handleFileMkdir({ requestId: 'req-mkdir-ok', path: newDir });
      assert.equal(mockSocket.emitted[0].data.success, true);

      // Failure: attempt to mkdir over an existing regular file
      const existingFile = path.join(TEST_ROOT, 'mkdir_conflict_file.txt');
      await writeFile(existingFile, 'blocking file');
      await handleFileMkdir({ requestId: 'req-mkdir-fail', path: existingFile });
      assert.equal(mockSocket.emitted[1].data.success, false);
      assert.ok(mockSocket.emitted[1].data.error);
    });
  });

  describe('8. Extreme Stress & Resilience (Deep Paths, Burst Load & Rejection Monitor)', () => {
    test('handles path length exceeding 300 characters without crashing', async () => {
      const segment = 'sub_dir_seg_12345';
      const deepPath = path.join(TEST_ROOT, ...Array(15).fill(segment));
      assert.ok(deepPath.length > 300, `Expected path length > 300, got ${deepPath.length}`);

      await createDirectory(deepPath);
      const deepFile = path.join(deepPath, 'deep_target.txt');
      await writeFile(deepFile, 'deep path content');
      const content = await readFile(deepFile);
      assert.equal(content, 'deep path content');

      const listing = await listDirectory(deepPath);
      assert.equal(listing.entries.length, 1);
      assert.equal(listing.entries[0].name, 'deep_target.txt');

      await deleteFile(deepPath);
      await assert.rejects(async () => {
        await fs.stat(deepPath);
      }, /ENOENT/);
    });

    test('burst test: 100 concurrent mixed socket requests complete without hanging or unhandled rejections', async () => {
      const burstDir = path.join(TEST_ROOT, 'burst_test_dir');
      await createDirectory(burstDir);

      let unhandledRejectionCount = 0;
      const onUnhandled = () => {
        unhandledRejectionCount++;
      };
      process.on('unhandledRejection', onUnhandled);

      const mockSocket = {
        emitted: [],
        emit(event, data) {
          this.emitted.push({ event, data });
        },
      };

      const promises = [];
      for (let i = 0; i < 100; i++) {
        const reqId = `burst-${i}`;
        const opType = i % 5;
        const filePath = path.join(burstDir, `file_${i}.txt`);
        const subDir = path.join(burstDir, `dir_${i}`);

        if (opType === 0) {
          // write
          promises.push(
            (async () => {
              try {
                await writeFile(filePath, `content ${i}`);
                mockSocket.emit('file:write:result', { requestId: reqId, success: true });
              } catch (e) {
                mockSocket.emit('file:write:result', { requestId: reqId, success: false, error: e.message });
              }
            })()
          );
        } else if (opType === 1) {
          // mkdir
          promises.push(
            (async () => {
              try {
                await createDirectory(subDir);
                mockSocket.emit('file:mkdir:result', { requestId: reqId, success: true });
              } catch (e) {
                mockSocket.emit('file:mkdir:result', { requestId: reqId, success: false, error: e.message });
              }
            })()
          );
        } else if (opType === 2) {
          // list
          promises.push(
            (async () => {
              try {
                const res = await listDirectory(burstDir);
                mockSocket.emit('file:list:result', { requestId: reqId, entries: res.entries });
              } catch (e) {
                mockSocket.emit('file:list:result', { requestId: reqId, entries: [], error: e.message });
              }
            })()
          );
        } else if (opType === 3) {
          // read (might be nonexistent or existent, both handled gracefully)
          promises.push(
            (async () => {
              try {
                const content = await readFile(filePath);
                mockSocket.emit('file:read:result', { requestId: reqId, content });
              } catch (e) {
                mockSocket.emit('file:read:result', { requestId: reqId, error: e.message });
              }
            })()
          );
        } else {
          // delete (valid or root guard test)
          const target = i === 99 ? '/' : filePath;
          promises.push(
            (async () => {
              try {
                await deleteFile(target);
                mockSocket.emit('file:delete:result', { requestId: reqId, success: true });
              } catch (e) {
                mockSocket.emit('file:delete:result', { requestId: reqId, success: false, error: e.message });
              }
            })()
          );
        }
      }

      await Promise.all(promises);
      process.off('unhandledRejection', onUnhandled);

      assert.equal(unhandledRejectionCount, 0, 'Zero unhandled rejections allowed');
      assert.equal(mockSocket.emitted.length, 100, 'All 100 requests must emit a response');

      // The 99th delete on '/' must fail cleanly with root error
      const rootDeleteResult = mockSocket.emitted.find((e) => e.data.requestId === 'burst-99');
      assert.ok(rootDeleteResult, 'Request burst-99 must be present');
      assert.equal(rootDeleteResult.data.success, false);
      assert.equal(rootDeleteResult.data.error, 'Cannot delete root directory');
    });
  });
});

