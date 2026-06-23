// Copies the only vendor assets the app actually loads into ui/vendor:
//   - Monaco's prebuilt min/ bundle  -> ui/vendor/monaco/vs
//   - markdown-it's UMD build         -> ui/vendor/markdown-it.min.js
// Run automatically before `tauri dev` / `tauri build` (see tauri.conf.json).
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'ui/vendor');

const monacoVs = resolve(root, 'node_modules/monaco-editor/min/vs');
const mdIt = resolve(root, 'node_modules/markdown-it/dist/markdown-it.min.js');

if (!existsSync(monacoVs) || !existsSync(mdIt)) {
  console.error('\n[sync-assets] Missing dependencies. Run `npm install` first.\n');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'monaco'), { recursive: true });

cpSync(monacoVs, resolve(out, 'monaco/vs'), { recursive: true });
cpSync(mdIt, resolve(out, 'markdown-it.min.js'));

console.log('[sync-assets] vendor assets synced to ui/vendor');
