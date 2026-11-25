// Price range slider shared by every deal page.
//   PriceFilter.mount(el, onChange)   build the control inside el; onChange() runs when either handle moves
//   PriceFilter.setPrices(numbers)    set the slider's range from every sale price on the page
//   PriceFilter.addPrices(numbers)    widen the range (Search all loads one retailer at a time)
//   PriceFilter.test(price)           true when the price is inside the chosen range
// The scale is logarithmic because prices run from about $1 to several thousand dollars; a straight line would
// leave nearly all the handle travel to the dearest items. Parking a handle at its end means "no limit" on that
// side, so a new daily scan with a higher top price is never cut off by an old setting. The setting is not saved
// between visits for the same reason.
(function () {
  const STEPS = 1000;
  let lo = Infinity, hi = -Infinity, min = null, max = null, onChange = null, els = null;

  const span = () => Math.log((hi + 1) / (lo + 1));
  const nice = (v) => {
    const s = v < 10 ? 0.5 : v < 100 ? 1 : v < 1000 ? 5 : v < 5000 ? 10 : 50;
    return Math.round(v / s) * s;
  };
  const toVal = (t) => Math.min(hi, Math.max(lo, nice((lo + 1) * Math.exp(span() * t / STEPS) - 1)));
  const toPos = (v) => Math.round(STEPS * Math.log((v + 1) / (lo + 1)) / span());
  const money = (v) => '$' + (v < 10 && v % 1 ? v.toFixed(2) : Math.round(v).toLocaleString('en-CA'));
  const ready = () => isFinite(lo) && hi > lo;

  function label() {
    if (min == null && max == null) return 'Any price';
    if (min == null) return 'Up to ' + money(max);
    if (max == null) return money(min) + ' and up';
    return money(min) + ' – ' + money(max);
  }

  function paint() {
    if (!els) return;
    els.box.hidden = !ready();
    if (!ready()) return;
    const a = min == null ? 0 : Math.min(STEPS, Math.max(0, toPos(min)));
    const b = max == null ? STEPS : Math.min(STEPS, Math.max(0, toPos(max)));
    els.a.value = a; els.b.value = b;
    els.box.style.setProperty('--pa', (a / STEPS * 100) + '%');
    els.box.style.setProperty('--pb', (b / STEPS * 100) + '%');
    els.out.textContent = label();
    els.a.setAttribute('aria-valuetext', min == null ? 'No minimum' : money(min));
    els.b.setAttribute('aria-valuetext', max == null ? 'No maximum' : money(max));
    els.box.classList.toggle('on', min != null || max != null);
  }

  function read(which) {
    let a = +els.a.value, b = +els.b.value;
    if (a > b) { if (which === 'a') a = b; else b = a; els.a.value = a; els.b.value = b; }
    min = a <= 0 ? null : toVal(a);
    max = b >= STEPS ? null : toVal(b);
    paint();
    if (onChange) onChange();
  }

  const api = window.PriceFilter = {
    mount(el, cb) {
      onChange = cb;
      el.innerHTML = '<div class="pf" hidden role="group" aria-label="Price range">' +
        '<span class="tag">Price</span><output class="pfv" aria-live="polite">Any price</output>' +
        '<div class="pftrack"><input class="pfa" type="range" min="0" max="' + STEPS + '" step="1" value="0" aria-label="Minimum price">' +
        '<input class="pfb" type="range" min="0" max="' + STEPS + '" step="1" value="' + STEPS + '" aria-label="Maximum price"></div></div>';
      els = { box: el.firstChild, out: el.querySelector('.pfv'), a: el.querySelector('.pfa'), b: el.querySelector('.pfb') };
      els.a.addEventListener('input', () => read('a'));
      els.b.addEventListener('input', () => read('b'));
      paint();
    },
    setPrices(list) { lo = Infinity; hi = -Infinity; api.addPrices(list); },
    addPrices(list) {
      for (const p of list) if (typeof p === 'number' && p > 0 && isFinite(p)) { if (p < lo) lo = p; if (p > hi) hi = p; }
      if (isFinite(lo)) { lo = Math.floor(lo); hi = Math.ceil(hi); }
      paint();
    },
    test(p) {
      if (min == null && max == null) return true;
      if (typeof p !== 'number' || !isFinite(p)) return false;
      return (min == null || p >= min - 0.005) && (max == null || p <= max + 0.005);
    },
    get range() { return { min, max, lo, hi }; }
  };
})();
