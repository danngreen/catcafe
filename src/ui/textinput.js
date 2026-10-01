// A real text box, laid over the game, for the one thing that has to be typed:
// a valley's invite code.
//
// The game is drawn on a canvas and reads keys for walking about, which is no
// way to type. A proper <input> brings up the phone's own keyboard, lets you
// paste, and keeps autocorrect out of it. On a phone the box has to be tapped
// before the keyboard appears (the game's own loop isn't a tap, and phones only
// open a keyboard for one), so it's big and obvious.
//
// Resolves to the text, or null for Cancel.

export function askText({ title, hint = '', placeholder = '', button = 'OK', check = null }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    Object.assign(wrap.style, {
      position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', zIndex: '50',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(14,16,19,0.72)', fontFamily: 'ui-monospace, Menlo, monospace',
    });
    const card = document.createElement('form');
    Object.assign(card.style, {
      width: 'min(380px, calc(100vw - 32px))', boxSizing: 'border-box', padding: '20px',
      background: '#2a2438', border: '2px solid #4a3f5e', borderRadius: '6px', color: '#f3ead8',
    });
    const h = document.createElement('div');
    h.textContent = title;
    Object.assign(h.style, { fontSize: '20px', fontWeight: 'bold', color: '#f2c75c', marginBottom: '6px' });
    const p = document.createElement('div');
    p.textContent = hint;
    Object.assign(p.style, { fontSize: '15px', color: '#c8bfd6', marginBottom: '14px', minHeight: '1em' });
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocorrect', 'off');
    input.spellcheck = false;
    Object.assign(input.style, {
      width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: '20px', fontFamily: 'inherit',
      border: '2px solid #4a3f5e', borderRadius: '4px', background: '#17141f', color: '#f3ead8',
    });
    const row = document.createElement('div');
    // Margins, not `gap`: Safari 12 on the old iPads has no flex gap.
    Object.assign(row.style, { display: 'flex', marginTop: '14px' });
    const mk = (label, primary) => {
      const b = document.createElement('button');
      b.type = primary ? 'submit' : 'button';
      b.textContent = label;
      Object.assign(b.style, {
        flex: '1', padding: '12px', fontSize: '17px', fontFamily: 'inherit', fontWeight: 'bold',
        border: '0', borderRadius: '4px', cursor: 'pointer',
        background: primary ? '#f2c75c' : '#4a3f5e', color: primary ? '#2a2438' : '#f3ead8',
      });
      return b;
    };
    const cancel = mk('Cancel', false);
    cancel.style.marginRight = '10px';
    const ok = mk(button, true);
    row.append(cancel, ok);
    card.append(h, p, input, row);
    wrap.append(card);
    document.body.append(wrap);
    setTimeout(() => input.focus(), 0);

    const finish = (value) => {
      wrap.remove();
      resolve(value);
    };
    card.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = input.value.trim();
      const problem = check ? check(value) : null;
      if (problem) { p.textContent = problem; p.style.color = '#ff9a8a'; input.focus(); return; }
      finish(value);
    });
    cancel.addEventListener('click', () => finish(null));
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(null); });
  });
}

/**
 * Put text on the clipboard. True if it got there: older browsers, and pages
 * not served over HTTPS, don't allow it.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** The phone's own share sheet (Messages, email, AirDrop), where there is one. */
export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export async function shareLink(title, text, url) {
  try { await navigator.share({ title, text, url }); return true; } catch { return false; }
}
