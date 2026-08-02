// Unit tests for ui/close-guard.js: what happens when the window is closed
// with a modified file open. A wrong answer here silently destroys work, so
// every branch is pinned down — especially the ones that must NOT close.
import { describe, it, expect, vi } from 'vitest';

import '../ui/close-guard.js';
const { confirmClose } = window.downerCloseGuard;

// Builds a guard call with spies, so tests can assert on what was invoked.
function scenario({ dirty, choice, saved = true }) {
  const deps = {
    isDirty: vi.fn(() => dirty),
    prompt: vi.fn(async () => choice),
    save: vi.fn(async () => saved)
  };
  return { deps, run: () => confirmClose(deps) };
}

describe('confirmClose', () => {
  it('closes a clean buffer without asking', async () => {
    const { deps, run } = scenario({ dirty: false });
    expect(await run()).toBe(true);
    expect(deps.prompt).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('asks before closing a dirty buffer', async () => {
    const { deps, run } = scenario({ dirty: true, choice: 'discard' });
    await run();
    expect(deps.prompt).toHaveBeenCalledTimes(1);
  });

  it('closes without saving when the user discards', async () => {
    const { deps, run } = scenario({ dirty: true, choice: 'discard' });
    expect(await run()).toBe(true);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('keeps the window open when the user cancels', async () => {
    const { deps, run } = scenario({ dirty: true, choice: 'cancel' });
    expect(await run()).toBe(false);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('saves, then closes, when the user picks Save', async () => {
    const { deps, run } = scenario({ dirty: true, choice: 'save' });
    expect(await run()).toBe(true);
    expect(deps.save).toHaveBeenCalledTimes(1);
  });

  it('stays open when the save is cancelled or fails', async () => {
    // e.g. an untitled buffer whose Save As dialog was dismissed.
    const { run } = scenario({ dirty: true, choice: 'save', saved: false });
    expect(await run()).toBe(false);
  });

  it('treats a non-boolean save result as a failed save', async () => {
    const deps = {
      isDirty: () => true,
      prompt: async () => 'save',
      save: async () => ({ ok: false })   // truthy, but not a real save
    };
    expect(await confirmClose(deps)).toBe(false);
  });

  it('treats an unrecognized answer (Esc, dialog dismissed) as cancel', async () => {
    for (const choice of ['', null, undefined, 'nonsense']) {
      const { run } = scenario({ dirty: true, choice });
      expect(await run(), `choice: ${JSON.stringify(choice)}`).toBe(false);
    }
  });

  it('waits for a slow prompt instead of closing early', async () => {
    let answered = false;
    const allowed = await confirmClose({
      isDirty: () => true,
      prompt: () => new Promise((resolve) => setTimeout(() => {
        answered = true;
        resolve('cancel');
      }, 10)),
      save: async () => true
    });
    expect(answered).toBe(true);
    expect(allowed).toBe(false);
  });

  it('accepts a synchronous prompt and save', async () => {
    expect(await confirmClose({
      isDirty: () => true,
      prompt: () => 'save',
      save: () => true
    })).toBe(true);
  });
});
