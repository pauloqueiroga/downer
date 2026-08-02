// Guards the three version declarations against drifting apart. The
// release workflow refuses to ship when the tag disagrees with them;
// this catches the drift on every CI run instead of at release time.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const pkgVersion = JSON.parse(read('package.json')).version;
const confVersion = JSON.parse(read('src-tauri/tauri.conf.json')).version;
const cargoVersion = read('src-tauri/Cargo.toml').match(/^version = "(.*)"$/m)?.[1];

describe('version consistency', () => {
  it('package.json has a semver version', () => {
    expect(pkgVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('tauri.conf.json matches package.json', () => {
    expect(confVersion).toBe(pkgVersion);
  });

  it('Cargo.toml matches package.json', () => {
    expect(cargoVersion).toBe(pkgVersion);
  });
});
