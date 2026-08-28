'use strict';

/* ------------------------------------------------------------------ *
 * downer unsaved-changes prompt: Save / Don't Save / Cancel.          *
 *                                                                     *
 * Opened and closed through the `open` attribute rather than          *
 * <dialog>'s own API. WKWebView only learned <dialog> in Safari 15.4: *
 * before that showModal() does not exist, the element renders as an   *
 * ordinary visible block, and a <form method="dialog"> inside it      *
 * submits for real — which navigates, reloading the whole app.        *
 * showModal() is still used where it exists, for the focus trap and   *
 * the inert background it brings, but nothing here depends on it.     *
 * Loaded as a classic <script>; exposes window.downerUnsaved.         *
 * ------------------------------------------------------------------ */

(function (global) {
  const CHOICES = ['save', 'discard', 'cancel'];

  function supportsDialog(dialog) {
    return typeof dialog.showModal === 'function';
  }

  function open(dialog) {
    const root = dialog.ownerDocument.documentElement;
    // Without a real <dialog> there is no top layer and no inert background,
    // so the stylesheet has to place the prompt and hold clicks off the app.
    root.classList.toggle('no-native-dialog', !supportsDialog(dialog));
    root.classList.add('modal-open');

    if (supportsDialog(dialog)) dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function close(dialog) {
    dialog.ownerDocument.documentElement.classList.remove('modal-open');
    if (!dialog.hasAttribute('open')) return;
    if (typeof dialog.close === 'function') dialog.close();
    dialog.removeAttribute('open');   // a no-op once close() has run
  }

  function isOpen(dialog) {
    return dialog.hasAttribute('open');
  }

  // Shows the prompt and resolves 'save' | 'discard' | 'cancel'.
  // Esc counts as cancel, and so does any choice we do not recognise —
  // only an explicit answer may drop the buffer.
  function ask(dialog, message) {
    const doc = dialog.ownerDocument;
    const text = dialog.querySelector('[data-role="message"]');
    if (text && message) text.textContent = message;

    const buttons = Array.from(dialog.querySelectorAll('button[data-choice]'));

    return new Promise((resolve) => {
      function finish(choice) {
        buttons.forEach((b) => b.removeEventListener('click', onClick));
        doc.removeEventListener('keydown', onKey, true);
        close(dialog);
        resolve(CHOICES.indexOf(choice) === -1 ? 'cancel' : choice);
      }

      function onClick(e) {
        finish(e.currentTarget.getAttribute('data-choice'));
      }

      function onKey(e) {
        if (e.key !== 'Escape') return;
        // Beat <dialog>'s own Esc handling, so there is one way out, not two.
        e.preventDefault();
        finish('cancel');
      }

      buttons.forEach((b) => b.addEventListener('click', onClick));
      doc.addEventListener('keydown', onKey, true);

      open(dialog);
      if (buttons[0]) buttons[0].focus();
    });
  }

  global.downerUnsaved = { ask, open, close, isOpen };
})(typeof window !== 'undefined' ? window : globalThis);
