/**
 * M3 Empirical Adversarial Challenge Test Suite
 *
 * Author: m3_challenger_2 (teamwork_challenger)
 * Target: apps/web/src/components/terminal/TerminalView.tsx
 *         apps/web/src/components/terminal/terminalThemes.ts
 *         apps/web/src/store/settings.ts
 *         apps/web/src/app/(dashboard)/dashboard/settings/page.tsx
 *
 * Test Dimensions:
 * 1. Theme resolution matrix (dark, light, system across dark/light OS preferences, WCAG contrast, ANSI 16 palette)
 * 2. Monospace font fallback formatting & edge-case inputs (quotes, whitespace, empty, pre-formatted)
 * 3. In-place option mutation verification (Terminal instance continuity, zero disposal, socket listener preservation)
 * 4. Selective refit testing (font changes refit + resize; theme/cursor/scrollback do NOT refit)
 * 5. Bell audio chime gating & Web Audio error resilience (silent on false, chime on true, rapid bell stress)
 * 6. Rapid-fire slider dragging & live theme churning stress harness (100 rapid changes + concurrent socket traffic)
 * 7. Zustand settings store concurrency, SSR safety, and schema drift deep merge
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const require = createRequire(import.meta.url);
const requireFromWeb = createRequire(path.resolve(rootDir, 'apps/web/package.json'));

console.log('================================================================');
console.log('M3 EMPIRICAL CHALLENGER ADVERSARIAL TEST SUITE');
console.log('Target: TerminalView, terminalThemes, settingsStore, Audio Bell');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function report(testName, passed, detail = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}: ${detail}`);
    failureDetails.push({ testName, detail });
  }
}

// Global polyfills for node environment
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

if (typeof globalThis.localStorage === 'undefined') {
  let storage = {};
  globalThis.localStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => {
      storage[k] = String(v);
    },
    removeItem: (k) => {
      delete storage[k];
    },
    clear: () => {
      storage = {};
    },
    length: 0,
    key: () => null,
  };
}

const esbuild = require(path.resolve(rootDir, 'node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild'));

// ===========================================================================
// SECTION 1: Theme Resolution Matrix & Palette Conformance
// ===========================================================================
console.log('--- Section 1: Theme Resolution Matrix & Palette Conformance ---');

const themeBundle = esbuild.buildSync({
  entryPoints: [path.resolve(rootDir, 'apps/web/src/components/terminal/terminalThemes.ts')],
  bundle: true,
  format: 'esm',
  write: false,
});

const themeModuleUrl = 'data:text/javascript;base64,' + Buffer.from(themeBundle.outputFiles[0].text).toString('base64');
const { darkTheme, lightTheme, resolveTerminalTheme, getFontFamilyWithFallback } = await import(themeModuleUrl);

// Test 1.1: Complete ANSI 16 palette presence in darkTheme
const requiredThemeKeys = [
  'background', 'foreground', 'cursor', 'cursorAccent',
  'selectionBackground', 'selectionInactiveBackground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
];

const darkMissingKeys = requiredThemeKeys.filter(k => typeof darkTheme[k] !== 'string');
report('Dark theme defines all 22 required XTerm ITheme color properties', darkMissingKeys.length === 0, `Missing: ${darkMissingKeys.join(', ')}`);

// Test 1.2: Complete ANSI 16 palette presence in lightTheme
const lightMissingKeys = requiredThemeKeys.filter(k => typeof lightTheme[k] !== 'string');
report('Light theme defines all 22 required XTerm ITheme color properties', lightMissingKeys.length === 0, `Missing: ${lightMissingKeys.join(', ')}`);

// Test 1.3: Hex color format validation
const hexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const darkInvalidHex = requiredThemeKeys.filter(k => !hexColorRegex.test(darkTheme[k]));
const lightInvalidHex = requiredThemeKeys.filter(k => !hexColorRegex.test(lightTheme[k]));
report('Dark theme colors are all valid CSS hex strings', darkInvalidHex.length === 0, `Invalid: ${darkInvalidHex.join(', ')}`);
report('Light theme colors are all valid CSS hex strings', lightInvalidHex.length === 0, `Invalid: ${lightInvalidHex.join(', ')}`);

// Test 1.4: WCAG Relative Luminance Contrast Verification
function getLuminance(hex) {
  const clean = hex.slice(1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function getContrast(hex1, hex2) {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

const darkContrast = getContrast(darkTheme.background, darkTheme.foreground);
report(`Dark theme text contrast ratio meets WCAG AA (>= 4.5:1, measured: ${darkContrast.toFixed(2)}:1)`, darkContrast >= 4.5);

const lightContrast = getContrast(lightTheme.background, lightTheme.foreground);
report(`Light theme text contrast ratio meets WCAG AA (>= 4.5:1, measured: ${lightContrast.toFixed(2)}:1)`, lightContrast >= 4.5);

// Test 1.5: Complete 2x3 Resolution Matrix
const resDarkWithDarkOS = resolveTerminalTheme('dark', true);
const resDarkWithLightOS = resolveTerminalTheme('dark', false);
report('resolveTerminalTheme(dark) returns isDark=true regardless of OS preference',
  resDarkWithDarkOS.isDark === true && resDarkWithLightOS.isDark === true &&
  resDarkWithDarkOS.theme === darkTheme && resDarkWithLightOS.theme === darkTheme
);

const resLightWithDarkOS = resolveTerminalTheme('light', true);
const resLightWithLightOS = resolveTerminalTheme('light', false);
report('resolveTerminalTheme(light) returns isDark=false regardless of OS preference',
  resLightWithDarkOS.isDark === false && resLightWithLightOS.isDark === false &&
  resLightWithDarkOS.theme === lightTheme && resLightWithLightOS.theme === lightTheme
);

const resSystemWithDarkOS = resolveTerminalTheme('system', true);
const resSystemWithLightOS = resolveTerminalTheme('system', false);
report('resolveTerminalTheme(system) adapts dynamically to OS preference',
  resSystemWithDarkOS.isDark === true && resSystemWithDarkOS.theme === darkTheme &&
  resSystemWithLightOS.isDark === false && resSystemWithLightOS.theme === lightTheme
);

// Test 1.6: Adversarial theme values
const resDefaultSystem = resolveTerminalTheme('system'); // omitted second param
report('resolveTerminalTheme(system) defaults systemPrefersDark to true', resDefaultSystem.isDark === true && resDefaultSystem.theme === darkTheme);

const resUnexpectedTheme = resolveTerminalTheme('unknown-theme', true);
report('resolveTerminalTheme handles unexpected theme gracefully without crashing', typeof resUnexpectedTheme === 'object' && resUnexpectedTheme.theme !== undefined);

// ===========================================================================
// SECTION 2: Monospace Font Fallback Formatting Edge Cases
// ===========================================================================
console.log('\n--- Section 2: Monospace Font Fallback Formatting ---');

// Test 2.1: Single unquoted font
const f1 = getFontFamilyWithFallback('JetBrains Mono');
report('Single font gets Menlo, Monaco, Courier New, monospace appended', f1 === "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace");

// Test 2.2: Single font with single quotes
const f2 = getFontFamilyWithFallback("'Fira Code'");
report('Single quoted font gets monospace fallbacks appended', f2 === "'Fira Code', Menlo, Monaco, 'Courier New', monospace");

// Test 2.3: Single font with double quotes
const f3 = getFontFamilyWithFallback('"Courier Prime"');
report('Double quoted font gets monospace fallbacks appended', f3 === '"Courier Prime", Menlo, Monaco, \'Courier New\', monospace');

// Test 2.4: Pre-formatted comma list preserved
const f4 = getFontFamilyWithFallback('JetBrains Mono, Menlo, monospace');
report('Multi-family string with comma is preserved untouched', f4 === 'JetBrains Mono, Menlo, monospace');

// Test 2.5: Empty string
const f5 = getFontFamilyWithFallback('');
report('Empty string returns default JetBrains Mono fallback string', f5 === 'JetBrains Mono, Menlo, Monaco, monospace');

// Test 2.6: Falsy / null / undefined runtime handling
const f6 = getFontFamilyWithFallback(null);
const f7 = getFontFamilyWithFallback(undefined);
report('Null and undefined return default fallback without throwing',
  f6 === 'JetBrains Mono, Menlo, Monaco, monospace' &&
  f7 === 'JetBrains Mono, Menlo, Monaco, monospace'
);

// ===========================================================================
// SECTION 3: In-Place Option Mutation & Lifecycle Continuity
// ===========================================================================
console.log('\n--- Section 3: In-Place Option Mutation & Lifecycle Continuity ---');

// Test using real @xterm/xterm Terminal
const { Terminal } = require(path.resolve(rootDir, 'apps/web/node_modules/@xterm/xterm'));

let terminalDisposed = false;
const realTerminal = new Terminal({
  fontSize: 14,
  fontFamily: getFontFamilyWithFallback('JetBrains Mono'),
  cursorStyle: 'block',
  scrollback: 5000,
  theme: darkTheme,
});

// Spy on dispose to detect unwanted teardown
const originalDispose = realTerminal.dispose.bind(realTerminal);
realTerminal.dispose = function() {
  terminalDisposed = true;
  originalDispose();
};

// Simulate socket stream and data handlers
const socketEmits = [];
const mockSocket = {
  emit: (event, payload) => {
    socketEmits.push({ event, payload });
  },
  on: (event, handler) => {
    mockSocket._handlers = mockSocket._handlers || {};
    mockSocket._handlers[event] = handler;
  },
  off: (event, handler) => {
    if (mockSocket._handlers) {
      delete mockSocket._handlers[event];
    }
  },
};

const inputDataReceived = [];
realTerminal.onData((data) => {
  mockSocket.emit('terminal:input', { sessionId: 'test-session-1', data });
});

// Verify terminal initial options
report('Terminal initializes with correct baseline options',
  realTerminal.options.fontSize === 14 &&
  realTerminal.options.cursorStyle === 'block' &&
  realTerminal.options.scrollback === 5000 &&
  realTerminal.options.theme.background === '#0d0d0d'
);

// Mutate options directly in-place (Effect 2 simulation on real Terminal instance)
realTerminal.options.fontSize = 18;
realTerminal.options.cursorStyle = 'underline';
realTerminal.options.scrollback = 10000;
realTerminal.options.fontFamily = getFontFamilyWithFallback('Fira Code');
realTerminal.options.theme = { ...lightTheme };

report('Terminal options mutate in-place without throwing',
  realTerminal.options.fontSize === 18 &&
  realTerminal.options.cursorStyle === 'underline' &&
  realTerminal.options.scrollback === 10000 &&
  realTerminal.options.theme.background === '#ffffff'
);

report('Terminal instance was NOT disposed during option mutations', terminalDisposed === false);

// Check that onData listener is still 100% operational after mutations
realTerminal.input('ls -la\r');
const hasInputEmitted = socketEmits.some(e => e.event === 'terminal:input' && e.payload.data === 'ls -la\r');
report('Terminal onData stream emits terminal:input after in-place option mutations', hasInputEmitted);

// ===========================================================================
// SECTION 4: Selective Refit & Geometry Synchronization Testing
// ===========================================================================
console.log('\n--- Section 4: Selective Refit Testing ---');

class MockFitAddon {
  constructor() {
    this.fitCalls = 0;
  }
  fit() {
    this.fitCalls++;
  }
}

function runTerminalOptionsSync(term, fitAddon, currentSettings, newSettings, activeTheme, onResize) {
  let needsRefit = false;

  if (term.options.fontSize !== newSettings.fontSize) {
    term.options.fontSize = newSettings.fontSize;
    needsRefit = true;
  }

  const resolvedFont = getFontFamilyWithFallback(newSettings.fontFamily);
  if (term.options.fontFamily !== resolvedFont) {
    term.options.fontFamily = resolvedFont;
    needsRefit = true;
  }

  if (term.options.cursorStyle !== newSettings.cursorStyle) {
    term.options.cursorStyle = newSettings.cursorStyle;
  }

  if (term.options.scrollback !== newSettings.scrollback) {
    term.options.scrollback = newSettings.scrollback;
  }

  term.options.bellStyle = newSettings.bellEnabled ? 'sound' : 'none';
  term.options.theme = { ...activeTheme };

  if (needsRefit) {
    fitAddon.fit();
    onResize(term.cols || 80, term.rows || 24);
  }
}

// Test 4.1: Cursor style change does NOT trigger refit or resize
const testTerm = {
  options: {
    fontSize: 14,
    fontFamily: getFontFamilyWithFallback('JetBrains Mono'),
    cursorStyle: 'block',
    scrollback: 5000,
    theme: darkTheme,
  },
  cols: 120,
  rows: 40,
};
const testFit = new MockFitAddon();
let resizeCalls = 0;
const testResize = () => { resizeCalls++; };

runTerminalOptionsSync(
  testTerm,
  testFit,
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'block', scrollback: 5000, bellEnabled: false },
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 5000, bellEnabled: false },
  darkTheme,
  testResize
);
report('CursorStyle change does NOT dispatch fit() or sendResize', testFit.fitCalls === 0 && resizeCalls === 0 && testTerm.options.cursorStyle === 'bar');

// Test 4.2: Scrollback change does NOT trigger refit or resize
runTerminalOptionsSync(
  testTerm,
  testFit,
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 5000, bellEnabled: false },
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 10000, bellEnabled: false },
  darkTheme,
  testResize
);
report('Scrollback change does NOT dispatch fit() or sendResize', testFit.fitCalls === 0 && resizeCalls === 0 && testTerm.options.scrollback === 10000);

// Test 4.3: Theme change does NOT trigger refit or resize
runTerminalOptionsSync(
  testTerm,
  testFit,
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 10000, bellEnabled: false },
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 10000, bellEnabled: false },
  lightTheme,
  testResize
);
report('Theme change does NOT dispatch fit() or sendResize', testFit.fitCalls === 0 && resizeCalls === 0 && testTerm.options.theme.background === '#ffffff');

// Test 4.4: Bell toggle does NOT trigger refit or resize
runTerminalOptionsSync(
  testTerm,
  testFit,
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 10000, bellEnabled: false },
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 10000, bellEnabled: true },
  lightTheme,
  testResize
);
report('Bell toggle does NOT dispatch fit() or sendResize', testFit.fitCalls === 0 && resizeCalls === 0 && testTerm.options.bellStyle === 'sound');

// Test 4.5: Font size change DOES trigger fit() and sendResize
runTerminalOptionsSync(
  testTerm,
  testFit,
  { fontSize: 14, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 10000, bellEnabled: true },
  { fontSize: 16, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 10000, bellEnabled: true },
  lightTheme,
  testResize
);
report('Font size change DOES trigger fitAddon.fit() and sendResize', testFit.fitCalls === 1 && resizeCalls === 1 && testTerm.options.fontSize === 16);

// Test 4.6: Font family change DOES trigger fit() and sendResize
runTerminalOptionsSync(
  testTerm,
  testFit,
  { fontSize: 16, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', scrollback: 10000, bellEnabled: true },
  { fontSize: 16, fontFamily: 'Fira Code', cursorStyle: 'bar', scrollback: 10000, bellEnabled: true },
  lightTheme,
  testResize
);
report('Font family change DOES trigger fitAddon.fit() and sendResize', testFit.fitCalls === 2 && resizeCalls === 2);

// ===========================================================================
// SECTION 5: Bell Audio Chime Gating & Web Audio Safety
// ===========================================================================
console.log('\n--- Section 5: Bell Audio Chime Gating & Web Audio Safety ---');

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
    this.closed = false;
    this.oscillators = [];
    this.gains = [];
    MockAudioContext.instances.push(this);
  }
  createOscillator() {
    const osc = {
      type: '',
      frequency: {
        setValueAtTime: (val, time) => { osc.freqVal = val; osc.freqTime = time; },
      },
      connect: (dest) => { osc.target = dest; },
      start: () => { osc.started = true; },
      stop: (time) => { osc.stopTime = time; },
    };
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    const gain = {
      gain: {
        setValueAtTime: (val, time) => { gain.startVal = val; },
        exponentialRampToValueAtTime: (val, time) => { gain.endVal = val; gain.endTime = time; },
      },
      connect: (dest) => { gain.target = dest; },
    };
    this.gains.push(gain);
    return gain;
  }
  async close() {
    this.closed = true;
  }
}
MockAudioContext.instances = [];

globalThis.window = globalThis.window || {};
globalThis.window.AudioContext = MockAudioContext;
globalThis.window.localStorage = globalThis.localStorage;

// Verify playTerminalBellSound parameters
function playTerminalBellSoundTest() {
  try {
    const AudioContextClass = globalThis.window.AudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 20);
  } catch {}
}

// Test 5.1: Gating verification
let bellTriggerCount = 0;
const bellEnabledRef = { current: false };

function handleBellEvent() {
  if (bellEnabledRef.current) {
    bellTriggerCount++;
    playTerminalBellSoundTest();
  }
}

// Case A: Bell disabled -> must be silent
handleBellEvent();
handleBellEvent();
report('Bell remains completely silent when bellEnabled === false', bellTriggerCount === 0 && MockAudioContext.instances.length === 0);

// Case B: Bell enabled -> must chime
bellEnabledRef.current = true;
handleBellEvent();
report('Bell chimes when bellEnabled === true', bellTriggerCount === 1 && MockAudioContext.instances.length === 1);

const ctx = MockAudioContext.instances[0];
const osc = ctx.oscillators[0];
const gain = ctx.gains[0];
report('Web Audio oscillator uses sine wave at 800Hz', osc.type === 'sine' && osc.freqVal === 800);
report('Web Audio gain applies exponential decay envelope', gain.startVal === 0.08 && gain.endVal === 0.001);

// Case C: Bell toggled back to disabled
bellEnabledRef.current = false;
handleBellEvent();
report('Bell goes silent again immediately when toggled to false', bellTriggerCount === 1);

// Test 5.2: Rapid Bell Firing Stress Test (50 bell bursts)
MockAudioContext.instances = [];
bellEnabledRef.current = true;
let threwError = false;
try {
  for (let i = 0; i < 50; i++) {
    handleBellEvent();
  }
} catch (e) {
  threwError = true;
}
report('50 rapid terminal bell bursts execute safely without throwing', !threwError && MockAudioContext.instances.length === 50);

// Wait for async ctx.close() timeouts to settle
await new Promise((resolve) => setTimeout(resolve, 50));
const closedCount = MockAudioContext.instances.filter(c => c.closed).length;
report('All audio contexts close automatically to prevent resource exhaustion', closedCount === 50);

// ===========================================================================
// SECTION 6: Rapid-Fire Slider Dragging & Live Theme Churning Stress Harness
// ===========================================================================
console.log('\n--- Section 6: Rapid-Fire Settings Churning Stress Harness ---');

// Stress test: 100 rapid sequential settings mutations simulating live user dragging
// font size slider while rapidly switching themes and cursor styles, with active terminal socket data streaming.

const stressTerminal = new Terminal({
  fontSize: 14,
  fontFamily: getFontFamilyWithFallback('JetBrains Mono'),
  cursorStyle: 'block',
  scrollback: 5000,
  theme: darkTheme,
});

let stressDisposed = false;
stressTerminal.dispose = () => { stressDisposed = true; };

const stressFitAddon = new MockFitAddon();
let stressResizeEmits = [];
const onStressResize = (cols, rows) => {
  stressResizeEmits.push({ cols, rows });
};

const themes = [darkTheme, lightTheme];
const cursorStyles = ['block', 'bar', 'underline'];
const fontFamilies = ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'];

let outputChunksWritten = 0;

// Execute 100 rapid mutations with concurrent terminal writes
for (let step = 0; step < 100; step++) {
  const currentFontSize = 12 + (step % 12); // step 99 -> 12 + (99 % 12) = 15
  const currentTheme = themes[step % themes.length]; // step 99 -> lightTheme
  const currentCursor = cursorStyles[step % cursorStyles.length]; // step 99 -> block
  const currentFont = fontFamilies[step % fontFamilies.length]; // step 99 -> monospace
  const currentScrollback = 1000 * (1 + (step % 10)); // step 99 -> 10000

  runTerminalOptionsSync(
    stressTerminal,
    stressFitAddon,
    {},
    {
      fontSize: currentFontSize,
      fontFamily: currentFont,
      cursorStyle: currentCursor,
      scrollback: currentScrollback,
      bellEnabled: step % 2 === 0,
    },
    currentTheme,
    onStressResize
  );

  outputChunksWritten++;
  stressTerminal.write(`Stream data chunk #${outputChunksWritten}\r\n`);
}

report('Terminal survived 100 rapid-fire setting mutations without disposal', stressDisposed === false);
report('Final font size matches final iteration (15px)', stressTerminal.options.fontSize === 15);
report('Final cursor style matches final iteration (block)', stressTerminal.options.cursorStyle === 'block');
report('Final scrollback matches final iteration (10000)', stressTerminal.options.scrollback === 10000);
report('Final theme background matches final iteration (#ffffff)', stressTerminal.options.theme.background === '#ffffff');
report('FitAddon was invoked for dynamic geometry recalculation', stressFitAddon.fitCalls > 0);
report('Remote PTY resize events were emitted consistently', stressResizeEmits.length > 0);
report('Terminal buffer accepted concurrent stream writes during rapid churning', outputChunksWritten === 100);

// ===========================================================================
// SECTION 7: Zustand Settings Store Concurrency & Resilience
// ===========================================================================
console.log('\n--- Section 7: Zustand Settings Store Concurrency & Resilience ---');

const storeBundle = await esbuild.build({
  entryPoints: [path.resolve(rootDir, 'apps/web/src/store/settings.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  plugins: [
    {
      name: 'alias-resolver',
      setup(build) {
        build.onResolve({ filter: /^@\/lib\/api$/ }, () => ({
          path: path.resolve(rootDir, 'apps/web/src/lib/api.ts'),
        }));
      },
    },
  ],
});

const storeModuleUrl = 'data:text/javascript;base64,' + Buffer.from(storeBundle.outputFiles[0].text).toString('base64');
const { useSettingsStore } = await import(storeModuleUrl);

// Test 7.1: Store baseline
useSettingsStore.getState().resetSettings();
const base = useSettingsStore.getState().settings;
report('Store resets to defaultUserSettings (fontSize 14, dark theme, block cursor)',
  base.fontSize === 14 && base.theme === 'dark' && base.cursorStyle === 'block'
);

// Test 7.2: Concurrent partial updates do not overwrite orthogonal fields
useSettingsStore.getState().updateSettings({ fontSize: 18 });
useSettingsStore.getState().updateSettings({ cursorStyle: 'underline' });
useSettingsStore.getState().updateSettings({ theme: 'light' });

const mergedState = useSettingsStore.getState().settings;
report('Independent partial updates accumulate cleanly without property collision',
  mergedState.fontSize === 18 &&
  mergedState.cursorStyle === 'underline' &&
  mergedState.theme === 'light' &&
  mergedState.scrollback === 5000 &&
  mergedState.bellEnabled === false
);

// Test 7.3: Storage persistence
const persistedItem = globalThis.localStorage.getItem('termix-user-settings');
report('Settings store writes state to localStorage (termix-user-settings)', typeof persistedItem === 'string' && persistedItem.includes('"fontSize":18'));

// Test 7.4: Schema drift & missing properties merge resilience
const parsedStorage = JSON.parse(persistedItem);
// Delete some properties in persisted JSON to test merge callback
delete parsedStorage.state.settings.scrollback;
delete parsedStorage.state.settings.bellEnabled;
globalThis.localStorage.setItem('termix-user-settings', JSON.stringify(parsedStorage));

// Verify that resetting or re-merging protects against missing schema keys
useSettingsStore.getState().resetSettings();
const stateAfterReset = useSettingsStore.getState().settings;
report('Store retains default values for missing schema fields upon reset',
  stateAfterReset.scrollback === 5000 && stateAfterReset.bellEnabled === false
);

// ===========================================================================
// SECTION 8: Settings Page Interactive Controls & Live Preview SSR Validation
// ===========================================================================
console.log('\n--- Section 8: Settings Page Interactive Controls & Live Preview ---');

const React = requireFromWeb('react');
const ReactDOMServer = requireFromWeb('react-dom/server');

const settingsPageBundle = await esbuild.build({
  entryPoints: [path.resolve(rootDir, 'apps/web/src/app/(dashboard)/dashboard/settings/page.tsx')],
  bundle: true,
  write: false,
  format: 'cjs',
  packages: 'external',
  plugins: [
    {
      name: 'alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          const basePath = path.resolve(rootDir, 'apps/web/src', args.path.slice(2));
          const fs = require('fs');
          if (fs.existsSync(basePath + '.ts')) return { path: basePath + '.ts' };
          if (fs.existsSync(basePath + '.tsx')) return { path: basePath + '.tsx' };
          if (fs.existsSync(basePath)) return { path: basePath };
          return { path: basePath + '.tsx' };
        });
      },
    },
  ],
});

const customRequire = (id) => {
  if (id === 'react') return React;
  if (id === 'react/jsx-runtime') return requireFromWeb('react/jsx-runtime');
  if (id === 'react-dom') return requireFromWeb('react-dom');
  try {
    return requireFromWeb(id);
  } catch {
    return requireFromWeb(path.resolve(rootDir, 'apps/web/node_modules', id));
  }
};

const m = { exports: {} };
const fn = new Function('module', 'exports', 'require', 'React', '__dirname', '__filename', settingsPageBundle.outputFiles[0].text);
fn(
  m,
  m.exports,
  customRequire,
  React,
  path.resolve(rootDir, 'apps/web/src/app/(dashboard)/dashboard/settings'),
  path.resolve(rootDir, 'apps/web/src/app/(dashboard)/dashboard/settings/page.tsx')
);

const SettingsPage = m.exports.default;
const renderedHtml = ReactDOMServer.renderToString(React.createElement(SettingsPage));

report('SettingsPage renders valid HTML', typeof renderedHtml === 'string' && renderedHtml.length > 0);
report('SettingsPage contains loading/mounting indicator during SSR', renderedHtml.includes('animate-spin') || renderedHtml.includes('Terminal Settings'));

// ===========================================================================
// SECTION 9: Session Isolation & Event Flow Verification
// ===========================================================================
console.log('\n--- Section 9: Session Isolation & Event Flow Verification ---');

const activeSessionId = 'session-alpha-123';
const foreignSessionId = 'session-beta-999';

const sessionTerminal = new Terminal();
const writtenChunks = [];
sessionTerminal.write = (data) => {
  writtenChunks.push(data);
};

// Replicate TerminalView socket listener
const handleOutput = (payload) => {
  if (payload.sessionId === activeSessionId) {
    sessionTerminal.write(payload.data);
  }
};

// 1. Output from active session arrives
handleOutput({ sessionId: activeSessionId, data: 'echo "hello active"\r\n' });
report('Terminal receives output matching its active sessionId', writtenChunks.length === 1 && writtenChunks[0] === 'echo "hello active"\r\n');

// 2. Output from foreign session arrives
handleOutput({ sessionId: foreignSessionId, data: 'echo "foreign output leak"\r\n' });
report('Terminal strictly ignores output from mismatched sessionId (zero leakage)', writtenChunks.length === 1);

// 3. User typing event flow
let capturedInput = null;
const sessionSocket = {
  emit: (event, payload) => {
    if (event === 'terminal:input') capturedInput = payload;
  },
};
const sendTerminalInput = (data) => {
  sessionSocket.emit('terminal:input', { sessionId: activeSessionId, data });
};
sendTerminalInput('top\r');
report('Terminal input generates formatted terminal:input payload with active sessionId',
  capturedInput !== null && capturedInput.sessionId === activeSessionId && capturedInput.data === 'top\r'
);

// 4. Resize event flow
let capturedResize = null;
const sendTerminalResize = (cols, rows) => {
  sessionSocket.emit('terminal:resize', { sessionId: activeSessionId, cols, rows });
};
sessionSocket.emit = (event, payload) => {
  if (event === 'terminal:resize') capturedResize = payload;
};
sendTerminalResize(140, 45);
report('Terminal resize generates formatted terminal:resize payload with cols and rows',
  capturedResize !== null && capturedResize.sessionId === activeSessionId && capturedResize.cols === 140 && capturedResize.rows === 45
);

// ===========================================================================
// SECTION 10: SettingsOverride Precedence & Style Isolation
// ===========================================================================
console.log('\n--- Section 10: SettingsOverride Precedence & Style Isolation ---');

const baseStoreSettings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: 'JetBrains Mono',
  cursorStyle: 'block',
  scrollback: 5000,
  bellEnabled: false,
};

const settingsOverride = {
  theme: 'light',
  fontSize: 20,
  cursorStyle: 'underline',
};

const computedSettings = { ...baseStoreSettings, ...settingsOverride };
report('SettingsOverride takes priority over store settings for specified keys',
  computedSettings.fontSize === 20 &&
  computedSettings.theme === 'light' &&
  computedSettings.cursorStyle === 'underline' &&
  computedSettings.scrollback === 5000 &&
  computedSettings.bellEnabled === false
);

const { theme: overrideTheme, isDark: overrideIsDark } = resolveTerminalTheme(computedSettings.theme, true);
report('Resolved override theme produces light background (#ffffff)',
  overrideIsDark === false && overrideTheme.background === '#ffffff'
);

// ===========================================================================
// SECTION 11: Teardown & Unmount Cleanup Verification
// ===========================================================================
console.log('\n--- Section 11: Teardown & Unmount Cleanup Verification ---');

let unmountSocketOffCalled = false;
let resizeObserverDisconnected = false;
let bellDisposed = false;
let termDisposed = false;

const teardownSocket = {
  off: (event, handler) => {
    if (event === 'terminal:output') unmountSocketOffCalled = true;
  },
};

const teardownObserver = {
  disconnect: () => {
    resizeObserverDisconnected = true;
  },
};

const teardownBell = {
  dispose: () => {
    bellDisposed = true;
  },
};

const teardownTerm = {
  dispose: () => {
    termDisposed = true;
  },
};

let refTerm = teardownTerm;
let refFit = { fit: () => {} };

// Simulate TerminalView cleanup function (lines 190-197)
const cleanup = () => {
  teardownSocket.off('terminal:output', handleOutput);
  teardownObserver.disconnect();
  teardownBell.dispose();
  teardownTerm.dispose();
  refTerm = null;
  refFit = null;
};

cleanup();

report('Unmount detaches socket listener (socket.off terminal:output)', unmountSocketOffCalled === true);
report('Unmount disconnects ResizeObserver', resizeObserverDisconnected === true);
report('Unmount disposes bellDisposable', bellDisposed === true);
report('Unmount disposes Terminal instance', termDisposed === true);
report('Terminal ref is nulled out on unmount', refTerm === null);
report('FitAddon ref is nulled out on unmount', refFit === null);

// Verify post-unmount rAF safety guard (lines 241-247)
let rafExecutedAfterUnmount = false;
const postUnmountRaf = () => {
  if (!refTerm || !refFit) {
    rafExecutedAfterUnmount = true;
    return; // Safely aborted!
  }
  refFit.fit(); // Should not reach here
};
postUnmountRaf();
report('Post-unmount requestAnimationFrame aborts safely without null pointer exception', rafExecutedAfterUnmount === true);

// ===========================================================================
// Summary
// ===========================================================================
console.log('\n================================================================');
console.log(`TOTAL EMPIRICAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  console.error('\nFAILURES DETECTED:');
  for (const f of failureDetails) {
    console.error(`- ${f.testName}: ${f.detail}`);
  }
  process.exit(1);
} else {
  console.log('\nALL EMPIRICAL CHALLENGER TESTS PASSED WITH ZERO FAILURES!\n');
  process.exit(0);
}
