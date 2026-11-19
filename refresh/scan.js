// Canadian Tire Ontario 50%+ scan. Run in a canadiantire.ca tab after refresh/hook.js has captured the page's own search headers (runbook step 2).
// Starts a background job: window.__R. One request at a time with a 350 ms pause, using only the site's own APIs:
//   GET /api/v1/store/v2/stores    (store list)
//   GET /api/v1/search/v2/search   (the 50%-and-up clearance search with the store set, 120 per page; plus category facets for new products)
// Speed-ups (2026-11-19):
//  - No separate PriceAvailability call. The search response (light=false) already carries the store's current/original price,
//    in-store quantity and sellable flag; checked against PriceAvailability on 240 products at 2 stores: identical. That call was
//    about two thirds of all requests.
//  - Categories already known from the published data are reused, so the per-store category pages are only read for new products.
//  - A store whose pages failed is retried once at the end; any store still incomplete is listed in the export (build_data.py then
//    keeps that store's previous deals and marks it stale, so no store silently loses its deals).
window.__searchH = Object.assign({}, window.__cap2);
if (!window.__cleanFetch) { const f = document.createElement('iframe'); f.style.display = 'none'; document.body.appendChild(f); window.__cleanFetch = f.contentWindow.fetch.bind(f.contentWindow); }
{
  const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
  const waits = {}; let n = 0;
  w.onmessage = e => { const f = waits[e.data]; delete waits[e.data]; if (f) f(); };
  window.__wsleep = ms => new Promise(res => { const id = ++n; waits[id] = res; w.postMessage({ id, ms }); });
}
window.__ctQ = async function (store, page, light, cat) {
  const h = Object.assign({}, window.__searchH); h['count'] = '120'; h['light'] = light ? 'true' : 'false';
  const u = new URL('/api/v1/search/v2/search', location.origin);
  u.searchParams.set('store', String(store)); u.searchParams.set('page', String(page));
  u.searchParams.set('x1', 'save_story_range'); u.searchParams.set('q1', '50% and up');
  if (cat) { u.searchParams.set('x2', 'ast-id-level-1'); u.searchParams.set('q2', cat); }
  const r = await window.__cleanFetch(u.toString(), { headers: h, credentials: 'include' });
  await window.__wsleep(350);
  if (!r.ok) return { status: r.status };
  return await r.json();
};
window.__storeH = {};
for (const k of ['Accept', 'browse-mode', 'x-web-host', 'service-client', 'service-version', 'Ocp-Apim-Subscription-Key', 'baseSiteId', 'bannerid', 'lang']) if (window.__searchH[k] != null) window.__storeH[k] = window.__searchH[k];
window.__ctStores = async function (lat, lng) {
  const u = new URL('/api/v1/store/v2/stores', location.origin);
  u.searchParams.set('maxCount', '300'); u.searchParams.set('radius', '800000'); u.searchParams.set('latitude', String(lat)); u.searchParams.set('longitude', String(lng));
  u.searchParams.set('language', 'en_CA'); u.searchParams.set('banner', 'CTR');
  const r = await window.__cleanFetch(u.toString(), { headers: window.__storeH, credentials: 'include' });
  await window.__wsleep(350);
  if (!r.ok) return { status: r.status };
  return await r.json();
};
window.__isDeep = (cur, orig) => cur != null && orig > 0 && cur <= orig * 0.5 + 0.005;
window.__buildExport4 = function () {
  const R = window.__R; const ON = R.stores; const sIdx = {}; ON.forEach((s, i) => sIdx[s.id] = i);
  const catList = []; const catI = {};
  const ci = l => { l = String(l).replace(/\*$/, ''); if (!(l in catI)) { catI[l] = catList.length; catList.push(l); } return catI[l]; };
  const deals = {}; const scanned = Object.keys(R.perStore).length; let dropDisc = 0, dropZero = 0, dropUnk = 0;
  for (const sid in R.perStore) {
    const seenHere = new Set();
    for (const r of R.perStore[sid]) {
      const [code, cur, curMax, orig, origMax, onSale, qty, sell] = r;
      if (seenHere.has(code)) continue;
      if (!window.__isDeep(cur, orig)) continue;
      seenHere.add(code);
      if (sell === false) { dropDisc++; continue; }
      if (qty === 0) { dropZero++; continue; }
      if (qty == null && sell !== true) { dropUnk++; continue; }
      (deals[code] = deals[code] || []).push([sIdx[sid], cur, curMax, orig, qty == null ? -1 : qty]);
    }
  }
  const items = []; let allStores = 0;
  for (const code in deals) {
    const d = deals[code];
    if (d.length >= ON.length) { allStores++; continue; }
    const p = R.products[code] || {};
    const cats = Object.keys(R.cat[code] || {}).map(ci);
    const brand = p.b && typeof p.b === 'object' ? (p.b.label || p.b.name || '') : (p.b || '');
    items.push([code, p.t || '', p.u || '', brand, p.sku || '', [...new Set(cats)], p.m ? 1 : 0, d.sort((a, b) => a[1] - b[1]), String(p.i || '').replace('https://media-www.canadiantire.ca/', '')]);
  }
  return {
    generated: new Date(R.started).toISOString(), storeCount: ON.length, storesScanned: scanned, incomplete: R.incomplete.slice(),
    excludedAllStores: allStores, dropped: { discontinued: dropDisc, noStock: dropZero, unknown: dropUnk },
    stores: ON.map(s => [s.id, s.name, s.addr || '', s.lat, s.lng]), cats: catList, items, requests: R.req
  };
};
window.__download = function (obj, name) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  return blob.size;
};
window.__R = { phase: 'stores', started: Date.now(), stores: null, idx: 0, done: 0, req: 0, errs: [], catSkipped: 0, catSeeded: 0, perStore: {}, products: {}, cat: {}, incomplete: [], finished: false };
(async () => {
  const R = window.__R; const isDeep = window.__isDeep; const pause = ms => window.__wsleep(ms);
  const num = p => p ? (p.value != null ? p.value : p.minPrice) : null;
  const numMax = p => p ? (p.value != null ? p.value : (p.maxPrice != null ? p.maxPrice : p.minPrice)) : null;
  try {
    // Categories from the published data (yesterday's run), so only new products need the category pages.
    try {
      const r = await window.__cleanFetch('https://adaptbranding.github.io/Outlier/data/canadian-tire/deals.json', { cache: 'no-store' });
      if (r.ok) { const prev = await r.json(); for (const it of prev.items || []) { const cs = (it[5] || []).map(i => prev.cats[i]).filter(Boolean); if (cs.length) { R.cat[it[0]] = {}; for (const c of cs) R.cat[it[0]][c] = 1; R.catSeeded++; } } }
    } catch (e) { R.errs.push({ what: 'seed', status: 'net' }); }

    const pts = [[42.31, -83.03], [42.04, -82.6], [42.40, -82.19], [42.97, -82.40], [42.98, -81.25], [43.45, -80.49], [43.37, -80.98], [43.13, -80.75], [42.87, -80.73], [42.84, -80.30], [43.14, -80.26], [43.25, -79.87], [43.09, -79.08], [43.16, -79.24], [43.55, -80.25], [43.92, -80.10], [44.57, -80.94], [44.17, -81.64], [43.74, -81.71], [43.65, -79.38], [43.77, -79.23], [43.64, -79.55], [43.59, -79.64], [43.73, -79.76], [43.45, -79.68], [43.86, -79.33], [44.06, -79.46], [43.90, -78.86], [44.30, -78.32], [44.35, -78.74], [43.96, -78.17], [44.16, -77.38], [44.23, -76.48], [44.59, -75.68], [45.02, -74.73], [45.42, -75.69], [45.30, -75.90], [45.47, -75.50], [45.60, -74.60], [44.90, -76.02], [45.47, -76.68], [45.83, -77.11], [45.06, -77.85], [44.39, -79.69], [44.61, -79.42], [44.50, -80.22], [44.75, -79.88], [45.04, -79.31], [45.33, -79.22], [45.35, -80.04], [46.31, -79.46], [46.49, -80.99], [46.38, -82.65], [46.52, -84.33], [47.51, -79.68], [48.15, -80.03], [48.48, -81.33], [49.06, -81.02], [49.42, -82.43], [49.69, -83.67], [47.99, -84.77], [48.72, -86.38], [48.38, -89.25], [49.77, -92.84], [49.77, -94.49], [48.61, -93.40], [50.09, -91.92], [51.03, -93.82], [52.92, -89.20], [45.75, -81.03], [45.97, -81.93]];
    const all = {};
    for (const [la, lo] of pts) {
      let d;
      for (let a = 0; a < 3; a++) { d = await window.__ctStores(la, lo).catch(() => ({ status: 'net' })); R.req++; if (!d.status) break; await pause(3000); }
      if (!d.status) for (const s of d.stores) all[s.id] = { id: s.id, name: s.name, prov: s.address && s.address.region && s.address.region.isocodeShort, addr: s.address && s.address.formattedAddress, lat: s.geoPoint && s.geoPoint.latitude, lng: s.geoPoint && s.geoPoint.longitude };
    }
    R.stores = Object.values(all).filter(s => s.prov === 'ON').sort((a, b) => a.id - b.id);
    R.phase = 'scan';

    async function q(store, page, light, cat) {
      let d;
      for (let a = 0; a < 4; a++) {
        d = await window.__ctQ(store, page, light, cat).catch(() => ({ status: 'net' })); R.req++;
        if (!d.status) return d;
        R.errs.push({ store, page, cat, status: d.status, a });
        if ((d.status === 403 || d.status === 429) && R.errs.filter(e => e.status === 403 || e.status === 429).length > 12) { R.aborted = 'blocked ' + d.status; return d; }
        await pause(d.status === 429 || d.status === 403 ? 60000 : 4000 * (a + 1));
      }
      return d;
    }
    // One store: every page of its 50%-and-up search. Returns true when every page came back.
    async function scanStore(st) {
      const rows = []; const prods = {}; let page = 1, total = 1, complete = true;
      while (page <= total && !R.aborted) {
        const d = await q(st.id, page, false, null);
        if (d.status) { complete = false; break; }
        total = (d.pagination && d.pagination.total) || 1;
        for (const p of (d.products || [])) {
          prods[p.code] = { t: p.title, u: p.url, b: p.brand && (p.brand.label || p.brand.name || p.brand), sku: p.skuId, m: p.isMultiSku, i: (p.images && p.images[0] && p.images[0].url) || '' };
          const av = p.fulfillment && p.fulfillment.availability;
          rows.push([p.code, num(p.currentPrice), numMax(p.currentPrice), num(p.originalPrice), numMax(p.originalPrice), p.isOnSale ? 1 : 0,
            av && typeof av.quantity === 'number' ? av.quantity : null, p.sellable === true ? true : (p.sellable === false ? false : null)]);
        }
        page++;
      }
      if (R.aborted) complete = false;
      const keep = rows.filter(r => isDeep(r[1], r[3]) && r[7] !== false && r[6] !== 0);
      if (complete && keep.some(r => !R.cat[r[0]])) {
        const d1 = await q(st.id, 1, true, null);
        if (!d1.status) {
          const f = (d1.facets || []).find(x => x.id === 'category_ast');
          const cs = f ? f.values.map(v => ({ label: v.label, count: v.count, code: decodeURIComponent(v.url || '').match(/q2=([^&]+)/)?.[1] })).filter(c => c.code).sort((a, b) => b.count - a.count) : [];
          if (cs.length) {
            const seen = new Set();
            for (const c of cs.slice(1)) {
              const pages = Math.ceil(c.count / 120);
              for (let pg = 1; pg <= pages; pg++) { const d = await q(st.id, pg, true, c.code); if (d.status) break; for (const p of (d.products || [])) { (R.cat[p.code] = R.cat[p.code] || {})[c.label] = 1; seen.add(p.code); } }
            }
            for (const r of rows) if (!seen.has(r[0]) && !R.cat[r[0]]) (R.cat[r[0]] = {})[cs[0].label] = 1;
          }
        }
      } else R.catSkipped++;
      if (complete || !R.perStore[st.id]) R.perStore[st.id] = rows;
      Object.assign(R.products, prods);
      return complete;
    }
    for (R.idx = 0; R.idx < R.stores.length && !R.aborted; R.idx++) {
      const st = R.stores[R.idx];
      if (!(await scanStore(st))) R.incomplete.push(st.id);
      R.done++;
    }
    // Stores the loop never reached (stopped early) count as incomplete too.
    for (const st of R.stores) if (!R.perStore[st.id] && !R.incomplete.includes(st.id)) R.incomplete.push(st.id);
    // Retry pass: one more try for every incomplete store, after a pause.
    if (R.incomplete.length && !R.aborted) {
      R.phase = 'retry'; await pause(30000);
      const again = R.incomplete.splice(0);
      for (const sid of again) { const st = R.stores.find(s => s.id === sid); if (R.aborted || !(await scanStore(st))) R.incomplete.push(sid); }
    }
  } catch (e) {
    R.errs.push({ what: 'exception', status: String(e && e.message).slice(0, 80) }); R.aborted = R.aborted || 'exception';
  } finally {
    R.finished = true; R.phase = 'done'; R.ended = Date.now();
  }
})();
'started'
