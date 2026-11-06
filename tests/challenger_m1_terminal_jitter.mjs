/**
 * Milestone 1 Empirical Challenger Test Suite (R2: Terminal Cleanup & R6: Jitter)
 */

import assert from 'node:assert/strict';
import { TerminalManager } from '../apps/agent/dist/terminal.js';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';

async function testTerminalLifecycle() {
  console.log('Testing TerminalManager lifecycle & closeAll cleanup...');
  const mockSocket = new EventEmitter();
  const tm = new TerminalManager(mockSocket);

  // Create session
  const sessionId = 'test-session-term-1';
  await tm.createSession(sessionId, 80, 24);

  assert.equal(tm.hasSession(sessionId), true, 'Session should exist after creation');

  // Verify closeAll kills session and clears map
  tm.closeAll();
  assert.equal(tm.hasSession(sessionId), false, 'Session should not exist after closeAll');

  // Idempotency: calling closeAll again should not throw
  assert.doesNotThrow(() => {
    tm.closeAll();
  });

  console.log('TerminalManager lifecycle tests PASSED.');
}

async function testIndexJitterConfig() {
  console.log('Verifying Socket.IO randomizationFactor configuration in index.ts...');
  const indexTsContent = await fs.readFile('apps/agent/src/index.ts', 'utf-8');
  assert.ok(
    indexTsContent.includes('randomizationFactor: 0.5'),
    'apps/agent/src/index.ts must configure randomizationFactor: 0.5'
  );
  console.log('Socket.IO jitter verification PASSED.');
}

async function main() {
  await testTerminalLifecycle();
  await testIndexJitterConfig();
  console.log('All auxiliary Milestone 1 challenger tests passed successfully.');
}

main().catch((err) => {
  console.error('Failure:', err);
  process.exit(1);
});
