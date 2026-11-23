"""Remove from data/home-depot/clearance.json the items already in data/home-depot/deals.json (a clearance-tagged item that also shows a
regular price at 50% off or more is listed once, as a sale). Run after both files are built: python3 -I refresh/hd_dedupe.py"""
import json
d = "data/home-depot/"
s = json.load(open(d + "deals.json", encoding="utf-8"))
c = json.load(open(d + "clearance.json", encoding="utf-8"))
sale = {i[0] for i in s["items"]}
before = len(c["items"])
c["items"] = [i for i in c["items"] if i[0] not in sale]
json.dump(c, open(d + "clearance.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print({"clearance_before": before, "clearance_after": len(c["items"]), "sale": len(s["items"])})
