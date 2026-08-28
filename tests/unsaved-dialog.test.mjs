// Unit tests for ui/unsaved-dialog.js, plus regression guards on the markup
// and stylesheet it depends on.
//
// The bug these exist for: the prompt used to be a <form method="dialog">
// inside a <dialog>, and both halves of that quietly assume the WebView
// supports <dialog>. WKWebView before Safari 15.4 does not, so the element
// rendered inline and permanently, and every button submitted the form for
// real — reloading the app into the same state, forever. None of it was
// reachable from a test, because it was inline in renderer.js.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import '../ui/unsaved-dialog.js';
const { ask, isOpen } = window.downerUnsaved;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'ui/index.html'), 'utf8');
const css = readFileSync(resolve(root, 'ui/styles.css'), 'utf8');

// The dialog markup, lifted out of index.html so the tests run against what
// actually ships rather than a copy that can drift away from it.
const DIALOG_HTML = html.slice(
  html.indexOf('<dialog id="unsaved"'),
  html.indexOf('</dialog>') + '</dialog>'.length
);

let dialog;
let calls;

// jsdom does not implement <dialog>, so the supported path is stubbed to the
// bit of the spec this module uses: showModal() sets `open`, close() clears
// it. The unsupported path needs no stub — that is the whole problem.
function mount({ native }) {
  document.body.innerHTML = DIALOG_HTML;
  dialog = document.getElementById('unsaved');
  calls = { showModal: 0, close: 0 };
  if (native) {
    dialog.showModal = function () { calls.showModal++; this.setAttribute('open', ''); };
    dialog.close = function () { calls.close++; this.removeAttribute('open'); };
  } else {
    delete dialog.showModal;
    delete dialog.close;
  }
  return dialog;
}

function click(choice) {
  dialog.querySelector(`button[data-choice="${choice}"]`).click();
}

function pressEscape() {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

afterEach(() => {
  document.documentElement.className = '';
  document.body.innerHTML = '';
});

// Both paths must behave identically — that is the whole point.
describe.each([
  ['with native <dialog>', true],
  ['without native <dialog>', false]
])('ask %s', (_label, native) => {
  beforeEach(() => mount({ native }));

  it.each(['save', 'discard', 'cancel'])('resolves %s when that button is clicked', async (choice) => {
    const answer = ask(dialog, 'x has unsaved changes');
    click(choice);
    expect(await answer).toBe(choice);
  });

  it('treats Esc as cancel', async () => {
    const answer = ask(dialog, 'x has unsaved changes');
    pressEscape();
    expect(await answer).toBe('cancel');
  });

  it('is hidden before it is asked for', () => {
    expect(isOpen(dialog)).toBe(false);
  });

  it('opens while asking and closes once answered', async () => {
    const answer = ask(dialog, 'x has unsaved changes');
    expect(isOpen(dialog)).toBe(true);
    click('cancel');
    await answer;
    expect(isOpen(dialog)).toBe(false);
  });

  it('shows the message it was given', () => {
    ask(dialog, 'notes.md has unsaved changes. Save before closing?');
    expect(dialog.textContent).toContain('notes.md has unsaved changes');
  });

  it('does not leak listeners across prompts', async () => {
    const first = ask(dialog, 'one');
    click('cancel');
    await first;

    // A stale click handler from the first prompt would resolve this early
    // with the wrong answer.
    const second = ask(dialog, 'two');
    click('save');
    expect(await second).toBe('save');
  });

  it('reopens cleanly after being answered', async () => {
    const first = ask(dialog, 'one');
    click('save');
    await first;
    ask(dialog, 'two');
    expect(isOpen(dialog)).toBe(true);
  });
});

describe('fallback behaviour', () => {
  it('flags the document so the stylesheet can stand in for the top layer', () => {
    mount({ native: false });
    ask(dialog, 'x');
    expect(document.documentElement.classList.contains('no-native-dialog')).toBe(true);
    expect(document.documentElement.classList.contains('modal-open')).toBe(true);
  });

  it('drops modal-open once answered, so the app takes clicks again', async () => {
    mount({ native: false });
    const answer = ask(dialog, 'x');
    click('cancel');
    await answer;
    expect(document.documentElement.classList.contains('modal-open')).toBe(false);
  });

  it('leaves the app alone when <dialog> works', () => {
    mount({ native: true });
    ask(dialog, 'x');
    expect(document.documentElement.classList.contains('no-native-dialog')).toBe(false);
  });

  it('prefers showModal where it exists, for the focus trap it brings', async () => {
    mount({ native: true });
    const answer = ask(dialog, 'x');
    expect(calls.showModal).toBe(1);
    click('cancel');
    await answer;
    expect(calls.close).toBe(1);
  });

  it('opens by attribute alone where showModal does not exist', () => {
    mount({ native: false });
    ask(dialog, 'x');
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});

describe('shipped markup', () => {
  it('has no form: submitting one navigates, which reloads the app', () => {
    expect(DIALOG_HTML).not.toContain('<form');
  });

  it('uses plain buttons, never submit buttons', () => {
    document.body.innerHTML = DIALOG_HTML;
    const buttons = [...document.querySelectorAll('#unsaved button')];
    expect(buttons.length).toBe(3);
    for (const b of buttons) expect(b.getAttribute('type')).toBe('button');
  });

  it('labels every button with the choice it stands for', () => {
    document.body.innerHTML = DIALOG_HTML;
    const choices = [...document.querySelectorAll('#unsaved button')]
      .map((b) => b.getAttribute('data-choice'));
    expect(choices).toEqual(['save', 'discard', 'cancel']);
  });

  it('carries a dialog role, which an unsupported <dialog> does not imply', () => {
    document.body.innerHTML = DIALOG_HTML;
    expect(document.getElementById('unsaved').getAttribute('role')).toBe('dialog');
  });
});

describe('shipped stylesheet', () => {
  it('hides the prompt itself rather than trusting <dialog> to do it', () => {
    expect(css.replace(/\s+/g, ' ')).toContain('#unsaved:not([open]) { display: none; }');
  });
});
