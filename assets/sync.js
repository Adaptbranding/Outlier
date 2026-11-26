// Optional account sync for the saved list (assets/saved.js).
// Nobody has to sign in: the list always lives in this browser. Signing in copies it to the person's account
// (Supabase table "favorites", one row per saved product, readable only by its owner) and keeps every device in step.
//   Sync.state()      { status: 'out' | 'in' | 'busy' | 'error', email }
//   Sync.open()       opens the sign-in / account dialog
//   Sync.onChange(fn) runs when the state changes
// The Supabase library (assets/vendor/) is only downloaded when someone signs in or is already signed in.
(function () {
  if (window.Sync) return;
  const CFG = { url: 'https://qemjhavbngizhgoxokob.supabase.co', ref: 'qemjhavbngizhgoxokob', key: 'sb_publishable_pok1RxDGOcoO-XmlFOegEw_X5QY-35V' };
  const SELF = document.currentScript && document.currentScript.src;
  const VENDOR = new URL('vendor/supabase-js-2.119.2.js', SELF || location.href).href;
  const MARK = 'outlier.sync.user.v1';        // which account this browser's list belongs to
  const PENDING = 'outlier.sync.pending.v1';  // changes that could not be sent yet
  const AUTHKEY = 'sb-' + CFG.ref + '-auth-token';
  const subs = [];
  let cl = null, libP = null, user = null, status = 'out', syncedFor = null, applying = false, prev = new Map(), lastPull = 0, chain = Promise.resolve();
  let note = '', dlg = null, googleOn = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const run = (fn) => (chain = chain.then(fn, fn).catch(() => {}));
  const emit = () => { subs.forEach(f => { try { f(); } catch (e) {} }); if (dlg && dlg.open) paintDialog(); };
  const setStatus = (s) => { status = s; emit(); };

  function lib() {
    if (libP) return libP;
    return (libP = new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res(window.supabase);
      const s = document.createElement('script');
      s.src = VENDOR;
      s.onload = () => (window.supabase && window.supabase.createClient ? res(window.supabase) : rej(new Error('lib')));
      s.onerror = () => { libP = null; rej(new Error('lib')); };
      document.head.appendChild(s);
    }));
  }
  async function client() {
    if (cl) return cl;
    const sb = await lib();
    cl = sb.createClient(CFG.url, CFG.key, { auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    // Do not call Supabase from inside this callback (it can deadlock the auth lock); hand off to a timer.
    cl.auth.onAuthStateChange((ev, session) => { setTimeout(() => onAuth(ev, session), 0); });
    return cl;
  }

  // ---- list <-> rows ----
  const toRow = (x) => ({ user_id: user.id, key: x.k, item: { s: x.s, c: x.c, t: x.t, i: x.i, u: x.u, b: x.b, p: x.p, o: x.o, m: x.m, at: x.at }, saved_at: new Date(x.at || Date.now()).toISOString() });
  const mapOf = (list) => new Map(list.map(x => [x.k, x]));
  function apply(list) {
    applying = true;
    try { window.Saved.setAll(list); } finally { applying = false; }
    prev = mapOf(window.Saved.list());
  }
  async function fetchRemote() {
    const { data, error } = await cl.from('favorites').select('item,saved_at').order('saved_at', { ascending: false }).limit(500);
    if (error) throw error;
    return (data || []).map(r => Object.assign({}, r.item, { at: (r.item && r.item.at) || Date.parse(r.saved_at) || Date.now() }));
  }

  // ---- changes waiting to be sent ----
  const readQ = () => { try { const v = JSON.parse(localStorage.getItem(PENDING) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const writeQ = (q) => { try { if (q.length) localStorage.setItem(PENDING, JSON.stringify(q)); else localStorage.removeItem(PENDING); } catch (e) {} };
  async function flush() {
    if (!cl || !user) return;
    let q = readQ();
    while (q.length) {
      const op = q[0];
      if (op.u && op.u !== user.id) { q.shift(); writeQ(q); continue; }   // queued by someone else on this browser: never send as this account
      if (op.t === 'up') {
        const { error } = await cl.from('favorites').upsert(op.items.map(x => Object.assign(toRow(x), { user_id: user.id })), { onConflict: 'user_id,key' });
        if (error) throw error;
      } else if (op.t === 'del') {
        for (let i = 0; i < op.keys.length; i += 100) {
          const { error } = await cl.from('favorites').delete().in('key', op.keys.slice(i, i + 100));
          if (error) throw error;
        }
      }
      q.shift(); writeQ(q);
    }
  }
  function enqueue(op) { const q = readQ(); op.u = user.id; q.push(op); writeQ(q); }

  // A change made on this device: work out what was added or removed and send it.
  function onLocal() {
    if (applying) { prev = mapOf(window.Saved.list()); return; }
    if (!user) return;
    run(async () => {
      const cur = mapOf(window.Saved.list());
      const added = [...cur.values()].filter(x => !prev.has(x.k));
      const removed = [...prev.keys()].filter(k => !cur.has(k));
      prev = cur;
      if (added.length) enqueue({ t: 'up', items: added });
      if (removed.length) enqueue({ t: 'del', keys: removed });
      if (!added.length && !removed.length) return;
      try { await flush(); if (status === 'error') setStatus('in'); } catch (e) { setStatus('error'); }
    });
  }

  // First sync after signing in, and later refreshes.
  function initialSync() {
    return run(async () => {
      setStatus('busy');
      try {
        await flush();
        const remote = await fetchRemote();
        const local = window.Saved.list();
        const marker = localStorage.getItem(MARK);
        let next = remote;
        if (!marker && local.length) {
          // Saved before signing in: keep those too, and add them to the account.
          const have = new Set(remote.map(x => x.k));
          const extra = local.filter(x => !have.has(x.k));
          if (extra.length) {
            const { error } = await cl.from('favorites').upsert(extra.map(toRow), { onConflict: 'user_id,key' });
            if (error) throw error;
          }
          next = remote.concat(extra);
        }
        localStorage.setItem(MARK, user.id);
        apply(next);
        lastPull = Date.now();
        setStatus('in');
      } catch (e) { setStatus('error'); }
    });
  }
  function pull(force) {
    if (!user || status === 'busy' || (force !== true && Date.now() - lastPull < 20000)) return;
    lastPull = Date.now();
    run(async () => {
      try {
        await flush();
        const remote = await fetchRemote();
        const a = remote.map(x => x.k).sort().join('\n'), b = window.Saved.list().map(x => x.k).sort().join('\n');
        if (a !== b) apply(remote);
        if (status !== 'in') setStatus('in');
      } catch (e) { if (status === 'in') setStatus('error'); }
    });
  }

  function onAuth(ev, session) {
    if (session && session.user) {
      const first = !user || user.id !== session.user.id;
      user = session.user;
      if (first) emit();
      if (syncedFor !== user.id) { syncedFor = user.id; note = ''; initialSync(); }
    } else if (ev !== 'SIGNED_OUT') {
      user = null; syncedFor = null; if (status !== 'out') setStatus('out'); else emit();
    }
  }

  // ---- sign in / out ----
  async function sendLink(email) {
    const c = await client();
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
    if (error) throw error;
  }
  async function google() {
    const c = await client();
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw error;
  }
  function signOut() {
    return run(async () => {
      setStatus('busy');
      try { await flush(); } catch (e) {}
      try { if (cl) await cl.auth.signOut({ scope: 'local' }); } catch (e) {}
      user = null; syncedFor = null;
      try { localStorage.removeItem(MARK); localStorage.removeItem(PENDING); } catch (e) {}
      apply([]);          // the list belongs to the account; it is not left behind on a shared computer
      note = 'Signed out. Your saved list was removed from this device and is still in your account.';
      setStatus('out');
    });
  }
  const friendly = (e) => {
    const m = String((e && e.message) || e || '');
    if (/not authorized/i.test(m)) return 'Sign-in emails are not turned on for this address yet.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many tries. Wait a minute and try again.';
    if (/invalid.*email|valid email/i.test(m)) return 'Enter a valid email address.';
    if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google sign-in is not available yet. Use the email link.';
    return 'Could not sign in. Check your connection and try again.';
  };

  // ---- dialog ----
  let ui = { step: 'form', email: '', err: '', busy: false };
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'acctdlg';
    dlg.setAttribute('aria-labelledby', 'acctttl');
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { if (opener && opener.focus) opener.focus(); });
    dlg.addEventListener('click', async (e) => {
      const t = e.target.closest && e.target.closest('[data-act]'); if (!t) return;
      const act = t.dataset.act;
      if (act === 'close') dlg.close();
      else if (act === 'again') { ui = { step: 'form', email: ui.email, err: '', busy: false }; paintDialog(); }
      else if (act === 'google') { ui.busy = true; ui.err = ''; paintDialog(); try { await google(); } catch (er) { ui.busy = false; ui.err = friendly(er); paintDialog(); } }
      else if (act === 'out') { await signOut(); dlg.close(); }
    });
    dlg.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target.closest('form'), inp = f && f.querySelector('input[name="email"]'); if (!inp) return;
      const email = inp.value.trim();
      if (!email) return;
      ui = { step: 'form', email, err: '', busy: true }; paintDialog();
      try { await sendLink(email); ui = { step: 'sent', email, err: '', busy: false }; }
      catch (er) { ui = { step: 'form', email, err: friendly(er), busy: false }; }
      paintDialog();
    });
    document.body.appendChild(dlg);
    return dlg;
  }
  function paintDialog() {
    if (!dlg) return;
    const x = '<button type="button" class="acctx" data-act="close" aria-label="Close">&times;</button>';
    if (user) {
      const st = status === 'busy' ? 'Syncing your saved list…' : status === 'error' ? 'Could not reach the server. Changes are kept here and will sync when it is back.' : 'Your saved list is synced. It will be here on any device you sign in on.';
      dlg.innerHTML = `<div class="acctin">${x}<h2 id="acctttl">Your account</h2><p class="acctemail">${esc(user.email || 'Signed in')}</p><p class="acctnote">${st}</p>
        <div class="acctrow"><button type="button" class="btn danger" data-act="out">Sign out</button><button type="button" class="btn ghost" data-act="close">Done</button></div>
        <p class="acctfine">Signing out removes the list from this device. It stays in your account.</p></div>`;
      return;
    }
    if (ui.step === 'sent') {
      dlg.innerHTML = `<div class="acctin">${x}<h2 id="acctttl">Check your email</h2><p class="acctnote">We sent a sign-in link to <b>${esc(ui.email)}</b>. Open it on this device to finish signing in. It can take a minute to arrive; check spam if you do not see it.</p>
        <div class="acctrow"><button type="button" class="btn ghost" data-act="again">Use a different email</button><button type="button" class="btn ghost" data-act="close">Close</button></div></div>`;
      return;
    }
    const g = googleOn ? `<div class="acctor"><span>or</span></div><button type="button" class="btn ghost acctg" data-act="google"${ui.busy ? ' disabled' : ''}>Continue with Google</button>` : '';
    dlg.innerHTML = `<div class="acctin">${x}<h2 id="acctttl">Sign in to sync your saved list</h2>
      <p class="acctnote">Keep your favorites on every phone and computer. There is no password: we email you a one-time sign-in link. What you have already saved here is added to your account.</p>
      <form class="acctform" novalidate><label for="acctemail">Email address</label>
        <input id="acctemail" name="email" type="email" inputmode="email" autocomplete="email" required value="${esc(ui.email)}" placeholder="you@example.com">
        <p class="accterr" role="alert">${esc(ui.err)}</p>
        <button type="submit" class="btn"${ui.busy ? ' disabled' : ''}>${ui.busy ? 'Sending…' : 'Email me a sign-in link'}</button></form>${g}
      <p class="acctfine">We store your email and your saved list, nothing else. Saving products works without an account.</p></div>`;
  }
  let opener = null;
  async function open() {
    opener = document.activeElement;
    ensureDialog();
    if (googleOn === null) {
      googleOn = false;
      fetch(CFG.url + '/auth/v1/settings', { headers: { apikey: CFG.key } }).then(r => r.json()).then(d => { googleOn = !!(d && d.external && d.external.google); if (dlg.open) paintDialog(); }).catch(() => {});
    }
    if (!user && ui.step === 'sent') ui = { step: 'form', email: ui.email, err: '', busy: false };
    paintDialog();
    if (!dlg.open) dlg.showModal();
    const first = dlg.querySelector('#acctemail') || dlg.querySelector('button');
    if (first) first.focus();
    client().catch(() => { ui.err = 'Could not load sign-in. Check your connection and try again.'; paintDialog(); });
  }

  window.Sync = {
    state: () => ({ status, email: user ? user.email : '', note }),
    open,
    onChange(fn) { subs.push(fn); }
  };

  // ---- start ----
  if (window.Saved) window.Saved.onChange(onLocal);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  window.addEventListener('online', () => pull(true));
  window.addEventListener('storage', (e) => { if (e.key === AUTHKEY && !e.newValue && user) { user = null; syncedFor = null; setStatus('out'); } });

  const h = location.hash || '';
  let returning = false;
  try { returning = !!localStorage.getItem(AUTHKEY); } catch (e) {}
  if (/[#&](access_token|error_code|error)=/.test(h) || /[?&](code|error_code)=/.test(location.search)) returning = true;
  if (/error_code=|error=/.test(h)) {
    const p = new URLSearchParams(h.replace(/^#/, ''));
    const expired = /expired|invalid/i.test((p.get('error_description') || '') + (p.get('error_code') || ''));
    ui.err = expired ? 'That sign-in link expired or was already used. Request a new one.' : 'Sign-in did not finish. Try again.';
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { open(); }); else open();
    returning = false;
  }
  if (returning) { setStatus('busy'); client().catch(() => setStatus('out')); }
})();
