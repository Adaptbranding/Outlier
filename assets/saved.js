// Saved products, kept in this browser (localStorage). Signing in (assets/sync.js) copies the list to the person's account so it follows them to other devices.
//   Saved.btn(snap)       HTML for the heart button; snap = { s: store id, c: product code, t: title, i: photo url,
//                         u: link, b: brand, p: sale price, o: list price, m: true when the price is a "from" price }
//   Saved.has(key)        key is store + ':' + code
//   Saved.list()          saved items, newest first
//   Saved.remove(key), Saved.clear(), Saved.count()
//   Saved.setAll(list)    replaces the whole list (used by assets/sync.js when a signed-in account's list is loaded)
//   Saved.onChange(fn)    runs after the list changes here or in another tab
// Cards are re-drawn as filters change, so buttons are built from Saved.has() each time and updated in place on click.
(function () {
  if (window.Saved) return;
  const KEY = 'outlier.saved.v1', MAX = 500;
  const subs = [];
  let mem = [];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => typeof n === 'number' && isFinite(n) ? n : null;
  const clean = (x) => {
    if (!x || typeof x !== 'object' || typeof x.s !== 'string' || typeof x.u !== 'string' || !/^https:\/\//.test(x.u)) return null;
    const code = typeof x.c === 'number' ? String(x.c) : x.c;
    if (typeof code !== 'string' || !code) return null;
    return { k: x.s + ':' + code, s: x.s, c: code, t: String(x.t || '').slice(0, 200), i: /^https:\/\//.test(x.i || '') ? x.i : '', u: x.u,
      b: String(x.b || '').slice(0, 60), p: num(x.p), o: num(x.o), m: !!x.m, at: num(x.at) || Date.now() };
  };
  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(v)) return (mem = v.map(clean).filter(Boolean));
    } catch (e) {}
    return mem;
  }
  function write(list) {
    mem = list.slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {}
    changed();
  }
  function changed() { paint(); subs.forEach(f => { try { f(); } catch (e) {} }); }

  const icon = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5 4.4 13a4.9 4.9 0 0 1 0-6.9 4.8 4.8 0 0 1 6.8 0l.8.8.8-.8a4.8 4.8 0 0 1 6.8 0 4.9 4.9 0 0 1 0 6.9z"/></svg>';
  const label = (on, t) => (on ? 'Remove from saved: ' : 'Save: ') + t;

  function paint(root) {
    const set = new Set(read().map(x => x.k));
    (root || document).querySelectorAll('button.save[data-snap]').forEach(b => {
      let snap; try { snap = JSON.parse(b.dataset.snap); } catch (e) { return; }
      const on = set.has(snap.s + ':' + snap.c);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', label(on, snap.t || 'this product'));
      b.title = on ? 'Saved. Click to remove' : 'Save for later';
    });
  }

  const api = window.Saved = {
    btn(snap) {
      const c = clean(snap); if (!c) return '';
      const on = read().some(x => x.k === c.k);
      const keep = { s: c.s, c: c.c, t: c.t, i: c.i, u: c.u, b: c.b, p: c.p, o: c.o, m: c.m };
      return `<button type="button" class="save" data-snap="${esc(JSON.stringify(keep))}" aria-pressed="${on}" aria-label="${esc(label(on, c.t))}" title="${on ? 'Saved. Click to remove' : 'Save for later'}">${icon}</button>`;
    },
    has: (k) => read().some(x => x.k === k),
    list: () => read().slice().sort((a, b) => b.at - a.at),
    count: () => read().length,
    remove(k) { write(read().filter(x => x.k !== k)); },
    clear() { write([]); },
    setAll(list) { write((Array.isArray(list) ? list : []).map(clean).filter(Boolean)); },
    toggle(snap) {
      const c = clean(snap); if (!c) return false;
      const list = read();
      if (list.some(x => x.k === c.k)) { write(list.filter(x => x.k !== c.k)); return false; }
      c.at = Date.now();
      write([c].concat(list));
      return true;
    },
    onChange(fn) { subs.push(fn); },
    paint
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button.save[data-snap]');
    if (!b) return;
    e.preventDefault();
    let snap; try { snap = JSON.parse(b.dataset.snap); } catch (err) { return; }
    api.toggle(snap);
  });
  // Another tab saved or removed something.
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) changed(); });
})();
