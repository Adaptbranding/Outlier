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
    menu.innerHTML = home + items + search + flip;
  }).catch(() => {});
})();

// RONA photos are requested at the large size (_L). If one is missing, fall back to the original (_M).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img && img.tagName === 'IMG' && /^https:\/\/cdn\.rona\.ca\/images\/[A-Za-z0-9_\-]+_L\.jpg$/.test(img.src)) img.src = img.src.replace(/_L\.jpg$/, '_M.jpg');
}, true);
