# Daily refresh runbook

Run by the scheduled task "Outlier daily refresh (Canadian Tire + Home Hardware + RONA + Mark's)" (6:34 am ET) in the owner's Chrome.
Every request is one the retailer's own site makes: one at a time per site with a 350 ms pause (Mark's: up to 6 at a time with a 150 ms pause, see its section).

## Run all four at the same time

(If your instructions run the retailers one after another instead, follow each retailer's own section below in turn: the Canadian Tire
steps are in the "Canadian Tire" section, not these numbered steps. Everything else here still applies.)

The four retailers are separate websites, so the four scans run side by side, one tab each. Each site still gets exactly the
requests, at the pace, its own section describes; the refresh just takes as long as the slowest scan instead of all of them added
together (three retailers one after another took about 5½ hours before 2026-11-19; Mark's, about 2-3 hours, is now the longest).

1. Open four tabs: Canadian Tire, Home Hardware, RONA and Mark's (URLs in each section below). Start each scan as its section says.
2. Right after starting a scan, paste `refresh/keepalive.js` in the same tab and check `window.__keepState` is `open`
   (Chrome throttles hidden tabs to a crawl; a page holding a WebRTC data channel is exempt). Do this in every tab, Mark's included.
3. Poll the tabs together (one short `javascript_tool` call per tab; each call must return within 45 s), then `sleep 290` in Bash, and repeat.
4. As each scan finishes: export, stage the file from Downloads, build, check, commit only that retailer's data file,
   `git pull --rebase origin main`, push. Then carry on polling the others.

## With agents (how the scheduled task runs)

The main session starts four agents at once, one per retailer, with the prompts in `refresh/agents.md` (COMMON block + that retailer's
block, verbatim). Each agent opens its own tab, runs its scan, exports, stages the file and reports back; it does not touch git. The main
session stays out of the browser and, as each report arrives, builds straight into `data/<retailer>/deals.json`, runs that retailer's checks,
commits only that file, `git pull --rebase origin main` and pushes. If an agent could not stage its file it gives the file name and the
main session stages it. A retailer whose agent reports a block (403/429/503/challenge) is not retried that day.

## Every store, every day

- The Canadian Tire, Home Hardware and RONA scans retry, once at the end, any store that had a failed request (Mark's retries the failed
  request itself), and lists the stores still incomplete in its export (`incomplete`).
- `build_data.py` keeps an incomplete store's deals from the file it replaces (so the store never shows up empty because of a failed request)
  and lists it under `stale` with the date of that data. It prints `incomplete_stores` and `stale_stores`: report both.
  A store that is stale two runs in a row needs a look.

## Canadian Tire

1. Open https://www.canadiantire.ca/en/promotions/clearance.html?x1=save_story_range&q1=50%25+and+up in a new tab (never set a store).
2. Run `refresh/hook.js` in the tab, click "Goto Page 2", wait ~5 s, confirm `!!window.__cap2` (the search headers; scan.js no longer needs the PriceAvailability ones).
3. Run `refresh/scan.js` (background job, about 40 minutes). Poll with
   `JSON.stringify({phase:__R.phase,done:__R.done,stores:__R.stores&&__R.stores.length,req:__R.req,errs:__R.errs.length,incomplete:__R.incomplete.length,aborted:__R.aborted||null,finished:__R.finished})`.
4. When finished: `window.__download(window.__buildExport4(), 'ct-ontario-outliers-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.json')`.
5. Stage that file from Downloads, run `python3 -I refresh/build_data.py <raw.json> data/canadian-tire/deals.json`.
6. Checks before pushing: stores >= 195, items >= 300, dropped.bad_url == 0, with_stock_count > 0, with_image >= 90% of items.
7. Commit only `data/canadian-tire/deals.json` and push to `main`. GitHub Pages redeploys on its own.

How it works: per store, every page of the site's own 50%-and-up clearance search with that store set (120 per page, the most the API
allows). That response already holds the store's price, in-store quantity and sellable flag, so no separate price/stock call is needed
(compared with the PriceAvailability call on 240 products at 2 stores on 2026-11-19: identical; that call capped at 40 products and was
about two thirds of all requests). Categories come from the published data; only new products need the per-store category pages.

## Home Hardware

