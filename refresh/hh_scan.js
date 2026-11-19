// Home Hardware Ontario discount scan (all discounted items, not only clearance). Run in a homehardware.ca tab (any page). Starts a background job: window.__HH.
// Uses only the site's own endpoints, one request at a time with a 350 ms pause:
//   POST /_data/en/storeGeoFindFilter           (the store locator)
//   GET  /_data/en/plp/category/13990/store/<id>  (the whole catalogue, plus the site's own on-sale filter)
//   GET  /en/liquidation/c/13993                (the Online Clearance list)
//   GET  /_data/en/product/bulk-product-data/<ids>/<store>,<warehouse>   (price + stock for that store)
{
  const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
  const waits = {}; let n = 0;
  w.onmessage = e => { const f = waits[e.data]; delete waits[e.data]; if (f) f(); };
  window.__hsleep = ms => new Promise(res => { const id = ++n; waits[id] = res; w.postMessage({ id, ms }); });
}
window.__hhDownload = function (obj, name) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  return blob.size;
};
(async () => {
  const R = window.__HH = { phase: 'stores', done: 0, total: 0, errs: [], finished: false, aborted: null, queries: 0 };
  const pause = ms => window.__hsleep(ms);
  const req = async (url, opt, what) => {
    for (let t = 0; t < 2; t++) {
      try {
        const r = await fetch(url, opt);
        if (r.status === 403 || r.status === 429) { R.errs.push({ what, status: r.status }); if (R.errs.length > 6) R.aborted = 'blocked ' + r.status; await pause(3000); continue; }
        if (!r.ok) { R.errs.push({ what, status: r.status }); await pause(1500); continue; }
        return r;
      } catch (e) { R.errs.push({ what, status: 'net' }); await pause(1500); }
    }
    return null;
  };
  const av = (s, k) => { const v = s.attributes && s.attributes[k]; return Array.isArray(v) ? v[0] : v; };
  const km = (a, b, c, d) => { const r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r; const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

  // ---- Phase 1: every Ontario store (crawl: query at seeds, then at any store not within 2.5 km of a prior query)
  const stores = new Map(); const queried = []; const queue = [];
  for (let la = 42.0; la <= 46.0; la += 0.7) for (let lo = -83.2; lo <= -74.6; lo += 0.9) queue.push([la, lo]);
  for (let la = 46.6; la <= 50.0; la += 1.1) for (let lo = -95.0; lo <= -76.0; lo += 2.0) queue.push([la, lo]);
  for (const la of [51.5, 53.5]) for (const lo of [-93, -88, -84, -80]) queue.push([la, lo]);
  function queued_near(la, lo) { for (const q of queried) if (Math.abs(q[0] - la) < 0.03 && Math.abs(q[1] - lo) < 0.04 && km(q[0], q[1], la, lo) < 2.5) return true; return false; }
  while (queue.length && !R.aborted) {
    const [la, lo] = queue.shift();
    if (queued_near(la, lo)) continue;
    queried.push([la, lo]); R.queries++;
    const r = await req('/_data/en/storeGeoFindFilter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: la, longitude: lo, limit: 50, storeType: '' }) }, 'stores');
    await pause(350);
    if (!r) continue;
    let j; try { j = await r.json(); } catch (e) { continue; }
    const a = Array.isArray(j) ? j : (j.items || j.stores || []);
    for (const s of a) {
      if (!s || !s.code || !s.geo || !s.address || s.address.stateOrProvince !== 'ON') continue;
      if (!stores.has(s.code)) {
        stores.set(s.code, s);
        if (!queued_near(s.geo.lat, s.geo.lng)) queue.push([s.geo.lat, s.geo.lng]);
      }
    }
    R.storesFound = stores.size; R.queueLeft = queue.length;
  }
  const live = [...stores.values()].filter(s => !s.isDisabled && String(av(s, 'tenantStoreclosed')) !== 'true')
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  R.storesOn = live.length;

  // ---- Phase 2: candidate products = everything discounted (not just clearance)
  //  a) the whole catalogue (category 13990, 192 per page) read at one reference store: every item whose sale price is below its list price
  //  b) the site's own "on sale" filter read at 8 stores spread across Ontario (catches discounts the reference store does not have)
  //  c) the Online Clearance list
  R.phase = 'list';
  const T = String.fromCharCode(126);
  const plp = async (store, start, extra, sort) => {
    const r = await req('/_data/en/plp/category/13990/store/' + store + '?sortBy=' + (sort || '') + '&pageSize=192&startIndex=' + start + '&availableInStore=false&excludeUnavailable=false' + (extra || ''), {}, 'plp');
    await pause(350);
    if (!r) return null;
    try { return await r.json(); } catch (e) { return null; }
  };
  const cand = new Set();
  const dropped = it => { const p = it.price || {}; return typeof p.salePrice === 'number' && typeof p.price === 'number' && p.price > 0 && p.salePrice < p.price; };
  const ref = live[0].code;
  R.catalogue = 0; R.catalogueTotal = 0; R.catalogueSeen = 0;
  // The catalogue list holds about 48,800 distinct products (its totalCount says more, but paging past the end answers 400). Read it once, 192 per page.
  const seenAll = new Set();
  for (let start = 0; !R.aborted; start += 192) {
    let j = await plp(ref, start, '', '');
    if (!j && start > 0 && start < 40000) { await pause(3000); j = await plp(ref, start, '', ''); }
    if (!j || !j.items || !j.items.length) { if (!j && start === 0) R.aborted = 'no catalogue'; break; }
    R.catalogueTotal = j.totalCount || R.catalogueTotal;
    for (const it of j.items) { R.catalogue++; seenAll.add(String(it.productCode)); if (dropped(it)) cand.add(String(it.productCode)); }
    R.catalogueSeen = seenAll.size;
    if (start > 120000) break;
  }
  if (!R.aborted && R.catalogueSeen < 40000) R.errs.push({ what: 'catalogue-coverage', status: R.catalogueSeen });
  R.fromCatalogue = cand.size;
  const spread = live.filter((s, i) => i % Math.max(1, Math.floor(live.length / 8)) === 0).slice(0, 8);
  const flt = '&facetValueFilter=' + encodeURIComponent('tenant' + T + 'on-sale-ind:true');
  for (const s of spread) {
    for (let start = 0; !R.aborted && start < 2000; start += 192) {
      const j = await plp(s.code, start, flt);
      if (!j || !j.items || !j.items.length) break;
      for (const it of j.items) if (dropped(it)) cand.add(String(it.productCode));
    }
  }
  const lr = await req('/en/liquidation/c/13993', {}, 'list');
  const html = lr ? await lr.text() : '';
  for (const x of (html.match(/\/p\/(\d+)/g) || [])) cand.add(x.slice(3));
  const ids = [...cand];
  const img = {};
  for (const m of html.matchAll(/homehardware\.sirv\.com\/products\/(\d+)\/(\d+)\.view/g)) img[m[2]] = 'https://homehardware.sirv.com/products/' + m[1] + '/' + m[2] + '.view';
  for (const c of ids) if (!img[c] && /^\d{7}$/.test(c)) img[c] = 'https://homehardware.sirv.com/products/' + c.slice(0, 4) + '/' + c + '.view';
  R.candidates = ids.length;
  if (!ids.length) R.aborted = 'no candidates';

  // ---- Phase 3: price + stock per store
  // 200 products per request (the endpoint answers up to 200 items per call; 300 ids came back capped at 200, 500 gave a 400).
  // Twice as many per request as before, at about the same time per request, so this phase takes about half as long.
  R.phase = 'scan'; R.total = live.length; R.incomplete = [];
  const meta = {}; const deals = {};
  const chunks = []; for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  R.withAnySale = 0; R.sample = null;
  const scanStore = async si => {
    const s = live[si]; const wh = av(s, 'tenantWarehouse') || '1'; let ok = true;
    for (const code in deals) deals[code] = deals[code].filter(d => d[0] !== si);  // a retry replaces the earlier partial result
    for (const ch of chunks) {
      if (R.aborted) { ok = false; break; }
      const r = await req('/_data/en/product/bulk-product-data/' + ch.join(',') + '/' + s.code + ',' + wh, {}, 'bulk');
      await pause(350);
      if (!r) { ok = false; continue; }
      let j; try { j = await r.json(); } catch (e) { ok = false; continue; }
      for (const it of (j.items || [])) {
        const code = String(it.productCode); const p = it.price || {};
        if (!meta[code]) { const c = it.content || {}; meta[code] = { title: c.productName || '', slug: c.seoFriendlyUrl || '', brand: c.brandName || '', cat: c.category || '' }; }
        if (typeof p.salePrice !== 'number' || typeof p.price !== 'number' || p.price <= 0) continue;
        if (p.salePrice > p.price * 0.5 + 0.005) continue;
        if (it.buyability && it.buyability.buyable === false) continue;
        let sq = 0, wq = 0;
        for (const iv of (it.inventory || [])) { if (String(iv.productCode) !== code) continue; if (String(iv.locationCode) === String(s.code)) sq += iv.stockAvailable || 0; else if (String(iv.locationCode) === String(wh)) wq += iv.stockAvailable || 0; }
        if (sq <= 0 && wq <= 0) continue;
        (deals[code] = deals[code] || []).push([si, p.salePrice, null, p.price, sq, wq]);
        if (!R.sample) R.sample = { code, store: s.code, p: { price: p.price, sale: p.salePrice, list: p.effectivePricelistCode }, sq, wq, bz: it.buyability ? Object.keys(it.buyability).slice(0, 8) : null };
      }
    }
    return ok;
  };
  for (let si = 0; si < live.length && !R.aborted; si++) {
    if (!(await scanStore(si))) R.incomplete.push(si);
    R.done = si + 1;
  }
  for (let si = R.done; si < live.length; si++) R.incomplete.push(si);  // never reached (stopped early)
  // Retry pass: one more try for every store with a failed request.
  if (R.incomplete.length && !R.aborted) {
    R.phase = 'retry'; await pause(30000);
    const again = R.incomplete.splice(0);
    for (const si of again) if (R.aborted || !(await scanStore(si))) R.incomplete.push(si);
  }
  for (const code in deals) if (!deals[code].length) delete deals[code];

  // ---- Export
  const cats = [...new Set(Object.keys(deals).map(c => meta[c].cat))];
  const items = Object.keys(deals).map(code => {
    const m = meta[code];
    return [code, m.title, '/en/' + m.slug + '/p/' + code, m.brand, code, [cats.indexOf(m.cat)], 0, deals[code], img[code] || ''];
  });
  window.__hhExport = () => ({
    generated: new Date().toISOString(),
    stores: live.map(s => [Number(s.code), s.name, [s.address.address1, s.address.cityOrTown, s.address.postalOrZipCode].filter(Boolean).join(', '), s.geo.lat, s.geo.lng]),
    cats, items, candidates: ids.length, storesScanned: R.done,
    incomplete: R.incomplete.map(si => Number(live[si].code))
  });
  R.items = items.length; R.finished = true; R.phase = 'done';
})().catch(e => { const R = window.__HH; R.errs.push({ what: 'exception', status: String(e && e.message).slice(0, 80) }); R.aborted = R.aborted || 'exception'; R.finished = true; R.phase = 'done'; });
