# VertexStealth website

Static site built by a small Node script (`scripts/build.js`) from the original design. No framework.

## Before the first deploy
1. Copy `TERMS_OF_SERVICE.md`, `PRIVACY_POLICY.md`, `EULA.md` from the app project's `legal/` folder into this project's `legal/` folder. The build refuses to run without them.
2. Open `site.config.json` and check: company, email, pricing, `paymentsLive`, `downloadUrl`.

## Deploy on Vercel
1. Push this folder to a GitHub repo (the `site` folder itself as the repo root).
2. Vercel -> Add New -> Project -> import the repo. Framework Preset: **Other**. Leave the build settings alone (`vercel.json` sets `npm run build` and output `dist`).
3. Deploy. Add your domain under Project -> Settings -> Domains. The canonical URL, sitemap and social tags follow the production domain automatically; to force one, set the env var `SITE_URL` (e.g. `https://vertexstealth.com`).
Preview deployments are automatically `noindex`.

## Things you change over time
| What | Where |
|---|---|
| Installer link | `site.config.json` -> `downloadUrl` (https only) and `downloadVersion`, or env var `DOWNLOAD_URL` |
| Turn on paid wording | `site.config.json` -> `"paymentsLive": true` (only once checkout works in the app) |
| Prices / free limit / trial | `site.config.json` -> `pricing` |
| Legal text | replace the `.md` in `legal/`, push |
| Homepage FAQ and pricing copy | `scripts/build.js` (`faq`, `pricingHtml`) |
| Antidetect / multi-profile pages | `src/pages/<slug>.html` (copy) and `<slug>.json` (title, description, FAQ, steps; FAQ and HowTo structured data are generated from it) |
| Download page copy and FAQ | `scripts/build.js` (`dlSteps`, `dlFaq`) |
| Page copy, CSS, JS | `src/index.main.html`, `src/styles.css`, `src/app.js` |
| Social preview image | `src/static/og-image.png` (1200x630) |

## Local preview
`npm install && npm run build && npm start` -> http://localhost:3000

## Pages
`/` home, `/antidetect-browser`, `/multi-profile-management`, `/download`, `/terms`, `/privacy`, `/eula`, 404. Every page emits JSON-LD (Organization, WebSite, WebPage; plus SoftwareApplication, HowTo, FAQPage and BreadcrumbList where relevant). Links between legal files such as `EULA.md` are rewritten to `/eula` automatically.

After deploying, validate the structured data at https://validator.schema.org and re-run your SEO crawler.

## Partner program page (`/partners-program`)
Content: `src/pages/partners-program.html` (+ `.json` for title, FAQ and steps). Program numbers live in `site.config.json` -> `partners`:
`commissionPercent` (20), `attributionDays` (30), `holdDays` (14, covers refunds), `minPayout` (50), `reviewTime`, `termsUpdated`. Change a number and every mention (copy, FAQ, terms, schema) updates on the next build. Have the Terms reviewed by a lawyer before launch.

**Application form.** With `partners.applyEndpoint` empty, the page shows an "Apply by email" button (pre-filled mail to the contact address). To use the real form, set `partners.applyEndpoint` (or env var `PARTNER_APPLY_URL`) to an https endpoint that accepts:
`POST` JSON `{ name, email, country, channel_url, promotion_plan }` and answers 2xx on success. The endpoint must send CORS headers allowing your site origin, validate and rate-limit input, and store the application as "pending" for admin review. `vercel.json` allows `connect-src` to `https://*.supabase.co`; edit it if the endpoint lives elsewhere.

## Partner program backend (referral links, portal, admin)
Pages: `/r/<code>` (referral landing, counts the visit then goes to `/download`), `/partner` (partner portal, e-mailed sign-in link), `/partner-admin` (your admin page; built only when the settings below are filled in; not linked, not indexed).
Turn it on in `site.config.json` -> `partners`: `"backendLive": true`, `functionsUrl`, `supabaseUrl`, `supabaseAnonKey` (public anon key). Env overrides: `PARTNER_BACKEND_LIVE=1`, `PARTNER_FUNCTIONS_URL`, `PARTNER_SUPABASE_URL`, `PARTNER_ADMIN_ANON_KEY`.
With `backendLive: false` the application form falls back to e-mail and the portal shows "opens when the program launches". Deploy the database and functions first: see the partner backend's `docs/DEPLOY.md`.
Local preview (`npm start`) sends the same security headers as Vercel; set `EXTRA_CONNECT="http://localhost:8001"` to allow a local API.
