# Deploying the partner program backend (about 45 minutes)

You need: your Supabase project, the Supabase CLI logged in (`supabase login`, `supabase link`), a Resend account, and the website repo on Vercel.

## 1. Database
1. Supabase dashboard -> **SQL Editor** -> paste all of `supabase/partner-program.sql` -> **Run**. It is safe to run twice.
2. It creates 9 tables (locked: nobody can read them through the API), the admin/app/webhook functions, and `partner_settings`.
   Change a rule any time with SQL, e.g. `update partner_settings set value = 21 where key = 'hold_days';`
   (keys: `default_percent`, `hold_days`, `min_payout`, `attribution_days`, `claim_window_hours`, `applications_per_ip_per_day`).
   If you change `hold_days`/`min_payout`/`attribution_days`, also change the matching `partners.*` values in the website's `site.config.json`
   so the page text agrees.

## 2. E-mail (Resend)
Approval, decline, confirmation and portal sign-in links are e-mails, so this is required.
1. Create a free account at resend.com and an API key.
2. Add and verify your domain (DNS records). Until a domain is verified Resend only delivers to your own address.
3. Choose the sender, e.g. `VertexStealth Partners <partners@yourdomain.com>`.

## 3. Functions
1. Copy `supabase/functions/*` (including `_shared`) into your project's `supabase/functions/`.
2. Add the contents of `supabase/config.toml.snippet` to your `supabase/config.toml`.
3. Secrets (the Supabase URL and keys are provided to functions automatically):
   ```
   supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="VertexStealth Partners <partners@yourdomain.com>" \
     ADMIN_NOTIFY_EMAIL=techinfo.vertex@gmail.com SITE_URL=https://yourdomain.com ALLOWED_ORIGINS=https://yourdomain.com \
     PARTNER_IP_SALT=$(openssl rand -hex 16) REVIEW_TIME="3 business days"
   ```
   (`ALLOWED_ORIGINS` is a comma list; add `https://www.yourdomain.com` and your `*.vercel.app` preview URL if you use them.)
4. Deploy:
   ```
   supabase functions deploy partner-apply --no-verify-jwt
   supabase functions deploy partner-click --no-verify-jwt
   supabase functions deploy partner-portal --no-verify-jwt
   supabase functions deploy partner-admin-review
   ```

## 4. Website
1. In the website repo edit `site.config.json` -> `partners`: set `"backendLive": true`, check `functionsUrl` / `supabaseUrl`, and paste your
   project's **anon public key** (Supabase -> Settings -> API; it is meant to be public) into `supabaseAnonKey`.
2. Push. Vercel rebuilds. New pages: `/r/<code>` (referral link), `/partner` (portal), `/partner-admin` (your admin page, not linked or indexed).
3. Edit `vercel.json` if you host functions on a custom domain (the CSP allows `https://*.supabase.co` only).

## 5. Try it end to end
1. Open `/partners-program`, apply with a test e-mail. You get an admin notification and the applicant gets a confirmation.
2. Open `/partner-admin`, sign in with your admin account (`is_admin = true`), **Approve**. The applicant is e-mailed a link and code.
3. Open `/r/<code>`: it lands on `/download` and shows the code. Open `/partner`, request a sign-in link, check the dashboard.

## 6. Payments and the app
- Paste the snippets from `docs/PAYMENT-HOOKS.md` into your Creem and Binance webhook functions and redeploy them.
- Follow `docs/APP-INTEGRATION.md` to add the referral-code box to sign-up.

## 7. Before you announce
- Have a lawyer read the Partner Program Terms on the page; the numbers there come from `site.config.json`.
- Add to your Privacy Policy: partner applications (name, email, country, plan), link-click counts, and Resend as an e-mail processor.
- Do one real $10 test purchase with a test partner and walk it through pending -> approved -> payout.
- Payouts are manual by design: the admin page shows who is owed what; you send the money (PayPal/USDT/bank), then press **Record payout** and enter your payment reference.

## Safety notes
- The admin page signs in with your Supabase password (email + password only; an account that requires 2-factor login cannot use it). Every action is re-checked on the server with `is_admin()`, so the page itself holds no power.
- Click counts can be inflated by someone refreshing a link from many browsers; commissions cannot, because they exist only for real paid orders.
