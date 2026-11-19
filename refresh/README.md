# Daily refresh runbook

Run by the scheduled task "CT Ontario clearance refresh" (6:34 am ET) in the owner's Chrome. All requests are the same ones canadiantire.ca makes itself, one at a time with a 350 ms pause.

1. Open https://www.canadiantire.ca/en/promotions/clearance.html?x1=save_story_range&q1=50%25+and+up in a new Chrome tab (never set a store).
2. Run `refresh/hook.js` in the tab, click "Goto Page 2", wait ~5 s, confirm `!!window.__cap2 && !!window.__capPA`.
3. Run `refresh/scan.js` (starts a background job, takes about 1.5-2 hours). Poll with `JSON.stringify({phase:__R.phase,done:__R.done,errs:__R.errs.length,finished:__R.finished})`.
4. When finished: `window.__download(window.__buildExport4(), 'ct-ontario-outliers-' + new Date().toISOString().slice(0,10) + '.json')`, then `indexedDB.deleteDatabase('ctOutlierScan')`.
5. Stage that file from the Downloads folder, run `python3 -I refresh/build_data.py <raw.json> data/canadian-tire/deals.json`.
6. Checks before pushing: stores >= 195, items >= 300, dropped.bad_url == 0, with_stock_count > 0, with_image >= 90% of items.
7. Commit only `data/canadian-tire/deals.json` and push to `main`. GitHub Pages redeploys on its own.

## Home Hardware (second retailer)

Run in the same scheduled task, after Canadian Tire is pushed. Same rules: only the site's own requests, one at a time, 350 ms pause.

1. Open https://www.homehardware.ca/en/liquidation/c/13993 in a new Chrome tab. If a cookie banner shows, choose "Reject Non-Essential". Do not change the selected store.
2. Paste and run `refresh/hh_scan.js`. It crawls every Ontario store from the store locator, then builds the candidate list from every discounted item (the whole catalogue read at one store, about 340 pages of 192, plus the site's own on-sale filter at 8 spread-out stores, plus the Online Clearance list), then asks for price and stock at each store for those candidates (about 40-60 minutes in all). Poll with `JSON.stringify({phase:__HH.phase,done:__HH.done,total:__HH.total,errs:__HH.errs.length,aborted:__HH.aborted,finished:__HH.finished})`.
3. When `finished` is true: `window.__hhDownload(window.__hhExport(), 'hh-ontario-outliers-' + new Date().toISOString().slice(0,10) + '.json')`.
4. Stage that file from the Downloads folder, run `python3 -I refresh/build_data.py <raw.json> data/home-hardware/deals.json hh`.
5. Checks before pushing: stores >= 300, items >= 20, dropped.bad_url == 0, with_image >= 90% of items, errs in the browser == 0 (or only a handful).
6. Commit only `data/home-hardware/deals.json` and push to `main`.

## RONA (third retailer)

Scan: open any page on rona.ca in Chrome, paste `refresh/rona_scan.js`, and poll `window.__RA`.
It selects each of the 115 Ontario stores by cookie (`RonaWCCookie.stores.selected` and `RonaWCCookie.storesize`),
reads every clearance department (96 items per page), keeps items priced at 50% off or more with stock in store,
and restores your original selected store when it ends. Roughly 3,500 requests and about 2 hours.
It stops by itself on a 403/429/503 or a challenge page and never tries to get around one; the store being scanned
at that moment is incomplete, so drop it before exporting (the last session lost 1 of 115 this way).

Export: `window.__raDownload(window.__raExport(), 'rona-ontario-outliers-YYYY-MM-DD.json')`, stage from Downloads,
then `python3 -I refresh/build_data.py <raw.json> data/rona/deals.json ra`.
Items at every scanned store are dropped by build_data.py (they are not outliers).

Why RONA reads clearance only: rona.ca has no discount filter, so the other discounted items sit in the weekly-deals (flyer) lists
(`RonaPromoFlyerView`, same department ids). Tested 2026-11-18 at 6 Ontario stores (Tools and Bathroom): 23 items were 50% off or more,
and none had a different price from store to store (only the in-store stock differed). Each flyer page is about 3.3 MB and a store needs
about 125 of them, roughly 45 GB for all 115 stores, so the flyer lists are not scanned.

## Mark's (fourth retailer)

Same platform as Canadian Tire (marks.com). The sale lists show one price for every store, so store prices come from the per-store product lookup (`/api/v1/product/api/v1/product/productFamilyList?storeName=<id>`, up to 250 products per request). That lookup returns the option (size or colour) that is stocked at the store, so a product can look cheaper at one store because a discounted option is in stock there. That matches the "discounted for one option only" note on the page, and only options with stock at the store are kept.

1. Open https://www.marks.com/en/sale-clearance/sale.html in a new Chrome tab. Do not change the selected store, and do not open marks.com in a second tab while the scan runs (the store choice is shared between tabs).
2. Run `refresh/marks_hook.js`, then click "Goto Next Page" (page 2) and wait ~5 s. Confirm `!!window.__cap`.
3. Run `refresh/marks_scan.js` (it also starts the keepalive). Phases: stores, catalogue (everything in sale-clearance, about 5,300 products), screen (whole catalogue at 6 spread-out stores; a product becomes a candidate if it is discounted at any of them), full (each candidate at every other Ontario store). About 2-3 hours. Poll with `JSON.stringify({phase:__R.phase,done:__R.done,total:__R.total,stores:__R.stores&&__R.stores.length,cat:__R.codes.length,cand:__R.cand&&__R.cand.length,errs:__R.errs.length,fatal:__R.fatal,finished:__R.finished})`.
4. When finished: `window.__download(window.__buildExport(), 'marks-ontario-outliers-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'-') + '.json')` (unique name), then `indexedDB.deleteDatabase('marksScan')`.
5. Stage the file, run `python3 -I refresh/build_data.py <raw.json> data/marks/deals.json` (the `ct` rules fit Mark's: same `/en/pdp/...html` paths and `product/...` image paths).
6. Checks before pushing: stores >= 120, items >= 50, dropped.bad_url == 0, with_stock_count > 0, with_image >= 90% of items.
7. Commit only `data/marks/deals.json` and push to `main`.

## Background tabs are throttled (all scans)

Chrome slows a hidden tab to a crawl (a RONA scan managed 94 requests in 34 minutes). Right after pasting any scan script, paste `refresh/keepalive.js` in the same tab:
it holds a local WebRTC data channel, which Chrome exempts from that throttling (the same scan then ran about 0.8 requests a second with nobody touching the tab).
Check `window.__keepState` is `open`.

## New-deal tracking

`build_data.py` keeps each item's first-seen date (row index 9, `YYYY-MM-DD`) by reading the file it is about to overwrite, so always build straight into `data/<retailer>/deals.json` (never a temp path, or every item loses its date and nothing shows as new). Items missing from the previous file get today's date; items from before tracking stay unknown (empty) until the next day. The site's "Show" filter and the search page's "New" badge use that date against each file's `generated` day.
