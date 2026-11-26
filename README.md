# Ontario Canadian Tire outlier deals

Items 50% off or more at only some Ontario Canadian Tire stores. `index.html` renders `data/deals.json`, which is refreshed daily. Photos load live from Canadian Tire's image servers. Independent tool, not affiliated with Canadian Tire.

## Saved products and optional account sync

Saving (the heart button), the Saved page and its price calculator work with no account: the list lives in the browser's `localStorage` (`assets/saved.js`).

Signing in is optional and copies the list to the visitor's account so it follows them to other devices (`assets/sync.js`, button in the nav):

- Backend: Supabase project **Outlier** (`qemjhavbngizhgoxokob`), table `public.favorites` (`user_id`, `key`, `item` jsonb, `saved_at`), row-level security so each person only reads and writes their own rows, 500-row cap per person.
- The Supabase URL and publishable key in `sync.js` are public by design; access is controlled by the row-level security policies. Never put a `service_role` key in this repo.
- `assets/vendor/supabase-js-*.js` is the unmodified `@supabase/supabase-js` UMD build (MIT), loaded only when someone signs in or is already signed in.
- Sign-in is a one-time email link (Google appears automatically when the provider is enabled in Supabase). Sign-in emails to the public need a custom SMTP provider in Supabase (Authentication settings), and the site URL plus `https://adaptbranding.github.io/Outlier/**` must be in the Supabase redirect URL allow list.
- Behaviour: first sign-in on a browser merges anything already saved there into the account; later changes are sent as they happen (queued while offline); other devices refresh when the tab regains focus; signing out removes the list from that device only.
