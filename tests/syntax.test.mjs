// The UI scripts are plain <script> files with no bundler in front of
// them, so nothing catches a syntax error before the app window opens
// blank. `node --check` parses each file without executing it.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'ui/preview-core.js',
  'ui/close-guard.js',
  'ui/renderer.js',
  'ui/tauri-api.js',
  'scripts/sync-assets.mjs',
  'scripts/bump-version.mjs'
];

describe('script syntax', () => {
  it.each(FILES)('%s parses cleanly', (file) => {
    expect(() =>
      execFileSync(process.execPath, ['--check', resolve(root, file)], {
        stdio: 'pipe'
      })
    ).not.toThrow();
  });
});
