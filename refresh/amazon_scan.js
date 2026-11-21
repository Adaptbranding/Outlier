// Amazon.ca sale-list scan: deals that are 50% off or more where the "Was/List" price is $100 or more, in Electronics, Tools & Home
// Improvement, Sports & Outdoors, Home & Kitchen and Patio, Lawn & Garden. Run in a signed-OUT amazon.ca tab (https://www.amazon.ca/gp/goldbox, which redirects to the current
// promotions page). Starts a background job: window.__AMZ. Amazon has no store-level prices, so the file has one "store" (Amazon.ca).
// Uses only the endpoint the deals page itself calls, same-origin, one request at a time with a 400 ms pause:
//   GET /d2b/api/v1/products/search?pageSize=60&startIndex=<n>&rankingContext=...&filters=...   (filters.minDiscount = 50)
// Each department returns well under the 500-product cap Amazon puts on one query (2026-11-21: 189, 269 and 127).
// If a department returns 480 or more products the scan says so in R.errs ("near cap"): split that department (price bands) before trusting it.
{
  const PAGE_TYPE = window.__AMZ_PAGE_TYPE || 'blackfriday';  // pageTypeId of the deals page; change if Amazon renames it after the sale
  const DEPTS = [['Electronics', '677211011'], ['Sports & Outdoors', '2242990011'], ['Tools & Home Improvement', '3006903011'], ['Home & Kitchen', '2206276011'], ['Patio, Lawn & Garden', '6299024011']];
  const MIN_LIST = 100, MAX_RATIO = 0.5;
  const R = window.__AMZ = { phase: 'scan', dept: '', pages: 0, seen: 0, errs: [], finished: false, aborted: null, perDept: {} };
  const found = {};  // asin -> { p: product, depts: Set }
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  window.__amzDownload = function (obj, name) {
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    return blob.size;
  };
  (async () => {
    for (const [name, id] of DEPTS) {
      R.dept = name; let start = 0, total = 0, guard = 0;
      while (!R.aborted) {
        const filters = { includedDepartments: [id], excludedDepartments: [], includedTags: [], excludedTags: ['restrictedcontent', 'huntingrestrict', 'duplicatedeal'],
          promotionTypes: ['TOP_DEAL', 'LIGHTNING_DEAL', 'BEST_DEAL'], accessTypes: [], brandIds: [], unifiedIds: [], minDiscount: 50 };
        const url = '/d2b/api/v1/products/search?pageSize=60&startIndex=' + start + '&calculateRefinements=false&rankingContext=' +
          encodeURIComponent(JSON.stringify({ pageTypeId: PAGE_TYPE, rankGroup: 'ESPEON_RANKING' })) + '&filters=' + encodeURIComponent(JSON.stringify(filters));
        let j = null;
        for (let t = 0; t < 2 && !j; t++) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (r.status === 403 || r.status === 429 || r.status === 503) { R.aborted = 'blocked ' + r.status; break; }
            if (!r.ok) { R.errs.push({ dept: name, start, status: r.status }); await sleep(2000); continue; }
            j = await r.json();
          } catch (e) { R.errs.push({ dept: name, start, status: String(e && e.message).slice(0, 60) }); await sleep(2000); }
        }
        if (!j) { if (!R.aborted) R.aborted = 'failed ' + name + ' at ' + start; break; }
        const ps = j.products || [];
        for (const p of ps) { const f = found[p.asin] || (found[p.asin] = { p, depts: new Set() }); f.depts.add(name); }
        total += ps.length; R.pages++; R.seen = Object.keys(found).length;
        if (!ps.length || j.nextIndex == null || j.nextIndex <= start || ++guard > 30) break;
        start = j.nextIndex; await sleep(400);
      }
      R.perDept[name] = total;
      if (total >= 480) R.errs.push({ dept: name, status: 'near cap ' + total });
      await sleep(400);
    }
    // ---- Export: keep deals whose list price is $100 or more and whose price is half of it or less.
    const cats = DEPTS.map(d => d[0]);
    const items = [];
    for (const asin in found) {
      const { p, depts } = found[asin];
      const pay = parseFloat(p.price && p.price.priceToPay && p.price.priceToPay.price);
      const was = parseFloat(p.price && p.price.basisPrice && p.price.basisPrice.price);
      if (!(pay > 0 && was >= MIN_LIST && pay <= was * MAX_RATIO + 0.005)) continue;
      if (p.dealDetails && p.dealDetails.state && p.dealDetails.state !== 'AVAILABLE') continue;
      const hi = p.image && (p.image.hiRes || p.image.lowRes);
      const img = hi && hi.baseUrl && hi.extension ? hi.baseUrl + '.' + hi.extension : '';
      items.push([asin, String(p.title || '').slice(0, 300), String(p.link || ''), '', asin, [...depts].map(d => cats.indexOf(d)).sort(), 0, [[0, pay, null, was, null]], img]);
    }
    window.__amzExport = () => ({
      generated: new Date().toISOString(),
      stores: [[1, 'Amazon.ca', 'Online, ships to Ontario', null, null]],
      cats, items, candidates: Object.keys(found).length, storesScanned: 1, incomplete: []
    });
    R.items = items.length; R.finished = true; R.phase = 'done';
  })().catch(e => { R.errs.push({ what: 'exception', status: String(e && e.message).slice(0, 80) }); R.aborted = R.aborted || 'exception'; R.finished = true; R.phase = 'done'; });
}
