// Mark's Ontario scan: store-level prices on everything in Sale & Clearance. Run in Chrome on marks.com after marks_hook.js.
// Starts a background job in window.__R and returns at once. Poll with:
//   JSON.stringify({phase:__R.phase,done:__R.done,total:__R.total,stores:__R.stores&&__R.stores.length,cat:__R.codes.length,cand:__R.cand&&__R.cand.length,errs:__R.errs.length,finished:__R.finished})
//
// How it works (the listing pages show one price for every store, only the per-store product lookup shows store prices):
//   1. Ontario store list from the store API (geo points across the province).
//   2. Catalogue: every product in sale-clearance (about 5,300), with category.
//   3. Screen: the full catalogue is looked up at 6 spread-out stores. A product is a candidate if it is discounted at any of them.
//   4. Full: every candidate is looked up at every other Ontario store (250 products per request, 6 requests at once).
// Export with:  window.__download(window.__buildExport(), 'marks-ontario-outliers-<date>-<time>.json')  (unique file name)
(function () {
  if (!window.__cap || !window.__cap.h) return 'run marks_hook.js first and click page 2';
  const ifr = document.createElement('iframe'); ifr.style.display = 'none'; document.body.appendChild(ifr);
  const cf = ifr.contentWindow.fetch.bind(ifr.contentWindow);
  // Worker-based sleep: not throttled when the tab is in the background.
  const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
  const waits = {}; let wn = 0; w.onmessage = (e) => { const f = waits[e.data]; delete waits[e.data]; if (f) f(); };
  const sleep = (ms) => new Promise((res) => { const id = ++wn; waits[id] = res; w.postMessage({ id, ms }); });

  const base = Object.assign({}, window.__cap.h);
  for (const k of ['newrelic', 'traceparent', 'tracestate']) delete base[k];
  const LH = Object.assign({}, base); delete LH.filters; LH.count = '40';              // listing: whole sale-clearance category
  const DH = Object.assign({}, base); delete DH.filters; delete DH.count; DH['Content-Type'] = 'application/json'; // detail lookups
  const SH = {}; for (const k of ['Accept', 'browse-mode', 'x-web-host', 'service-client', 'service-version', 'Ocp-Apim-Subscription-Key', 'baseSiteId', 'bannerid', 'lang']) if (base[k] != null) SH[k] = base[k];

  const R = window.__R = { phase: 'stores', started: Date.now(), stores: null, codes: [], meta: {}, cat: {}, catList: [], screen: [], cand: null, perStore: {}, done: 0, total: 0, req: 0, errs: [], finished: false };
  const num = (p) => (p ? (p.value != null ? p.value : p.minPrice) : null);
  const numMax = (p) => (p ? (p.value != null ? p.value : (p.maxPrice != null ? p.maxPrice : p.minPrice)) : null);
  window.__isDeep = (cur, orig) => cur != null && orig > 0 && cur <= orig * 0.5 + 0.005;

  async function getJ(url, opts) {
    for (let a = 0; a < 4; a++) {
      let r;
      try { r = await cf(url, opts); } catch (e) { r = { ok: false, status: 'net' }; }
      R.req++;
      if (r.ok) { try { return await r.json(); } catch (e) { r = { ok: false, status: 'json' }; } }
      R.errs.push({ s: r.status, a, t: Date.now() });
      await sleep(r.status === 429 || r.status === 403 ? 60000 : 3000 * (a + 1));
    }
    return null;
  }
  const listUrl = (store, page, x1, q1) => { const u = new URL('/api/v1/search/v2/search', location.origin); u.searchParams.set('store', String(store)); u.searchParams.set('page', String(page)); if (x1) { u.searchParams.set('x1', x1); u.searchParams.set('q1', q1); } return u.toString(); };
  const detailUrl = (store) => { const u = new URL('/api/v1/product/api/v1/product/productFamilyList', location.origin); u.searchParams.set('storeName', String(store)); u.searchParams.set('baseStoreId', 'MKS'); u.searchParams.set('lang', 'en_CA'); u.searchParams.set('includeSpecifications', 'false'); return u.toString(); };

  // IndexedDB checkpoint per finished store, so a crash does not lose hours of work.
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('marksScan', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const put = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => { db.close(); rej(tx.error); }; }); };

  async function pool(tasks, n) {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); R.done++; await sleep(150); } }));
  }

  // Look up `codes` at one store; fills R.perStore[sid][code] = [code, cur, curMax, orig, qty, sellable]
  async function lookup(sid, codes) {
    const d = await getJ(detailUrl(sid), { method: 'POST', headers: DH, body: JSON.stringify({ productCodes: codes }), credentials: 'include' });
    if (!d || !d.products) { R.errs.push({ s: 'nodata', sid }); return; }
    const m = R.perStore[sid] || (R.perStore[sid] = {});
    for (const p of d.products) {
      const cur = num(p.currentPrice), orig = num(p.originalPrice);
      if (cur == null || orig == null) continue;
      const q = p.fulfillment && typeof p.fulfillment.quantity === 'number' ? p.fulfillment.quantity : null;
      m[p.code] = [p.code, cur, numMax(p.currentPrice), orig, q, p.sellable === true ? true : (p.sellable === false ? false : null)];
    }
  }
  const batches = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

  (async () => {
    try {
      // 1. Ontario stores
      const pts = [[43.65, -79.38], [43.45, -80.49], [42.98, -81.25], [42.31, -83.03], [43.09, -79.08], [44.39, -79.69], [44.30, -78.32], [44.23, -76.48], [45.42, -75.69], [45.02, -74.73], [44.59, -80.94], [46.49, -80.99], [46.31, -79.46], [46.52, -84.33], [48.48, -81.33], [49.42, -82.43], [48.38, -89.25], [49.77, -92.84], [45.83, -77.11], [44.17, -81.64]];
      const all = {};
      for (const [la, lo] of pts) {
        const u = new URL('/api/v1/store/v2/stores', location.origin);
        u.searchParams.set('maxCount', '300'); u.searchParams.set('radius', '800000'); u.searchParams.set('latitude', String(la)); u.searchParams.set('longitude', String(lo)); u.searchParams.set('language', 'en_CA'); u.searchParams.set('banner', 'MKS');
        const d = await getJ(u.toString(), { headers: SH, credentials: 'include' }); await sleep(300);
        for (const s of ((d && d.stores) || [])) all[s.id] = { id: s.id, name: s.name, prov: s.address && s.address.region && s.address.region.isocodeShort, addr: s.address && s.address.formattedAddress, lat: s.geoPoint && s.geoPoint.latitude, lng: s.geoPoint && s.geoPoint.longitude };
      }
      R.stores = Object.values(all).filter((s) => s.prov === 'ON').sort((a, b) => a.id - b.id);

      // 2. Catalogue + categories (listing is the same at every store)
      R.phase = 'catalogue';
      const sid0 = R.stores[0].id;
      const first = await getJ(listUrl(sid0, 1), { headers: LH, credentials: 'include' });
      if (!first) throw new Error('listing failed');
      const pages = Math.ceil((first.resultCount || 0) / 40);
      const take = (d) => { for (const p of (d.products || [])) if (!R.meta[p.code]) { R.meta[p.code] = { t: p.title, u: p.url, b: p.brand && (p.brand.label || p.brand.name || p.brand) || '', sku: p.skuId, m: p.isMultiSku, i: (p.images && p.images[0] && p.images[0].url) || '' }; R.codes.push(p.code); } };
      take(first);
      for (let pg = 2; pg <= pages; pg++) { const d = await getJ(listUrl(sid0, pg), { headers: LH, credentials: 'include' }); if (d) take(d); await sleep(300); }
      const facet = (first.facets || []).find((f) => f && f.id === 'category_ast');
      const cats = facet ? facet.values.map((v) => ({ label: v.label, count: Number(v.count), code: (decodeURIComponent(v.url || '').match(/q1=([^&]+)/) || [])[1] })).filter((c) => c.code) : [];
      for (const c of cats) {
        R.catList.push(c.label);
        for (let pg = 1; pg <= Math.ceil(c.count / 40); pg++) { const d = await getJ(listUrl(sid0, pg, 'ast-id-level-1', c.code), { headers: LH, credentials: 'include' }); if (!d) break; for (const p of (d.products || [])) (R.cat[p.code] = R.cat[p.code] || {})[c.label] = 1; await sleep(300); }
      }

      // 3. Screen: whole catalogue at 6 spread-out stores
      R.phase = 'screen';
      const step = Math.max(1, Math.floor(R.stores.length / 6));
      R.screen = R.stores.filter((s, i) => i % step === Math.floor(step / 2)).slice(0, 6).map((s) => s.id);
      const bAll = batches(R.codes, 250);
      R.total = R.screen.length * bAll.length;
      await pool(R.screen.flatMap((sid) => bAll.map((b) => () => lookup(sid, b))), 6);
      const cand = new Set();
      for (const sid of R.screen) for (const code in (R.perStore[sid] || {})) { const r = R.perStore[sid][code]; if (r[1] < r[3] - 0.005) cand.add(code); }
      R.cand = [...cand];
      for (const sid of R.screen) { try { await put('store:' + sid, R.perStore[sid]); } catch (e) {} }

      // 4. Full: every candidate at every other store
      R.phase = 'full'; R.done = 0;
      const bC = batches(R.cand, 250);
      const rest = R.stores.map((s) => s.id).filter((id) => R.screen.indexOf(id) < 0);
      R.total = rest.length * bC.length;
      const left = {}; rest.forEach((sid) => (left[sid] = bC.length));
      await pool(rest.flatMap((sid) => bC.map((b) => async () => { await lookup(sid, b); if (--left[sid] === 0) { try { await put('store:' + sid, R.perStore[sid]); } catch (e) {} } })), 6);
      R.finished = true; R.ended = Date.now(); R.phase = 'done';
    } catch (e) { R.fatal = String(e && e.message || e); }
  })();

  window.__buildExport = function () {
    const ON = R.stores, sIdx = {}; ON.forEach((s, i) => (sIdx[s.id] = i));
    const catList = [], catI = {}; const ci = (l) => { if (!(l in catI)) { catI[l] = catList.length; catList.push(l); } return catI[l]; };
    const deals = {}; let dropDisc = 0, dropZero = 0, dropUnk = 0;
    for (const sid in R.perStore) {
      for (const code in R.perStore[sid]) {
        const [c, cur, curMax, orig, qty, sell] = R.perStore[sid][code];
        if (!window.__isDeep(cur, orig)) continue;
        if (sell === false) { dropDisc++; continue; }
        if (qty === 0) { dropZero++; continue; }
        if (qty == null && sell !== true) { dropUnk++; continue; }
        (deals[c] = deals[c] || []).push([sIdx[sid], cur, curMax, orig, qty == null ? -1 : qty]);
      }
    }
    const items = []; let allStores = 0;
    for (const code in deals) {
      const d = deals[code];
      if (d.length >= ON.length) { allStores++; continue; }
      const p = R.meta[code] || {};
      const cats = Object.keys(R.cat[code] || {}).map(ci);
      if (!cats.length) cats.push(ci('Other'));
      items.push([code, p.t || '', p.u || '', p.b || '', p.sku || '', [...new Set(cats)], p.m ? 1 : 0, d.sort((a, b) => a[1] - b[1]), String(p.i || '').replace('https://media-www.marks.com/', '')]);
    }
    return { generated: new Date(R.started).toISOString(), storeCount: ON.length, storesScanned: Object.keys(R.perStore).length, excludedAllStores: allStores, dropped: { discontinued: dropDisc, noStock: dropZero, unknown: dropUnk }, catalogue: R.codes.length, candidates: R.cand ? R.cand.length : 0, stores: ON.map((s) => [s.id, s.name, s.addr || '', s.lat, s.lng]), cats: catList, items };
  };
  window.__download = function (obj, name) {
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000); return blob.size;
  };
  return 'marks scan started';
})();
