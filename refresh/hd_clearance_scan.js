// Home Depot Canada clearance scan (badge CLR, search filter xmv). Run on any homedepot.ca page after pasting refresh/keepalive.js in the same tab.
// Clearance has no regular price on homedepot.ca, so this records price and stock only (discount unknown). Three workers run over different store
// ranges at about 1 request a second each (about 15-20 minutes in all). Poll window.__cl.state until "done"; any non-200 answer stops that worker
// (window.__cl.errs) and its stores stay missing: report it instead of retrying in a loop. Then the raw export is in window.__rawc (download it).
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const C = window.__cl = { state: 'run', errs: [], n: 0, meta: {}, cat: {}, res: {}, stores: [], doneW: 0 };
  const sd = await (await fetch('/api/storesvc/v1/stores?pageSize=200&lang=en', { credentials: 'include' })).json();
  const sl = (sd.stores || sd.data || sd).filter(s => s.name !== '7274');      // 7274 = "Online" pseudo-store (its clearance search returns a 500)
  C.stores = sl.map(s => [parseInt(s.name, 10), s.displayName || ('Home Depot ' + s.address.town), s.address.formattedAddress || '', s.geoPoint && s.geoPoint.latitude, s.geoPoint && s.geoPoint.longitude]);
  const work = async (list) => {
    try {
      for (const s of list) {
        const pc = ((s.address && s.address.postalCode) || '').replace(/\s/g, ''), row = {};
        const q = (cat, page) => '/api/search/v1/search?' + (cat ? 'category=' + cat + '&' : '') + 'store=' + s.name + '&filter=xmv&sort=price-asc&pageSize=40&page=' + page + '&postalCode=' + pc + '&lang=en';
        const J = async u => { const r = await fetch(u, { credentials: 'include' }); if (r.status !== 200) throw new Error(r.status + ' store ' + s.name); C.n++; await sleep(400); return r.json(); };
        const d0 = await J(q('', 1));
        const cf = ((d0.facets || []).find(f => f.code === 'categoryPathHierarchy') || {}).facetValues || [];
        for (const fv of cf) {
          const slug = fv.code.split('/').pop();
          for (let page = 1; page <= Math.ceil(fv.count / 40); page++) {
            const d = await J(q(slug, page));
            for (const p of (d.products || [])) {
              const dp = p.pricing && p.pricing.displayPrice && p.pricing.displayPrice.value; if (dp == null) continue;
              row[p.code] = [dp, (p.storeStock && p.storeStock.stockLevel) || 0];
              (C.cat[p.code] = C.cat[p.code] || new Set()).add(slug);
              if (!C.meta[p.code]) C.meta[p.code] = [p.name, p.brand || '', p.url, p.imageUrl, p.modelNumber || ''];
            }
          }
        }
        C.res[s.name] = row;
      }
    } catch (e) { C.errs.push(String(e).slice(0, 60)); }
    if (++C.doneW === 3) finish();
  };
  const finish = () => {
    const N = { appliances: 'Appliances', bath: 'Bath', 'building-materials': 'Building Materials', decor: 'Decor', floors: 'Flooring', kitchen: 'Kitchen', outdoors: 'Outdoors', tools: 'Tools', 'windows-doors': 'Windows & Doors', lighting: 'Lighting & Fans', generaljunk: 'Other' };
    const used = new Set(); for (const c in C.cat) C.cat[c].forEach(x => used.add(x));
    const slugs = [...used], cats = slugs.map(k => { const b = k.replace(/^l1-/, ''); return N[b] || b.replace(/-/g, ' ').replace(/^./, m => m.toUpperCase()); });
    const idx = {}; C.stores.forEach((s, i) => idx[String(s[0])] = i);
    const out = [];
    for (const c in C.meta) {
      const deals = [];
      for (const sid in C.res) { const v = C.res[sid][c]; if (!v || !(v[1] > 0)) continue; deals.push([idx[sid], v[0], null, 0, v[1]]); }
      if (!deals.length) continue;
      const m = C.meta[c];
      out.push([c, m[0], m[2], m[1], m[4], [...C.cat[c]].map(x => slugs.indexOf(x)), 0, deals, m[3]]);
    }
    window.__rawc = JSON.stringify({ generated: new Date().toISOString(), stores: C.stores, cats, items: out });
    C.stats = { stores: Object.keys(C.res).length, of: C.stores.length, items: out.length };
    C.state = C.errs.length ? 'error' : 'done';
  };
  const t = Math.ceil(sl.length / 3);
  work(sl.slice(0, t)); work(sl.slice(t, 2 * t)); work(sl.slice(2 * t));
})();
'started';
