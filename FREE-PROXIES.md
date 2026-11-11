# Free proxy list (website + app)

Adds a public page at **/free-proxy-list** and a **Free proxies** tab in **/admin**.
The site downloads the lists you add, tests every proxy itself, and stores only the working ones.

## Set up (once)

1. **Supabase:** open the SQL Editor, paste the whole of `supabase/free-proxies.sql` and run it.
   (It needs `supabase/site-admin.sql` to have been run before, which you already did.)
2. **Deploy** this folder to Vercel as usual (push to GitHub). `vercel.json` now also contains a daily cron job for `/api/proxy-refresh`.
3. Open **/admin > Setup check**. The two new tables (`proxy_sources`, `free_proxies`) must show a tick.
4. Open **/admin > Free proxies**:
   - click **Test country lookup** (it should say it works),
   - add your first source (see below), then click **Refresh now**. The first refresh takes up to a minute.
5. Open **/free-proxy-list**. The table fills from the database.

Optional Vercel environment variables:

| Name | What it does |
|---|---|
| `CRON_SECRET` | Any long random text. If set, only Vercel's cron (which sends it automatically) can call the daily refresh. |
| `IPINFO_TOKEN` | A free token from ipinfo.io. If set, country lookup uses IPinfo Lite instead of the keyless country.is service. Set it if "Test country lookup" ever fails. |

## Adding a source

Admin > Free proxies > **Add a source**. Paste a link to a plain-text (or JSON) list with one proxy per line, for example
`https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt`.

* **What does the list contain?** Pick the proxy type of the list. Lists that write the type in every line (`socks5://1.2.3.4:1080`) work with any choice, the line wins.
* **Test link** downloads the list and tells you how many valid proxies it found. Nothing is saved.
* **Show on the website / Offer in the app** are two separate switches.

For every source in the table you can: **Hide on website / Show on website**, **Remove from app / Offer in app**, **Disable / Enable** (both switches at once), **Edit** and **Delete**.
A source that is off on both is not downloaded at all. A proxy listed by several sources is visible wherever at least one of them is switched on.

## How it works

* Each refresh downloads every enabled list, keeps up to 800 already-known proxies plus a random sample of new ones (about 2,400 checks in total, 300 at a time) and tests them.
* A proxy is "working" only if it opens a real tunnel to a public server and that server completes a TLS handshake through it (HTTP via CONNECT, SOCKS4, SOCKS5). HTTP proxies that refuse tunnels get a plain request test and are shown as HTTP only. The HTTPS tag means the CONNECT tunnel worked.
* Speed is how long that test took **from Vercel's servers**, not from the visitor's computer.
* Country comes from an IP lookup done once per new proxy.
* A proxy that fails 3 checks in a row is deleted. A proxy no enabled source lists any more is deleted. A source that fails to download keeps its old proxies and shows the error in the admin table.
* Refreshes run: when someone opens the page and the data is older than 20 minutes, once a day by cron, and when you click **Refresh now**. A database lock makes sure only one refresh runs at a time.
* Private and reserved addresses (10.x, 192.168.x, 127.x and so on) are ignored, and source links to internal addresses are rejected.
* Not shown on purpose: **anonymity level**. It cannot be verified honestly without our own judge server, so the page does not claim it.

## For the desktop app

The app can read the same verified list. Which proxies it gets is controlled by each source's **App** switch.

```
GET https://www.vertexstealth.top/api/free-proxies?target=app
    optional filters: protocol=http|https|socks4|socks5   country=KE   maxms=1500   per=2000   page=1
    -> { updatedAt, total, page, pages, rows: [{ ip, port, protocol, https, country, ms, checked, uptime }], facets: { protocols, countries } }

GET https://www.vertexstealth.top/api/free-proxies?target=app&format=txt        one ip:port per line (protocol:// prefix when no protocol filter)
GET https://www.vertexstealth.top/api/free-proxies?view=sources&target=app      the source links switched on for the app
```

* `protocol` is `http`, `socks4` or `socks5`. For `https` rows, `protocol` is `http` and `https` is `true`.
* The response is cached for 60 seconds. `per` can be up to 2000 for the app.
* If the app currently downloads its own lists, replace that with the call above, or read `view=sources` so the admin switches take effect. Then the app's country and protocol pickers can use `facets` and the `country` / `protocol` fields of each row.
* The app code was not part of this upload, so the app side is not changed here.

## Files added or changed

* New: `supabase/free-proxies.sql`, `api/free-proxies.js`, `api/proxy-refresh.js`, `api/_lib/proxies.js`, `src/free-proxies.js`, `src/free-proxies.css`, `scripts/test-proxies.js`, `scripts/fixtures/`
* Changed: `api/admin.js` (new proxy actions, setup check), `src/admin.js` + `src/admin.css` (Free proxies tab), `scripts/build.js` (page, nav, footer, sitemap, docs link), `vercel.json` (daily cron), `package.json` (test script)

## Tests

`npm test` runs the old API tests and the new proxy tests. The new tests start real mock HTTP, SOCKS4 and SOCKS5 proxies on your machine and check the refresh job, the admin actions and the public API against an in-memory fake Supabase.
