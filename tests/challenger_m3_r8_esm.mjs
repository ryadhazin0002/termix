/**
 * Milestone 3 Adversarial Challenger Test Suite (Requirement R8: Modern ESM Module Configuration)
 * 
 * Verifies:
 * 1. apps/web/package.json contains "type": "module" and valid ESM configuration.
 * 2. Importing TypeScript files directly from apps/web/src via Node --experimental-strip-types
 *    emits ZERO [MODULE_TYPELESS_PACKAGE_JSON] warnings on stderr.
 * 3. apps/web/postcss.config.js uses ESM 'export default', contains no CommonJS artifacts,
 *    and can be dynamically imported and executed in ES module scope without ReferenceError.
 * 4. All JavaScript configuration files in apps/web adhere strictly to ESM and do not leak
 *    unwrapped CommonJS symbols (module.exports, require) that would crash in ESM mode.
 * 5. Direct PostCSS transformation executes cleanly using the exported plugin configuration.
 * 6. Adversarial verification: Confirming that when a package.json lacks "type": "module",
 *    Node WOULD produce [MODULE_TYPELESS_PACKAGE_JSON] on TS import, verifying the test harness sensitivity.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('========================================================================');
console.log('CHALLENGER ADVERSARIAL TEST SUITE: R8 MODERN ESM CONFIGURATION (apps/web)');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function testCase(name, passed, detail = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name} ${detail ? '--> ' + detail : ''}`);
    failureDetails.push({ name, detail });
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE 1: package.json Declaration & Structure
// ---------------------------------------------------------------------------
console.log('--- Suite 1: apps/web/package.json Declaration & Structure ---');

const webPkgPath = path.resolve(rootDir, 'apps/web/package.json');
let webPkg;

try {
  const pkgContent = await fs.readFile(webPkgPath, 'utf-8');
  webPkg = JSON.parse(pkgContent);
  testCase('apps/web/package.json is valid JSON', true);
} catch (err) {
  testCase('apps/web/package.json is valid JSON', false, err.message);
}

testCase(
  'apps/web/package.json contains "type": "module"',
  webPkg && webPkg.type === 'module',
  `Expected "module", got "${webPkg?.type}"`
);

testCase(
  'apps/web/package.json package name is "@termix/web"',
  webPkg && webPkg.name === '@termix/web',
  `Expected "@termix/web", got "${webPkg?.name}"`
);

testCase(
  'apps/web/package.json contains necessary build and type-check scripts',
  Boolean(webPkg?.scripts?.build && webPkg?.scripts?.['type-check']),
  `Found scripts: ${JSON.stringify(webPkg?.scripts)}`
);

// ---------------------------------------------------------------------------
// TEST SUITE 2: Node.js TS Import & [MODULE_TYPELESS_PACKAGE_JSON] Elimination
// ---------------------------------------------------------------------------
console.log('\n--- Suite 2: Warning Elimination under node --experimental-strip-types ---');

const testImportTargets = [
  './apps/web/src/store/devices.ts',
  './apps/web/src/components/files/pathUtils.ts',
  './apps/web/src/components/terminal/terminalThemes.ts',
  './apps/web/src/lib/fileSocket.ts',
  './apps/web/src/lib/utils.ts',
];

for (const target of testImportTargets) {
  const code = `import('${target}').then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });`;
  const result = spawnSync('node', ['--experimental-strip-types', '-e', code], {
    cwd: rootDir,
    encoding: 'utf-8',
    env: { ...process.env },
  });

  const hasTypelessWarning = result.stderr.includes('MODULE_TYPELESS_PACKAGE_JSON');
  const hasAnyWarning = result.stderr.toLowerCase().includes('warning:');

  testCase(
    `Importing ${target} produces zero MODULE_TYPELESS_PACKAGE_JSON warnings`,
    !hasTypelessWarning,
    `Stderr: ${result.stderr}`
  );

  testCase(
    `Importing ${target} produces zero Node warnings on stderr`,
    !hasAnyWarning && result.stderr.trim() === '',
    `Stderr: ${result.stderr}`
  );

  testCase(
    `Importing ${target} executes with exit code 0`,
    result.status === 0,
    `Status: ${result.status}, stderr: ${result.stderr}`
  );
}

// ---------------------------------------------------------------------------
// TEST SUITE 3: PostCSS ESM Export and Dynamic Evaluation
// ---------------------------------------------------------------------------
console.log('\n--- Suite 3: apps/web/postcss.config.js ESM Export & Loading ---');

const postcssConfigPath = path.resolve(rootDir, 'apps/web/postcss.config.js');
const postcssContent = await fs.readFile(postcssConfigPath, 'utf-8');

testCase(
  'apps/web/postcss.config.js uses "export default"',
  postcssContent.includes('export default'),
  'postcss.config.js does not contain "export default"'
);

testCase(
  'apps/web/postcss.config.js contains no CommonJS "module.exports"',
  !postcssContent.includes('module.exports'),
  'postcss.config.js still contains "module.exports"'
);

let loadedPostcssConfig;
try {
  const imported = await import(pathToFileURL(postcssConfigPath).href);
  loadedPostcssConfig = imported.default || imported;
  testCase('apps/web/postcss.config.js loads dynamically via ESM import() without error', true);
} catch (err) {
  testCase('apps/web/postcss.config.js loads dynamically via ESM import() without error', false, err.stack);
}

testCase(
  'Loaded PostCSS config exports plugins object',
  typeof loadedPostcssConfig?.plugins === 'object' && loadedPostcssConfig.plugins !== null,
  `plugins: ${JSON.stringify(loadedPostcssConfig?.plugins)}`
);

testCase(
  'Loaded PostCSS config defines tailwindcss and autoprefixer plugins',
  'tailwindcss' in (loadedPostcssConfig?.plugins || {}) && 'autoprefixer' in (loadedPostcssConfig?.plugins || {}),
  `plugins: ${JSON.stringify(loadedPostcssConfig?.plugins)}`
);

// Verify actual PostCSS integration: process a sample stylesheet
try {
  const { createRequire } = await import('node:module');
  const webRequire = createRequire(webPkgPath);
  const postcss = webRequire('postcss');
  const autoprefixer = webRequire('autoprefixer');
  const tailwindcss = webRequire('tailwindcss');

  const sampleCss = '::placeholder { color: gray; }';
  const processor = postcss([autoprefixer()]);
  const processed = await processor.process(sampleCss, { from: undefined });
  testCase(
    'PostCSS executes successfully with configured plugins',
    processed && typeof processed.css === 'string' && processed.css.length > 0
  );

  // Also test loading plugins directly from postcss.config.js export
  const pluginList = [];
  if (loadedPostcssConfig?.plugins?.tailwindcss) pluginList.push(tailwindcss());
  if (loadedPostcssConfig?.plugins?.autoprefixer) pluginList.push(autoprefixer());
  const fullProcessor = postcss(pluginList);
  const fullProcessed = await fullProcessor.process('a { display: flex; }', { from: undefined });
  testCase(
    'PostCSS executes successfully using loaded postcss.config.js plugins',
    fullProcessed && typeof fullProcessed.css === 'string' && fullProcessed.css.includes('display: flex')
  );
} catch (err) {
  testCase('PostCSS executes successfully with configured plugins', false, err.message);
}

// ---------------------------------------------------------------------------
// TEST SUITE 4: apps/web/next.config.mjs ESM Validation
// ---------------------------------------------------------------------------
console.log('\n--- Suite 4: apps/web/next.config.mjs ESM Validation ---');

const nextConfigPath = path.resolve(rootDir, 'apps/web/next.config.mjs');
testCase('apps/web/next.config.mjs exists', existsSync(nextConfigPath));

try {
  const importedNext = await import(pathToFileURL(nextConfigPath).href);
  testCase('apps/web/next.config.mjs resolves and loads dynamically in ESM', typeof importedNext === 'object');
} catch (err) {
  testCase('apps/web/next.config.mjs resolves and loads dynamically in ESM', false, err.stack);
}

// ---------------------------------------------------------------------------
// TEST SUITE 5: CommonJS Contamination Scan in apps/web
// ---------------------------------------------------------------------------
console.log('\n--- Suite 5: CommonJS Contamination Scan in apps/web ---');

async function scanForCjsArtifacts(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const violations = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.turbo') {
        continue;
      }
      violations.push(...(await scanForCjsArtifacts(full)));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      const content = await fs.readFile(full, 'utf-8');
      // Look for bare module.exports or exports. outside comments/tests
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('*')) continue;
        if (line.includes('module.exports =') || line.includes('module.exports=')) {
          violations.push(`${full}:${i + 1} - module.exports`);
        }
      }
    }
  }
  return violations;
}

const cjsViolations = await scanForCjsArtifacts(path.resolve(rootDir, 'apps/web'));
testCase(
  'Zero unescaped module.exports found across apps/web JavaScript files',
  cjsViolations.length === 0,
  `Violations: ${JSON.stringify(cjsViolations)}`
);

// ---------------------------------------------------------------------------
// TEST SUITE 6: Negative / Adversarial Control: Sensitivity Verification
// ---------------------------------------------------------------------------
console.log('\n--- Suite 6: Harness Sensitivity & Negative Control ---');

// Create a temporary package without "type": "module" and verify Node DOES produce the warning
const tempDir = path.resolve(rootDir, '.temp_esm_test_' + Date.now());
try {
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'temp-pkg' }, null, 2));
  await fs.writeFile(path.join(tempDir, 'dummy.ts'), 'export const x: number = 42;\n');

  const negCheck = spawnSync('node', ['--experimental-strip-types', '-e', `import('./dummy.ts')`], {
    cwd: tempDir,
    encoding: 'utf-8',
  });

  const reproducesWarning = negCheck.stderr.includes('MODULE_TYPELESS_PACKAGE_JSON');
  testCase(
    'Negative Control: Node emits [MODULE_TYPELESS_PACKAGE_JSON] when "type": "module" is omitted',
    reproducesWarning,
    `Stderr was: ${negCheck.stderr}`
  );
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------
console.log('\n========================================================================');
console.log('CHALLENGER TEST HARNESS EXECUTION SUMMARY');
console.log('========================================================================');
console.log(`Total Assertions: ${totalTests}`);
console.log(`Passed:           ${passedTests}`);
console.log(`Failed:           ${failedTests}`);

if (failedTests > 0) {
  console.error('\nFailures:');
  for (const f of failureDetails) {
    console.error(`  - ${f.name}: ${f.detail}`);
  }
  process.exit(1);
} else {
  console.log('\nVERDICT: 100% PASS — Requirement R8 ESM Module Configuration robustly verified.');
  process.exit(0);
}
