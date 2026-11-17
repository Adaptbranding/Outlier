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
    menu.innerHTML = home + items;
  }).catch(() => {});
})();
