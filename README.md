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
| FAQ and pricing copy | `scripts/build.js` (`faq`, `pricingHtml`) |
| Page copy, CSS, JS | `src/index.main.html`, `src/styles.css`, `src/app.js` |
| Social preview image | `src/static/og-image.png` (1200x630) |

## Local preview
`npm install && npm run build && npm start` -> http://localhost:3000
