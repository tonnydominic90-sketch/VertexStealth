# Setup: Brevo email, Google sign-in, account dashboard, partner access

Everything below is click-by-click. Do the parts in order. Part 6 (the database file and the functions) is what makes the
account dashboard and the partner sign-in work.

---
## Part 1. Brevo: sender and domain

You said you already have a verified Brevo account. Check two things.

1. Brevo -> your name (top right) -> **Senders, domains, IPs** -> **Senders**. Your sending address must be listed and show as active.
   * If it is a Gmail/Yahoo address: it works for testing, but many inboxes may put the mail in spam. For real use send from your own domain.
2. Brevo -> **Senders, domains, IPs** -> **Domains** -> **Add a domain** -> `vertexstealth.top`. Brevo shows 3-4 DNS records
   (a `brevo-code` TXT, DKIM records and a DMARC TXT). Add each one in **Vercel -> Domains -> vertexstealth.top -> DNS Records -> Add**
   (the Type, Name and Value must match exactly). Back in Brevo press **Authenticate**. It can take up to an hour.

Then a sender like `support@vertexstealth.top` can be added under **Senders** (Brevo emails a code to that address, so you need
a mailbox for it; if you do not have one yet, keep using the address you already verified and change it later).

## Part 2. Brevo: API key and the website

1. Brevo -> **SMTP & API** -> **API Keys** -> **Generate a new API key**, name it `website`, copy it (starts with `xkeysib-`).
2. Vercel -> your project -> **Settings -> Environment Variables**. Add (Production):
   * `BREVO_API_KEY` = the key
   * `EMAIL_FROM` = `VertexStealth <your-verified-address>`  (the exact address verified in Brevo)
   * `EMAIL_REPLY_TO` = a mailbox you actually read (optional but recommended)
   * `SITE_URL` = `https://www.vertexstealth.top`
   * `SUPABASE_ANON_KEY` = your Supabase anon key (Supabase -> Project Settings -> API -> anon public). Without it sign-in shows "not configured".
   * Delete the old `RESEND_API_KEY`.
3. **Deployments -> Redeploy**.
4. Open `/admin` -> **Setup check**. The **Email sending (Brevo)** rows must be green: API key valid, plan and credits, sender verified.
5. `/admin` -> **Communication** -> send a **test** email to yourself.

**How you will use the email**
* `/admin` -> Communication is your communication centre (welcome, announcements, price changes, maintenance, security notices). It sends through Brevo.
  "Product news" mails carry an unsubscribe link; "service" mails (security, billing, legal) do not.
* Brevo's free plan allows about **300 emails per day**. Sending to every user in one go must stay under that, or upgrade the Brevo plan.
* Replies go to `EMAIL_REPLY_TO`.

## Part 3. Brevo for the partner program emails (Supabase functions)

Supabase -> **Edge Functions -> Secrets** (or run `supabase secrets set ...`). Add or change:
* `BREVO_API_KEY` = the same key
* `EMAIL_FROM` = `VertexStealth Partners <your-verified-address>`
* `ADMIN_NOTIFY_EMAIL` = where you want "new partner application" alerts
* `SITE_URL` = `https://www.vertexstealth.top`
* `ALLOWED_ORIGINS` = `https://www.vertexstealth.top,https://vertexstealth.top`
Remove `RESEND_API_KEY` and `RESEND_API_URL` if they exist. The email code changed, so redeploy **all four** functions (Part 6).

## Part 4. Brevo for sign-up / password-reset emails (very important)

Supabase's built-in mail service only sends a few emails per hour and only to your own team, so real users would never get their
confirmation email. Route Supabase Auth mail through Brevo SMTP:

1. Brevo -> **SMTP & API** -> **SMTP** tab. Note the **Login** (looks like `xxxx@smtp-brevo.com`) and click **Generate a new SMTP key** (copy it).
2. Supabase -> **Authentication -> Emails -> SMTP Settings** (older dashboards: Project Settings -> Authentication). Turn on **Enable custom SMTP** and fill in:
   * Sender email: your verified address; Sender name: `VertexStealth`
   * Host: `smtp-relay.brevo.com`  Port: `587`
   * Username: the Brevo SMTP login  Password: the SMTP key
3. Save, then create a test account on the website and check the confirmation email arrives.

## Part 5. Google sign-in

1. Go to console.cloud.google.com -> create a project `VertexStealth`.
2. **APIs & Services -> OAuth consent screen** (Google may call it "Google Auth Platform"): User type **External**, app name `VertexStealth`,
   your support email, authorized domain `vertexstealth.top`. Keep the default scopes (email, profile, openid). Press **Publish app** so anyone can use it.
3. **Credentials -> Create credentials -> OAuth client ID -> Web application**:
   * Authorized JavaScript origins: `https://www.vertexstealth.top`
   * Authorized redirect URIs: `https://jtvjvogreelngfdseqee.supabase.co/auth/v1/callback`
   Copy the **Client ID** and **Client secret**.
4. Supabase -> **Authentication -> Sign In / Providers -> Google**: enable it, paste Client ID and Secret, save.
5. Supabase -> **Authentication -> URL Configuration**: Site URL `https://www.vertexstealth.top`; Redirect URLs: add
   `https://www.vertexstealth.top/login`, `https://www.vertexstealth.top/account` and `https://www.vertexstealth.top/**`.
6. Done. The **Continue with Google** button appears on `/login` and `/signup` automatically once the provider is on (the page checks Supabase).

Notes: a Google user has no password. The desktop app signs in with email and password, so they set one on `/account` -> Security.
If the same email already has a password account, Supabase links both sign-in methods to one account.

## Part 6. Account dashboard and partner dashboard access

1. Supabase -> **SQL Editor** -> paste all of `supabase/account-dashboard.sql` -> **Run**. (Safe to run twice. It adds three functions: `my_partner`, `my_devices`, `partner_session_for_user`.)
2. Redeploy the functions (they share the changed email code):
   ```
   supabase functions deploy partner-apply --no-verify-jwt
   supabase functions deploy partner-click --no-verify-jwt
   supabase functions deploy partner-portal --no-verify-jwt
   supabase functions deploy partner-admin-review
   ```
3. Push the website. Vercel rebuilds.

How it works for a partner: when you **Approve** an application, the partner gets the email. If they have (or create) a VertexStealth account
with the **same, confirmed email** (password or Google), `/account` shows **Open partner dashboard** and `/partner` signs them in automatically.
Without an account they can still use the one-time email link on `/partner`.
