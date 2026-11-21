// Amazon.ca wide scan: items anywhere on Amazon.ca (not only its deals list) that are 50% off or more of a list price of $100 or more,
// counting coupons, for name brands in furniture, outdoor & recreation, camping, hunting and farm equipment.
// Run in a signed-OUT amazon.ca tab (any amazon.ca page), after pasting refresh/keepalive.js in the same tab. Starts a background job: window.__AW.
// Amazon search has no "% off" filter, so this reads ordinary search result pages (the same pages a shopper's search opens), one at a time
// with an 800 ms pause, and keeps the cards that show a strikethrough list price. Name brand = the title contains a brand from BRANDS below.
// Stops at once on a CAPTCHA, 403, 429 or 503 (never works around it). Coverage is whatever these searches surface, not every product on Amazon.
{
  const BRANDS = ['Coleman','YETI','Weber','Traeger','Napoleon','Blackstone','Camp Chef','Char-Broil','Solo Stove','Ninja','Dometic','Igloo','Pelican','RTIC','Stanley','Thule','Yakima','Garmin','Bushnell','Vortex','Leupold','Nikon','Burris','Primos','Moultrie','Stealth Cam','Spypoint','Browning','Tasco','Barska','Athlon','Swarovski','Zeiss','Celestron','Hawke','Sightmark','Pulsar','ATN','Muddy','Ameristep','Barnett','TenPoint','Excalibur','Bear Archery','PSE','Hoyt','Mathews','Realtree','Mossy Oak','Under Armour','Carhartt','Sitka','Kryptek','Danner','LaCrosse','Muck','Sig Sauer','Fiocchi','Stack-On','Liberty','Barska','Amazon Basics','Intex','Bestway','Sevylor','Advanced Elements','Perception','Pelican','Old Town','Sun Dolphin','Hobie','Bote','Aqua Marina','Atoll','Gili','Sea Eagle','Zodiac','NRS','Trek','Specialized','Cannondale','Schwinn','Mongoose','Raleigh','Rad Power','Aventon','Segway','Hover-1','Gotrax','Jetson','Razor','Bowflex','NordicTrack','ProForm','Schwinn','Nautilus','Peloton','Concept2','Sunny Health','Marcy','Life Fitness','Spalding','Silverback','Goalrilla','Step2','Little Tikes','Gorilla Playsets','Backyard Discovery','Swing-N-Slide','KidKraft','Skywalker','JumpSport','Springfree','Uniflame','Sunnydaze','Tiki','Hampton Bay','Sunjoy','Abba Patio','Christopher Knight','Safavieh','Ashley','Signature Design','Flash Furniture','Serta','Sealy','Tempur-Pedic','Casper','Zinus','Nectar','Linenspa','Simmons','Beautyrest','Lucid','Novilla','Modway','Homelegance','Bush Furniture','Sauder','Prepac','Walker Edison','Convenience Concepts','Home Styles','South Shore','Winsome','Baxton','Best Choice','Costway','Giantex','Vasagle','Yaheetech','Furinno','Rivet','Stone & Beam','Coaster','Acme','Herman Miller','Steelcase','Secretlab','Autonomous','FlexiSpot','Uplift','La-Z-Boy','Lazy Boy','Human Touch','Osaki','Kahuna','Real Relax','Brookstone','Intex','Husqvarna','Stihl','Echo','Greenworks','EGO','Ryobi','DeWalt','Milwaukee','Makita','Bosch','Craftsman','Black+Decker','Worx','Toro','Cub Cadet','Troy-Bilt','Honda','Yamaha','Generac','Champion','Westinghouse','Pulsar','Predator','Jackery','EcoFlow','Anker','Bluetti','Goal Zero','Oupes','Sun Joe','Kubota','John Deere','Mahindra','Massimo','Kawasaki','Polaris','Can-Am','Kolpin','Titan Attachments','Agri-Fab','Brinly','Swisher','WEN','Boss Industrial','Kobalt','Husky','Wagan','Tuff Stuff','Gallagher','Zareba','Premier1','Tru-Test','Fi-Shock','Little Giant','Rubbermaid','Miller Manufacturing','Backyard Chicken','Omlet','Sony','Samsung','LG','Apple','Bose','JBL','Beats','Sennheiser','Dyson','iRobot','Shark','Roomba','DJI','GoPro','Canon','Fujifilm','Panasonic','Philips','Logitech','Razer','Dell','HP','Lenovo','ASUS','Acer','Microsoft','Google','Ring','Blink','Eufy','Arlo','Nest','Sonos','Vizio','TCL','Hisense','Roku','Fitbit','Oura','Whoop','Insta360','Theragun','Hyperice','Osprey','Gregory','Deuter','The North Face','Patagonia','Arc\'teryx','Marmot','MSR','Big Agnes','NEMO','REI','Kelty','Sierra Designs','Eureka','Ozark Trail','Alps Mountaineering','Teton','Wenzel','Mountain Hardwear','Black Diamond','Petzl','Jetboil','Primus','Sawyer','Katadyn','LifeStraw','Lodge','Hydro Flask','Kershaw','Gerber','Leatherman','Benchmade','SOG','Victorinox','Streamlight','Fenix','Nitecore','Olight','Maglite','Petromax','Rumpl','Therm-a-Rest','Klymit','Sea to Summit','Exped','Redcamp','Shimano','Penn','Daiwa','Abu Garcia','Okuma','St. Croix','Lowrance','Humminbird','Minn Kota','Garmin','Johnson Outdoors','Rapala','Berkley','Ugly Stik','Plano','Flambeau','Cabela\'s','Bass Pro','Hunter\'s Specialties','Wildgame Innovations','Cuddeback','Reconyx','Tactacam','Remington','Winchester','Savage','Ruger','Mossberg','Bergara','Hornady','Nosler','Trijicon','Holosun','Crimson Trace','Hogue','Magpul','Caldwell','Lyman','Frankford Arsenal','Vanguard','Steiner','Meopta','Kowa','Leica','Maven','Irish Setter','Wolverine','Kenetrek','Crispi','Schnee\'s','Badlands','Mystery Ranch','KUIU','First Lite','Scent-Lok','ThermaCell','Banded','Rig\'Em Right','Havalon','Outdoor Edge','Buck Knives','Morakniv','Cold Steel','Spyderco','Cuddelink','Hunters Specialties','API Outdoors','Hawke','Lucid','Sightron','Konus','Gamo','Crosman','Daisy','Umarex','Benjamin','Hatsan','Ravin','Killer Instinct','Wicked Ridge','Excalibur','Bowtech','Escalade','Easton','Gold Tip','Black Eagle','Carbon Express','Muzzy','Grim Reaper','NAP','Trophy Ridge','Axcel','Spot-Hogg','Hamskea','Rinehart','Delta McKenzie','Field Logic','Montana Black Gold','Plano','Thule','Sitka Gear','Walker\'s','Peltor','3M','Howard Leight','Caldwell'];
  const BRAND_LIST = [...new Set(BRANDS)];
  const Q = {
    0: ['sofa', 'sectional sofa', 'loveseat', 'recliner', 'leather couch', 'queen mattress', 'memory foam mattress', 'bed frame', 'platform bed', 'bunk bed', 'dining table set', 'patio furniture set', 'outdoor sectional', 'adirondack chair', 'ergonomic office chair', 'standing desk', 'gaming chair', 'computer desk', 'bookcase', 'tv stand', 'dresser', 'nightstand', 'wardrobe', 'accent chair', 'bar stools', 'massage chair', 'area rug 8x10', 'ottoman', 'futon', 'ashley furniture', 'serta mattress', 'sealy mattress', 'tempur-pedic', 'la-z-boy', 'herman miller', 'steelcase', 'flexispot', 'zinus', 'flash furniture', 'costway'],
    1: ['kayak', 'inflatable kayak', 'paddle board', 'canoe', 'electric bike', 'mountain bike', 'trampoline', 'fire pit', 'gazebo', 'hot tub', 'above ground pool', 'golf clubs', 'treadmill', 'exercise bike', 'rowing machine', 'pickleball', 'basketball hoop', 'swing set', 'playhouse', 'ping pong table', 'air hockey table', 'pool table', 'hammock', 'patio heater', 'snowshoes', 'snowboard', 'fishing rod reel', 'fish finder', 'electric scooter', 'bowflex', 'nordictrack', 'schwinn', 'intex pool', 'bestway pool', 'segway', 'trek bike', 'step2', 'little tikes', 'gorilla playset', 'backyard discovery'],
    2: ['camping tent', 'cabin tent', 'rooftop tent', 'sleeping bag', 'camping cot', 'camping stove', 'portable power station', 'camping generator', 'camping cooler', 'camp chair', 'canopy tent', 'awning', 'backpacking pack', 'camp kitchen', 'portable heater', 'lantern', 'water filter', 'truck tent', 'coleman', 'yeti', 'jackery', 'ecoflow', 'bluetti', 'anker solix', 'goal zero', 'dometic', 'osprey', 'msr', 'big agnes', 'nemo', 'the north face tent', 'traeger', 'weber', 'blackstone griddle', 'camp chef', 'solo stove'],
    3: ['rifle scope', 'binoculars', 'laser rangefinder', 'trail camera', 'tree stand', 'hunting blind', 'crossbow', 'compound bow', 'night vision', 'thermal monocular', 'gun safe', 'game cart', 'deer feeder', 'hunting boots', 'hunting jacket', 'scope mount', 'spotting scope', 'hunting pack', 'vortex', 'bushnell', 'leupold', 'nikon', 'garmin', 'sitka', 'moultrie', 'spypoint', 'tenpoint', 'barnett', 'muddy', 'stack-on', 'liberty safe', 'swarovski', 'zeiss', 'pulsar'],
    4: ['tractor', 'log splitter', 'wood chipper', 'chicken coop', 'utility vehicle', 'atv', 'utility cart', 'tractor attachment', 'post hole digger', 'livestock panel', 'electric fence', 'water trough', 'skid steer attachment', 'pressure washer', 'generator', 'chainsaw', 'brush cutter', 'garden tiller', 'wheelbarrow', 'hay feeder', 'greenhouse', 'snow blower', 'riding mower', 'zero turn mower', 'husqvarna', 'stihl', 'echo', 'ego', 'greenworks', 'kubota', 'john deere', 'generac', 'champion generator', 'honda generator', 'westinghouse', 'toro', 'cub cadet', 'dewalt', 'milwaukee', 'makita']
  };
  const EXTRA3 = ['hunting clothing','hunting bibs','hunting socks','hunting gloves','hunting rain gear','hunting vest','hunting backpack','blaze orange vest','waders','chest waders','hunting knife','game processing','meat grinder','deer call','duck call','turkey call','decoy','duck decoys','hunting binoculars','rangefinder binoculars','ground blind','pop up blind','climbing tree stand','ladder stand','hang on tree stand','safety harness','bow sight','bow case','arrow','archery target','bow stand','crossbow scope','red dot sight','holographic sight','gun cleaning kit','gun case','rifle case','shooting rest','shooting bench','bipod','shooting glasses','ear protection electronic','hunting headlamp','hunting flashlight','handheld spotlight','thermal scope','digital night vision','cellular trail camera','solar panel trail camera','game camera','deer stand','feeder','ATV rack','gun rack','gun safe','cabela\'s','bass pro','moultrie game camera','browning trail camera','sitka jacket','under armour hunting','carhartt','irish setter boots','rocky boots','kenetrek','scent-lok','thermacell','banded','avery decoys','havalon','buck knife'];  // hunting gear added 2026-11-21
  if (window.__AW_ONLY_EXTRA) { for (const k in Q) delete Q[k]; Q[3] = EXTRA3; } else { Q[3] = Q[3].concat(EXTRA3); }
  const PAGES = 2, PAUSE = 800;
  const R = window.__AW = { phase: 'scan', q: '', done: 0, total: 0, cards: 0, errs: [], finished: false, aborted: null, hits: 0 };
  const found = {};  // asin -> { c: card, cats: Set }
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const num = e => e ? parseFloat(e.textContent.replace(/[^0-9.]/g, '')) : NaN;
  const queue = [];
  for (const ci in Q) for (const q of Q[ci]) queue.push([q, +ci]);
  R.total = queue.length * PAGES;
  window.__awDownload = function (obj, name) {
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    return blob.size;
  };
  const parse = (html) => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    if (/captcha|robot check|enter the characters/i.test(d.title + ' ' + (d.body ? d.body.textContent.slice(0, 600) : ''))) return null;
    const out = [];
    d.querySelectorAll('[data-component-type="s-search-result"]').forEach(c => {
      const asin = c.getAttribute('data-asin'); if (!asin) return;
      const cur = num(c.querySelector('.a-price:not(.a-text-price) .a-offscreen'));
      const was = num(c.querySelector('.a-price.a-text-price .a-offscreen'));
      if (!(was >= 100 && cur > 0)) return;  // only cards that can qualify are kept
      const h = c.querySelector('h2'), a = c.querySelector('h2 a') || c.querySelector('a.a-link-normal.s-link-style');
      const cp = c.querySelector('.s-coupon-unclipped, [class*=couponBadge], span[class*=coupon]');
      const cpt = cp ? cp.textContent.replace(/\s+/g, ' ').trim() : '';
      let eff = cur, note = '';
      const pay = cpt.match(/You pay \$([\d,]+(?:\.\d+)?)/i);
      const pct = cpt.match(/Save (\d+)%/i), off = cpt.match(/Save \$([\d,]+(?:\.\d+)?)/i);
      if (pay) { eff = parseFloat(pay[1].replace(/,/g, '')); note = 'coupon applied'; }
      else if (pct) { eff = Math.round(cur * (100 - +pct[1])) / 100; note = pct[1] + '% coupon'; }
      else if (off) { eff = Math.round((cur - parseFloat(off[1].replace(/,/g, ''))) * 100) / 100; note = '$' + off[1] + ' coupon'; }
      const img = c.querySelector('img.s-image');
      out.push({ asin, t: h ? h.textContent.replace(/\s+/g, ' ').trim() : '', href: a ? a.getAttribute('href') : '', cur, was, eff, note, cpt: cpt.slice(0, 80), img: img ? img.getAttribute('src') : '' });
    });
    return out;
  };
  (async () => {
    let bad = 0;
    for (const [q, ci] of queue) {
      R.q = q;
      for (let pg = 1; pg <= PAGES && !R.aborted; pg++) {
        let r;
        try { r = await fetch('/s?k=' + encodeURIComponent(q) + (pg > 1 ? '&page=' + pg : ''), { credentials: 'include' }); }
        catch (e) { R.errs.push({ q, status: String(e && e.message).slice(0, 40) }); if (++bad > 5) R.aborted = 'too many errors'; await sleep(3000); continue; }
        if (r.status === 403 || r.status === 429 || r.status === 503) { R.aborted = 'blocked ' + r.status; break; }
        if (!r.ok) { R.errs.push({ q, status: r.status }); if (++bad > 5) R.aborted = 'too many errors'; continue; }
        const cards = parse(await r.text());
        if (cards === null) { R.aborted = 'captcha'; break; }
        bad = 0; R.done++;
        for (const c of cards) { const f = found[c.asin] || (found[c.asin] = { c, cats: new Set() }); f.cats.add(ci); }
        R.cards = Object.keys(found).length;
        await sleep(PAUSE);
      }
      if (R.aborted) break;
    }
    // Export: 50% off or more of a list price of $100 or more (coupon counted), name brands only.
    const items = [];
    const lower = s => s.toLowerCase();
    const norm = s => ' ' + lower(s).replace(/[^a-z0-9+&' ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    for (const asin in found) {
      const { c, cats } = found[asin];
      if (!(c.eff > 0 && c.eff <= c.was * 0.5 + 0.005)) continue;
      const m = /^\/[A-Za-z0-9%_.\-]{1,200}\/dp\/[A-Z0-9]{10}/.exec(c.href || '');
      const path = m ? m[0] : '/dp/' + asin;
      const tl = norm(c.t);
      let brand = '';
      for (const b of BRAND_LIST) { if (tl.includes(norm(b))) { brand = b; break; } }
      if (!brand && !window.__AW_ANY) continue;  // window.__AW_ANY = true keeps unbranded items too (brand is '')
      items.push({ asin, t: c.t, path, brand, cur: c.cur, was: c.was, eff: c.eff, note: c.note, img: c.img, cats: [...cats].sort() });
    }
    window.__awItems = items;
    R.hits = items.length; R.found = Object.keys(found).length; R.finished = true; R.phase = 'done';
  })().catch(e => { R.errs.push({ what: 'exception', status: String(e && e.message).slice(0, 80) }); R.aborted = R.aborted || 'exception'; R.finished = true; R.phase = 'done'; });
}
