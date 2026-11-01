# Accounts, admin panel and direct download: setup

## 1. Direct download (GitHub)
The Download button points to `https://github.com/tonnydominic90-sketch/VertexStealth-Release/releases/latest/download/VertexStealth-Setup.exe`.
GitHub serves that straight to the browser, so the download just starts. It needs **a fixed installer file name** on every release.
In the desktop app's `electron-builder.config.js` set, under `nsis`:

    nsis: { artifactName: "VertexStealth-Setup.exe" }

(or change `downloadAsset` in `site.config.json` to your real file name). Check the result by opening the link above in a browser after publishing a release.

## 2. Website sign-in (same accounts as the app)
1. In `site.config.json` set `supabase.anonKey` to your project's **anon** key (it is public; the desktop app already contains it), or set `SUPABASE_ANON_KEY` in Vercel.
2. Supabase > Authentication > URL Configuration > **Redirect URLs**: add
   `https://www.vertexstealth.top/login`, `https://www.vertexstealth.top/account`.
3. Pages: `/login`, `/signup`, `/forgot`, `/account`. Password reset and email-confirmation links return to the site.
4. Sign-ups made on the website do not carry a device id. If your database trigger refuses sign-ups without one, the page shows the database's message; tell me and I will adjust.

## 3. Admin panel (/admin)
Only accounts with `profiles.is_admin = true` can open it (your admin account already has this). Everything runs through `/api/admin`, which checks the caller's login and admin flag on the server and uses the service role key, which never reaches the browser.

1. Supabase > SQL Editor: run `supabase/site-admin.sql` (new tables only; no existing table is changed).
2. Vercel > Settings > Environment Variables: add everything in `.env.example`. Redeploy.
3. Email (Resend): create an account at resend.com, add the domain `vertexstealth.top`, then add the DNS records Resend shows (SPF, DKIM) in **Vercel > Domains > DNS Records**. Create an API key and set `RESEND_API_KEY`.
4. Open `/admin` > **Setup check** and fix anything marked with a cross. If a profile column name differs from your schema, edit `api/_lib/schema-map.json`.

### What the panel does
- **Overview:** users, new accounts, active users, plan counts, page views, top pages/referrers/devices.
- **Users:** search and filter; Suspend (temporary or until lifted; blocks sign-in everywhere), Ban (permanent; also flags the account and its devices), Make/Remove admin, Upgrade (monthly, yearly, custom days, remove plan). Every action is written to the audit log. You cannot act on your own account, and you cannot suspend or ban another admin without demoting them first.
- **Locations:** country of website visitors and of users. Only the country/region/city from Vercel's edge is stored, never the IP address.
- **Communication:** 12 templates (welcome, trial ending, trial ended, pricing change, maintenance, security, terms update, support follow-up, product update, new feature, re-engagement, blank). Send to all users, a segment, or hand-picked users; test send to yourself; type SEND to confirm. Banned, suspended and unconfirmed accounts are skipped. "Product news" emails carry an unsubscribe link and skip anyone who unsubscribed; "service" emails (security, billing, legal, maintenance) do not.

### Locations for app users (optional)
The website records a location when someone signs in on the site. To also learn where app users are, the app can call once on launch (main process):

    fetch('https://www.vertexstealth.top/api/track', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + session.access_token}, body: JSON.stringify({event:'app_launch', version: app.getVersion(), path:'/app'})}).catch(()=>{});

## 4. Before you go live
- The Privacy Policy does not yet mention website analytics (country-level page views), the admin email centre or unsubscribe records. Add a short paragraph and bump `LEGAL_VERSION`.
- Send "product news" only to people who would expect it; service notices (price changes need 30 days' notice, terms changes 14 days under your Terms) are fine for everyone.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` only in Vercel. If either leaks, rotate it immediately.
- Run `node scripts/test-api.js` after changing anything in `/api`.