1. Open https://www.homehardware.ca/en/liquidation/c/13993 in a new tab. If a cookie banner shows, choose "Reject Non-Essential". Do not change the selected store.
2. Paste and run `refresh/hh_scan.js`. It crawls every Ontario store from the store locator, builds the candidate list from every discounted
   item (the whole catalogue read at one store, about 310 pages of 192, plus the site's own on-sale filter at 8 spread-out stores, plus the
   Online Clearance list), then asks for price and stock at each store for those candidates, 200 per request (about an hour in all;
   2026-11-19: 68 minutes, of which the per-store check was 52).
   Poll with `JSON.stringify({phase:__HH.phase,done:__HH.done,total:__HH.total,errs:__HH.errs.length,incomplete:(__HH.incomplete||[]).length,aborted:__HH.aborted,finished:__HH.finished})`.
3. When `finished` is true: `window.__hhDownload(window.__hhExport(), 'hh-ontario-outliers-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.json')`.
4. Stage that file from Downloads, run `python3 -I refresh/build_data.py <raw.json> data/home-hardware/deals.json hh`.
5. Checks before pushing: stores >= 300, items >= 20, dropped.bad_url == 0, with_image >= 90% of items.
6. Commit only `data/home-hardware/deals.json` and push to `main`.

Store list: the store locator returns every store within a fixed distance, up to the limit asked for; with a limit of 200 the seed grid
covers almost everything, so the crawl only follows up around a query that came back full (385 stores from 138 queries instead of 462).

Request sizes tested 2026-11-19: the catalogue list returns about a third of each 192-slot page (hidden products are filtered after
paging), so stepping by 192 is right. bulk-product-data answers up to 200 items per call (300 ids came back capped at 200, 500 gave a 400);
200 ids per call returned exactly what two calls of 100 did.

## RONA

