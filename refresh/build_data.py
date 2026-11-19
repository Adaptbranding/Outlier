import json, re, sys, math

raw_path, out_path = sys.argv[1], sys.argv[2]
retailer = sys.argv[3] if len(sys.argv) > 3 else "ct"  # "ct" (default), "hh" or "ra"
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
cat_remap = None
if retailer == "hh":
    # Home Hardware's category paths look like "New LBM &HARDLINES/Kitchen/Food Preparation": use the department (second part).
    for st in stores:
        st[2] = re.sub(r"^N/A,\s*", "", st[2])
    dept = [(c.split("/")[1].strip() if c.count("/") >= 1 and c.split("/")[1].strip() else "Other") for c in cats]
    cats = sorted(set(dept))
    cat_remap = [cats.index(d) for d in dept]
nstores = len(stores)
if retailer == "hh":
    path_re = re.compile(r"^/en/[a-z0-9\-]+/p/\d+$")
    img_re = re.compile(r"^https://homehardware\.sirv\.com/products/\d+/\d+\.view$")
elif retailer == "ra":
    path_re = re.compile(r"^/en/product/[a-z0-9\-]+$")
    img_re = re.compile(r"^https://cdn\.rona\.ca/images/[A-Za-z0-9_\-]+\.jpg$")
else:
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
        wq = d[5] if len(d) > 5 and isinstance(d[5], int) and not isinstance(d[5], bool) and 0 <= d[5] < 1000000 else None
        if qty == 0 and not wq:
            dropped["no_stock"] = dropped.get("no_stock", 0) + 1
            continue
        seen.add(si)
        row = [si, sale, sale_max if sale_max and sale_max != sale else None, orig, qty]
        if wq is not None:
            row.append(wq)
        clean.append(row)
    if not clean:
        dropped["no_deals"] += 1
        continue
    if len(clean) >= nstores:
        dropped["all_stores"] += 1
        continue
    if cat_remap is not None:
        cidx = [cat_remap[c] for c in cidx if isinstance(c, int) and 0 <= c < len(cat_remap)]
    cidx = sorted({c for c in cidx if isinstance(c, int) and 0 <= c < len(cats)})
    clean.sort(key=lambda d: d[1])
    items.append([s(code, 20), s(title), url, s(brand, 80), s(sku, 20), cidx, 1 if multi else 0, clean, img])

# Stores the scan could not finish (listed in the export's "incomplete") keep their previous deals from the file being replaced,
# and are listed in "stale" with the date of that data, so a failed store never silently shows as having no deals.
def _sid(x):
    if isinstance(x, bool):
        return None
    if isinstance(x, int):
        return x
    if isinstance(x, str) and x.isdigit():
        return int(x)
    return None

incomplete = {i for i in (_sid(x) for x in (raw.get("incomplete") or [])) if i is not None}
stale = {}
if incomplete:
    new_idx = {st[0]: i for i, st in enumerate(stores)}
    inc_idx = {new_idx[sid] for sid in incomplete if sid in new_idx}
    for it in items:
        it[7] = [d for d in it[7] if d[0] not in inc_idx]
    try:
        with open(out_path, encoding="utf-8") as f:
            prev = json.load(f)
    except (OSError, ValueError):
        prev = None
    if prev:
        prev_ids = [st[0] for st in prev.get("stores", [])]
        prev_stale = prev.get("stale") or {}
        by_code = {it[0]: it for it in items}
        for pit in prev.get("items", []):
            moved = []
            for d in pit[7]:
                if 0 <= d[0] < len(prev_ids) and prev_ids[d[0]] in incomplete and prev_ids[d[0]] in new_idx:
                    moved.append([new_idx[prev_ids[d[0]]]] + list(d[1:]))
            if not moved:
                continue
            it = by_code.get(pit[0])
            if it is None:
                cidx = []
                for c in pit[5]:
                    if 0 <= c < len(prev.get("cats", [])):
                        name = prev["cats"][c]
                        if name not in cats:
                            cats.append(name)
                        cidx.append(cats.index(name))
                it = [pit[0], pit[1], pit[2], pit[3], pit[4], sorted(set(cidx)), pit[6], [], pit[8] if len(pit) > 8 else ""]
                items.append(it)
                by_code[pit[0]] = it
            have = {d[0] for d in it[7]}
            it[7].extend(d for d in moved if d[0] not in have)
        for sid in incomplete:
            if sid in new_idx:
                stale[str(sid)] = prev_stale.get(str(sid), prev.get("generated")) if sid in prev_ids else None
    else:
        stale = {str(sid): None for sid in incomplete if sid in new_idx}
    kept = []
    for it in items:
        if not it[7]:
            dropped["no_deals"] += 1
        elif len(it[7]) >= nstores:
            dropped["all_stores"] += 1
        else:
            it[7].sort(key=lambda d: d[1])
            kept.append(it)
    items = kept

out = {
    "generated": s(raw["generated"], 40),
    "storeCount": nstores,
    "stores": stores,
    "cats": cats,
    "items": items,
}
if stale:
    out["stale"] = stale
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
                  "stores_scanned": raw.get("storesScanned"),
                  "incomplete_stores": sorted(incomplete),
                  "stale_stores": stale}, indent=1))
