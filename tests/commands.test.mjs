// The frontend reaches Rust by command name in a string, so a rename on
// either side fails silently at runtime -- the invoke just rejects and the
// feature quietly stops working. These check both lists still agree.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const bridge = read('ui/tauri-api.js');
const main = read('src-tauri/src/main.rs');

// Command names the bridge asks for: invoke('some_command', ...).
const invoked = [...bridge.matchAll(/invoke\(\s*'([a-z_]+)'/g)].map((m) => m[1]);

// Command names Rust registers: tauri::generate_handler![a, b, c].
const registered = (main.match(/generate_handler!\[([^\]]*)\]/s)?.[1] ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

describe('tauri command wiring', () => {
  it('finds commands on both sides', () => {
    expect(invoked.length).toBeGreaterThan(0);
    expect(registered.length).toBeGreaterThan(0);
  });

  it('every command the frontend invokes is registered in Rust', () => {
    const missing = invoked.filter((name) => !registered.includes(name));
    expect(missing).toEqual([]);
  });

  it('registers is_macos, which decides whether Save As PDF is offered', () => {
    expect(registered).toContain('is_macos');
    expect(invoked).toContain('is_macos');
  });
});
