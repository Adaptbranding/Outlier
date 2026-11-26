// Bass Pro Shops Canada scan (basspro.ca). Run in Chrome on https://www.basspro.ca/l/bargain-cave-sale-and-clearance-shop-all (signed out).
// The site shows one online price per product (stock differs by store, price does not), so this is a one-"store" retailer like Amazon.ca.
// It pages through the site's own Sale list the way a visitor does (the site's own #numberOfResults / #firstResult / #f-category URL
// state, 108 products per page, about 41 pages), then once per top Category to label the products. About 1.5 s between pages.
// Starts a background job in window.__B and returns at once. Poll with:
//   JSON.stringify({phase:__B.phase,page:__B.page,total:__B.total,items:Object.keys(__B.items).length,cats:__B.catDone,errs:__B.errs.length,finished:__B.finished})
// Export with:  window.__download(window.__bpExport(), 'bp-<date>-<time>.json')   (unique file name; paste keepalive.js first)
(function () {
  if (!/\/l\/bargain-cave-sale-and-clearance-shop-all/.test(location.pathname)) return 'open the Bargain Cave Sale list first';
  const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' })));
  const waits = {}; let wn = 0; w.onmessage = (e) => { const f = waits[e.data]; delete waits[e.data]; if (f) f(); };
  const sleep = (ms) => new Promise((res) => { const id = ++wn; waits[id] = res; w.postMessage({ id, ms }); });
  const B = window.__B = { phase: 'list', page: 0, total: 0, items: {}, catOf: {}, cats: [], catDone: 0, errs: [], finished: false, started: Date.now() };
  const PRICE = /^\$([\d,]+\.\d\d)(?:\s*-\s*\$([\d,]+\.\d\d))?$/;
  const num = (s) => parseFloat(String(s).replace(/,/g, ''));
  const showing = () => { const m = document.body.innerText.match(/Showing:\s*([\d,]+)\s*-\s*([\d,]+)\s*of\s*([\d,]+)/); return m ? [num(m[1]), num(m[2]), num(m[3])] : null; };
  const cards = () => [...document.querySelectorAll('[class*=styles_ResultItem]')].filter((e) => e.querySelector('a[href^="/p/"]') && e.innerText.includes('$'));

  function parse(card) {
    const a = card.querySelector('a[href^="/p/"]');
    const slug = (a.getAttribute('href') || '').split('?')[0].replace(/^\/p\//, '');
    const L = card.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    const pl = L.filter((l) => PRICE.test(l));
    if (!slug || pl.length < 2) return null; // no regular price shown = not a deal
    const m1 = pl[0].match(PRICE), m2 = pl[1].match(PRICE);
    const c = [num(m1[1]), m1[2] ? num(m1[2]) : null], o = [num(m2[1]), m2[2] ? num(m2[2]) : null];
    // Best pair: cheapest option against its regular price (ranges are lined up low-to-low, high-to-high).
    let sale = c[0], orig = o[0];
    if (c[1] != null && o[1] != null && o[1] > 0 && 1 - c[1] / o[1] > 1 - c[0] / o[0]) { sale = c[1]; orig = o[1]; }
    else if (c[1] != null && o[1] == null) { sale = c[0]; orig = o[0]; }
    const img = card.querySelector('img');
    let im = ''; if (img) { const mm = (img.currentSrc || img.src || '').match(/\/ProductImages\/([A-Za-z0-9\/_.\-]+)/); if (mm) im = 'ProductImages/' + mm[1]; }
    return { slug, title: (L.find((l) => !/^\+\d+$/.test(l) && !/^new!?$/i.test(l) && l.length > 2) || ''), sale, orig, range: c[1] != null || o[1] != null, img: im, said: (L.find((l) => /^Save\b/.test(l)) || ''), tag: (L.find((l) => /^(Clearance|Sale)$/i.test(l)) || '') };
  }

  async function page(hash, off, expectTotal) {
    for (let t = 0; t < 3; t++) {
      location.hash = hash;
      const t0 = Date.now(); let s = null;
      while (Date.now() - t0 < 15000) { await sleep(400); s = showing(); if (s && s[0] === off + 1 && cards().length) { if (expectTotal == null || s[2] === expectTotal) break; } s = null; }
      if (s) { await sleep(500); const out = []; const seen = new Set(); for (const c of cards()) { const p = parse(c); const raw = c.querySelector('a[href^="/p/"]').getAttribute('href').split('?')[0]; if (seen.has(raw)) continue; seen.add(raw); out.push(p || { skip: raw.replace(/^\/p\//, '') }); } return { s, out }; }
      B.errs.push({ hash, off, t, at: Date.now() });
      await sleep(4000 * (t + 1));
    }
    return null;
  }

  (async () => {
    try {
      // Top Category facet values (name, count) from the filter panel.
      const t = document.body.innerText, i = t.indexOf('\nCategory\n'), j = t.indexOf('View All', i);
      const lines = t.slice(i + 10, j).split('\n').map((s) => s.trim()).filter(Boolean);
      for (let k = 0; k + 1 < lines.length; k += 2) { const n = lines[k], c = num(lines[k + 1].replace(/[()]/g, '')); if (n && c > 0) B.cats.push([n, c]); }
      // 1. the whole Sale list
      let off = 0;
      for (;;) {
        B.page++;
        const r = await page('#numberOfResults=108&firstResult=' + off, off, null);
        if (!r) { B.errs.push({ stop: 'list', off }); break; }
        B.total = r.s[2];
        for (const p of r.out) { if (p.skip) { B.items[p.skip] = B.items[p.skip] || null; continue; } B.items[p.slug] = p; }
        off += 108; if (off >= r.s[2]) break;
        await sleep(1500);
      }
      if (window.__BP_LIST_ONLY) { location.hash = '#numberOfResults=108'; B.phase = 'done'; B.finished = true; return; } // per-store runs only need prices
      // 2. label products by Category, top values only
      B.phase = 'cats';
      for (const [name, cnt] of B.cats) {
        let o2 = 0;
        for (;;) {
          const r = await page('#f-category=' + encodeURIComponent(name) + '&numberOfResults=108&firstResult=' + o2, o2, cnt);
          if (!r) { B.errs.push({ stop: 'cat', name, o2 }); break; }
          for (const p of r.out) { const sl = p.slug || p.skip; if (sl && !B.catOf[sl]) B.catOf[sl] = name; }
          o2 += 108; if (o2 >= cnt) break;
          await sleep(1500);
        }
        B.catDone++;
      }
      location.hash = '#numberOfResults=108';
      B.phase = 'done'; B.finished = true;
    } catch (e) { B.errs.push({ ex: String(e && e.message || e) }); B.phase = 'error'; B.finished = true; }
  })();

  window.__bpExport = () => JSON.stringify({ generated: new Date().toISOString(), store: ((document.body.innerText.match(/My Store:\s*\n?([^\n]+)/) || [])[1] || '').trim(), total: B.total, cats: B.cats, errs: B.errs.filter((e) => e.stop || e.ex).length, retries: B.errs.length, items: Object.values(B.items).filter(Boolean).map((p) => Object.assign({ cat: B.catOf[p.slug] || '' }, p)) });
  window.__download = window.__download || function (text, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  return 'started';
})();
