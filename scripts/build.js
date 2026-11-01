#!/usr/bin/env node
'use strict';
/*
 * VertexStealth website build.
 *   src/            templates, CSS, JS, static files
 *   legal/*.md      your Terms / Privacy / EULA (rendered to /terms /privacy /eula)
 *   site.config.json  company details, pricing, download link, payments flag
 *   dist/           output (what Vercel serves)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { marked } = require('marked');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const cfg = JSON.parse(read('site.config.json'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => '$' + n;

// ---------- site URL ----------
const env = process.env;
const isProd = !env.VERCEL_ENV || env.VERCEL_ENV === 'production';
let siteUrl = env.SITE_URL || cfg.siteUrl ||
  (env.VERCEL_PROJECT_PRODUCTION_URL && 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL) ||
  (env.VERCEL_URL && 'https://' + env.VERCEL_URL) || 'http://localhost:3000';
siteUrl = siteUrl.replace(/\/+$/, '');

// ---------- assets (content-hashed so caching is safe) ----------
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
function emitAsset(file) {
  const body = fs.readFileSync(path.join(src, file));
  const h = crypto.createHash('sha1').update(body).digest('hex').slice(0, 8);
  const ext = path.extname(file);
  const name = `assets/${path.basename(file, ext)}.${h}${ext}`;
  fs.writeFileSync(path.join(dist, name), body);
  return '/' + name;
}
const cssUrl = emitAsset('styles.css');
const jsUrl = emitAsset('app.js');
for (const f of fs.readdirSync(path.join(src, 'static'))) {
  fs.copyFileSync(path.join(src, 'static', f), path.join(dist, f));
}

// ---------- content ----------
const P = cfg.pricing;
const live = !!cfg.paymentsLive;
const mail = (subject) => `mailto:${cfg.email}?subject=${encodeURIComponent(subject)}`;
const saving = P.monthly * 12 - P.yearly;

const faq = [
  ['What is VertexStealth?', 'VertexStealth is an antidetect browser and multi-profile manager for Windows. It launches your installed Chrome or Firefox with a separate profile folder and individual browser settings, and includes proxy configuration, fingerprint controls, WebRTC options and inspection tools.'],
  ['How does profile isolation work?', 'Each managed profile uses its own application-managed browser data folder. This keeps profile cookies and browser storage separate from other VertexStealth profiles and from your regular Chrome or Firefox profile.'],
  ['Can I use my own proxy?', 'Yes. VertexStealth supports per-profile HTTP, HTTPS, and SOCKS5 proxy configuration, including authenticated proxy workflows. Proxy performance and behavior depend on the provider, network, and configuration.'],
  ['Which browsers and operating systems are supported?', 'VertexStealth is a Windows desktop app (Windows 10 and 11). It launches Google Chrome or Mozilla Firefox, which must already be installed on your computer. macOS and Linux versions are not available yet.'],
  ['Is there a free trial?', `Yes. Every new account gets a ${P.trialDays}-day free trial with up to ${P.trialProfiles} browser profiles. After the trial you need a paid plan (${money(P.monthly)} per month or ${money(P.yearly)} per year, USD) to keep using your profiles. Your profiles are not deleted: they are locked and become usable again once a paid plan is active.` + (live ? '' : ' Paid checkout is not open yet.')],
  ['How many browser profiles can I create?', `During the ${P.trialDays}-day trial you can have up to ${P.trialProfiles} browser profiles at a time. Paid plans remove the profile limit.`],
  ['How do I cancel a paid plan?', `You can cancel at any time from your payment provider's subscription settings or by emailing ${cfg.email}. Cancellation takes effect at the end of the current billing period, so you keep paid access until then. See the Terms of Service for refund details.`],
  ['What can I not use VertexStealth for?', 'You may use VertexStealth only for lawful purposes. The Terms of Service prohibit fraud, identity theft, account takeover, credential stuffing, spam, unauthorised access to systems or accounts, illegal content and infringement of third-party rights. Whether running several accounts on a given website breaches that site\'s own terms is your responsibility.'],
  ['Why does Windows say "Windows protected your PC" when I install?', 'The installer is not code-signed yet, and Windows SmartScreen warns about new files with no reputation. Choose More info, then Run anyway. The Download page has step-by-step instructions.'],
  ['Do I need an account?', 'Yes. You create a VertexStealth account inside the app. The account holds your sign-in and plan details; your browser profiles, cookies and browsing data stay on your computer.'],
  ['What is a browser fingerprint?', 'A browser fingerprint is a collection of browser and device signals that websites may use to distinguish sessions. Examples include browser version, platform, screen dimensions, language, timezone, fonts, and graphics-related properties.'],
  ['Can VertexStealth guarantee anonymity or stop account bans?', 'No. Fingerprint configuration and profile separation do not guarantee anonymity, undetectability, or freedom from website restrictions. Sites can use many signals and their own policies. Use the software responsibly and follow applicable laws and platform terms.'],
  ['Does VertexStealth include cloud profiles or team sharing?', 'No. Profiles are stored locally on your computer. VertexStealth does not host browser sessions in the cloud or share profiles between accounts. To enforce plan limits it keeps an opaque identifier for each profile with your account; see the Privacy Policy for details.'],
];

function faqHtml() {
  return `<section class="section pale" id="faq">
 <div class="wrap"><div class="section-head"><div class="kicker">Good to know</div><h2>Frequently asked questions</h2><p>Useful answers about browser profiles, proxies, fingerprint settings, plans and supported workflows.</p></div>
  <div class="faq">
${faq.map(([q, a]) => `   <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
  </div>
 </div>
</section>`;
}

function pricingHtml() {
  const paidBtn = (cls) => live
    ? `<a class="btn ${cls}" href="/download">Download, then upgrade in the app</a>`
    : `<a class="btn ${cls}" href="${esc(mail('VertexStealth paid plans'))}">Get notified</a>`;
  const note = `New accounts start with a ${P.trialDays}-day trial. All prices are in USD.` + (live
    ? ' Pay by card, PayPal or crypto (Binance Pay); crypto payments are one-off and do not renew automatically.'
    : ' Paid plans are opening soon: email us and we will let you know.');
  return `<section class="section wrap" id="pricing">
 <div class="section-head"><div class="kicker">Plans &amp; pricing</div><h2>Try it free for ${P.trialDays} days, then choose a plan</h2><p>Every new account gets a ${P.trialDays}-day trial with up to ${P.trialProfiles} profiles. After the trial, a paid plan is needed to keep using your profiles.</p></div>
 <div class="pricing-note">${esc(note)}</div>
 <div class="plans">
  <article class="plan"><h3>Free trial</h3><p>For trying isolated browser profiles and core settings.</p><div class="price">$0 <small>for ${P.trialDays} days</small></div><div class="features-list"><span><b class="check">✓</b> Up to ${P.trialProfiles} browser profiles</span><span><b class="check">✓</b> Chrome and Firefox launch</span><span><b class="check">✓</b> Proxy, fingerprint and WebRTC settings</span></div><a class="btn outline" href="/download">Start free trial</a><p class="plan-note">Then pick Monthly or Yearly. Your profiles are locked, not deleted, until you do.</p></article>
  <article class="plan"><h3>Monthly</h3><p>Unlimited profiles, billed every month.</p><div class="price">${money(P.monthly)} <small>/ month</small></div><div class="features-list"><span><b class="check">✓</b> Unlimited browser profiles</span><span><b class="check">✓</b> Everything in the trial</span><span><b class="check">✓</b> App updates included</span></div>${paidBtn('outline')}<p class="plan-note">${live ? 'Card, PayPal or crypto.' : 'Checkout opens soon.'}</p></article>
  <article class="plan featured"><span class="plan-badge">BEST VALUE</span><h3>Yearly</h3><p>Unlimited profiles, billed once a year.</p><div class="price">${money(P.yearly)} <small>/ year</small></div><div class="features-list"><span><b class="check">✓</b> Unlimited browser profiles</span><span><b class="check">✓</b> Everything in the trial</span><span><b class="check">✓</b> Save ${money(saving)} compared with monthly</span></div>${paidBtn('primary')}<p class="plan-note">${live ? 'Card, PayPal or crypto.' : 'Checkout opens soon.'}</p></article>
 </div>
</section>`;
}

const finalCta = `<section class="final-cta" id="get-started"><div class="wrap cta-inner"><div><div class="eyebrow">Take control of your browser workspace</div><h2>Keep every profile in its own lane.</h2><p>Download VertexStealth for Windows and try it free for ${P.trialDays} days.</p></div><div class="actions flush"><a class="btn primary" href="/download">Download for Windows <span>↓</span></a><a class="btn outline" href="/features">Explore features</a></div></div></section>`;

// ---------- layout ----------
const header = `<a class="skip" href="#top">Skip to content</a>
<div class="announcement">A focused workspace for browser profile management. <strong>Meet VertexStealth.</strong> <a href="/features">Explore the platform →</a></div>
<header class="header">
 <div class="wrap nav">
  <a class="brand" href="/" aria-label="VertexStealth home"><span class="brandmark">V</span><span class="brandname">Vertex<span>Stealth</span></span></a>
  <button class="menu" id="menu" aria-expanded="false" aria-controls="links">Menu</button>
  <nav class="links" id="links" aria-label="Main navigation">
   <a href="/features">Features</a><a href="/antidetect-browser">Antidetect browser</a><a href="/multi-profile-management">Multi-profile</a><a href="/pricing">Pricing</a><a href="/faq">FAQ</a><a href="/blog">Blog</a><a class="m-only" href="/download">Download</a><a class="m-only" href="/login" data-auth-link>Sign in</a>
  </nav>
  <div class="navright"><a class="login" href="/download">Download</a><a class="login" href="/login" data-auth-link>Sign in</a><a class="btn primary" href="/download">Get VertexStealth <span>↗</span></a></div>
 </div>
</header>`;

const footer = `<footer class="footer"><div class="wrap"><div class="footer-top"><div class="footer-brand"><a class="brand" href="/"><span class="brandmark">V</span><span class="brandname">Vertex<span>Stealth</span></span></a><p>An antidetect browser and multi-profile manager: isolated Chrome and Firefox profiles with per-profile proxies and fingerprint settings, in one Windows desktop workspace.</p></div><div class="footer-cols"><div class="footer-col"><strong>Product</strong><a href="/features">Features</a><a href="/antidetect-browser">Antidetect browser</a><a href="/multi-profile-management">Multi-profile management</a><a href="/pricing">Pricing</a><a href="/download">Download</a></div><div class="footer-col"><strong>Learn</strong><a href="/product-preview">Product preview</a><a href="/how-it-works">How it works</a><a href="/use-cases">Use cases</a><a href="/faq">FAQ</a><a href="/blog">Blog</a></div><div class="footer-col"><strong>Company</strong><a href="${esc(mail('VertexStealth support'))}">Contact &amp; support</a><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a><a href="/eula">EULA</a></div></div></div><div class="footer-bottom"><span>© <span id="year">${new Date().getFullYear()}</span> ${esc(cfg.company)}. All rights reserved.</span><span>Product mockups are illustrative.</span></div></div></footer>`;


// ---------- structured data ----------
const software = () => ({
  '@type': 'SoftwareApplication', '@id': siteUrl + '/#software', name: cfg.name, url: siteUrl + '/',
  applicationCategory: 'BrowserApplication', operatingSystem: 'Windows 10, Windows 11',
  description: 'An antidetect browser and multi-profile manager for Windows that launches installed Chrome or Firefox using isolated profile folders, with per-profile proxy configuration, configurable fingerprint settings, WebRTC options and live fingerprint inspection.',
  publisher: { '@id': siteUrl + '/#org' },
  offers: [
    ...(live ? [
      { '@type': 'Offer', name: 'Monthly', price: String(P.monthly), priceCurrency: 'USD', url: siteUrl + '/pricing' },
      { '@type': 'Offer', name: 'Yearly', price: String(P.yearly), priceCurrency: 'USD', url: siteUrl + '/pricing' },
    ] : []),
  ],
});
const faqNode = (items) => ({ '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const howtoNode = (h) => ({ '@type': 'HowTo', name: h.name, step: h.steps.map(([n, t], i) => ({ '@type': 'HowToStep', position: i + 1, name: n, text: t })) });
const buildDate = new Date().toISOString().slice(0, 10);
const faqBlock = (items) => `<h2>Frequently asked questions</h2>\n<div class="faq">\n${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}\n</div>`;

function page({ file, title, desc, canonicalPath, main, nodes = [], crumb = null, index = true, bare = false, scripts = [], styles = [], pageId = '' }) {
  const url = siteUrl + canonicalPath;
  const robots = index && isProd ? 'index,follow,max-image-preview:large' : 'noindex,nofollow';
  const og = `${siteUrl}/og-image.png`;
  const graph = [
    { '@type': 'Organization', '@id': siteUrl + '/#org', name: cfg.company, url: siteUrl + '/', email: cfg.email, logo: siteUrl + '/favicon.svg' },
    { '@type': 'WebSite', '@id': siteUrl + '/#website', url: siteUrl + '/', name: cfg.name, inLanguage: 'en', publisher: { '@id': siteUrl + '/#org' } },
    { '@type': 'WebPage', '@id': url + '#webpage', url, name: title, description: desc, inLanguage: 'en', dateModified: buildDate, isPartOf: { '@id': siteUrl + '/#website' } },
    ...nodes,
    ...(crumb ? [{ '@type': 'BreadcrumbList', itemListElement: [['Home', '/'], ...(Array.isArray(crumb) ? crumb : [[crumb, canonicalPath]])].map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: siteUrl + u })) }] : []),
  ];
  const jsonld = '\n<script type="application/ld+json">\n' + JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') + '\n</script>';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#f7fbff">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(og)}">${jsonld}
<link rel="stylesheet" href="${cssUrl}">${styles.map((u) => `\n<link rel="stylesheet" href="${u}">`).join('')}
</head>
<body${pageId ? ` data-page="${pageId}"` : ''}>
${bare ? '' : header}
<main id="top">
${main}
</main>
${bare ? '' : footer}
<script src="${jsUrl}" defer></script>${scripts.map((u) => `\n<script src="${u}" defer></script>`).join('')}
</body>
</html>
`;
  fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
  fs.writeFileSync(path.join(dist, file), html);
}

// ---------- home ----------
const defaultTitle = 'VertexStealth — Antidetect Browser & Multi-Profile Manager';
const homeDesc = 'VertexStealth is an antidetect browser and multi-profile manager for Windows: isolated Chrome and Firefox profiles with per-profile proxies, fingerprint controls and live checks.';

const homeMain = read('src/index.main.html')
  .replace('{{PRICING}}', pricingHtml())
  .replace('{{FAQ}}', faqHtml())
  .replace('{{FINAL_CTA}}', finalCta);
page({ file: 'index.html', title: defaultTitle, desc: homeDesc, canonicalPath: '/', main: homeMain, nodes: [software(), faqNode(faq)] });

// ---------- section pages (/features, /pricing, /faq ...) ----------
const secs = {};
for (const m of homeMain.matchAll(/<section class="[^"]*" id="([^"]+)">[\s\S]*?<\/section>/g)) secs[m[1]] = m[0];
const sectionPages = [
  { slug: 'features', ids: ['features', 'isolation', 'fingerprint'], crumb: 'Features', title: 'Features — Isolated Profiles, Proxies & Fingerprint Controls | VertexStealth', desc: 'Everything in VertexStealth: isolated Chrome and Firefox profiles, per-profile proxies, fingerprint settings, WebRTC options and fingerprint checks.',
    answer: 'VertexStealth is a Windows antidetect browser and multi-profile manager that launches your installed Chrome or Firefox with isolated profile folders, per-profile proxies and configurable fingerprint settings.',
    faqs: [
      ['How does VertexStealth keep browser profiles separate?', 'Each managed profile launches Chrome or Firefox with its own browser data folder, so cookies and browser storage stay separate from other VertexStealth profiles and from your regular browser profile.'],
      ['Which proxy types does VertexStealth support?', 'VertexStealth supports HTTP, HTTPS and SOCKS5 proxies per profile, including authenticated proxies, and includes a connection test you can run before launching.'],
      ['Which fingerprint signals can I configure?', 'Supported signals include user agent, platform, language, timezone, geolocation, screen resolution, fonts, hardware-related values, WebRTC behavior and selected Canvas, WebGL and audio overrides. Always verify what the browser actually reports with the built-in Fingerprint Check.'],
      ['Does VertexStealth work on macOS or Linux?', 'Not yet. VertexStealth is a Windows 10 and 11 desktop app and launches Google Chrome or Mozilla Firefox, which must already be installed.'],
    ], nodes: () => [software()] },
  { slug: 'product-preview', ids: ['product-preview'], crumb: 'Product preview', title: 'Product Preview — Proxy, Fingerprint & Checks | VertexStealth', desc: 'A closer look at VertexStealth: proxy configuration, fingerprint settings and the built-in fingerprint check.',
    answer: 'The VertexStealth interface brings the controls for each browser profile together: proxy configuration, supported fingerprint settings and a fingerprint check, all set per profile.',
    faqs: [
      ['What profile controls can I see in the VertexStealth interface?', 'Each profile has proxy settings (type, credentials and a connection test), fingerprint settings such as navigator, display, environment and location values, WebRTC options and a Fingerprint Check.'],
      ['How does VertexStealth help keep browser profiles separate?', 'Every profile has its own settings and its own browser data folder, so one profile\'s cookies and storage are not shared with another.'],
      ['What can I inspect before I use a profile?', 'After launching a profile you can inspect selected browser properties with the Fingerprint Check, and open external diagnostic pages to compare what the browser reports.'],
    ], nodes: () => [software()] },
  { slug: 'how-it-works', ids: ['how-it-works'], crumb: 'How it works', title: 'How VertexStealth Works — From Profile to Verified Session', desc: 'Create a browser profile, set its environment, launch it and inspect what the browser reports, in three steps.',
    answer: 'VertexStealth works in three steps: create a profile for Chrome or Firefox, set its environment (proxy, timezone, WebRTC and other settings), then launch it and inspect what the browser reports.',
    faqs: [
      ['How do I create a VertexStealth profile?', 'Open the app, add a profile, give it a name, choose Chrome or Firefox and pick a supported desktop or mobile device preset, or randomize the supported settings.'],
      ['What do I need installed before I start?', 'You need Windows 10 or 11 and Google Chrome or Mozilla Firefox already installed. You also create a VertexStealth account inside the app.'],
      ['How do I check a profile after launching it?', 'Use the built-in Fingerprint Check to inspect selected browser properties, and open external diagnostic pages to confirm what the browser reports.'],
    ], howto: { name: 'How to create and verify a VertexStealth profile', steps: [['Create a profile', 'Name the profile, select Chrome or Firefox, and choose a supported device preset or environment configuration.'], ['Set your environment', 'Configure a proxy if needed, then review timezone, geolocation, WebRTC, navigator and other available settings.'], ['Launch and inspect', 'Launch the isolated browser and use Fingerprint Check or external diagnostics to inspect selected properties.']] } },
  { slug: 'use-cases', ids: ['use-cases'], crumb: 'Use cases', title: 'Use Cases — QA, Marketing, Research & Developer Workflows | VertexStealth', desc: 'Where separate browser profiles help: QA and web testing, digital marketing, research and developer workflows.',
    answer: 'VertexStealth is used for QA and web testing, digital marketing, research and developer workflows where separate browser sessions and controlled test environments are useful.',
    faqs: [
      ['Which workflows can VertexStealth support?', 'QA and web testing, digital marketing (keeping client or campaign sessions separate), research and analysis with dedicated sessions and proxies, and developer workflows such as inspecting browser properties and using supported local automation.'],
      ['Can I use VertexStealth for any activity?', 'No. The Terms of Service allow only lawful use and prohibit fraud, identity theft, account takeover, credential stuffing, spam and unauthorised access. Many websites also restrict multiple accounts, and following their rules is your responsibility.'],
      ['Does VertexStealth guarantee anonymity or prevent account bans?', 'No. Profile separation and fingerprint settings do not guarantee anonymity, undetectability or freedom from website restrictions.'],
    ] },
  { slug: 'pricing', ids: ['pricing'], crumb: 'Pricing', title: 'Pricing — Free Trial, Monthly and Yearly | VertexStealth', desc: 'VertexStealth pricing: a ' + P.trialDays + '-day free trial with up to ' + P.trialProfiles + ' profiles, then ' + money(P.monthly) + ' per month or ' + money(P.yearly) + ' per year for unlimited profiles.',
    answer: `VertexStealth offers a ${P.trialDays}-day free trial with up to ${P.trialProfiles} browser profiles, then paid plans at ${money(P.monthly)} per month or ${money(P.yearly)} per year with no profile limit.` + (live ? '' : ' Paid checkout is not open yet.'),
    extra: `<section class="section wrap legal"><h2>How do the VertexStealth plans compare?</h2>
<table><thead><tr><th></th><th>Free trial</th><th>Monthly</th><th>Yearly</th></tr></thead><tbody>
<tr><th>Price (USD)</th><td>$0 for ${P.trialDays} days</td><td>${money(P.monthly)} per month</td><td>${money(P.yearly)} per year (save ${money(saving)})</td></tr>
<tr><th>Browser profiles</th><td>Up to ${P.trialProfiles}</td><td>Unlimited</td><td>Unlimited</td></tr>
<tr><th>Browsers</th><td>Chrome and Firefox</td><td>Chrome and Firefox</td><td>Chrome and Firefox</td></tr>
<tr><th>Proxy, fingerprint and WebRTC settings, Fingerprint Check</th><td>Included</td><td>Included</td><td>Included</td></tr>
<tr><th>Availability</th><td>One trial per account and per device</td><td>After the trial</td><td>After the trial</td></tr>
<tr><th>When it ends</th><td>A paid plan is required; profiles are locked, not deleted</td><td>Cancel any time; access continues to the end of the period</td><td>Cancel any time; access continues to the end of the period</td></tr>
<tr><th>Billing period</th><td>None</td><td>1 month</td><td>12 months</td></tr>
<tr><th>Renewal</th><td>Not applicable</td><td>Automatic for card and PayPal; crypto is a one-off payment</td><td>Automatic for card and PayPal; crypto is a one-off payment</td></tr>
<tr><th>Payment methods</th><td>Not applicable</td><td>Card, PayPal, crypto (Binance Pay)</td><td>Card, PayPal, crypto (Binance Pay)</td></tr>
<tr><th>Refund</th><td>Not applicable</td><td>Full refund within 7 days of your first purchase</td><td>Full refund within 7 days of your first purchase</td></tr>
</tbody></table>
<h2>How do cancellation and refunds work?</h2>
<ul>
<li>You can cancel at any time from your payment provider's subscription settings or by emailing <a href="${esc(mail('VertexStealth support'))}">${esc(cfg.email)}</a>.</li>
<li>Cancellation takes effect at the end of the current billing period, so you keep paid access until then.</li>
<li>If you are dissatisfied with your first purchase, you can ask for a full refund within 7 days.</li>
<li>Price changes for future billing periods are announced at least 30 days in advance.</li>
</ul>
<p>Full details are in the <a href="/terms">Terms of Service</a>.${live ? '' : ' Paid checkout is not open yet.'}</p></section>`,
    faqs: [
      ['What does the VertexStealth free trial include?', `A ${P.trialDays}-day trial with up to ${P.trialProfiles} browser profiles, Chrome or Firefox launch, per-profile proxy, fingerprint and WebRTC settings, and the built-in Fingerprint Check. There is one trial per account and per device.`],
      ['What happens when the trial ends?', `You need a paid plan to keep using your profiles. Your profiles are not deleted: they are locked and become usable again as soon as a paid plan is active.`],
      ['Which payment methods are accepted?', 'Credit or debit card, PayPal and cryptocurrency through Binance Pay. Card and PayPal subscriptions renew automatically; crypto payments are one-off and do not renew automatically.'],
    ], nodes: () => [software()] },
  { slug: 'faq', ids: ['faq'], crumb: 'FAQ', title: 'FAQ — VertexStealth Antidetect Browser', desc: 'Answers about browser profiles, proxies, fingerprint settings, plans and supported workflows in VertexStealth.',
    answer: 'These answers cover what VertexStealth is, how profiles and proxies work, which plans exist, and what the software cannot guarantee.', nodes: () => [faqNode(faq)] },
];
for (const sp of sectionPages) {
  let body = sp.ids.map((id) => secs[id]).join('\n');
  body = body.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>(\s*(?:<\/div>\s*)?)<p([^>]*)>[\s\S]*?<\/p>/, (m, a, t, mid, pa) => `<h1${a}>${t}</h1>${mid}<p${pa}>${esc(sp.answer)}</p>`);
  if (!/<h1/.test(body)) body = body.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/, (m, a, t) => `<h1${a}>${t}</h1>`);
  if (sp.slug === 'features') body = body.replace(/<a class="textlink"[^>]*>[^<]*<\/a>/g, '');
  const faqSec = sp.faqs ? `<section class="section pale"><div class="wrap legal">${faqBlock(sp.faqs)}</div></section>` : '';
  const nodes = [...(sp.nodes ? sp.nodes() : []), ...(sp.faqs ? [faqNode(sp.faqs)] : []), ...(sp.howto ? [howtoNode(sp.howto)] : [])];
  page({ file: sp.slug + '.html', title: sp.title, desc: sp.desc, canonicalPath: '/' + sp.slug, crumb: sp.crumb, nodes, main: body + '\n' + (sp.extra || '') + '\n' + faqSec + '\n' + finalCta });
}

// ---------- blog (src/blog/*.md with front matter) ----------
const fmt = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const blogDir = path.join(src, 'blog');
const posts = (fs.existsSync(blogDir) ? fs.readdirSync(blogDir).filter((f) => f.endsWith('.md')) : []).map((f) => {
  const raw = fs.readFileSync(path.join(blogDir, f), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`blog/${f}: missing front matter`);
  const fm = Object.fromEntries(m[1].split('\n').map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')]; }));
  for (const k of ['title', 'description', 'date']) if (!fm[k]) throw new Error(`blog/${f}: front matter "${k}" is required`);
  const words = m[2].split(/\s+/).length;
  return { slug: f.replace(/\.md$/, ''), ...fm, md: m[2], words, mins: Math.max(1, Math.round(words / 200)) };
}).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

page({
  file: 'blog.html', title: 'Blog — Antidetect Browser & Multi-Profile Guides | VertexStealth', canonicalPath: '/blog', crumb: 'Blog',
  desc: 'Guides on browser fingerprints, proxies and multi-profile browser management from the VertexStealth team.',
  nodes: [{ '@type': 'Blog', '@id': siteUrl + '/blog#blog', url: siteUrl + '/blog', name: cfg.name + ' Blog', publisher: { '@id': siteUrl + '/#org' } }],
  main: `<section class="page"><div class="wrap">
<div class="section-head"><div class="kicker">Blog</div><h1>Guides on profiles, proxies and fingerprints</h1><p class="lead">Practical explainers for managing multiple browser profiles.</p></div>
<div class="posts">
${posts.map((p) => `<article class="post-card"><div class="post-meta">${fmt(p.date)} · ${p.mins} min read</div><h2><a href="/blog/${p.slug}">${esc(p.title)}</a></h2><p>${esc(p.description)}</p><a class="textlink" href="/blog/${p.slug}">Read article →</a></article>`).join('\n')}
</div></div></section>`,
});
for (const p of posts) {
  const url = siteUrl + '/blog/' + p.slug;
  const used = new Set(); const heads = [];
  let bodyHtml = marked.parse(p.md, { gfm: true }).replace(/<a href="(https?:\/\/[^"]+)"/g, '<a href="$1" rel="noopener"')
    .replace(/<h2>([\s\S]*?)<\/h2>/g, (m, t) => {
      let id = t.replace(/<[^>]+>/g, '').replace(/&[#a-z0-9]+;/gi, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
      for (let n = 2; used.has(id); n++) id = id.replace(/-\d+$/, '') + '-' + n;
      used.add(id); heads.push([id, t.replace(/<[^>]+>/g, '')]);
      return `<h2 id="${id}">${t}</h2>`;
    });
  const toc = `<nav class="toc" aria-label="Table of contents"><strong>In this article</strong><ol>${heads.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
  page({
    file: 'blog/' + p.slug + '.html', title: p.seoTitle || `${p.title} — ${cfg.name}`, desc: p.description, canonicalPath: '/blog/' + p.slug,
    crumb: [['Blog', '/blog'], [p.title, '/blog/' + p.slug]],
    nodes: [{ '@type': 'BlogPosting', '@id': url + '#post', headline: p.title, description: p.description, datePublished: p.date, dateModified: p.updated || p.date, wordCount: p.words, inLanguage: 'en', mainEntityOfPage: url, author: { '@id': siteUrl + '/#org' }, publisher: { '@id': siteUrl + '/#org' } }],
    main: `<section class="page"><div class="wrap legal"><a class="back" href="/blog">← All articles</a>
<h1>${esc(p.title)}</h1>
<div class="post-meta">By the ${esc(cfg.name)} team · ${p.updated ? 'Updated ' + fmt(p.updated) : 'Published ' + fmt(p.date)} · ${p.mins} min read</div>
${toc}
${bodyHtml}
<div class="post-cta"><strong>Try it yourself.</strong> <a href="/download">Download ${esc(cfg.name)} for Windows</a> and try it free for ${P.trialDays} days, or see <a href="/features">all features</a> and <a href="/pricing">pricing</a>.</div>
<h2>Keep reading</h2>
<ul class="related">
${posts.filter((x) => x.slug !== p.slug).map((x) => `<li><a href="/blog/${x.slug}">${esc(x.title)}</a></li>`).join('\n')}
</ul></div></section>`,
  });
}

// ---------- download ----------
const dlUrl = (process.env.DOWNLOAD_URL || cfg.downloadUrl || '').trim();
if (dlUrl && !/^https:\/\//.test(dlUrl)) throw new Error('downloadUrl must start with https://');
const dlDirect = (process.env.DOWNLOAD_DIRECT_URL || cfg.downloadDirectUrl || '').trim() || dlUrl;
if (dlDirect && !/^https:\/\//.test(dlDirect)) throw new Error('downloadDirectUrl must start with https://');
const dlCard = dlUrl
  ? `<div class="dl-card"><h2>VertexStealth for Windows</h2><p>Official installer, downloaded straight from our GitHub Releases page.</p><a class="btn primary" href="${esc(dlDirect)}" rel="noopener" data-dl>Download installer <span>↓</span></a><p class="dl-started" id="dlStarted" hidden>Your download is starting. When it finishes, open the file and follow the steps below. Not starting? <a href="${esc(dlUrl)}" rel="noopener">Open the releases page</a>.</p><div class="dl-meta"><span>Windows 10 / 11</span>${cfg.downloadVersion ? `<span data-dl-version>Version ${esc(cfg.downloadVersion)}</span>` : '<span data-dl-version hidden></span>'}<span>Hosted on GitHub</span></div></div>
<div class="dl-notice"><strong>Windows may warn you when you open the installer.</strong> The installer is not code-signed yet, so Windows SmartScreen can show "Windows protected your PC". It is expected, and it takes about 10 seconds to continue. Follow the <a href="/download">steps below</a> or read <a href="/blog/windows-protected-your-pc-smartscreen-install">why this happens</a>.</div>`
  : `<div class="dl-card"><h2>VertexStealth for Windows</h2><div class="dl-soon">The Windows installer is not published yet. Email us and we will tell you as soon as it is available.</div><a class="btn primary" href="${esc(mail('VertexStealth download notification'))}">Notify me</a><div class="dl-meta"><span>Windows 10 / 11</span></div></div>`;
const steps = [
  ['Download the installer', 'Click Download installer and save the .exe file from our official GitHub Releases page. Your browser may say the file is not commonly downloaded: open the download list and choose Keep (or Keep anyway).', 'Click <b>Download installer</b> and save the <b>.exe</b> file from our official GitHub Releases page. Your browser may say the file is not commonly downloaded: open the download list and choose <b>Keep</b> (or <b>Keep anyway</b>).'],
  ['Open the installer', 'Double-click the downloaded VertexStealth setup file in your Downloads folder.', 'Double-click the downloaded <b>VertexStealth</b> setup file in your Downloads folder.'],
  ['Click More info', 'If Windows shows "Windows protected your PC", do not close it. Click the small More info link under the message.', 'If Windows shows <b>"Windows protected your PC"</b>, do not close it. Click the small <b>More info</b> link under the message.'],
  ['Click Run anyway', 'Check that the app name shows the VertexStealth setup file. The publisher will say Unknown publisher because the installer is not code-signed yet. Click Run anyway.', 'Check that the app name shows the VertexStealth setup file. The publisher will say <b>Unknown publisher</b> because the installer is not code-signed yet. Click <b>Run anyway</b>.'],
  ['Allow the installer and finish', 'If User Account Control asks for permission, click Yes, then follow the installer steps.', 'If User Account Control asks for permission, click <b>Yes</b>, then follow the installer steps.'],
  ['Sign in and start', `Open VertexStealth and create your account inside the app. New accounts start with a ${P.trialDays}-day trial.`, `Open VertexStealth and create your account inside the app. New accounts start with a ${P.trialDays}-day trial.`],
];
const dlSteps = { name: 'How to install VertexStealth on Windows and pass the SmartScreen warning', steps: steps.map(([n, t]) => [n, t]) };
const svgA = `<svg viewBox="0 0 520 250" role="img" aria-label="Illustration: the Windows protected your PC window with the More info link highlighted"><rect width="520" height="250" rx="10" fill="#1f5ca9"/><text x="28" y="60" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="24" font-weight="700">Windows protected your PC</text><text x="28" y="94" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="13.5">Microsoft Defender SmartScreen prevented an unrecognized app</text><text x="28" y="114" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="13.5">from starting. Running this app might put your PC at risk.</text><rect x="20" y="132" width="86" height="28" rx="5" fill="none" stroke="#ffd23f" stroke-width="3"/><text x="28" y="152" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="700" text-decoration="underline">More info</text><rect x="350" y="196" width="140" height="32" fill="#fff" fill-opacity=".9"/><text x="420" y="217" text-anchor="middle" fill="#1b2a3a" font-family="Segoe UI,Arial,sans-serif" font-size="14">Don't run</text></svg>`;
const svgB = `<svg viewBox="0 0 520 250" role="img" aria-label="Illustration: the SmartScreen window after More info, with the Run anyway button highlighted"><rect width="520" height="250" rx="10" fill="#1f5ca9"/><text x="28" y="50" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="24" font-weight="700">Windows protected your PC</text><text x="28" y="82" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="13.5">Microsoft Defender SmartScreen prevented an unrecognized app</text><text x="28" y="102" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="13.5">from starting. Running this app might put your PC at risk.</text><text x="28" y="136" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="13.5">App: VertexStealth Setup</text><text x="28" y="157" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="13.5">Publisher: Unknown publisher</text><rect x="196" y="190" width="150" height="40" rx="3" fill="#fff"/><rect x="194" y="188" width="154" height="44" rx="5" fill="none" stroke="#ffd23f" stroke-width="3"/><text x="271" y="215" text-anchor="middle" fill="#1b2a3a" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="700">Run anyway</text><rect x="360" y="190" width="130" height="40" fill="#fff" fill-opacity=".9"/><text x="425" y="215" text-anchor="middle" fill="#1b2a3a" font-family="Segoe UI,Arial,sans-serif" font-size="14">Don't run</text></svg>`;
const dlFaq = [
  ['Why does Windows say "Windows protected your PC"?', 'Windows SmartScreen checks the reputation of downloaded files. The VertexStealth installer is not code-signed yet and new files start with no reputation, so Windows shows a warning for unrecognized apps. Choose More info, then Run anyway.'],
  ['Is the VertexStealth installer safe to run?', 'We publish the installer only on our official GitHub Releases page. The warning appears because the file is new and unsigned, not because Windows found malware. You can also scan the file with Microsoft Defender or an online scanner before running it.'],
  ['Is there a free trial?', `Yes. New accounts get a ${P.trialDays}-day free trial with up to ${P.trialProfiles} browser profiles. After the trial you need a paid plan to keep using your profiles.`],
  ['Which browsers does it work with?', 'VertexStealth launches Google Chrome or Mozilla Firefox, which must already be installed on your computer.'],
  ['Is there a version for macOS or Linux?', 'Not yet. VertexStealth is a Windows 10 and 11 desktop app.'],
  ['Do I need an account?', 'Yes. You create a VertexStealth account inside the app. Your browser profiles and browsing data stay on your computer.'],
];
page({
  file: 'download.html', title: 'Download VertexStealth Antidetect Browser for Windows', canonicalPath: '/download', crumb: 'Download',
  desc: 'Download VertexStealth for Windows, an antidetect browser and multi-profile manager. Free ' + P.trialDays + '-day trial with up to ' + P.trialProfiles + ' browser profiles; uses your installed Chrome or Firefox.',
  nodes: [software(), howtoNode(dlSteps), faqNode(dlFaq)],
  main: `<section class="page"><div class="wrap page-narrow">
<div class="kicker">Download</div>
<h1>Download VertexStealth for Windows</h1>
<p class="lead">VertexStealth for Windows is an antidetect browser and multi-profile manager. It launches your installed Chrome or Firefox with separate profile folders, proxies and fingerprint settings.</p>
${dlCard}
<h2 class="dl-h2">How do I install VertexStealth on Windows?</h2>
<p class="dl-intro">Windows will probably show a blue "Windows protected your PC" window the first time. Here is exactly what to do.</p>
<ol class="sm-steps">
${steps.map(([n, , h]) => `<li><strong>${esc(n)}</strong><span>${h}</span></li>`).join('\n')}
</ol>
<div class="sm-figs"><figure class="sm-fig">${svgA}<figcaption>Step 3: click <b>More info</b>. Illustration, your screen may look slightly different.</figcaption></figure><figure class="sm-fig">${svgB}<figcaption>Step 4: click <b>Run anyway</b>.</figcaption></figure></div>
<h2 class="dl-h2">Why does Windows show this warning?</h2>
<div class="legal"><p>Windows Defender SmartScreen checks the reputation of every downloaded installer. Microsoft says that when a file is not signed, reputation has to build from zero for each new version. Code signing needs a paid certificate, and we are exploring solutions. Until then, new releases may show this warning. Read the full explanation in <a href="/blog/windows-protected-your-pc-smartscreen-install">Windows Protected Your PC: How to Install VertexStealth</a>.</p></div>
<h2 class="dl-h2">How do I make sure I have the real installer?</h2>
<div class="legal"><ul>
<li>Download it only from this page or from our GitHub Releases page: <a href="${esc(dlUrl || '/download')}" rel="noopener">VertexStealth-Release on GitHub</a>.</li>
<li>Do not run copies from other websites, chats or file-sharing links.</li>
<li>Do not turn off SmartScreen or Windows Security to install. You do not need to.</li>
<li>If Windows shows a message that blocks the app with no Run anyway button, contact <a href="${esc(mail('VertexStealth install help'))}">${esc(cfg.email)}</a> and tell us your Windows version.</li>
</ul></div>
<h2 class="dl-h2">What do you get with VertexStealth?</h2>
<div class="legal"><ul>
<li>Isolated Chrome and Firefox profiles, each with its own cookies, storage and settings</li>
<li>A proxy per profile (HTTP, HTTPS or SOCKS5) with a built-in connection test</li>
<li>Configurable fingerprint settings, timezone and location that can follow the proxy, and WebRTC modes</li>
<li>A built-in Fingerprint Check, plus shortcuts to outside testers</li>
<li>A ${P.trialDays}-day free trial with up to ${P.trialProfiles} profiles, then Monthly or Yearly plans</li>
</ul></div>
<h2 class="dl-h2">System requirements</h2>
<div class="legal"><ul>
<li>Windows 10 or Windows 11</li>
<li>Google Chrome or Mozilla Firefox installed</li>
<li>An internet connection for sign-in and your plan</li>
<li>Optional: an HTTP, HTTPS or SOCKS5 proxy for each profile</li>
</ul>
<p>Learn more about <a href="/antidetect-browser">VertexStealth as an antidetect browser</a> and <a href="/multi-profile-management">multi-profile management</a>.</p>
${faqBlock(dlFaq)}</div>
<p class="fineprint">By installing you agree to the <a class="ul" href="/eula">EULA</a>, <a class="ul" href="/terms">Terms of Service</a> and <a class="ul" href="/privacy">Privacy Policy</a>. Need help? <a class="ul" href="${esc(mail('VertexStealth support'))}">${esc(cfg.email)}</a></p>
</div></section>`,
});

// ---------- pillar pages (src/pages/<slug>.html + .json) ----------
const pillars = ['antidetect-browser', 'multi-profile-management'];
for (const slug of pillars) {
  const meta = JSON.parse(read(`src/pages/${slug}.json`));
  const main = read(`src/pages/${slug}.html`)
    .replace('{{FAQ}}', faqBlock(meta.faq))
    .replace(/\{\{FREE\}\}/g, P.trialProfiles).replace(/\{\{TRIAL\}\}/g, P.trialDays)
    .replace(/\{\{MONTHLY\}\}/g, money(P.monthly)).replace(/\{\{YEARLY\}\}/g, money(P.yearly))
    .replace('{{PAID_NOTE}}', live ? '' : ' Paid checkout is not open yet.');
  page({
    file: slug + '.html', title: meta.title, desc: meta.desc, canonicalPath: '/' + slug, crumb: meta.crumb, main,
    nodes: [software(), howtoNode(meta.howto), faqNode(meta.faq)],
  });
}

// ---------- legal pages from legal/*.md ----------
const legalDefs = [
  { slug: 'terms', title: 'Terms of Service', names: ['TERMS_OF_SERVICE', 'TERMS-OF-SERVICE', 'TERMS', 'TERMS_OF_USE'] },
  { slug: 'privacy', title: 'Privacy Policy', names: ['PRIVACY_POLICY', 'PRIVACY-POLICY', 'PRIVACY'] },
  { slug: 'eula', title: 'End User License Agreement', names: ['EULA', 'END_USER_LICENSE_AGREEMENT'] },
];
const legalDir = path.join(root, 'legal');
const legalFiles = fs.existsSync(legalDir) ? fs.readdirSync(legalDir).filter((f) => /\.md$/i.test(f)) : [];
const missing = [];
const legalPages = [];
for (const d of legalDefs) {
  const f = legalFiles.find((x) => d.names.includes(path.basename(x, path.extname(x)).toUpperCase()));
  if (!f) { missing.push(d); continue; }
  legalPages.push({ d, md: fs.readFileSync(path.join(legalDir, f), 'utf8') });
}
if (missing.length && !process.env.ALLOW_MISSING_LEGAL) {
  console.error('\nBUILD STOPPED: missing legal documents in /legal:\n' +
    missing.map((d) => `  - ${d.names[0]}.md  (for /${d.slug})`).join('\n') +
    '\n\nCopy your legal/*.md files from the VertexStealth app project into this site\'s legal/ folder,\n' +
    'then build again. (Set ALLOW_MISSING_LEGAL=1 to build without them - not recommended for production.)\n');
  process.exit(1);
}
for (const { d, md } of legalPages) {
  const hasH1 = /^\s*#\s+\S/.test(md);
  let body = marked.parse(md, { gfm: true }).split('techinfo.vertex@gmail.com').join(cfg.email);
  // legal markdown links to its sibling files (e.g. EULA.md) -> clean site URLs
  body = body.replace(/href="(?:\.{0,2}\/)*(?:legal\/)?([A-Za-z_\-]+)\.md(#[^"]*)?"/g, (m, name, hash) => {
    const hit = legalDefs.find((x) => x.names.includes(name.toUpperCase()));
    return hit ? `href="/${hit.slug}${hash || ''}"` : m;
  });
  page({
    file: d.slug + '.html', title: `${d.title} — ${cfg.name}`, canonicalPath: '/' + d.slug, crumb: d.title,
    desc: `${d.title} for ${cfg.name}, provided by ${cfg.company}.`,
    main: `<section class="page"><div class="wrap legal"><a class="back" href="/">← Back to home</a>\n${hasH1 ? '' : `<h1>${esc(d.title)}</h1>\n`}${body}</div></section>`,
  });
}
for (const d of missing) {
  console.warn(`WARNING: /${d.slug} built as a stub (legal/${d.names[0]}.md missing).`);
  page({
    file: d.slug + '.html', title: `${d.title} — ${cfg.name}`, canonicalPath: '/' + d.slug, index: false,
    desc: `${d.title} for ${cfg.name}.`,
    main: `<section class="page"><div class="wrap legal"><h1>${esc(d.title)}</h1><p>This document is not available yet. Contact <a href="${esc(mail(d.title))}">${esc(cfg.email)}</a>.</p></div></section>`,
  });
}

// ---------- 404 ----------
page({
  file: '404.html', title: 'Page not found — ' + cfg.name, canonicalPath: '/404', index: false,
  desc: 'The page you are looking for does not exist.',
  main: '<section class="notfound"><div class="wrap"><div class="kicker">404</div><h1>This page is not here.</h1><p class="lead">The link may be old or mistyped.</p><a class="btn primary" href="/">Back to home</a></div></section>',
});


// ---------- accounts + admin (Supabase auth, serverless API) ----------
const sbUrl = (process.env.SUPABASE_URL || (cfg.supabase && cfg.supabase.url) || '').trim();
const sbAnon = (process.env.SUPABASE_ANON_KEY || (cfg.supabase && cfg.supabase.anonKey) || '').trim();
if (!sbAnon) console.warn('WARNING: Supabase anon key is empty (site.config.json supabase.anonKey or SUPABASE_ANON_KEY). Sign-in pages will show "not configured".');
fs.writeFileSync(path.join(dist, 'vs-config.js'), `window.VS_CONFIG=${JSON.stringify({ supabaseUrl: sbUrl, anonKey: sbAnon, siteUrl })};\n`);
const authJs = emitAsset('auth.js');
const adminJs = emitAsset('admin.js');
const adminCss = emitAsset('admin.css');
const authScripts = ['/vs-config.js', authJs];
const authPage = (slug, title, body) => page({ file: slug + '.html', title: `${title} — ${cfg.name}`, desc: `${title} for your ${cfg.name} account.`, canonicalPath: '/' + slug, index: false, scripts: authScripts, pageId: slug, main: `<section class="auth-wrap"><div class="auth-card">${body}</div></section>` });
const authNote = 'Your VertexStealth account works on this website and in the desktop app, with the same email and password.';
authPage('login', 'Sign in', `<h1>Sign in</h1><p class="auth-sub">${authNote}</p><div class="auth-msg" id="authMsg" role="alert" hidden></div>
<form id="authForm" novalidate><label class="field"><span>Email</span><input type="email" id="email" autocomplete="email" required></label><label class="field"><span>Password</span><input type="password" id="password" autocomplete="current-password" required></label><button class="btn primary auth-btn" type="submit">Sign in</button></form>
<p class="auth-links"><a href="/forgot">Forgot password?</a><a href="/signup">Create an account</a></p>`);
authPage('signup', 'Create account', `<h1>Create your account</h1><p class="auth-sub">${authNote} New accounts start with a ${P.trialDays}-day free trial.</p><div class="auth-msg" id="authMsg" role="alert" hidden></div>
<form id="authForm" novalidate><label class="field"><span>Email</span><input type="email" id="email" autocomplete="email" required></label><label class="field"><span>Password (at least 8 characters)</span><input type="password" id="password" autocomplete="new-password" minlength="8" required></label><label class="field"><span>Confirm password</span><input type="password" id="password2" autocomplete="new-password" required></label>
<label class="check-row"><input type="checkbox" id="terms" required><span>I am at least 18 and agree to the <a href="/terms">Terms of Service</a>, <a href="/eula">EULA</a> and <a href="/privacy">Privacy Policy</a>.</span></label><button class="btn primary auth-btn" type="submit">Create account</button></form>
<p class="auth-links"><a href="/login">Already have an account? Sign in</a></p>`);
authPage('forgot', 'Reset password', `<h1>Reset your password</h1><p class="auth-sub">Enter your email and we will send you a link to choose a new password.</p><div class="auth-msg" id="authMsg" role="alert" hidden></div>
<form id="authForm" novalidate><label class="field"><span>Email</span><input type="email" id="email" autocomplete="email" required></label><button class="btn primary auth-btn" type="submit">Send reset link</button></form>
<p class="auth-links"><a href="/login">Back to sign in</a></p>`);
authPage('account', 'Your account', `<h1>Your account</h1><div class="auth-msg" id="authMsg" role="alert" hidden></div>
<div id="accountBody" hidden><dl class="acct"><div><dt>Email</dt><dd id="acctEmail"></dd></div><div><dt>Member since</dt><dd id="acctSince"></dd></div><div id="acctPlanRow" hidden><dt>Plan</dt><dd id="acctPlan"></dd></div></dl>
<div class="acct-actions"><a class="btn primary" href="/download">Download for Windows <span>↓</span></a><button class="btn outline" type="button" id="signOut">Sign out</button></div>
<h2 id="pwTitle">Change password</h2><form id="authForm" novalidate><label class="field"><span>New password (at least 8 characters)</span><input type="password" id="password" autocomplete="new-password" minlength="8" required></label><label class="field"><span>Confirm new password</span><input type="password" id="password2" autocomplete="new-password" required></label><button class="btn outline auth-btn" type="submit">Update password</button></form>
<p class="auth-links"><a href="${esc(mail('Account help'))}">Need help? ${esc(cfg.email)}</a></p></div>`);
page({ file: 'admin.html', title: 'Admin — ' + cfg.name, desc: 'Administration.', canonicalPath: '/admin', index: false, bare: true, scripts: [...authScripts, adminJs], styles: [adminCss], pageId: 'admin', main: '<div id="adminRoot" class="adm-root"><p class="adm-boot">Loading…</p></div>' });

// ---------- robots + sitemap ----------
fs.writeFileSync(path.join(dist, 'robots.txt'), isProd
  ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /login\nDisallow: /signup\nDisallow: /forgot\nDisallow: /account\n\nSitemap: ${siteUrl}/sitemap.xml\n`
  : 'User-agent: *\nDisallow: /\n');
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', '/features', '/product-preview', '/how-it-works', '/use-cases', '/pricing', '/faq', '/antidetect-browser', '/multi-profile-management', '/download', '/blog', ...posts.map((p) => '/blog/' + p.slug), '/terms', '/privacy', '/eula'];
fs.writeFileSync(path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${siteUrl}${u === '/' ? '/' : u}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');

// ---------- sanity checks ----------
const problems = [];
for (const f of fs.readdirSync(dist).filter((x) => x.endsWith('.html'))) {
  const t = fs.readFileSync(path.join(dist, f), 'utf8');
  if (/\{\{|\}\}/.test(t.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ''))) problems.push(f + ': unreplaced template marker');
  if (/example\.com|hello@/.test(t)) problems.push(f + ': placeholder domain/email left in page');
  if (/\sstyle="/.test(t)) problems.push(f + ': inline style (blocked by the CSP)');
}
if (problems.length) { console.error('BUILD STOPPED:\n  ' + problems.join('\n  ')); process.exit(1); }

console.log(`Built ${fs.readdirSync(dist).filter((x) => x.endsWith('.html')).length} pages -> dist/`);
console.log(`Site URL: ${siteUrl}  (${isProd ? 'indexable' : 'preview: noindex'})`);
console.log(`Download link: ${dlUrl || '(none yet - Download page shows "Notify me")'}`);
if (dlDirect) console.log(`Direct download: ${dlDirect}`);
console.log(`Payments: ${live ? 'LIVE wording' : 'not live (paid buttons say "Get notified")'}`);
