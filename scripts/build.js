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
  ['What is VertexStealth?', 'VertexStealth is a desktop browser profile manager that launches installed Chrome or Firefox with a separate profile directory and individual browser settings. It includes proxy configuration, fingerprint controls, WebRTC options, and inspection tools.'],
  ['How does profile isolation work?', 'Each managed profile uses its own application-managed browser data folder. This keeps profile cookies and browser storage separate from other VertexStealth profiles and from your regular Chrome or Firefox profile.'],
  ['Can I use my own proxy?', 'Yes. VertexStealth supports per-profile HTTP, HTTPS, and SOCKS5 proxy configuration, including authenticated proxy workflows. Proxy performance and behavior depend on the provider, network, and configuration.'],
  ['Which browsers and operating systems are supported?', 'VertexStealth is a Windows desktop app (Windows 10 and 11). It launches Google Chrome or Mozilla Firefox, which must already be installed on your computer. macOS and Linux versions are not available yet.'],
  ['Is VertexStealth free?', `You can use VertexStealth for free with up to ${P.freeProfiles} browser profiles. New accounts also start with a ${P.trialDays}-day trial without that limit. Paid plans cost ${money(P.monthly)} per month or ${money(P.yearly)} per year (USD) and remove the profile limit.` + (live ? '' : ' Paid checkout is not open yet.')],
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
 <div class="section-head"><div class="kicker">Plans &amp; pricing</div><h2>Start free, upgrade when you need more profiles</h2><p>Try VertexStealth with ${P.freeProfiles} profiles at no cost. Paid plans remove the limit.</p></div>
 <div class="pricing-note">${esc(note)}</div>
 <div class="plans">
  <article class="plan"><h3>Free</h3><p>For trying isolated browser profiles and core settings.</p><div class="price">$0 <small>forever</small></div><div class="features-list"><span><b class="check">✓</b> Up to ${P.freeProfiles} browser profiles</span><span><b class="check">✓</b> Chrome and Firefox launch</span><span><b class="check">✓</b> Proxy, fingerprint and WebRTC settings</span></div><a class="btn outline" href="/download">Download free</a><p class="plan-note">Includes a ${P.trialDays}-day trial without the profile limit.</p></article>
  <article class="plan"><h3>Monthly</h3><p>Unlimited profiles, billed every month.</p><div class="price">${money(P.monthly)} <small>/ month</small></div><div class="features-list"><span><b class="check">✓</b> Unlimited browser profiles</span><span><b class="check">✓</b> Everything in Free</span><span><b class="check">✓</b> App updates included</span></div>${paidBtn('outline')}<p class="plan-note">${live ? 'Card, PayPal or crypto.' : 'Checkout opens soon.'}</p></article>
  <article class="plan featured"><span class="plan-badge">BEST VALUE</span><h3>Yearly</h3><p>Unlimited profiles, billed once a year.</p><div class="price">${money(P.yearly)} <small>/ year</small></div><div class="features-list"><span><b class="check">✓</b> Unlimited browser profiles</span><span><b class="check">✓</b> Everything in Free</span><span><b class="check">✓</b> Save ${money(saving)} compared with monthly</span></div>${paidBtn('primary')}<p class="plan-note">${live ? 'Card, PayPal or crypto.' : 'Checkout opens soon.'}</p></article>
 </div>
</section>`;
}

const finalCta = `<section class="final-cta" id="get-started"><div class="wrap cta-inner"><div><div class="eyebrow">Take control of your browser workspace</div><h2>Keep every profile in its own lane.</h2><p>Download VertexStealth for Windows and start with ${P.freeProfiles} free profiles.</p></div><div class="actions flush"><a class="btn primary" href="/download">Download for Windows <span>↓</span></a><a class="btn outline" href="/#features">Explore features</a></div></div></section>`;

// ---------- layout ----------
const header = `<a class="skip" href="#top">Skip to content</a>
<div class="announcement">A focused workspace for browser profile management. <strong>Meet VertexStealth.</strong> <a href="/#features">Explore the platform →</a></div>
<header class="header">
 <div class="wrap nav">
  <a class="brand" href="/" aria-label="VertexStealth home"><span class="brandmark">V</span><span class="brandname">Vertex<span>Stealth</span></span></a>
  <button class="menu" id="menu" aria-expanded="false" aria-controls="links">Menu</button>
  <nav class="links" id="links" aria-label="Main navigation">
   <a href="/#features">Features</a><a href="/#how-it-works">How it works</a><a href="/#use-cases">Use cases</a><a href="/#pricing">Pricing</a><a href="/#faq">FAQ</a><a class="m-only" href="/download">Download</a>
  </nav>
  <div class="navright"><a class="login" href="/download">Download</a><a class="btn primary" href="/download">Get VertexStealth <span>↗</span></a></div>
 </div>
