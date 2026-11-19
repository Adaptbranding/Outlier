# Agent prompts for the daily refresh

The four retailers run at the same time, one agent each. The main session clones the repo to `/home/claude/outlier`, then starts
all four agents in ONE message (four Agent calls, `subagent_type: general-purpose`, `run_in_background: true`), each with the
COMMON block below followed by its retailer's block. The agents only do the browser part and stage the export; the main session
builds, checks and pushes each retailer as soon as its agent reports back (README: build and checks), so git is only touched in one place.

## COMMON

You run one retailer's scan for the Outlier site (https://adaptbranding.github.io/Outlier/) in the owner's own Chrome, at the same time as
three other agents scanning the other retailers in other tabs. The runbook is /home/claude/outlier/refresh/README.md: read your retailer's
section and "Every store, every day". The scripts are in /home/claude/outlier/refresh/. Only read files there; do not edit, build,
commit or push anything: the main session does that.

1. Load the tools in ONE ToolSearch call: `select:mcp__claude-in-chrome__select_browser,mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__find,mcp__claude-in-chrome__computer,mcp__remote-devices__device_stage_files`.
2. Call select_browser with deviceId 7982f1d7-2631-4e96-b2a6-6e72fbf07564 (Browser 1), then tabs_context_mcp with createIfEmpty:true, then
   tabs_create_mcp to get a tab of your own. Use only that tab id from then on. Never navigate, run code in or close any other tab: the other
   agents' scans run in them. If a tool says your tab is gone, call tabs_context_mcp and report it; do not start the scan again.
3. To run a script, read the file and pass its full contents to javascript_tool. A javascript_tool call must return within 45 s, so never wait
   inside one; between polls run Bash `sleep 290` (timeout 300000). Return only counts and short strings from javascript_tool (output that
   contains URLs with query strings is blocked).
4. Never open a second tab on your retailer's site, never change the site's selected store yourself, and never try to get around a 403, 429,
   503 or challenge page. If the scan stops on one, export what it has (unfinished stores are listed as incomplete) and report it.
5. When the scan has finished, export with the runbook's unique file name (it contains the UTC date and time), then stage it with
   device_stage_files using exactly `C:\Users\zfalc\Downloads\<file name>` (never list the Downloads folder: over 8000 entries). If staging
   fails, report the file name anyway.
6. Check the staged file with `python3 -I -c` (print its generated time, number of stores, number of items and its incomplete list): the
   generated time must be from this run.
7. Close your own tab. Reply with: retailer, file name, staged path, generated, minutes from start to finish, stores, stores scanned, items,
   incomplete store ids, number of errors with the last two, and anything unusual.

## Canadian Tire

Open https://www.canadiantire.ca/en/promotions/clearance.html?x1=save_story_range&q1=50%25+and+up in your tab (never set a store). Paste
refresh/hook.js, find the "Goto Page 2" link and click it, wait about 5 s, and confirm `!!window.__cap2` is true. Paste refresh/scan.js,
then refresh/keepalive.js, and check `window.__keepState` is "open". Poll with the runbook's Canadian Tire one-liner (about 45 minutes).
Export with the runbook's Canadian Tire step 4.

## Home Hardware

Open https://www.homehardware.ca/en/liquidation/c/13993 in your tab. If a cookie banner shows, choose "Reject Non-Essential". Paste
refresh/hh_scan.js, then refresh/keepalive.js, and check `window.__keepState` is "open". Poll with the runbook's Home Hardware one-liner
(about an hour). Export with the runbook's Home Hardware step 3.

## RONA

Open https://www.rona.ca/en/promotions/clearance in your tab. First check that the site answers, with one request:
`const r=await fetch('/en/promotions/clearance',{credentials:'include'});const h=await r.text();JSON.stringify({status:r.status,challenge:/captcha-delivery|geo\.captcha/i.test(h.slice(0,5000))})`.
If the status is 403, 429 or 503 or challenge is true, stop: close your tab and report "RONA blocked" with the status (do not retry and do
not open rona.ca again). Otherwise paste refresh/rona_scan.js, then refresh/keepalive.js, check `window.__keepState` is "open", poll with
the runbook's RONA one-liner (about an hour) and export with the runbook's RONA step 3.

## Mark's

Open https://www.marks.com/en/sale-clearance/sale.html in your tab. Paste refresh/marks_hook.js, find the "Goto Next Page" link (page 2)
and click it, wait about 5 s, and confirm `!!window.__cap` is true. Paste refresh/marks_scan.js, then refresh/keepalive.js, and check `window.__keepState` is "open". Poll with the
runbook's Mark's one-liner (2-3 hours; if `fatal` is set, stop and report it). Export with the runbook's Mark's step 4 (unique name), then
run `indexedDB.deleteDatabase('marksScan')`.
