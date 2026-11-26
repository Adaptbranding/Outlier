// Renders the retailer menu (logos) from retailers.json into #menu.
// Include with: <script src="../assets/nav.js" data-base="../" defer></script>
(function () {
  const el = document.currentScript, base = el.dataset.base || '';
  const here = el.dataset.here || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  fetch(base + 'retailers.json').then(r => r.json()).then(d => {
    const menu = document.getElementById('menu'); if (!menu) return;
    const home = `<a href="${base || './'}"${here === 'home' ? ' aria-current="page"' : ''}>Home</a>`;
    const items = d.retailers.filter(x => x.live).map(x => {
      const inner = x.logo ? `<img src="${esc(base + x.logo)}" alt="${esc(x.name)}" height="24">` : esc(x.name);
      return `<a href="${esc(base + x.path)}"${here === x.id ? ' aria-current="page"' : ''}>${inner}</a>`;
    }).join('');
    const search = `<a href="${base}search/"${here === 'search' ? ' aria-current="page"' : ''}>Search all</a>`;
    // Private, password-protected page (see flip/ and tools/lock_page.py).
    const lock = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:6px;flex:none"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    const flip = `<a href="${base}flip/"${here === 'flip' ? ' aria-current="page"' : ''}>${lock}Marketplace</a>`;
    const heart = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true" style="margin-right:6px;flex:none"><path d="M12 20.5 4.4 13a4.9 4.9 0 0 1 0-6.9 4.8 4.8 0 0 1 6.8 0l.8.8.8-.8a4.8 4.8 0 0 1 6.8 0 4.9 4.9 0 0 1 0 6.9z"/></svg>';
    const saved = `<a href="${base}saved/"${here === 'saved' ? ' aria-current="page"' : ''}>${heart}Saved<span class="navcount" id="navcount" hidden></span></a>`;
    const acct = '<button type="button" class="acct" id="acctbtn">Sign in</button>';
    menu.innerHTML = home + items + search + saved + flip + acct;
    // The count needs saved.js; pages that do not load it get it here.
    const count = () => { const n = window.Saved ? window.Saved.count() : 0, c = document.getElementById('navcount'); if (c) { c.textContent = n; c.hidden = !n; } };
    // Optional account sync: sync.js adds nothing to the page until someone signs in (the Supabase library loads then).
    const startSync = () => {
      const b = document.getElementById('acctbtn');
      const label = () => {
        if (!b || !window.Sync) return;
        const s = window.Sync.state(), inn = s.status === 'in' || s.status === 'error' || (s.status === 'busy' && s.email);
        b.textContent = inn ? 'Account' : 'Sign in'; b.classList.toggle('on', !!inn);
      };
      const ready = new Promise((res) => {
        if (window.Sync) return res();
        const sy = document.createElement('script'); sy.src = base + 'assets/sync.js?v=1'; sy.onload = res; sy.onerror = res; document.head.appendChild(sy);
      });
      ready.then(() => { label(); window.Sync && window.Sync.onChange(label); });
      if (b) b.addEventListener('click', () => ready.then(() => window.Sync && window.Sync.open()));
    };
    const boot = () => { count(); window.Saved.onChange(count); startSync(); };
    if (window.Saved) boot();
    else { const sc = document.createElement('script'); sc.src = base + 'assets/saved.js?v=2'; sc.onload = boot; document.head.appendChild(sc); }
  }).catch(() => {});
})();

// RONA photos are requested at the large size (_L). If one is missing, fall back to the original (_M).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.tagName === 'IMG' && /^https:\/\/cdn\.rona\.ca\/images\/[A-Za-z0-9_\-]+_L\.jpg$/.test(img.src)) img.src = img.src.replace(/_L\.jpg$/, '_M.jpg');
}, true);
