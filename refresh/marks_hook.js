// Mark's: capture the headers the site sends to its own search API, so marks_scan.js can reuse them.
// 1. Open https://www.marks.com/en/sale-clearance/sale.html in Chrome (the Claude in Chrome tab).
// 2. Paste this whole file into the page (javascript_tool). It returns "hook installed".
// 3. Click the "Goto Next Page" link (page 2) so the site makes one search call. The page navigates inside the same tab
//    without a reload, so the hook survives. window.__cap then holds {url, h} (the request headers).
// 4. Paste marks_scan.js, then keepalive.js (see README: background tabs are throttled).
(function () {
  window.__cap = null;
  const isSearch = (u) => /\/search\/v2\/search/.test(u || '');
  const of = window.fetch;
  window.fetch = function (u, o) {
    try {
      const url = typeof u === 'string' ? u : u.url;
      if (isSearch(url)) {
        const h = {};
        const hh = (o && o.headers) || (u && u.headers);
        if (hh) { if (hh.forEach && !Array.isArray(hh)) hh.forEach((v, k) => (h[k] = v)); else Object.assign(h, hh); }
        window.__cap = { url, h };
      }
    } catch (e) {}
    return of.apply(this, arguments);
  };
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.setRequestHeader, xn = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__h) this.__h[k] = v; return xs.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () { if (isSearch(this.__u)) window.__cap = { url: this.__u, h: this.__h }; return xn.apply(this, arguments); };
  return 'hook installed';
})();
