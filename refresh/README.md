# Daily refresh runbook

Run by the scheduled task "CT Ontario clearance refresh" (6:34 am ET) in the owner's Chrome. All requests are the same ones canadiantire.ca makes itself, one at a time with a 350 ms pause.

1. Open https://www.canadiantire.ca/en/promotions/clearance.html?x1=save_story_range&q1=50%25+and+up in a new Chrome tab (never set a store).
2. Run `refresh/hook.js` in the tab, click "Goto Page 2", wait ~5 s, confirm `!!window.__cap2 && !!window.__capPA`.
3. Run `refresh/scan.js` (starts a background job, takes about 1.5-2 hours). Poll with `JSON.stringify({phase:__R.phase,done:__R.done,errs:__R.errs.length,finished:__R.finished})`.
4. When finished: `window.__download(window.__buildExport4(), 'ct-ontario-outliers-' + new Date().toISOString().slice(0,10) + '.json')`, then `indexedDB.deleteDatabase('ctOutlierScan')`.
5. Stage that file from the Downloads folder, run `python3 -I refresh/build_data.py <raw.json> data/canadian-tire/deals.json`.
6. Checks before pushing: stores >= 195, items >= 300, dropped.bad_url == 0, with_stock_count > 0, with_image >= 90% of items.
7. Commit only `data/canadian-tire/deals.json` and push to `main`. GitHub Pages redeploys on its own.
