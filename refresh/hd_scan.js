// Home Depot Canada scan. Run on any homedepot.ca page (no sign-in), after pasting refresh/keepalive.js in the same tab.
// Start: paste this file, then poll window.__hd.state until "done". The raw JSON is then in window.__raw (download it, see README).
// Steps: (1) page every sale filter at one base store and keep items 50% or more off; (2) check price + stock for those items at all
// stores (products-localized-basic, 34 ids per call); (3) read links, photos and categories; (4) assemble the raw export.
// Pace is about 2 requests a second. Stops on any non-200 answer.
(async () => {
  const H = window.__hd = { state: 'candidates', err: null, items: {}, res: {}, meta: {}, cat: {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const BASE = '7135', BASEPC = 'L4N8V4';
  const J = async (u) => { const r = await fetch(u, { credentials: 'include' }); if (r.status !== 200) throw new Error(r.status + ' ' + u.slice(0, 80)); return r.json(); };
  try {
    // 1. candidates
    for (const f of ['j2z', 'qs7', 'ni6', 'xzs']) {           // Savings, Special Buy, New Lower Price, Bulk Pricing. Clearance (xmv) has no regular price, so it cannot be checked.
      let page = 1, pages = 1;
      while (page <= pages) {
        const d = await J('/api/search/v1/search?store=' + BASE + '&filter=' + f + '&sort=price-asc&pageSize=40&page=' + page + '&postalCode=' + BASEPC + '&lang=en');
        if (page === 1) pages = Math.min(Math.ceil(((d.searchReport && d.searchReport.totalProducts) || 0) / 40), 100);
        for (const p of (d.products || [])) {
          const pr = p.pricing || {}, dp = pr.displayPrice && pr.displayPrice.value, wp = pr.wasprice && pr.wasprice.value;
          if (dp && wp && dp <= wp * 0.5 + 0.005) H.items[p.code] = [p.code, p.name, p.brand];
        }
        page++; await sleep(500);
      }
    }
    const codes = Object.keys(H.items);
    // 2. every store
    H.state = 'stores';
    const sd = await J('/api/storesvc/v1/stores?pageSize=200&lang=en');
    const sl = (sd.stores || sd.data || sd).filter(s => s.name !== '7274');   // 7274 is the "Online" pseudo-store, not a physical store
    for (const s of sl) {
      const pc = ((s.address && s.address.postalCode) || '').replace(/\s/g, ''), row = {};
      for (let i = 0; i < codes.length; i += 34) {
        const a = await J('/api/productsvc/v1/products-localized-basic?products=' + codes.slice(i, i + 34).join(',') + '&store=' + s.name + '&postalCode=' + pc + '&lang=en');
        for (const p of a) { const o = p.optimizedPrice || {}; row[p.productId] = [o.displayPrice && o.displayPrice.value, o.wasprice && o.wasprice.value, p.storeStock && p.storeStock.stockLevel]; }
        await sleep(450);
      }
      H.res[s.name] = row;
    }
    // 3. links, photos, categories
    H.state = 'meta';
    const slugs = ['appliances', 'bath', 'building-materials', 'decor', 'floors', 'kitchen', 'outdoors', 'tools', 'windows-doors', 'lighting'];
    const names = ['Appliances', 'Bath', 'Building Materials', 'Decor', 'Flooring', 'Kitchen', 'Outdoors', 'Tools', 'Windows & Doors', 'Lighting & Fans'];
    const want = new Set(codes);
    for (const c of slugs) {
      let page = 1, pages = 1;
      while (page <= pages) {
        const d = await J('/api/search/v1/search?category=l1-' + c + '&store=' + BASE + '&filter=j2z&sort=price-asc&pageSize=40&page=' + page + '&postalCode=' + BASEPC + '&lang=en');
        if (page === 1) pages = Math.min(Math.ceil(((d.searchReport && d.searchReport.totalProducts) || 0) / 40), 100);
        for (const p of (d.products || [])) if (want.has(p.code)) { (H.cat[p.code] = H.cat[p.code] || []).push(c); if (!H.meta[p.code]) H.meta[p.code] = [p.url, p.imageUrl, p.modelNumber || '']; }
        page++; await sleep(500);
      }
    }
    // 4. assemble (build_data.py "hd" mode drops items that are out of stock everywhere or not 50% off)
    const idx = {}; sl.forEach((s, i) => idx[s.name] = i);
    const stores = sl.map(s => [parseInt(s.name, 10), s.displayName || ('Home Depot ' + s.address.town), s.address.formattedAddress || '', s.geoPoint && s.geoPoint.latitude, s.geoPoint && s.geoPoint.longitude]);
    const out = [];
    for (const c of codes) {
      const it = H.items[c], mm = H.meta[c]; if (!mm) continue;
      const deals = [];
      for (const sid in H.res) { const v = H.res[sid][c]; if (!v) continue; const [d, w, q] = v; if (d == null || !w || !(d <= w * 0.5 + 0.005) || !(q > 0)) continue; deals.push([idx[sid], d, null, w, q]); }
      if (!deals.length) continue;
      out.push([c, it[1], mm[0], it[2] || '', mm[2] || '', [...new Set((H.cat[c] || []).map(x => slugs.indexOf(x)).filter(x => x >= 0))], 0, deals, mm[1]]);
    }
    window.__raw = JSON.stringify({ generated: new Date().toISOString(), stores, cats: names, items: out });
    H.state = 'done';
  } catch (e) { H.err = String(e); H.state = 'error'; }
})();
'started';
