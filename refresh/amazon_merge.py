"""Merge the Amazon.ca scans into one raw file for build_data.py (mode "am").

usage: python3 -I refresh/amazon_merge.py [--any] <wide_items.json> <raw_out.json> [<deals_list_raw.json>]

  --any               keep items with no recognised brand too (brand is left blank); without it only name brands are kept

  wide_items.json     window.__awItems from refresh/amazon_wide_scan.js (a JSON list)
  deals_list_raw.json optional export of refresh/amazon_scan.js (Amazon's own deals list); kept only for name brands
Name brand = the title contains a brand from the BRANDS list in refresh/amazon_wide_scan.js (the one list used for both scans).
"""
import ast, json, re, sys, os, datetime

here = os.path.dirname(os.path.abspath(__file__))
ANY = "--any" in sys.argv
args = [a for a in sys.argv[1:] if a != "--any"]
wide_path, out_path = args[0], args[1]
sale_path = args[2] if len(args) > 2 else None

src = open(os.path.join(here, "amazon_wide_scan.js"), encoding="utf-8").read()
m = re.search(r"const BRANDS = (\[.*?\]);\n", src, re.S)
BRANDS = list(dict.fromkeys(ast.literal_eval(m.group(1))))

def norm(x):
    return " " + re.sub(r"\s+", " ", re.sub(r"[^a-z0-9+&' ]+", " ", x.lower())).strip() + " "

NB = [(b, norm(b)) for b in BRANDS]
def brand_of(title):
    # The brand must be in the first five words of the title: "... compatible with Husqvarna" accessories are not that brand's product.
    # When several brands match ("Walker's Razor ..."), the one that starts earliest wins, then the longest name.
    t = norm(" ".join(title.split()[:5]))
    best = None
    for b, nb in NB:
        i = t.find(nb)
        if i >= 0:
            k = (i, -len(nb))
            if best is None or k < best[0]:
                best = (k, b)
    return best[1] if best else ""

CATS = ["Furniture", "Outdoor & Recreation", "Camping", "Hunting", "Farm Equipment", "Electronics", "Tools & Home Improvement", "Sports & Outdoors", "Home & Kitchen", "Patio, Lawn & Garden", "Large Appliances", "Kitchen, Bath & Cabinets", "Kitchen Appliances", "Outdoor Power Equipment", "Snow Removal", "Tools", "Clothing & Accessories", "Shoes & Boots", "Automotive", "Pets", "Health & Beauty"]
SALE_CAT = {"Electronics": 5, "Tools & Home Improvement": 6, "Sports & Outdoors": 7, "Home & Kitchen": 8, "Patio, Lawn & Garden": 9, "Clothing, Shoes & Accessories": 16, "Automotive": 18, "Pet Supplies": 19, "Beauty & Personal Care": 20, "Health & Personal Care": 20}

# Deals-list items (and search hits from other groups) whose title is clearly hunting gear also get the Hunting category.
HUNT_RE = re.compile(r"\b(hunting|rifle ?scope|riflescope|binoculars?|rangefinders?|trail cam\w*|game cam\w*|tree ?stands?|ground blinds?|hunting blinds?|crossbows?|archery|compound bow|thermal (?:scope|monocular|imag\w*)|spotting scope|deer|turkey call|duck call|decoys?|gun (?:safe|case|rack|cleaning)|rifle|shooting (?:rest|bench|glasses)|bipod|camo|blaze orange|game processing)\b", re.I)
# The sale list's Clothing, Shoes & Accessories department (and clothing searches) also carry perfume; it is filed under Health & Beauty (20), not clothing.
FRAG_RE = re.compile(r"\b(fragrances?|parfum|eau de|cologne|toilette|perfume)\b", re.I)
# A search for "dog fence" also returns security cameras. For the search-only groups Automotive (18), Pets (19) and Health & Beauty (20) the title must look like that
# category, otherwise the category is removed, but only when the item has another category (Jackery found by "car battery" stays in Camping); an item with only that category keeps it.
# Sale-list departments are Amazon's own, so they are trusted.
REL_RE = {
    18: re.compile(r"\b(car|cars|auto|automotive|truck|trucks|suv|vehicle|vehicles|tires?|tyres?|wheels?|jump ?starter|dash ?cam|batter(?:y|ies)|motor|motorcycle|engine|trailer|hitch|wipers?|obd\w*|brakes?|bumper|windshield|tonneau|roof rack|cargo|compressor|floor jack|ramps?|ev charger|helmet|throttle|actuator|fits select|oem|original equipment|dorman|rotor|axle|transmission|exhaust|headlights?|floor mats?|car seat|booster)\b", re.I),
    19: re.compile(r"\b(dogs?|cats?|pets?|puppy|puppies|kitten|aquarium|fish|birds?|reptile|terrarium|litter|horse|kennel|crate|leash|collar|treats?|purina|orijen|royal canin|blue buffalo|bully|petsafe|kong|nylabone|furminator|scratching|feeder|chew)\b", re.I),
    20: re.compile(r"\b(toothbrush|dental|oral|floss|flosser|hair|shaver|trimmer|epilator|skin|skincare|face|facial|mask|makeup|beauty|perfume|parfum|eau de|cologne|toilette|fragrances?|massag\w*|heating pad|tens|blood pressure|oximeter|thermometer|cpap|vitamins?|protein|collagen|supplements?|omega|fish oil|creatine|scale|hearing|reading glasses|sunscreen|lotion|cream|serum|moisturi\w*|cleanser|nail|laser|wax|shampoo|conditioner|brush|dryer|straightener|curler|curling|razor|foot|sonicare|oral-b|waterpik|theragun|hypervolt|neck|knee|posture|sleep|eye|lip|mascara|foundation)\b", re.I),
}
def relevant_cats(cs, title):
    out = [c for c in cs if c not in REL_RE or REL_RE[c].search(title or "")]
    return out if out else list(cs)
