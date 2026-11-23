// RONA Ontario scan: every product at 50% off or more, per store. Run in a rona.ca tab (e.g. https://www.rona.ca/en/promotions/clearance).
// Starts a background job: window.__RA. Uses only the site's own pages, one request at a time with a 350 ms pause:
//   GET /webapp/wcs/stores/servlet/RonaStoreSelectionSummary   (store list, embedded as a JS array)
//   GET /en/promotions/clearance, /en/promotions/weekly-deals   (the departments of both lists, read once at a big-box store)
//   GET /webapp/wcs/stores/servlet/RonaPromoClearanceView      (the clearance list for the selected store, 96 per page, the most the site allows)
//   GET /webapp/wcs/stores/servlet/RonaPromoFlyerView&searchFilter=inStockStore
//                                                              (the weekly deals in stock at the selected store; added 2026-11-23)
// Clearance and weekly deals are where every discounted RONA product is listed (the site menu's Deals & Flyer section has only these two).
// Weekly deals are about 25,000 products, but with the site's own "In stock at <store>" filter a big store has about 1,700 (18 pages) and a
// small store a few hundred; deals here need stock anyway, so nothing is lost. Weekly-deal prices differ from store to store (checked
// 2026-11-23: Welland vs Etobicoke 89 of 96 the same, Bancroft vs Etobicoke 51 of 71), so every store's own list is read.
// Speed-up (2026-11-19): each store's clearance is read as ONE list across all departments instead of department by department
// (Welland: 19 pages instead of 30; a store with no clearance: 1 request instead of 18; about 2,000 pages for all 115 stores, roughly 50 minutes;
// the first full run did its first 101 stores, 1,451 pages, in 37 minutes with no errors).
// Every product on the list carries the site's category code (e.g. 01-131); page 1 of each department, read once at the start,
// maps those codes to the department names (each department is exactly one code, checked on all 18 at Welland).
// The selected store is the cookie RonaWCCookie.stores.selected (the site's own store picker sets the same cookie). It is set again before
// every request and checked on every page, so a store change from anywhere else (another rona.ca tab, the owner browsing) can never mix one
// store's items into another's. A store with a failed or mismatched page is retried once at the end and, if it still fails, listed as
// incomplete in the export. The original cookie values are restored when the job ends.
// If a request gets a challenge page or 403/429/503 the job stops; it never tries to get around it.
{
  const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
  const waits = {}; let n = 0;
  w.onmessage = e => { const f = waits[e.data]; delete waits[e.data]; if (f) f(); };
  window.__rsleep = ms => new Promise(res => { const id = ++n; waits[id] = res; w.postMessage({ id, ms }); });
}
window.__raDownload = function (obj, name) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  return blob.size;
};
(async () => {
  const R = window.__RA = { phase: 'stores', done: 0, total: 0, errs: [], finished: false, aborted: null, requests: 0, items: 0, incomplete: [], started: Date.now() };
  const pause = ms => window.__rsleep(ms);
  const getCk = n => { const m = document.cookie.split('; ').find(c => c.startsWith(n + '=')); return m ? m.slice(n.length + 1) : null; };
  const setCk = (n, v) => { document.cookie = n + '=' + v + '; path=/'; };
  const orig = { sel: getCk('RonaWCCookie.stores.selected'), size: getCk('RonaWCCookie.storesize') };
  const restore = () => { if (orig.sel) setCk('RonaWCCookie.stores.selected', orig.sel); if (orig.size) setCk('RonaWCCookie.storesize', orig.size); };
  const select = s => { setCk('RonaWCCookie.stores.selected', s.id); setCk('RonaWCCookie.storesize', s.size); };
  const BASE = '/webapp/wcs/stores/servlet/RonaPromoClearanceView';
  const listUrl = (page, dept, view, inStock) => (view ? '/webapp/wcs/stores/servlet/' + view : BASE) + '?' + (dept ? 'navDescriptors=' + dept + '&' : '') + 'catalogId=10051&keywords=*&searchKey=&page=' + page + '&pageSize=96&langId=-1&storeId=10151' + (inStock ? '&searchFilter=inStockStore' : '');
  const LISTS = [['RonaPromoClearanceView', false, 'clearance'], ['RonaPromoFlyerView', true, 'weekly']];
  const get = async (url, what) => {
    for (let t = 0; t < 2; t++) {
      R.requests++;
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (r.status === 403 || r.status === 429 || r.status === 503) { R.errs.push({ what, status: r.status }); R.aborted = 'blocked ' + r.status; return null; }
        if (!r.ok) { R.errs.push({ what, status: r.status }); await pause(2000); continue; }
        const h = await r.text();
        if (/captcha-delivery|geo\.captcha|datadome.*captcha/i.test(h.slice(0, 5000)) && h.length < 20000) { R.errs.push({ what, status: 'challenge' }); R.aborted = 'challenge page'; return null; }
        return h;
      } catch (e) { R.errs.push({ what, status: 'net' }); await pause(2000); }
    }
    return null;
  };
  const codeRe = /"partNumber":"(\d+)"[^<]*?"categoryHierarchies":\[\{"categories":\[\{"identifier":"([^"]+)"/g;
  const pageCount = d => {
    const pc = d.querySelector('[data-page-count]'); if (pc && +pc.getAttribute('data-page-count') > 0) return +pc.getAttribute('data-page-count');
    const pm = /(\d+)\s*See All/.exec((d.querySelector('.pagination') || { textContent: '' }).textContent.replace(/\s+/g, ' ')); return pm ? +pm[1] : 1;
  };
  let stores = [];
  try {
    // ---- stores
    const sh = await get('/webapp/wcs/stores/servlet/RonaStoreSelectionSummary?langId=-1&storeId=10151&catalogId=10051&latitudeOverlay=44.39&longitudeOverlay=-79.69&distance=100&lbAddress=Barrie&isAjax=1', 'stores');
    if (sh) for (const m of sh.matchAll(/\{'id':'(\d+)','la':'([\d.\-]+)','ln':'([\d.\-]+)','n':'((?:[^'\\]|\\.)*)','c':'((?:[^'\\]|\\.)*)','p':'((?:[^'\\]|\\.)*)','b':'[^']*','s':'([^']*)'/g)) {
      if (m[6] !== 'Ontario') continue;
      stores.push({ id: m[1], lat: +m[2], lng: +m[3], name: m[4].replace(/\\u([0-9A-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), city: m[5], size: m[7] });
    }
    stores.sort((a, b) => a.id.localeCompare(b.id));
    R.storesOn = stores.length; R.total = stores.length;
    if (stores.length < 80) R.aborted = 'too few stores ' + stores.length;

    // ---- departments, and the category code of each (page 1 of every department at one big-box store)
    R.phase = 'depts';
    const ref = stores.find(s => s.size === 'BIG_BOX') || stores[0];
    if (ref) select(ref);
    const dh = R.aborted ? null : await get('/en/promotions/clearance', 'depts');
    await pause(350);
    const depts = [];
    if (dh) {
      const d = new DOMParser().parseFromString(dh, 'text/html');
      for (const a of d.querySelectorAll('a[href*="RonaPromoClearanceView"][href*="navDescriptors"]')) {
        const m = /^\s*(.+?)\s*\((\d+)\)\s*$/.exec(a.textContent.replace(/\s+/g, ' '));
        const id = /navDescriptors=(\d+)/.exec(a.getAttribute('href') || '');
        if (m && id && !depts.some(x => x.id === id[1])) depts.push({ id: id[1], name: m[1] });
      }
    }
    R.depts = depts.length;
    if (depts.length < 8) R.aborted = R.aborted || 'too few departments ' + depts.length;
    const cats = depts.map(d => d.name);
    const codeCat = {};  // category code -> department index
    for (let di = 0; di < depts.length && !R.aborted; di++) {
      select(ref);
      const h = await get(listUrl(1, depts[di].id), 'dept-map');
      await pause(350);
      if (!h) continue;
      const seen = {};
      for (const m of h.matchAll(codeRe)) seen[m[2]] = (seen[m[2]] || 0) + 1;
      const top = Object.entries(seen).sort((a, b) => b[1] - a[1])[0];
      if (top && !(top[0] in codeCat)) codeCat[top[0]] = di;
    }
    // Weekly-deals departments: most are the clearance ones (same category codes); map the codes of the others (e.g. Sports, Recreation and Toys).
    if (ref) select(ref);
    const wh = R.aborted ? null : await get('/en/promotions/weekly-deals', 'weekly-depts');
    await pause(350);
    R.weeklyDepts = 0;
    if (wh) {
      const d = new DOMParser().parseFromString(wh, 'text/html');
      const wd = [];
      for (const a of d.querySelectorAll('a[href*="RonaPromoFlyerView"][href*="navDescriptors"]')) {
        const m = /^\s*(.+?)\s*\((\d+)\)\s*$/.exec(a.textContent.replace(/\s+/g, ' '));
        const id = /navDescriptors=(\d+)/.exec(a.getAttribute('href') || '');
        if (m && id && !wd.some(x => x.id === id[1])) wd.push({ id: id[1], name: m[1] });
      }
      R.weeklyDepts = wd.length;
      for (const w of wd) {
        if (R.aborted || cats.includes(w.name)) continue;
        select(ref);
        const h = await get(listUrl(1, w.id, 'RonaPromoFlyerView', false), 'weekly-dept-map');
        await pause(350);
        if (!h) continue;
        const seen = {};
        for (const m of h.matchAll(codeRe)) seen[m[2]] = (seen[m[2]] || 0) + 1;
        const top = Object.entries(seen).sort((a, b) => b[1] - a[1])[0];
        if (top && !(top[0] in codeCat)) { codeCat[top[0]] = cats.length; cats.push(w.name); }
      }
    }
    R.codesMapped = Object.keys(codeCat).length;
    let other = -1;
    const catOf = code => { if (code in codeCat) return codeCat[code]; if (other < 0) { other = cats.length; cats.push('Other'); } return other; };

    // ---- per store: the whole clearance list and the weekly deals in stock there (all departments), 96 per page
    R.phase = 'scan';
    const items = {}; // sku -> {title, url, brand, img, cat, deals:[]}
    R.sample = null; R.pairsSeen = 0; R.mismatchStores = 0; R.pages = 0; R.pagesBy = { clearance: 0, weekly: 0 }; R.dealsBy = { clearance: 0, weekly: 0 }; R.capped = 0;
    const scanStore = async si => {
      const s = stores[si]; let ok = true;
      for (const k in items) items[k].deals = items[k].deals.filter(x => x[0] !== si);  // a retry replaces the earlier partial result
      const storeRe = new RegExp('_selectedStoreId\\s*=\\s*"' + s.id + '"');
      for (const [view, inStock, list] of LISTS) {
      if (!ok || R.aborted) break;
      let page = 1, pages = 1;
      while (page <= pages && !R.aborted) {
        select(s);
        const h = await get(listUrl(page, null, view, inStock), list);
        await pause(350);
        if (!h) { ok = false; break; }
        if (!storeRe.test(h)) {
          R.errs.push({ what: 'store-mismatch', status: s.id }); ok = false;
          if (++R.mismatchStores > 8) R.aborted = 'store cookie not honoured';
          break;
        }
        R.pages++; R.pagesBy[list]++;
        const d = new DOMParser().parseFromString(h, 'text/html');
        // The site stops returning products after about 100 pages of one list; no store's list is near that (largest about 30).
        if (page === 1) { pages = pageCount(d); if (pages > 100) { R.capped++; pages = 100; } }
        const codeOf = {}; for (const m of h.matchAll(codeRe)) codeOf[m[1]] = m[2];
        for (const t of d.querySelectorAll('.product-tile.js-product-tile')) {
          const sku = t.dataset.sku; const price = parseFloat(t.dataset.price); const reg = parseFloat(t.dataset.priceRegular);
          if (!sku || !(price >= 0) || !(reg > 0)) continue;
          R.pairsSeen++;
          if (price > reg * 0.5 + 0.005) continue;
          const sm = /(\d+)\s*in\s*Store/i.exec((t.querySelector('.plp-stock-message') || { textContent: '' }).textContent);
          const qty = sm ? +sm[1] : 0;
          if (qty <= 0) continue;
          let it = items[sku];
          if (!it) {
            const a = t.querySelector('a[href*="/en/product/"]');
            const im = [...t.querySelectorAll('img')].map(i => i.getAttribute('src') || '').find(x => /cdn\.rona\.ca\/images\//.test(x)) || '';
            it = items[sku] = {
              title: ((t.querySelector('.product-tile__title') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
              brand: ((t.querySelector('.product-tile__brand') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
              url: a ? a.getAttribute('href').replace(/^https:\/\/www\.rona\.ca/, '').replace(/[?#].*$/, '') : '',
              img: im.replace(/\?.*$/, ''), cat: catOf(codeOf[sku] || ''), deals: []
            };
          }
          const ex = it.deals.find(x => x[0] === si);
          if (!ex) { it.deals.push([si, price, null, reg, qty]); R.dealsBy[list]++; }
          else if (price < ex[1]) { ex[1] = price; ex[3] = reg; ex[4] = qty; }  // on both lists at this store: keep the lower price
          if (!R.sample) R.sample = { sku, store: s.id, price, reg, qty };
        }
        page++;
      }
      }
      return ok && !R.aborted;
    };
    for (let si = 0; si < stores.length && !R.aborted; si++) {
      if (!(await scanStore(si))) R.incomplete.push(si);
      R.done = si + 1; R.items = Object.keys(items).length;
    }
    for (let si = R.done; si < stores.length; si++) R.incomplete.push(si);  // never reached (stopped early)
    if (R.incomplete.length && !R.aborted) {
      R.phase = 'retry'; await pause(30000);
      const again = R.incomplete.splice(0);
      for (const si of again) if (R.aborted || !(await scanStore(si))) R.incomplete.push(si);
    }

    const used = Object.keys(items).filter(k => items[k].url && items[k].title && items[k].deals.length);
    window.__raExport = () => ({
      generated: new Date(R.started).toISOString(),
      stores: stores.map(s => [Number(s.id), s.name, s.city + ', Ontario', s.lat, s.lng]),
      cats,
      items: used.map(k => { const it = items[k]; return [k, it.title, it.url, it.brand, k, [it.cat], 0, it.deals, it.img]; }),
      storesScanned: R.done, requests: R.requests, incomplete: R.incomplete.map(si => Number(stores[si].id))
    });
    R.items = used.length;
  } catch (e) {
    R.errs.push({ what: 'exception', status: String(e && e.message).slice(0, 80) }); R.aborted = R.aborted || 'exception';
  } finally {
    restore();
    R.finished = true; R.phase = 'done'; R.ended = Date.now();
  }
})();
