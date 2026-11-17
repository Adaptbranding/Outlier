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
2. Paste and run `refresh/hh_scan.js`. It crawls every Ontario store from the store locator, reads the Online Clearance list (about 200 items), then asks for price and stock at each store (about 15-20 minutes). Poll with `JSON.stringify({phase:__HH.phase,done:__HH.done,total:__HH.total,errs:__HH.errs.length,aborted:__HH.aborted,finished:__HH.finished})`.
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