SHOE_RE = re.compile(r"\b(shoes?|boots?|sneakers?|sandals?|slippers?|loafers?|clogs?|footwear|trainers?|moccasins?|oxfords?)\b", re.I)
def tag_hunting(cs, title):
    return sorted(set(cs) | {3}) if HUNT_RE.search(title or "") else sorted(cs)

def title_of(t, path):
    """Some search cards carry only the brand as their heading; fall back to the readable part of the link."""
    if len(t or "") >= 20:
        return t
    mm = re.match(r"^/([A-Za-z0-9%_.\-]{1,200})/dp/", path or "")
    slug = mm.group(1).replace("-", " ") if mm else ""
    return slug if len(slug) > len(t or "") else t

def img_ok(u):
    """Search-result photos look like .../I/<id>._AC_UY218_.jpg; keep <id>.jpg (the page adds its own size)."""
    mm = re.match(r"^https://m\.media-amazon\.com/images/I/([A-Za-z0-9%+\-]+)(?:\.[A-Za-z0-9_,\-]+)?\.(jpg|png)$", u or "")
    return "https://m.media-amazon.com/images/I/%s.%s" % (mm.group(1), mm.group(2)) if mm else ""

# A price under 20% of the list price (over 80% off) is almost always a made-up reference price (a $43 organizer "listed" at $4,299).
MAX_OFF = 0.8
# Items checked by hand whose search-card list price belongs to another variant (Stanley Quencher 30 oz: card said $129.97, product page lists $51.99).
EXCLUDE = {"B0DCF66SX6"}
SLUG_RE = re.compile(r"^/[A-Za-z0-9%_.\-]{1,200}/dp/[A-Z0-9]{10}$")
dropped_inflated = 0
items = {}
wide = json.load(open(wide_path, encoding="utf-8"))
for w in wide:
    asin = w["asin"]
    if asin in EXCLUDE or not SLUG_RE.match(w["path"] or ""):  # no product name in the link = sponsored card with an unreliable title
        dropped_inflated += 1
        continue
    if w["eff"] < w["was"] * (1 - MAX_OFF) or not (ANY or brand_of(w["t"])):
        dropped_inflated += 1
        continue
    ttl = title_of(w["t"], w["path"])
    wc = sorted((set(w["cats"]) - {16, 17}) | {20}) if FRAG_RE.search(ttl or "") and set(w["cats"]) & {16, 17} else w["cats"]
    items[asin] = [asin, ttl, w["path"], brand_of(w["t"]), asin, tag_hunting(relevant_cats(wc, ttl), w["t"]), 0, [[0, w["eff"], None, w["was"], None]], img_ok(w.get("img")), w.get("note") or ""]
sale_kept = sale_total = 0
if sale_path:
    sale = json.load(open(sale_path, encoding="utf-8"))
    cats = sale["cats"]
    for it in sale["items"]:
        sale_total += 1
        b = brand_of(it[1])
        d0 = it[7][0]
        if not (ANY or b) or d0[1] < d0[3] * (1 - MAX_OFF) or not SLUG_RE.match(it[2] or ""):
            continue
        sale_kept += 1
        cidx = sorted({SALE_CAT[cats[c]] for c in it[5] if cats[c] in SALE_CAT})
        if 16 in cidx and FRAG_RE.search(it[1] or ""):
            cidx = sorted((set(cidx) - {16}) | {20})
        if 16 in cidx and SHOE_RE.search(it[1] or ""):  # the sale list's Clothing, Shoes & Accessories department: footwear goes to Shoes & Boots
            cidx = sorted((set(cidx) - {16}) | {17})
        if it[0] in items:
            items[it[0]][5] = tag_hunting(set(items[it[0]][5]) | set(cidx), it[1])
            continue
        items[it[0]] = [it[0], it[1], it[2], b, it[0], tag_hunting(cidx, it[1]), 0, it[7], it[8], ""]
out = {
    "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    "stores": [[1, "Amazon.ca", "Online, ships to Ontario", None, None]],
    "cats": CATS, "items": list(items.values()), "storesScanned": 1, "incomplete": [],
}
json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(json.dumps({"wide": len(wide), "deals_list_total": sale_total, "deals_list_name_brand": sale_kept, "dropped_inflated_or_not_first_words": dropped_inflated, "merged": len(items)}))
