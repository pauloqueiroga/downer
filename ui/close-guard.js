'use strict';

/* ------------------------------------------------------------------ *
 * downer close guard: decides whether the window may close when the   *
 * buffer has unsaved changes. No Tauri, Monaco, or DOM dependencies — *
 * the renderer injects the dirty flag, the prompt, and the save       *
 * routine, so this also runs under Node (jsdom) in the test suite.    *
 * Loaded as a classic <script>; exposes window.downerCloseGuard.      *
 * ------------------------------------------------------------------ */

(function (global) {
  // deps.isDirty() -> boolean            buffer differs from what's on disk
  // deps.prompt()  -> 'save' | 'discard' | 'cancel'   (may be async)
  // deps.save()    -> true only when the file actually reached disk
  //                   (false if the Save As dialog was dismissed or the
  //                   write failed — in that case we must NOT close)
  // Resolves true when the window may close.
  async function confirmClose({ isDirty, prompt, save }) {
    if (!isDirty()) return true;
    const choice = await prompt();
    if (choice === 'save') return (await save()) === true;
    // Anything other than an explicit discard keeps the window open.
    return choice === 'discard';
  }

  global.downerCloseGuard = { confirmClose };
})(typeof window !== 'undefined' ? window : globalThis);