</header>`;

const footer = `<footer class="footer"><div class="wrap"><div class="footer-top"><div class="footer-brand"><a class="brand" href="/"><span class="brandmark">V</span><span class="brandname">Vertex<span>Stealth</span></span></a><p>Isolated browser profiles and configurable browser environments, brought together in a desktop workspace.</p></div><div class="footer-cols"><div class="footer-col"><strong>Product</strong><a href="/#features">Features</a><a href="/#product-preview">Product preview</a><a href="/#pricing">Pricing</a><a href="/download">Download</a></div><div class="footer-col"><strong>Learn</strong><a href="/#how-it-works">How it works</a><a href="/#use-cases">Use cases</a><a href="/#faq">FAQ</a></div><div class="footer-col"><strong>Company</strong><a href="${esc(mail('VertexStealth support'))}">Contact &amp; support</a><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a><a href="/eula">EULA</a></div></div></div><div class="footer-bottom"><span>© <span id="year">${new Date().getFullYear()}</span> ${esc(cfg.company)}. All rights reserved.</span><span>Product mockups are illustrative.</span></div></div></footer>`;

function page({ file, title, desc, canonicalPath, main, jsonld = '', index = true }) {
  const url = siteUrl + canonicalPath;
  const robots = index && isProd ? 'index,follow,max-image-preview:large' : 'noindex,nofollow';
  const og = `${siteUrl}/og-image.png`;
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
<link rel="stylesheet" href="${cssUrl}">
</head>
<body>
${header}
<main id="top">
${main}
</main>
${footer}
<script src="${jsUrl}" defer></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(dist, file), html);
}

// ---------- home ----------
const defaultTitle = 'VertexStealth — Isolated Browser Profiles & Fingerprint Control';
const homeDesc = 'Manage isolated Chrome and Firefox profiles with per-profile proxies, configurable browser fingerprint settings, WebRTC controls and fingerprint inspection in one Windows desktop workspace.';
const jsonld = '\n<script type="application/ld+json">\n' + JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': siteUrl + '/#org', name: cfg.company, url: siteUrl + '/', email: cfg.email },
    { '@type': 'WebSite', '@id': siteUrl + '/#website', url: siteUrl + '/', name: cfg.name, inLanguage: 'en', publisher: { '@id': siteUrl + '/#org' } },
    {
      '@type': 'SoftwareApplication', '@id': siteUrl + '/#software', name: cfg.name, url: siteUrl + '/',
      applicationCategory: 'BrowserApplication', operatingSystem: 'Windows 10, Windows 11',
      description: 'A desktop browser profile manager that launches installed Chrome or Firefox using isolated profile folders, with per-profile proxy configuration, configurable fingerprint overrides, WebRTC options and live fingerprint inspection.',
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD', url: siteUrl + '/#pricing' },
        ...(live ? [
          { '@type': 'Offer', name: 'Monthly', price: String(P.monthly), priceCurrency: 'USD', url: siteUrl + '/#pricing' },
          { '@type': 'Offer', name: 'Yearly', price: String(P.yearly), priceCurrency: 'USD', url: siteUrl + '/#pricing' },
        ] : []),
      ],
    },
    { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ],
}, null, 1).replace(/</g, '\\u003c') + '\n</script>';

const homeMain = read('src/index.main.html')
  .replace('{{PRICING}}', pricingHtml())
  .replace('{{FAQ}}', faqHtml())
  .replace('{{FINAL_CTA}}', finalCta);
page({ file: 'index.html', title: defaultTitle, desc: homeDesc, canonicalPath: '/', main: homeMain, jsonld });

// ---------- download ----------
const dlUrl = (process.env.DOWNLOAD_URL || cfg.downloadUrl || '').trim();
if (dlUrl && !/^https:\/\//.test(dlUrl)) throw new Error('downloadUrl must start with https://');
const dlCard = dlUrl
  ? `<div class="dl-card"><h2>VertexStealth for Windows</h2><p>Free to start with ${P.freeProfiles} profiles.</p><a class="btn primary" href="${esc(dlUrl)}" rel="noopener">Download installer <span>↓</span></a><div class="dl-meta"><span>Windows 10 / 11</span>${cfg.downloadVersion ? `<span>Version ${esc(cfg.downloadVersion)}</span>` : ''}</div></div>`
  : `<div class="dl-card"><h2>VertexStealth for Windows</h2><div class="dl-soon">The Windows installer is not published yet. Email us and we will tell you as soon as it is available.</div><a class="btn primary" href="${esc(mail('VertexStealth download notification'))}">Notify me</a><div class="dl-meta"><span>Windows 10 / 11</span></div></div>`;
page({
  file: 'download.html', title: 'Download VertexStealth for Windows', canonicalPath: '/download',
  desc: 'Download VertexStealth for Windows. Free plan with up to ' + P.freeProfiles + ' browser profiles; uses your installed Chrome or Firefox.',
  main: `<section class="page"><div class="wrap page-narrow">
