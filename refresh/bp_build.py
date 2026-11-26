"""Bass Pro Shops Canada: turn the export of refresh/bp_scan.js into data/bass-pro/deals.json.

    python3 -I refresh/bp_build.py <raw.json> data/bass-pro/deals.json

Same row layout as the Amazon.ca file (one online "store"):
  [code, title, url, brand, sku, [category index], 0, [[0, sale, None, regular, None]], image path, first seen, note]
Keeps products whose sale price is 50% off or more of the regular price. A product with several options at different prices
is kept at the option with the biggest discount (note "options"). Checks are printed; exit status 1 when one fails.
"""
import datetime
import json
import re
import sys

raw_path, out_path = sys.argv[1], sys.argv[2]
raw = json.load(open(raw_path, encoding="utf-8"))
today = datetime.date.today().isoformat()

try:
    prev = json.load(open(out_path, encoding="utf-8"))
    prev_first = {r[0]: (r[9] if len(r) > 9 and isinstance(r[9], str) else "") for r in prev.get("items", [])}
    have_prev = True
except Exception:
    prev_first, have_prev = {}, False

BRAND = re.compile(r"^([A-Z][A-Za-z0-9'’.&\- ]{1,32}?)[®™]")
rows, cats, bad = [], [], {"price": 0, "title": 0, "slug": 0}
seen = set()
for it in raw["items"]:
    slug, title = it.get("slug", ""), (it.get("title") or "").strip()
    sale, orig = it.get("sale"), it.get("orig")
    if not re.fullmatch(r"[a-z0-9][a-z0-9\-]*", slug or ""):
        bad["slug"] += 1
        continue
    if slug in seen:
        continue
    if re.fullmatch(r"\+?\d+|new!?", title, re.I) or len(title) < 3:  # swatch counter or badge picked up as the title: fall back to the product's URL name
        title = re.sub(r"-\d{6,}$", "", slug).replace("-", " ").title()
        for a, b in (("Mens", "Men's"), ("Womens", "Women's"), ("Boys", "Boys'"), ("Redhead", "RedHead"), ("Cabelas", "Cabela's")):
            title = re.sub(r"\b" + a + r"\b", b, title)
    if not title:
        bad["title"] += 1
        continue
    if not (isinstance(sale, (int, float)) and isinstance(orig, (int, float)) and sale >= 0.05 and orig > sale):
        bad["price"] += 1
        continue
    if 1 - sale / orig < 0.4995:
        continue
    seen.add(slug)
    cat = it.get("cat") or "Other"
    if cat not in cats:
        cats.append(cat)
    img = it.get("img") or ""
    if not re.fullmatch(r"ProductImages/[A-Za-z0-9/_.\-]+", img):
        img = ""
    m = BRAND.match(title)
    first = prev_first.get(slug, today if have_prev else "")
    rows.append([slug, title[:200], "/p/" + slug, m.group(1).strip() if m else "", "", [cats.index(cat)], 0,
                 [[0, round(float(sale), 2), None, round(float(orig), 2), None]], img, first, "options" if it.get("range") else ""])

# Categories in the site's order, "Other" last.
order = [c for c in [x[0] for x in raw.get("cats", [])] if c in cats] + [c for c in cats if c not in [x[0] for x in raw.get("cats", [])] and c != "Other"]
if "Other" in cats:
    order.append("Other")
remap = {cats.index(c): i for i, c in enumerate(order)}
for r in rows:
    r[5] = [remap[r[5][0]]]
rows.sort(key=lambda r: -(1 - r[7][0][1] / r[7][0][3]))

out = {"generated": raw["generated"], "storeCount": 1,
       "stores": [[1, "Bass Pro Shops Canada", "Online (basspro.ca)", None, None]], "cats": order, "items": rows}

scanned = len(raw["items"])
checks = {
    "scanned >= 85% of the list": scanned >= 0.85 * raw["total"],
    "no scan errors": raw.get("errs", 0) == 0,
    "kept items >= 100": len(rows) >= 100,
    "with image >= 90%": sum(1 for r in rows if r[8]) >= 0.9 * max(1, len(rows)),
    "bad rows < 2%": sum(bad.values()) < 0.02 * max(1, scanned),
}
print(json.dumps({"list_total": raw["total"], "scanned": scanned, "kept": len(rows), "cats": len(order), "bad": bad,
                  "with_image": sum(1 for r in rows if r[8]), "new_today": sum(1 for r in rows if r[9] == today)}))
for k, v in checks.items():
    print(("PASS " if v else "FAIL ") + k)
if not all(checks.values()):
    sys.exit(1)
json.dump(out, open(out_path, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
print("wrote", out_path)
