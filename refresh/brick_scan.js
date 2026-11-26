// The Brick (thebrick.com) scan. Run in Chrome on any thebrick.com page (signed out, any store).
// The Brick is a Shopify store. Every product's public feed (/collections/<handle>/products.json, 250 per page) lists one variant per
// PRICE ZONE (the variant title is the zone code, e.g. ZBA) with that zone's price and compare-at (regular) price. Each store sits in one
// price zone, so one pass over the feeds covers every store. refresh/brick_stores.json maps store -> zone (found by setting each store's
// postal code on the site and reading the zone it picks).
// Starts a background job in window.__K and returns at once. Poll with:
//   JSON.stringify({phase:__K.phase,cur:__K.cur,pages:__K.pages,seen:__K.seen,keep:Object.keys(__K.items).length,errs:__K.errs.length,fin:__K.fin})
// Export with:  window.__download(window.__brickExport(), 'brick-<date>-<time>.json')   (unique file name; paste keepalive.js first)
(function () {
  const ZONES = ['ZBA', 'ZBC', 'ZBO', 'ZCA', 'ZFA', 'ZFF', 'ZBW']; // price zones used by Ontario stores
  // Top-level site sections, in this order; a product is labelled with the first section it appears in.
  const SECTIONS = [['Mattresses', 'mattress-store'], ['Living Room', 'furniture-living-room'], ['Bedroom', 'furniture-bedroom'], ['Dining Room', 'furniture-dining-room'],
    ['Appliances', 'appliances'], ['Electronics', 'electronics'], ['Office', 'furniture-office'], ['Home Decor', 'home-decor'], ['Small Spaces', 'small-space-furniture'], ['Outdoor', 'outdoor-living']];
  const EXTRA = ['all', 'last-chance']; // catch anything not in a section ("Other")
  const Q = String.fromCharCode(63);
  const K = window.__K = { phase: 'sections', cur: '', pages: 0, seen: 0, items: {}, ids: {}, errs: [], fin: false, started: Date.now() };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const img = (p) => { const s = (p.images && p.images[0] && p.images[0].src) || ''; const m = s.match(/\/files\/([^?]+)/) || s.match(/\/products\/([^?]+)/); return m ? m[1] : ''; };

  function take(p, cat) {
    if (K.ids[p.id]) return; K.ids[p.id] = 1; K.seen++;
    const z = {}; let best = 0;
    for (const v of p.variants) {
      const zone = String(v.title || '').trim(); if (ZONES.indexOf(zone) < 0) continue;
      const a = +v.price, c = +(v.compare_at_price || 0); if (!(a > 0 && a < 50000)) continue;
      const cur = z[zone]; if (!cur || a < cur[0]) z[zone] = [a, c > a ? c : 0, v.available ? 1 : 0, v.sku || ''];
    }
    for (const k in z) { const [a, c] = z[k]; if (c > a) best = Math.max(best, 1 - a / c); }
    if (best < 0.4995) return; // only 50%+ off at some store's price zone
    const cs = (p.tags || []).filter((t) => t.indexOf('clearance-store:') === 0).map((t) => t.slice(16));
    K.items[p.id] = { id: p.id, handle: p.handle, title: p.title, vendor: p.vendor || '', type: p.product_type || '', cat, img: img(p), z, clear: p.tags.indexOf('clearance') >= 0, cs };
  }

  async function crawl(handle, cat) {
    K.cur = handle;
    for (let pg = 1; pg <= 60; pg++) {
      let j = null;
      for (let t = 0; t < 3 && !j; t++) {
        try { const r = await fetch('/collections/' + handle + '/products.json' + Q + 'limit=250&page=' + pg); if (r.status === 404) return; if (!r.ok) throw new Error('st' + r.status); j = await r.json(); }
        catch (e) { K.errs.push({ handle, pg, t, e: String(e && e.message || e).slice(0, 40) }); await sleep(2000 * (t + 1)); }
      }
      if (!j) { K.errs.push({ stop: handle, pg }); return; }
      K.pages++;
      if (!j.products.length) return;
      for (const p of j.products) take(p, cat);
      if (j.products.length < 250) return;
      await sleep(200);
    }
  }

  (async () => {
    try {
      for (const [cat, h] of SECTIONS) await crawl(h, cat);
      K.phase = 'extra';
      for (const h of EXTRA) await crawl(h, 'Other');
      K.phase = 'done'; K.fin = true;
    } catch (e) { K.errs.push({ ex: String(e && e.message || e) }); K.phase = 'error'; K.fin = true; }
  })();

  window.__brickExport = () => JSON.stringify({ generated: new Date().toISOString(), zones: ZONES, seen: K.seen, errs: K.errs.filter((e) => e.stop || e.ex).length, retries: K.errs.length, items: Object.values(K.items) });
  window.__download = window.__download || function (text, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  return 'started';
})();