<div class="kicker">Download</div>
<h1>Get VertexStealth for Windows</h1>
<p class="lead">A desktop app that launches your installed Chrome or Firefox with separate profile folders, proxies and fingerprint settings.</p>
${dlCard}
<h2 class="dl-h2">Getting started</h2>
<ol class="dl-steps">
<li><span><b>Install.</b> Run the installer. You need Windows 10 or 11 and Google Chrome or Mozilla Firefox already installed.</span></li>
<li><span><b>Sign in.</b> Create your VertexStealth account inside the app. New accounts start with a ${P.trialDays}-day trial.</span></li>
<li><span><b>Create a profile.</b> Pick Chrome or Firefox, set a proxy if you need one, launch, and use Fingerprint Check to see what the browser reports.</span></li>
</ol>
<p class="fineprint">By installing you agree to the <a class="ul" href="/eula">EULA</a>, <a class="ul" href="/terms">Terms of Service</a> and <a class="ul" href="/privacy">Privacy Policy</a>. Need help? <a class="ul" href="${esc(mail('VertexStealth support'))}">${esc(cfg.email)}</a></p>
</div></section>`,
});

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
  const body = marked.parse(md, { gfm: true });
  page({
    file: d.slug + '.html', title: `${d.title} — ${cfg.name}`, canonicalPath: '/' + d.slug,
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

// ---------- robots + sitemap ----------
fs.writeFileSync(path.join(dist, 'robots.txt'), isProd
  ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
  : 'User-agent: *\nDisallow: /\n');
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', '/download', '/terms', '/privacy', '/eula'];
fs.writeFileSync(path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${siteUrl}${u === '/' ? '/' : u}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');

// ---------- sanity checks ----------
const problems = [];
for (const f of fs.readdirSync(dist).filter((x) => x.endsWith('.html'))) {
  const t = fs.readFileSync(path.join(dist, f), 'utf8');
  if (/\{\{|\}\}/.test(t)) problems.push(f + ': unreplaced template marker');
  if (/example\.com|hello@/.test(t)) problems.push(f + ': placeholder domain/email left in page');
  if (/\sstyle="/.test(t)) problems.push(f + ': inline style (blocked by the CSP)');
}
if (problems.length) { console.error('BUILD STOPPED:\n  ' + problems.join('\n  ')); process.exit(1); }

console.log(`Built ${fs.readdirSync(dist).filter((x) => x.endsWith('.html')).length} pages -> dist/`);
console.log(`Site URL: ${siteUrl}  (${isProd ? 'indexable' : 'preview: noindex'})`);
console.log(`Download link: ${dlUrl || '(none yet - Download page shows "Notify me")'}`);
console.log(`Payments: ${live ? 'LIVE wording' : 'not live (paid buttons say "Get notified")'}`);
