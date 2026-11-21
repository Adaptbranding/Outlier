"""Merge the Amazon.ca scans into one raw file for build_data.py (mode "am").

usage: python3 -I refresh/amazon_merge.py <wide_items.json> <raw_out.json> [<deals_list_raw.json>]

  wide_items.json     window.__awItems from refresh/amazon_wide_scan.js (a JSON list)
  deals_list_raw.json optional export of refresh/amazon_scan.js (Amazon's own deals list); kept only for name brands
Name brand = the title contains a brand from the BRANDS list in refresh/amazon_wide_scan.js (the one list used for both scans).
"""
import ast, json, re, sys, os, datetime

here = os.path.dirname(os.path.abspath(__file__))
wide_path, out_path = sys.argv[1], sys.argv[2]
sale_path = sys.argv[3] if len(sys.argv) > 3 else None

src = open(os.path.join(here, "amazon_wide_scan.js"), encoding="utf-8").read()
m = re.search(r"const BRANDS = (\[.*?\]);\n", src, re.S)
BRANDS = list(dict.fromkeys(ast.literal_eval(m.group(1))))

def norm(x):
    return " " + re.sub(r"\s+", " ", re.sub(r"[^a-z0-9+&' ]+", " ", x.lower())).strip() + " "

NB = [(b, norm(b)) for b in BRANDS]
def brand_of(title):
    # The brand must be in the first five words of the title: "... compatible with Husqvarna" accessories are not that brand's product.
    t = norm(" ".join(title.split()[:5]))
    for b, nb in NB:
        if nb in t:
            return b
    return ""

CATS = ["Furniture", "Outdoor & Recreation", "Camping", "Hunting", "Farm Equipment", "Electronics", "Tools & Home Improvement", "Sports & Outdoors", "Home & Kitchen", "Patio, Lawn & Garden"]
SALE_CAT = {"Electronics": 5, "Tools & Home Improvement": 6, "Sports & Outdoors": 7, "Home & Kitchen": 8, "Patio, Lawn & Garden": 9}

def img_ok(u):
    """Search-result photos look like .../I/<id>._AC_UY218_.jpg; keep <id>.jpg (the page adds its own size)."""
    mm = re.match(r"^https://m\.media-amazon\.com/images/I/([A-Za-z0-9%+\-]+)(?:\.[A-Za-z0-9_,\-]+)?\.(jpg|png)$", u or "")
    return "https://m.media-amazon.com/images/I/%s.%s" % (mm.group(1), mm.group(2)) if mm else ""

# A price under 20% of the list price (over 80% off) is almost always a made-up reference price (a $43 organizer "listed" at $4,299).
MAX_OFF = 0.8
dropped_inflated = 0
items = {}
wide = json.load(open(wide_path, encoding="utf-8"))
for w in wide:
    asin = w["asin"]
    if w["eff"] < w["was"] * (1 - MAX_OFF) or not brand_of(w["t"]):
        dropped_inflated += 1
        continue
    items[asin] = [asin, w["t"], w["path"], brand_of(w["t"]), asin, list(w["cats"]), 0, [[0, w["eff"], None, w["was"], None]], img_ok(w.get("img")), w.get("note") or ""]
sale_kept = sale_total = 0
if sale_path:
    sale = json.load(open(sale_path, encoding="utf-8"))
    cats = sale["cats"]
    for it in sale["items"]:
        sale_total += 1
        b = brand_of(it[1])
        d0 = it[7][0]
        if not b or d0[1] < d0[3] * (1 - MAX_OFF):
            continue
        sale_kept += 1
        cidx = sorted({SALE_CAT[cats[c]] for c in it[5] if cats[c] in SALE_CAT})
        if it[0] in items:
            items[it[0]][5] = sorted(set(items[it[0]][5]) | set(cidx))
            continue
        items[it[0]] = [it[0], it[1], it[2], b, it[0], cidx, 0, it[7], it[8], ""]
out = {
    "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    "stores": [[1, "Amazon.ca", "Online, ships to Ontario", None, None]],
    "cats": CATS, "items": list(items.values()), "storesScanned": 1, "incomplete": [],
}
json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(json.dumps({"wide": len(wide), "deals_list_total": sale_total, "deals_list_name_brand": sale_kept, "dropped_inflated_or_not_first_words": dropped_inflated, "merged": len(items)}))
