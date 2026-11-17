// RONA Ontario clearance scan. Run in a rona.ca tab (e.g. https://www.rona.ca/en/promotions/clearance). Starts a background job: window.__RA.
// Uses only the site's own pages, one request at a time with a 350 ms pause:
//   GET /webapp/wcs/stores/servlet/RonaStoreSelectionSummary   (store list, embedded as a JS array)
//   GET /webapp/wcs/stores/servlet/RonaPromoClearanceView      (the clearance list for the selected store, by department, 96 per page)
// The selected store is the cookie RonaWCCookie.stores.selected (the site's own store picker sets the same cookie).
// The original cookie values are restored when the job ends. If a request gets a challenge page or 403/429 the job stops; it never tries to get around it.
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
  const R = window.__RA = { phase: 'stores', done: 0, total: 0, errs: [], finished: false, aborted: null, requests: 0, items: 0 };
  const pause = ms => window.__rsleep(ms);
  const getCk = n => { const m = document.cookie.split('; ').find(c => c.startsWith(n + '=')); return m ? m.slice(n.length + 1) : null; };
  const setCk = (n, v) => { document.cookie = n + '=' + v + '; path=/'; };
  const orig = { sel: getCk('RonaWCCookie.stores.selected'), size: getCk('RonaWCCookie.storesize') };
  const restore = () => { if (orig.sel) setCk('RonaWCCookie.stores.selected', orig.sel); if (orig.size) setCk('RonaWCCookie.storesize', orig.size); };
  const BASE = '/webapp/wcs/stores/servlet/RonaPromoClearanceView';
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
  try {
    // ---- stores
    const sh = await get('/webapp/wcs/stores/servlet/RonaStoreSelectionSummary?langId=-1&storeId=10151&catalogId=10051&latitudeOverlay=44.39&longitudeOverlay=-79.69&distance=100&lbAddress=Barrie&isAjax=1', 'stores');
    const stores = [];
    if (sh) for (const m of sh.matchAll(/\{'id':'(\d+)','la':'([\d.\-]+)','ln':'([\d.\-]+)','n':'((?:[^'\\]|\\.)*)','c':'((?:[^'\\]|\\.)*)','p':'((?:[^'\\]|\\.)*)','b':'[^']*','s':'([^']*)'/g)) {
      if (m[6] !== 'Ontario') continue;
      stores.push({ id: m[1], lat: +m[2], lng: +m[3], name: m[4].replace(/\\u([0-9A-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), city: m[5], size: m[7] });
    }
    stores.sort((a, b) => a.id.localeCompare(b.id));
    R.storesOn = stores.length; R.total = stores.length;
    if (stores.length < 80) R.aborted = 'too few stores ' + stores.length;

    // ---- departments (ids are the same for every store)
    R.phase = 'depts';
    const first = stores.find(s => s.size === 'BIG_BOX') || stores[0];
    if (first) { setCk('RonaWCCookie.stores.selected', first.id); setCk('RonaWCCookie.storesize', first.size); }
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

    // ---- per store, per department
    R.phase = 'scan';
    const items = {}; // sku -> {title, url, brand, img, cat, deals:[]}
    R.sample = null; R.pairsSeen = 0;
    for (let si = 0; si < stores.length && !R.aborted; si++) {
      const s = stores[si];
      setCk('RonaWCCookie.stores.selected', s.id); setCk('RonaWCCookie.storesize', s.size);
      let verified = false;
      for (let di = 0; di < depts.length && !R.aborted; di++) {
        let page = 1, pages = 1;
        while (page <= pages && !R.aborted) {
          const url = BASE + '?navDescriptors=' + depts[di].id + '&catalogId=10051&keywords=*&searchKey=&page=' + page + '&pageSize=96&langId=-1&storeId=10151';
          const h = await get(url, 'page');
          await pause(350);
          if (!h) break;
          if (!verified) {
            if (!new RegExp('_selectedStoreId\\s*=\\s*"' + s.id + '"').test(h)) { R.errs.push({ what: 'store-mismatch', status: s.id }); if (R.errs.filter(e => e.what === 'store-mismatch').length > 3) R.aborted = 'store cookie not honoured'; break; }
            verified = true;
          }
          const d = new DOMParser().parseFromString(h, 'text/html');
          const tiles = d.querySelectorAll('.product-tile.js-product-tile');
          if (page === 1) { const pm = /(\d+)\s*See All/.exec((d.querySelector('.pagination') || { textContent: '' }).textContent.replace(/\s+/g, ' ')); pages = pm ? +pm[1] : 1; }
          for (const t of tiles) {
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
                img: im.replace(/\?.*$/, ''), cat: di, deals: []
              };
            }
            if (!it.deals.some(x => x[0] === si)) it.deals.push([si, price, null, reg, qty]);
            if (!R.sample) R.sample = { sku, store: s.id, price, reg, qty };
          }
          page++;
        }
      }
      R.done = si + 1; R.items = Object.keys(items).length;
    }

    const used = Object.keys(items).filter(k => items[k].url && items[k].title);
    window.__raExport = () => ({
      generated: new Date().toISOString(),
      stores: stores.map(s => [Number(s.id), s.name, s.city + ', Ontario', s.lat, s.lng]),
      cats,
      items: used.map(k => { const it = items[k]; return [k, it.title, it.url, it.brand, k, [it.cat], 0, it.deals, it.img]; }),
      storesScanned: R.done, requests: R.requests
    });
    R.items = used.length;
  } catch (e) {
    R.errs.push({ what: 'exception', status: String(e && e.message).slice(0, 80) }); R.aborted = R.aborted || 'exception';
  } finally {
    restore();
    R.finished = true; R.phase = 'done';
  }
})();