1. Open https://www.rona.ca/en/promotions/clearance in a new tab. Do not open rona.ca in any other tab while the scan runs: the selected
   store is a cookie shared by every rona.ca tab (a test in another tab once put Welland's clearance under Rodney).
2. Paste `refresh/rona_scan.js` (background job, `window.__RA`). Poll with
   `JSON.stringify({phase:__RA.phase,done:__RA.done,total:__RA.total,pages:__RA.pages,errs:__RA.errs.length,incomplete:__RA.incomplete.length,aborted:__RA.aborted,finished:__RA.finished})`.
3. When finished: `window.__raDownload(window.__raExport(), 'rona-ontario-outliers-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.json')`.
4. Stage that file from Downloads, run `python3 -I refresh/build_data.py <raw.json> data/rona/deals.json ra`.
5. Checks before pushing: stores >= 100, items >= 3000, dropped.bad_url == 0, with_image >= 90% of items.
6. Commit only `data/rona/deals.json` and push to `main`.

How it works: each of the 115 Ontario stores is selected by cookie (`RonaWCCookie.stores.selected` and `RonaWCCookie.storesize`), and its
whole clearance list is read across all departments, 96 items per page (the most the site allows; asking for more still returns 96).
Each product on the list carries the site's category code (e.g. `01-131`), and page 1 of each department, read once at a big-box store,
maps the codes to department names (one code per department; all 18 checked 2026-11-19). Before 2026-11-19 every department was read
separately at every store, so a store with no clearance still took 18 requests. Items priced at 50% off or more with stock in store are kept;
items at every scanned store are dropped by build_data.py (they are not outliers). The selected store is set before every request and
checked on every page; a page for the wrong store marks that store incomplete (retried at the end) instead of mixing data. The original
selected store is restored when the job ends. It stops by itself on a 403/429/503 or a challenge page and never tries to get around one;
unfinished stores are listed as incomplete and keep their previous deals.

Once a day only: on 2026-11-19, after two full RONA scans plus tests in one day (several thousand requests within a few hours), rona.ca
started answering every request with a 403 and a challenge page; one scan a day had run without trouble for three days. The block
lifted on its own within about an hour and a half (a third scan then ran cleanly). Avoid extra RONA scans on the same day, and never try
to get past a challenge page (if one shows, the owner can clear it in their own browser).

Why RONA reads clearance only: rona.ca has no discount filter, so the other discounted items sit in the weekly-deals (flyer) lists
(`RonaPromoFlyerView`, same department ids). Tested 2026-11-18 at 6 Ontario stores (Tools and Bathroom): 23 items were 50% off or more,
and none had a different price from store to store (only the in-store stock differed). Each flyer page is about 3.3 MB and a store needs
about 125 of them, roughly 45 GB for all 115 stores, so the flyer lists are not scanned.

## Mark's

Same platform as Canadian Tire (marks.com). The sale lists show one price for every store, so store prices come from the per-store product lookup (`/api/v1/product/api/v1/product/productFamilyList?storeName=<id>`, up to 250 products per request). That lookup returns the option (size or colour) that is stocked at the store, so a product can look cheaper at one store because a discounted option is in stock there. That matches the "discounted for one option only" note on the page, and only options with stock at the store are kept.

1. Open https://www.marks.com/en/sale-clearance/sale.html in a new Chrome tab. Do not change the selected store, and do not open marks.com in a second tab while the scan runs (the store choice is shared between tabs).
2. Run `refresh/marks_hook.js`, then click "Goto Next Page" (page 2) and wait ~5 s. Confirm `!!window.__cap`.
3. Run `refresh/marks_scan.js`, then paste `refresh/keepalive.js` in the same tab and check `window.__keepState` is `open`. Phases: stores, catalogue (everything in sale-clearance, about 5,300 products), screen (whole catalogue at 6 spread-out stores; a product becomes a candidate if it is discounted at any of them), full (each candidate at every other Ontario store). About 2-3 hours. Poll with `JSON.stringify({phase:__R.phase,done:__R.done,total:__R.total,stores:__R.stores&&__R.stores.length,cat:__R.codes.length,cand:__R.cand&&__R.cand.length,errs:__R.errs.length,fatal:__R.fatal,finished:__R.finished})`.
4. When finished: `window.__download(window.__buildExport(), 'marks-ontario-outliers-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.json')` (unique name), then `indexedDB.deleteDatabase('marksScan')`.
5. Stage the file, run `python3 -I refresh/build_data.py <raw.json> data/marks/deals.json` (the `ct` rules fit Mark's: same `/en/pdp/...html` paths and `product/...` image paths).
6. Checks before pushing: stores >= 120, items >= 50, dropped.bad_url == 0, with_stock_count > 0, with_image >= 90% of items.
7. Commit only `data/marks/deals.json` and push to `main`.

## Amazon.ca

Not a store scan: Amazon has one price for the whole country, so the file has one "store" (Amazon.ca) and the page has no store filters.
Criteria (owner, 2026-11-21): name-brand items anywhere on Amazon.ca (not only its sale list) that are 50% off or more of a list price of $100 or more,
coupons counted, in furniture, outdoor & recreation, camping, hunting, farm equipment (plus electronics, tools and sports from the
sale list). Amazon search has no "% off" filter, so there are two scans, both run from one signed-OUT amazon.ca tab (never sign in):

1. Open https://www.amazon.ca/gp/goldbox, paste `refresh/keepalive.js` (check `window.__keepState` is `open`).
2. Sale list (about 30 s; Electronics, Sports & Outdoors, Tools & Home Improvement, Home & Kitchen, Patio Lawn & Garden): paste `refresh/amazon_scan.js`, poll `window.__AMZ` until `finished`, then
   `window.__amzDownload(window.__amzExport(), 'amazon-sale-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.json')`.
   Check `errs` is empty and every `perDept` is under 480 (Amazon caps a query at 500). If the page was renamed after the sale, set
   `window.__AMZ_PAGE_TYPE` to the new `rankingContext.pageTypeId` first; 0 items with no errors means it is stale.
3. Search scan (about 30-40 min, 380 search pages, one at a time, 800 ms pause): paste `refresh/amazon_wide_scan.js`, poll `window.__AW`
   (`q`, `done` of `total`, `errs`, `aborted`, `finished`). Then
   `window.__awDownload(window.__awItems, 'amazon-wide-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.json')`.
   A CAPTCHA, 403, 429 or 503 stops the scan (`aborted`): do not work around it; report and push nothing.
   (If Chrome stops saving a later download from the same tab, copy the JSON into `localStorage` and download it from a second amazon.ca tab; delete the key after.)
4. Stage both files from Downloads, then
   `python3 -I refresh/amazon_merge.py <wide.json> <raw.json> <sale.json>` and `python3 -I refresh/build_data.py <raw.json> data/amazon/deals.json am`.
5. Checks: items >= 10, dropped.bad_url == 0, with_image >= 90% of items. Commit only `data/amazon/deals.json` and push to `main`.

"Name brand" = one of the first five words of the title is a brand from the `BRANDS` list at the top of `amazon_wide_scan.js` (the one list, used by
the merge for both scans; "...compatible with Husqvarna" accessories do not count). Add brands there. The merge also drops any item priced under 20% of
its list price (over 80% off), which on 2026-11-21 was always a made-up reference price (a $43 organizer "listed" at $4,299). Coupons: a card that already shows "You pay $X ... coupon applied" uses X; "Save N%" or "Save $N" coupons (clip on the
product page) are subtracted from the price; the page says which. The "Was" price is Amazon's reference price and can be inflated; the page says so.
Coverage is the searches in `Q`, not every Amazon product; most 50%-off search results turned out to be rare (about 1 in 400 cards in a pilot).

Added 2026-11-21 (owner: lower the floor to $100 and add hunting gear): the list-price floor is $100 or more in both scans, and `amazon_wide_scan.js` now
has 71 extra hunting queries (clothing, blinds, stands, calls, optics, shooting accessories) plus more hunting brands. To run only those, set
`window.__AW_ONLY_EXTRA = true` before pasting the script (about 15 min); concatenate its `window.__awItems` with the main run's before merging.
The merge picks the brand that starts earliest in the first five words, tags clearly-hunting titles with the Hunting category, uses the link text when a
search card's heading is only the brand, and has a small `EXCLUDE` list for items checked by hand (search-card list price belonged to another variant).

Any brand (owner, 2026-11-21: "any deals 50% off or higher"): set `window.__AW_ANY = true` before pasting `amazon_wide_scan.js` (the 522-page run, about 25 min) and
merge with `python3 -I refresh/amazon_merge.py --any ...`. Unbranded items get a blank brand; the page's Brands filter ("All brands" / "Name brands only")
separates them. Unbranded list prices are the least reliable (many "Smart Watch" style listings show a made-up list price just under the 80% cap).

## Home Depot (all Canadian stores)

Home Depot Canada charges the same price at every store, so the store-level difference is which stores have the item in stock. The page covers all 182 stores in every province (Province filter; the "Online" pseudo-store 7274 is left out by both scripts).

Sales at 50% off or more (about 20 minutes):
1. Open any homedepot.ca page in Chrome (no sign-in needed), paste `refresh/keepalive.js`, then paste `refresh/hd_scan.js`.
2. It pages the sale filters at one base store (Aurora), keeps items 50% or more off, checks price and stock for each at all 182 stores, then reads links, photos and categories. Poll `window.__hd.state` until it is `done` (`error` shows `window.__hd.err`; it stops on any non-200 answer, so do not retry in a loop).
3. Download `window.__raw` as a file (`hd-raw-<date>.json`), stage it, then `python3 -I refresh/build_data.py <raw.json> data/home-depot/deals.json hd`.

Clearance (about 15-20 minutes): badge CLR, search filter `xmv`. homedepot.ca shows no regular price for it, so its discount is unknown; the page lists it as "Clearance" with price and stock only and hides it when the minimum discount is raised above 50%.
4. In the same tab paste `refresh/hd_clearance_scan.js` (three workers over store ranges), poll `window.__cl.state` until `done` (`error`: see `window.__cl.errs`, push nothing for clearance). Download `window.__rawc` as `hd-clear-<date>.json`, stage it, then `python3 -I refresh/build_data.py <raw.json> data/home-depot/clearance.json hdc` and `python3 -I refresh/hd_dedupe.py` (drops clearance items already listed as sales).
5. Checks: sales items >= 40 and `dropped.bad_url == 0`; clearance items >= 20 and `__cl.stats.stores` equals `of`. Commit `data/home-depot/deals.json` and `data/home-depot/clearance.json` together (or just the sales file if clearance failed its checks).

Limits: items on sale only at stores other than the base store are not seen. Regular prices on other sites (homedepot.com in USD) were tried for clearance and are not a reliable base price, so clearance has no percentage.

## New-deal tracking

`build_data.py` keeps each item's first-seen date (row index 9, `YYYY-MM-DD`) by reading the file it is about to overwrite, so always build straight into `data/<retailer>/deals.json` (never a temp path, or every item loses its date and nothing shows as new). Items missing from the previous file get today's date; items from before tracking stay unknown (empty) until the next day. The site's "Show" filter and the search page's "New" badge use that date against each file's `generated` day.
