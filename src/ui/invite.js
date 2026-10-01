// Inviting people to a valley on the public server: the link, the code in big
// letters, a QR code to scan across the room, and Copy and Share.
//
// It's a page overlay rather than a canvas screen, because a phone only lets a
// page copy to the clipboard or open its share sheet from inside a real tap on
// a real button, and the game's own buttons aren't that.
//
// The valley's creator also gets the two things only they can do: make a new
// link (the old one stops working; nobody already in is affected) and send
// everybody else away (for when a griefer gets in).

import qrcode from '../vendor/qrcode.js';
import { inviteLink, newInviteCode, revokeOthers } from '../net/valleys.js';
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
      { fontSize: '21px', fontWeight: 'bold', color: '#f2c75c', marginBottom: '6px' });
    const lead = el('div', first
      ? 'This link is the way back into your cafe. Bookmark it, or add the game to your Home Screen. Anyone you share it with can come and play.'
      : 'Anyone with this link or code can come and play in your valley.',
    { fontSize: '15px', color: '#c8bfd6', marginBottom: '12px', lineHeight: '1.35' });
    const qrBox = el('div', null, { margin: '0 auto 10px', lineHeight: '0' });
    const code = el('div', '', { fontSize: '24px', fontWeight: 'bold', letterSpacing: '1px', color: '#f3ead8' });
    const link = el('div', '', { fontSize: '14px', color: '#c8bfd6', margin: '4px 0 12px', wordBreak: 'break-all' });
    const note = el('div', '', { fontSize: '14px', color: '#8fd18a', minHeight: '18px', marginBottom: '8px' });

    const button = (label, kind) => {
      const b = el('button', label, {
        display: 'block', width: '100%', padding: '11px', marginTop: '8px', fontSize: '16px',
        fontFamily: 'inherit', fontWeight: 'bold', border: '0', borderRadius: '4px', cursor: 'pointer',
        background: kind === 'main' ? '#f2c75c' : kind === 'danger' ? '#7a3344' : '#4a3f5e',
        color: kind === 'main' ? '#2a2438' : '#f3ead8',
      });
      b.type = 'button';
      return b;
    };

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

    const copy = button('Copy link', 'main');
    copy.addEventListener('click', async () => {
      say(await copyText(inviteLink(v.code)) ? 'Copied! Paste it into a message.' : "Couldn't copy it. Press and hold the link to copy it instead.", false);
    });
    const buttons = [copy];
    if (canShare()) {
      const share = button('Share...', 'plain');
      share.addEventListener('click', () => {
        shareLink('Cat Cafe', 'Come play in my Cat Cafe valley!', inviteLink(v.code));
      });
      buttons.push(share);
    }

    // The creator's buttons each ask twice: the first tap says what will happen.
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
    const extra = [];
    if (v.creator) {
      extra.push(el('div', 'Only you can do these, because you made this valley.',
        { fontSize: '13px', color: '#c8bfd6', marginTop: '16px' }));
      extra.push(twice('Make a new link', 'Tap again: the old link will stop working',
        async () => ({ ...(await newInviteCode(v)), message: "Here's the new link. The old one doesn't work anymore, but everyone already in can still play." })));
      extra.push(twice('Revoke everyone else', 'Tap again: everyone else loses access',
        async () => ({ ...(await revokeOthers(v)), message: "Everyone else's access has ended. Share the new link with the people you still want." })));
    }
    const close = button('Close', 'plain');
    const finish = () => { wrap.remove(); resolve(v); };
    close.addEventListener('click', finish);
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(); });

    card.append(title, lead, qrBox, code, link, note, ...buttons, ...extra, close);
    wrap.append(card);
    document.body.append(wrap);
    show();
    setTimeout(() => copy.focus(), 0);
  });
}
