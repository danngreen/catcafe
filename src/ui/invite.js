// Inviting people to a valley on the public server: the link (with a copy
// button beside it), the code in big letters, a QR code to scan across the
// room, and Share where the device has one.
//
// It's a page overlay rather than a canvas screen, because a phone only lets a
// page copy to the clipboard or open its share sheet from inside a real tap on
// a real button, and the game's own buttons aren't that.
//
// The valley's creator also gets the one thing only they can do, for when a
// griefer gets in: revoke everyone's access. Everybody else is sent out on the
// spot, the old link stops working, and there's a new one to give to the
// people they trust.

import qrcode from '../vendor/qrcode.js';
import { inviteLink, revokeOthers } from '../net/valleys.js';
import { copyText, canShare, shareLink } from './textinput.js';

/** Draw a link as a QR code on a canvas, with the white border scanners want. */
export function qrCanvas(text, px = 4) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const quiet = 4;
  const c = document.createElement('canvas');
  c.width = c.height = (n + quiet * 2) * px;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#17141f';
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) if (q.isDark(r, col)) ctx.fillRect((col + quiet) * px, (r + quiet) * px, px, px);
  }
  return c;
}

/**
 * Show the invite for `valley` ({ id, key, code, creator }). `first` is the
 * card shown once, right after somebody starts a new cafe. Resolves when it's
 * closed, with the valley as it is now (its code may have changed).
 */
export function showInvite({ valley, first = false }) {
  return new Promise((resolve) => {
    let v = { ...valley };
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.dataset.invite = '1';
    Object.assign(wrap.style, {
      position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', zIndex: '50', overflowY: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(14,16,19,0.72)', fontFamily: 'ui-monospace, Menlo, monospace',
    });
    const card = document.createElement('div');
    Object.assign(card.style, {
      position: 'relative',
      width: 'min(420px, calc(100vw - 32px))', boxSizing: 'border-box', padding: '18px', margin: '16px 0',
      background: '#2a2438', border: '2px solid #4a3f5e', borderRadius: '6px', color: '#f3ead8',
      textAlign: 'center',
    });
    const el = (tag, text, style) => {
      const e = document.createElement(tag);
      if (text != null) e.textContent = text;
      Object.assign(e.style, style || {});
      return e;
    };
    const title = el('div', first ? 'Your valley is ready!' : 'Invite friends',
      { fontSize: '21px', fontWeight: 'bold', color: '#f2c75c', margin: '0 28px 6px' });
    const lead = el('div', first
      ? 'This link is the way back into your cafe. Bookmark it, or add the game to your Home Screen. Anyone you share it with can come and play.'
      : 'Anyone with this link or code can come and play in your valley.',
    { fontSize: '15px', color: '#c8bfd6', marginBottom: '12px', lineHeight: '1.35' });
    const qrBox = el('div', null, { margin: '0 auto 10px', lineHeight: '0' });
    const code = el('div', '', { fontSize: '24px', fontWeight: 'bold', letterSpacing: '1px', color: '#f3ead8' });
    const linkRow = el('div', null, {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '4px 0 12px',
    });
    const link = el('span', '', { fontSize: '14px', color: '#c8bfd6', wordBreak: 'break-all' });
    const note = el('div', '', { fontSize: '14px', color: '#8fd18a', minHeight: '18px', marginBottom: '8px' });

    const button = (label, kind) => {
      const b = el('button', label, {
        display: 'block', width: '100%', padding: '11px', marginTop: '8px', fontSize: '16px',
        fontFamily: 'inherit', fontWeight: 'bold', border: '0', borderRadius: '4px', cursor: 'pointer',
        background: kind === 'danger' ? '#7a3344' : '#4a3f5e',
        color: '#f3ead8',
      });
      b.type = 'button';
      return b;
    };

    // A small square button holding an icon: copy, and close.
    const iconButton = (label, svg, style) => {
      const b = el('button', null, {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        width: '32px', height: '32px', padding: '0', border: '0', borderRadius: '4px', cursor: 'pointer',
        background: 'transparent', color: '#c8bfd6', ...style,
      });
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = svg;
      return b;
    };
    const SVG = (body) => `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    const copy = iconButton('Copy link', SVG('<rect x="6" y="6" width="10" height="10" rx="2"/><path d="M12 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>'),
      { background: '#4a3f5e', color: '#f3ead8' });
    const closeX = iconButton('Close', SVG('<path d="M4 4l10 10M14 4L4 14"/>'),
      { position: 'absolute', top: '8px', right: '8px' });
    linkRow.append(link, copy);

    const show = () => {
      const url = inviteLink(v.code);
      code.textContent = v.code;
      link.textContent = url.replace(/^https?:\/\//, '');
      qrBox.textContent = '';
      const c = qrCanvas(url, 4);
      c.style.width = '164px';
      c.style.height = '164px';
      c.style.imageRendering = 'pixelated';
      qrBox.append(c);
    };
    const say = (text, bad) => { note.textContent = text; note.style.color = bad ? '#ff9a8a' : '#8fd18a'; };

    copy.addEventListener('click', async () => {
      say(await copyText(inviteLink(v.code)) ? 'Copied! Paste it into a message.' : "Couldn't copy it. Press and hold the link to copy it instead.", false);
    });
    const buttons = [];
    if (canShare()) {
      const share = button('Share...', 'plain');
      share.addEventListener('click', () => {
        shareLink('Cat Cafe', 'Come play in my Cat Cafe valley!', inviteLink(v.code));
      });
      buttons.push(share);
    }

    // The creator's button asks twice: the first tap says what will happen.
    const twice = (label, confirmText, act) => {
      const b = button(label, 'danger');
      let armed = false;
      b.addEventListener('click', async () => {
        if (!armed) { armed = true; b.textContent = confirmText; return; }
        b.disabled = true;
        const r = await act();
        b.disabled = false;
        armed = false;
        b.textContent = label;
        if (!r.ok) { say(r.why || "That didn't work. Try again.", true); return; }
        v = { ...v, code: r.code };
        show();
        say(r.message, false);
      });
      return b;
    };
    // Not on the first card: nobody else has seen the link yet, so there's
    // nobody to send away.
    const extra = [];
    if (v.creator && !first) {
      extra.push(el('hr', null, { border: '0', borderTop: '1px solid #4a3f5e', margin: '16px 0 0' }));
      extra.push(el('div', "You are the creator of this valley. Only you can revoke everyone's access, which also makes a new link.",
        { fontSize: '13px', color: '#c8bfd6', marginTop: '12px', lineHeight: '1.35' }));
      extra.push(twice("Revoke everyone's access", 'Tap again: everyone is sent out and the old link stops working',
        async () => ({ ...(await revokeOthers(v)), message: "Everyone else's access has ended. Share the new link with the people you trust." })));
    }
    const finish = () => { wrap.remove(); resolve(v); };
    closeX.addEventListener('click', finish);
    // A click on the dimmed page around the card closes it too.
    wrap.addEventListener('click', (e) => { if (e.target === wrap) finish(); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(); });

    card.append(closeX, title, lead, qrBox, code, linkRow, note, ...buttons, ...extra);
    wrap.append(card);
    document.body.append(wrap);
    show();
    setTimeout(() => copy.focus(), 0);
  });
}
