import json, re, sys, math

raw_path, out_path = sys.argv[1], sys.argv[2]
with open(raw_path, encoding="utf-8") as f:
    raw = json.load(f)

def s(v, n=300):
    if not isinstance(v, str):
        return ""
    v = re.sub(r"[\x00-\x1f\x7f]", " ", v).strip()
    return v[:n]

def money(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 or v > 100000:
        return None
    return round(float(v), 2)

stores = []
for st in raw["stores"]:
    sid, name, addr, lat, lng = st
    if not isinstance(sid, int):
        raise ValueError(f"bad store id {sid!r}")
    lat = lat if isinstance(lat, (int, float)) and 41 < lat < 57 else None
    lng = lng if isinstance(lng, (int, float)) and -96 < lng < -74 else None
    stores.append([sid, s(name, 80), s(addr, 200), lat, lng])

cats = [s(c, 60) for c in raw["cats"]]
nstores = len(stores)
path_re = re.compile(r"^/en/pdp/[a-z0-9\-]+\.html$")
img_re = re.compile(r"^(product/[A-Za-z0-9/_.\-]+|https://media-www\.(canadiantire|partycity)\.ca/[A-Za-z0-9/_.\-]+)$")

items, dropped = [], {"bad_url": 0, "no_deals": 0, "all_stores": 0, "bad_price": 0}
for it in raw["items"]:
    code, title, url, brand, sku, cidx, multi, deals = it[:8]
    img = it[8] if len(it) > 8 and isinstance(it[8], str) and img_re.match(it[8]) else ""
    if not isinstance(url, str) or not path_re.match(url):
        dropped["bad_url"] += 1
        continue
    clean = []
    seen = set()
    for d in deals:
        si, sale, sale_max, orig = d[:4]
        qty = d[4] if len(d) > 4 else None
        qty = qty if isinstance(qty, int) and not isinstance(qty, bool) and 0 <= qty < 100000 else None
        sale, sale_max, orig = money(sale), money(sale_max), money(orig)
        if not isinstance(si, int) or not (0 <= si < nstores) or si in seen:
            continue
        if sale is None or orig is None or orig <= 0 or not (sale <= orig * 0.5 + 0.005):
            dropped["bad_price"] += 1
            continue
        if qty == 0:
            dropped["no_stock"] = dropped.get("no_stock", 0) + 1
            continue
        seen.add(si)
        clean.append([si, sale, sale_max if sale_max and sale_max != sale else None, orig, qty])
    if not clean:
        dropped["no_deals"] += 1
        continue
    if len(clean) >= nstores:
        dropped["all_stores"] += 1
        continue
    cidx = sorted({c for c in cidx if isinstance(c, int) and 0 <= c < len(cats)})
    clean.sort(key=lambda d: d[1])
    items.append([s(code, 20), s(title), url, s(brand, 80), s(sku, 20), cidx, 1 if multi else 0, clean, img])

out = {
    "generated": s(raw["generated"], 40),
    "storeCount": nstores,
    "stores": stores,
    "cats": cats,
    "items": items,
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

pairs = sum(len(i[7]) for i in items)
one = sum(1 for i in items if len(i[7]) == 1)
print(json.dumps({"stores": nstores, "items": len(items), "pairs": pairs, "single_store": one,
                  "uncategorized": sum(1 for i in items if not i[5]), "dropped": dropped,
                  "excluded_all_stores_in_export": raw.get("excludedAllStores"),
                  "removed_in_browser": raw.get("dropped"),
                  "with_image": sum(1 for i in items if i[8]),
                  "with_stock_count": sum(1 for i in items for d in i[7] if d[4] is not None),
                  "stores_scanned": raw.get("storesScanned")}, indent=1))
