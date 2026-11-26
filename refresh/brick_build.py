"""The Brick (Ontario): turn the export of refresh/brick_scan.js into data/brick/deals.json.

    python3 -I refresh/brick_build.py <raw.json> data/brick/deals.json [refresh/brick_stores.json]

thebrick.com prices by "zone", not by store: every product carries one price per zone and each Ontario store belongs to one zone
(refresh/brick_stores.json lists the 58 Ontario stores and their zone). So each store gets the price and discount of its own zone.
Same row layout as the other multi-store files:
  [code, title, url, brand, sku, [category index], 0, [[store index, sale, None, regular, None], ...], image path, first seen, note]
A store is listed only when its zone's price is 50% off or more of the compare-at price and the option is available to order.
Checks are printed; exit status 1 when one fails.
"""
import datetime
import json
import re
import sys
from urllib.parse import quote

raw_path, out_path = sys.argv[1], sys.argv[2]
stores_path = sys.argv[3] if len(sys.argv) > 3 else "refresh/brick_stores.json"
raw = json.load(open(raw_path, encoding="utf-8"))
smap = json.load(open(stores_path, encoding="utf-8"))["stores"]
today = datetime.date.today().isoformat()

try:
    prev = json.load(open(out_path, encoding="utf-8"))
    prev_first = {r[0]: (r[9] if len(r) > 9 and isinstance(r[9], str) else "") for r in prev.get("items", [])}
    have_prev = True
except Exception:
    prev_first, have_prev = {}, False

stores = sorted(smap, key=lambda s: s["name"])
zone_stores = {}
for i, s in enumerate(stores):
    zone_stores.setdefault(s["zone"], []).append(i)
unknown_zone = [s["name"] for s in stores if s["zone"] not in raw["zones"]]

rows, cats, bad = [], [], {"handle": 0, "title": 0, "price": 0, "nostore": 0}
seen = set()
for it in raw["items"]:
    handle = it.get("handle") or ""
    if not re.fullmatch(r"[^\s/?#\"'<>\\%]{1,250}", handle):
        bad["handle"] += 1
        continue
    if handle in seen:
        continue
    title = re.split(r"\s*\|\s*", (it.get("title") or "").strip())[0].strip()  # English half of "English | French"
    if len(title) < 3:
        bad["title"] += 1
        continue
    deals, sku = [], ""
    for zone, v in it["z"].items():
        price, comp, avail = v[0], v[1], v[2]
        if not (isinstance(price, (int, float)) and isinstance(comp, (int, float)) and 0.05 <= price < comp < 100000):
            continue
        if 1 - price / comp < 0.4995 or not avail:
            continue
        sku = sku or str(v[3] or "")
        for si in zone_stores.get(zone, []):
            deals.append([si, round(float(price), 2), None, round(float(comp), 2), None])
    if not deals:
        bad["nostore" if any(True for _ in it["z"]) else "price"] += 1
        continue
    deals.sort(key=lambda d: d[0])
    seen.add(handle)
    cat = it.get("cat") or "Other"
    if cat not in cats:
        cats.append(cat)
    img = it.get("img") or ""
    if not re.fullmatch(r"1/2660/5202/[A-Za-z0-9/_.\-]+", img):
        img = ""
    first = prev_first.get(handle, today if have_prev else "")
    rows.append([handle, title[:200], "/products/" + quote(handle, safe="-_.~"), (it.get("vendor") or "").strip()[:60], sku, [cats.index(cat)], 0,
                 deals, img, first, ""])

# Categories in the site's order, "Other" last.
site_order = [c[0] if isinstance(c, list) else c for c in raw.get("cats", [])] or [
    "Mattresses", "Living Room", "Bedroom", "Dining Room", "Appliances", "Electronics", "Office", "Home Decor", "Small Spaces", "Outdoor"]
order = [c for c in site_order if c in cats] + [c for c in cats if c not in site_order and c != "Other"]
if "Other" in cats:
    order.append("Other")
remap = {cats.index(c): i for i, c in enumerate(order)}
for r in rows:
    r[5] = [remap[r[5][0]]]
best = lambda r: max(1 - d[1] / d[3] for d in r[7])
rows.sort(key=lambda r: -best(r))

out = {"generated": raw["generated"], "storeCount": len(stores),
       "stores": [[1000 + i, s["name"], "Online price for this store's area", None, None] for i, s in enumerate(stores)],
       "cats": order, "items": rows}

checks = {
    "scanned >= 25000 products": raw.get("seen", 0) >= 25000,
    "no scan errors": not raw.get("errs"),
    "kept items >= 100": len(rows) >= 100,
    "with image >= 90%": sum(1 for r in rows if r[8]) >= 0.9 * max(1, len(rows)),
    "every store zone was scanned": not unknown_zone,
    "bad rows < 2%": sum(bad.values()) < 0.02 * max(1, len(raw["items"])),
}
print(json.dumps({"scanned": raw.get("seen"), "candidates": len(raw["items"]), "kept": len(rows), "stores": len(stores), "cats": len(order),
                  "bad": bad, "with_image": sum(1 for r in rows if r[8]), "new_today": sum(1 for r in rows if r[9] == today)}))
for k, v in checks.items():
    print(("PASS " if v else "FAIL ") + k)
if not all(checks.values()):
    sys.exit(1)
json.dump(out, open(out_path, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
print("wrote", out_path)
