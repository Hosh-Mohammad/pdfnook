#!/usr/bin/env node
/* pdfnook — static site generator.
 *
 * Usage:   node build.js
 * Options (environment variables):
 *   SITE_URL       Public URL of the site, no trailing slash. Used for canonical URLs, sitemap, Open Graph.
 *                  Default: https://pdfnook.hoshmuhammad2001.workers.dev
 *   CONTACT_EMAIL  Address shown on the Contact page. Default: aaliyasoomro786@gmail.com
 *
 * It reads assets/js/tools-data.js and writes every HTML page, sitemap.xml and robots.txt.
 * The generated files are plain static files; no build step is needed on the hosting side.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { TOOLS, CATEGORIES } = require('./assets/js/tools-data.js');

const SITE_URL = (process.env.SITE_URL || 'https://pdfnook.hoshmuhammad2001.workers.dev').replace(/\/+$/, '');
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'aaliyasoomro786@gmail.com';
const BRAND = 'pdfnook';
const UPDATED = new Date().toISOString().slice(0, 10);
const ROOT = __dirname;
const toolById = Object.fromEntries(TOOLS.map(t => [t.id, t]));

const SCRIPT_FOR = {
  organize: 'tools-organize.js', compress: 'tools-compress.js', 'to-pdf': 'tools-convert.js', 'from-pdf': 'tools-convert.js',
  edit: 'tools-edit.js', security: 'tools-security-info.js', info: 'tools-security-info.js'
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');

function write(rel, content) {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

// ---------------------------------------------------------------- shared fragments
const LOGO_SVG = `<svg viewBox="0 0 30 34" aria-hidden="true" focusable="false"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#7c4dff"/></linearGradient></defs><path d="M3 2h16l8 8v22H3z" fill="url(#lg)"/><path d="M19 2v8h8" fill="#fff" fill-opacity=".35"/><text x="15" y="26" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">PDF</text></svg>`;

function header(base, current) {
  const link = (href, label, key) => `<a href="${base}${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-row">
    <a class="logo" href="${base || './'}" aria-label="${BRAND} home">${LOGO_SVG}<span>${BRAND}</span></a>
    <nav class="main-nav" id="main-nav" aria-label="Main">
      ${link('', 'Home', 'home')}
      ${link('all-tools/', 'All PDF Tools', 'tools')}
      ${link('about/', 'About Us', 'about')}
      ${link('contact/', 'Contact', 'contact')}
      ${link('privacy-policy/', 'Privacy Policy', 'privacy')}
    </nav>
    <div class="header-tools">
      <div class="header-search"><label class="sr-only" for="hs">Search PDF tools</label><input id="hs" class="search-input" type="search" placeholder="Search tools…" autocomplete="off" data-tool-search></div>
      <button class="theme-btn" id="theme-btn" type="button" aria-label="Switch to dark mode">🌙</button>
    </div>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="Toggle menu">☰</button>
  </div>
</header>`;
}

function footer(base) {
  const popular = TOOLS.filter(t => t.popular);
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <a class="logo" href="${base || './'}">${LOGO_SVG}<span>${BRAND}</span></a>
        <p style="margin-top:10px;color:var(--muted)">Free PDF tools that run in your browser. No sign-up, no uploads, no watermarks.</p>
      </div>
      <div><h3>Popular tools</h3><ul>${popular.slice(0, 6).map(t => `<li><a href="${base}${t.id}/">${esc(t.name)}</a></li>`).join('')}</ul></div>
      <div><h3>Company</h3><ul>
        <li><a href="${base}about/">About Us</a></li><li><a href="${base}contact/">Contact Us</a></li><li><a href="${base}all-tools/">All PDF Tools</a></li></ul></div>
      <div><h3>Legal</h3><ul>
        <li><a href="${base}privacy-policy/">Privacy Policy</a></li><li><a href="${base}terms/">Terms and Conditions</a></li><li><a href="${base}disclaimer/">Disclaimer</a></li></ul></div>
    </div>
    <div class="copyright">© ${new Date().getFullYear()} ${BRAND}. All rights reserved. Your files are processed locally in your browser.</div>
  </div>
</footer>`;
}

function adSlot(name, extraClass) {
  // Hidden by CSS and left empty until ads-config.js enables AdSense. No placeholder ad is ever drawn.
  return `<aside class="ad-slot ${extraClass || ''}" data-ad-slot="${name}" aria-label="Advertisement"><span class="ad-label">Advertisement</span></aside>`;
}

function page({ title, desc, path: urlPath, base, body, current, jsonld, scripts, ogType, noindex }) {
  const canonical = SITE_URL + '/' + urlPath;
  return `<!DOCTYPE html>
<html lang="en" data-base="${base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="theme-color" content="#2f6bff">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:type" content="${ogType || 'website'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE_URL}/assets/images/og-image.png">
<meta property="og:image:alt" content="${BRAND}: free online PDF tools">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${base}assets/images/favicon.svg" type="image/svg+xml">
<script>try{var t=localStorage.getItem('toolnest-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<link rel="stylesheet" href="${base}assets/css/style.css">
${(jsonld || []).map(j => `<script type="application/ld+json">${json(j)}</script>`).join('\n')}
</head>
<body>
${header(base, current)}
<main id="main">
${body}
</main>
${footer(base)}
<script src="${base}assets/js/tools-data.js" defer></script>
<script src="${base}assets/js/ads-config.js" defer></script>
${(scripts || []).map(s => `<script src="${base}assets/js/${s}" defer></script>`).join('\n')}
<script src="${base}assets/js/app.js" defer></script>
</body>
</html>
`;
}

function breadcrumb(base, trail) {
  // trail: [[label, href|null], ...] — first item is Home
  return `<nav class="breadcrumb container" aria-label="Breadcrumb"><ol>${trail.map(([l, h]) => `<li>${h ? `<a href="${h}">${esc(l)}</a>` : `<span aria-current="page">${esc(l)}</span>`}</li>`).join('')}</ol></nav>`;
}
function breadcrumbLd(trail) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([l, p], i) => ({ '@type': 'ListItem', position: i + 1, name: l, item: SITE_URL + '/' + p })) };
}
function toolCard(base, t) {
  return `<a class="card" href="${base}${t.id}/"><div class="ico" aria-hidden="true">${t.icon}</div><h3>${esc(t.name)}</h3><p>${esc(t.short)}</p></a>`;
}
function faqHtml(faqs) {
  return `<div class="faq">${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
}
function faqLd(faqs) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}

// ---------------------------------------------------------------- homepage
const HOME_FAQS = [
  [`Is ${BRAND} really free?`, 'Yes. All tools are free to use, without registration, watermarks or daily limits. The site may show ads in the future to cover running costs.'],
  ['Are my PDF files uploaded to a server?', 'No. Every tool runs in your browser using JavaScript. Your documents are never sent to our servers or to any third party.'],
  [`Do I need to install anything?`, `No. ${BRAND} works in modern browsers such as Chrome, Edge, Firefox and Safari on desktop and mobile.`],
  ['Is there a file size limit?', 'There is no server limit because nothing is uploaded, but each file is limited to 150 MB to protect your device’s memory. Very large files may be slow on older phones.'],
  ['Can you unlock a PDF if I forgot the password?', 'No. Unlock PDF only removes a password when you enter the correct one. It does not crack or bypass passwords.'],
  ['Which tools work offline?', 'After the page has loaded once, most tools keep working without an internet connection because everything runs locally.']
];

function buildHome() {
  const base = '';
  const popularIds = ['merge-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-jpg', 'jpg-to-pdf', 'rotate-pdf', 'protect-pdf', 'unlock-pdf'];
  const popular = popularIds.map(id => toolById[id]);
  const title = `${BRAND} – Free PDF Tools Online: Merge, Split, Compress, Convert`;
  const desc = 'Free PDF tools online. Merge, split, compress, convert, rotate, protect and edit PDF files in your browser. No sign-up, no upload, no watermark.';
  const body = `
<section class="hero">
  <div class="container">
    <h1>All Your PDF Tools in One Place</h1>
    <p class="sub">Merge, split, compress, convert and edit PDF files online. Free, fast and secure.</p>
    <div class="search-wrap"><label class="sr-only" for="hero-search">Search PDF tools</label><input id="hero-search" class="search-input" type="search" placeholder="Search for a PDF tool, e.g. “merge”, “compress”, “jpg”…" autocomplete="off" data-tool-search></div>
    <div class="chips" aria-label="Popular tools">${popular.slice(0, 6).map(t => `<a class="chip" href="${t.id}/">${t.icon} ${esc(t.name)}</a>`).join('')}</div>
    <div class="dropzone" id="hero-drop">
      <div class="dz-icon" aria-hidden="true">📂</div>
      <p>Drag and drop a PDF here, or</p>
      <button type="button" class="btn btn-primary btn-lg" data-browse>Select PDF file</button>
      <input type="file" accept=".pdf,application/pdf" multiple>
      <p style="margin:12px 0 0;font-size:.85rem">Files stay on your device. Then choose the tool you need.</p>
    </div>
    <div id="hero-pick" class="hidden" style="max-width:640px;margin:16px auto 0;text-align:left">
      <div class="notice info"><strong></strong><br><small></small></div>
      <div class="chips" style="justify-content:flex-start">${popular.map(t => `<a class="chip" href="${t.id}/">${t.icon} ${esc(t.name)}</a>`).join('')}</div>
    </div>
  </div>
</section>

<section class="section alt" id="popular">
  <div class="container">
    <div class="section-head"><h2>Popular PDF Tools</h2><p>The tools most people use every day.</p></div>
    <div class="grid cols-4">${popular.map(t => toolCard(base, t)).join('')}</div>
  </div>
</section>

<div class="container">${adSlot('home', 'ad-home')}</div>

<section class="section" id="all-tools">
  <div class="container">
    <div class="section-head"><h2>Browse All PDF Tools</h2><p>${TOOLS.length} free tools to organize, compress, convert, edit and secure your PDFs.</p></div>
    ${CATEGORIES.map(c => `<h3 class="cat-title">${esc(c.name)}</h3><div class="grid cols-4">${TOOLS.filter(t => t.cat === c.id).map(t => toolCard(base, t)).join('')}</div>`).join('')}
  </div>
</section>

<section class="section alt" id="why">
  <div class="container">
    <div class="section-head"><h2>Why Choose ${BRAND}?</h2></div>
    <div class="features">
      <div class="card"><div class="ico" aria-hidden="true">🔐</div><h3>Private by design</h3><p>Files are processed in your browser. They are never uploaded to a server.</p></div>
      <div class="card"><div class="ico" aria-hidden="true">⚡</div><h3>Fast and lightweight</h3><p>No waiting for uploads or downloads. Tools load only the code they need.</p></div>
      <div class="card"><div class="ico" aria-hidden="true">🆓</div><h3>Free, no sign-up</h3><p>No account, no watermark and no daily limit on any tool.</p></div>
      <div class="card"><div class="ico" aria-hidden="true">📱</div><h3>Works on any device</h3><p>A responsive design for phones, tablets and desktops, with a dark mode.</p></div>
      <div class="card"><div class="ico" aria-hidden="true">🧰</div><h3>${TOOLS.length} tools in one place</h3><p>Merge, split, compress, convert, edit, protect and read PDFs without switching sites.</p></div>
      <div class="card"><div class="ico" aria-hidden="true">✅</div><h3>Honest about limits</h3><p>Every tool explains what it can and cannot do, so you are never surprised.</p></div>
    </div>
  </div>
</section>

<section class="section" id="how">
  <div class="container">
    <div class="section-head"><h2>How It Works</h2></div>
    <ol class="steps">
      <li><h3>Choose a tool</h3><p>Pick a tool from the list or use the search box.</p></li>
      <li><h3>Add your files</h3><p>Drag and drop files or browse. They stay on your device.</p></li>
      <li><h3>Download the result</h3><p>Process the file and download it instantly. Nothing is stored.</p></li>
    </ol>
  </div>
</section>

<section class="section alt" id="privacy">
  <div class="container">
    <div class="section-head"><h2>Privacy and Security</h2><p>Your documents are yours. ${BRAND} is built so that we never need to see them.</p></div>
    <div class="features">
      <div class="card"><h3>Local processing</h3><p>PDF.js and pdf-lib run inside your browser tab. Your file data is not transmitted anywhere.</p></div>
      <div class="card"><h3>Nothing is stored</h3><p>Files live in memory only while you use a tool and are released when you reset or close the page.</p></div>
      <div class="card"><h3>Read the details</h3><p>See our <a href="privacy-policy/">Privacy Policy</a> for exactly what data the site does and does not collect.</p></div>
    </div>
  </div>
</section>

<section class="section" id="faq">
  <div class="container">
    <div class="section-head"><h2>Frequently Asked Questions</h2></div>
    ${faqHtml(HOME_FAQS)}
  </div>
</section>`;
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: SITE_URL + '/', description: desc },
    { '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: SITE_URL + '/', logo: SITE_URL + '/assets/images/favicon.svg' },
    faqLd(HOME_FAQS)
  ];
  write('index.html', page({ title, desc, path: '', base, body, current: 'home', jsonld }));
}

// ---------------------------------------------------------------- all tools page
function buildAllTools() {
  const base = '../';
  const trail = [['Home', base], ['All PDF Tools', null]];
  const body = `${breadcrumb(base, trail)}
<section class="section"><div class="container">
  <div class="section-head"><h1>All PDF Tools</h1><p>Every free PDF tool in one list. All of them run in your browser.</p></div>
  ${CATEGORIES.map(c => `<h2 class="cat-title">${esc(c.name)}</h2><div class="grid cols-4">${TOOLS.filter(t => t.cat === c.id).map(t => toolCard(base, t)).join('')}</div>`).join('')}
</div></section>`;
  write('all-tools/index.html', page({
    title: `All PDF Tools – Free Online PDF Utilities | ${BRAND}`,
    desc: `Browse all ${TOOLS.length} free PDF tools: merge, split, compress, convert, rotate, edit and protect PDF files online in your browser.`,
    path: 'all-tools/', base, body, current: 'tools',
    jsonld: [breadcrumbLd([['Home', ''], ['All PDF Tools', 'all-tools/']])]
  }));
}

// ---------------------------------------------------------------- tool pages
function buildTool(t) {
  const base = '../';
  const cat = CATEGORIES.find(c => c.id === t.cat);
  const trail = [['Home', base], ['All PDF Tools', base + 'all-tools/'], [t.name, null]];
  const related = t.related.map(id => toolById[id]).filter(Boolean);
  const body = `${breadcrumb(base, trail)}
<div class="container">
  <div class="tool-head"><h1>${esc(t.name)}</h1><p>${esc(t.lead)}</p></div>
  <div class="tool-layout" id="tool-layout">
    <div class="tool-main">
      <div id="tool-app" data-tool="${t.id}" data-accept="${esc(t.accept)}" data-multiple="${t.multiple}" data-kind="${t.kind}">
        <noscript><div class="notice error">JavaScript is required to use this tool. All processing happens in your browser.</div></noscript>
        <div class="notice info">Loading tool…</div>
      </div>
      <div class="notice info" style="margin-top:12px">🔒 <strong>Private:</strong> your files are processed on your device and are not uploaded to any server.</div>
      ${adSlot('tool', 'ad-tool')}
      <section class="panel" aria-labelledby="how-h"><h2 id="how-h">How to use ${esc(t.name)}</h2>
        <ol>${t.howto.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>
      ${adSlot('incontent', 'ad-incontent')}
      <section aria-labelledby="faq-h"><h2 id="faq-h" style="margin-top:28px">Frequently asked questions</h2>${faqHtml(t.faqs)}</section>
      <section class="related" aria-labelledby="rel-h"><h2 id="rel-h" style="margin-top:32px">Related PDF tools</h2>
        <div class="grid">${related.map(r => toolCard(base, r)).join('')}</div></section>
    </div>
    ${adSlot('sidebar', 'ad-sidebar')}
  </div>
</div>`;
  const app = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: `${t.name} – ${BRAND}`, url: `${SITE_URL}/${t.id}/`,
    description: t.desc, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (modern web browser)',
    browserRequirements: 'Requires JavaScript', isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  };
  const scripts = ['pdf-helpers.js', 'runtime.js', SCRIPT_FOR[t.cat]];
  write(`${t.id}/index.html`, page({
    title: t.title, desc: t.desc, path: `${t.id}/`, base, body, scripts, current: 'tools',
    jsonld: [app, breadcrumbLd([['Home', ''], ['All PDF Tools', 'all-tools/'], [t.name, `${t.id}/`]]), faqLd(t.faqs)]
  }));
}

// ---------------------------------------------------------------- legal / info pages
function simplePage(slug, key, title, desc, inner) {
  const base = '../';
  const trail = [['Home', base], [title.split(' | ')[0].split(' – ')[0], null]];
  const body = `${breadcrumb(base, trail)}<div class="container"><article class="prose">${inner}</article></div>`;
  write(`${slug}/index.html`, page({
    title: `${title} | ${BRAND}`, desc, path: `${slug}/`, base, body, current: key,
    jsonld: [breadcrumbLd([['Home', ''], [trail[1][0], `${slug}/`]])]
  }));
}

function buildLegal() {
  simplePage('about', 'about', 'About Us', `About ${BRAND}: free, private PDF tools that run entirely in your browser, with no sign-up and no uploads.`, `
<h1>About ${BRAND}</h1>
<p>${BRAND} is a collection of free online PDF tools. You can merge, split, compress, convert, rotate, edit and protect PDF files without creating an account or installing software.</p>
<h2>Our approach</h2>
<p>Most online PDF services upload your documents to a server. ${BRAND} does the opposite: every tool runs inside your own browser using open-source libraries (<a href="https://mozilla.github.io/pdf.js/" rel="noopener">PDF.js</a>, <a href="https://github.com/cantoo-scribe/pdf-lib" rel="noopener">pdf-lib</a> and <a href="https://stuk.github.io/jszip/" rel="noopener">JSZip</a>). Your files never leave your device.</p>
<h2>What we promise</h2>
<ul>
<li>Free to use, with no sign-up and no watermarks.</li>
<li>Honest descriptions: every tool states what it can and cannot do.</li>
<li>No selling or sharing of your documents, because we never receive them.</li>
</ul>
<h2>Funding</h2>
<p>To cover running costs, ${BRAND} may display advertising in the future. Ads will always be clearly labelled and kept separate from the tools.</p>
<h2>Get in touch</h2>
<p>Questions, bug reports or ideas? Visit the <a href="../contact/">contact page</a>.</p>`);

  simplePage('contact', 'contact', 'Contact Us', `Contact ${BRAND} for support, bug reports, feedback or business enquiries.`, `
<h1>Contact Us</h1>
<p>We would love to hear from you: bug reports, feature ideas, or general feedback.</p>
<p><strong>Email:</strong> <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></p>
<h2>Before you write</h2>
<ul>
<li>Tell us which tool you were using and which browser and device you have.</li>
<li><strong>Please do not send confidential documents.</strong> We cannot see your files, and we do not need them to help you.</li>
<li>We read every message but cannot recover forgotten PDF passwords.</li>
</ul>
<h2>Quick message</h2>
<form id="contact-form" class="panel" action="mailto:${esc(CONTACT_EMAIL)}" method="post" enctype="text/plain">
  <div class="settings">
    <div class="field"><label for="c-name">Your name</label><input type="text" id="c-name" name="name" autocomplete="name"></div>
    <div class="field"><label for="c-sub">Subject</label><input type="text" id="c-sub" name="subject"></div>
    <div class="field full"><label for="c-msg">Message</label><textarea id="c-msg" name="message" required></textarea>
    <small>Sending opens your email app. Nothing is submitted to our website.</small></div>
  </div>
  <div class="actions"><button class="btn btn-primary" type="submit">Open in email app</button></div>
</form>`);

  simplePage('privacy-policy', 'privacy', 'Privacy Policy', `${BRAND} privacy policy: your PDF files are processed locally in your browser and are never uploaded. Learn about cookies and advertising.`, `
<h1>Privacy Policy</h1>
<p><em>Last updated: ${UPDATED}</em></p>
<p>This policy explains what information ${BRAND} (“we”, “the site”) handles when you use the website.</p>
<h2>1. Your files</h2>
<p>All PDF and image processing is performed locally in your web browser. <strong>Your files are not uploaded to our servers or to any third party.</strong> Files exist only in your device’s memory while you use a tool and are discarded when you reset the tool, navigate away or close the page. We do not store, view or share your documents.</p>
<h2>2. Information we collect</h2>
<p>We do not require registration and do not ask for personal information to use the tools. The site may receive standard technical data (such as IP address, browser type and pages requested) through our hosting provider’s server logs, which is used to operate and secure the service.</p>
<h2>3. Local storage</h2>
<p>The site stores one small preference in your browser’s local storage: your choice of light or dark theme. It never contains personal data or file contents and stays on your device.</p>
<h2>4. Advertising and cookies</h2>
<p>We may show ads served by Google AdSense in the future. If ads are enabled, Google and its partners may use cookies or similar technologies to serve and measure ads, including personalized ads based on your visits to this and other websites. You can learn how Google uses data at <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">policies.google.com/technologies/partner-sites</a> and manage ad personalization at <a href="https://adssettings.google.com" rel="noopener">adssettings.google.com</a>. You may also opt out of personalized advertising by visiting <a href="https://www.aboutads.info" rel="noopener">aboutads.info</a>.</p>
<p>Where required by law (for example in the European Economic Area, the United Kingdom and Switzerland), we will ask for your consent through a consent banner before personalized ads or non-essential cookies are used. Until advertising is enabled, this site sets no advertising or tracking cookies.</p>
<h2>5. Third-party links</h2>
<p>The site may link to other websites. We are not responsible for their content or privacy practices.</p>
<h2>6. Children</h2>
<p>The site is a general-audience utility and is not directed at children under 13. We do not knowingly collect personal information from children.</p>
<h2>7. Your rights</h2>
<p>Because we do not collect personal data through the tools, there is generally nothing to access, correct or delete. If you believe we hold information about you, contact us and we will respond as required by applicable law.</p>
<h2>8. Changes</h2>
<p>We may update this policy. The date above shows when it last changed.</p>
<h2>9. Contact</h2>
<p>Questions about this policy? Use the <a href="../contact/">contact page</a>.</p>`);

  simplePage('terms', 'terms', 'Terms and Conditions', `Terms and Conditions for using ${BRAND}, a free browser-based PDF toolkit.`, `
<h1>Terms and Conditions</h1>
<p><em>Last updated: ${UPDATED}</em></p>
<p>By using ${BRAND} you agree to these terms. If you do not agree, please do not use the site.</p>
<h2>1. The service</h2>
<p>${BRAND} provides free browser-based tools for working with PDF and image files. The service is provided “as is” and “as available”, and features may change or be removed at any time.</p>
<h2>2. Acceptable use</h2>
<ul>
<li>Use the tools only with files you own or have permission to process.</li>
<li>Do not use the site to bypass security on documents you are not authorized to access, or for any unlawful purpose.</li>
<li>Do not attempt to disrupt, scrape at abusive rates or reverse engineer the service in ways that harm it or other users.</li>
</ul>
<h2>3. Your content</h2>
<p>You keep all rights to your files. Because processing is local, we never receive or store them. You are responsible for keeping backups of your original files.</p>
<h2>4. No warranty and limitation of liability</h2>
<p>We do not guarantee that tools will be error-free or that results will be suitable for any particular purpose. To the fullest extent permitted by law, ${BRAND} and its operators are not liable for any loss or damage arising from use of the site, including loss of data. Always check processed files before relying on them.</p>
<h2>5. Intellectual property</h2>
<p>The site’s design, text and code are owned by their respective authors. Third-party libraries are used under their open-source licenses (see the licence files in <code>assets/vendor</code>).</p>
<h2>6. Advertising</h2>
<p>The site may display advertisements. We are not responsible for the content of third-party ads or the websites they lead to.</p>
<h2>7. Changes</h2>
<p>We may update these terms. Continued use after changes means you accept them.</p>
<h2>8. Contact</h2>
<p>Questions? Use the <a href="../contact/">contact page</a>.</p>`);

  simplePage('disclaimer', 'disclaimer', 'Disclaimer', `Disclaimer for ${BRAND}: tools are provided as-is, with no guarantee of results, and are not legal or professional advice.`, `
<h1>Disclaimer</h1>
<p><em>Last updated: ${UPDATED}</em></p>
<h2>General</h2>
<p>The tools on ${BRAND} are provided for general convenience, “as is”, without warranties of any kind. While we work to make them reliable, results can vary depending on how a PDF was created.</p>
<h2>Document quality and compatibility</h2>
<p>Some PDFs use features that browser-based tools cannot fully process (complex forms, unusual encryption, damaged files). Compression modes that convert pages to images remove selectable text. Conversion tools such as PDF to HTML or HTML to PDF are basic text conversions and do not preserve layout or styling. Each tool page describes its limitations.</p>
<h2>Security tools</h2>
<p>Password protection uses AES-256 encryption, but its effectiveness depends on a strong password that you keep safe. We cannot recover lost passwords. Unlock PDF removes a password only when you provide the correct one; use it only on documents you are authorized to open.</p>
<h2>Not professional advice</h2>
<p>Nothing on this site is legal, financial or professional advice. If a document is legally or financially important, keep the original and verify the processed copy.</p>
<h2>Advertising and external links</h2>
<p>The site may display third-party advertisements and links. We do not endorse them and are not responsible for their content.</p>
<h2>Contact</h2>
<p>See the <a href="../contact/">contact page</a> for questions.</p>`);
}

function build404() {
  const body = `<div class="container"><div class="prose" style="text-align:center"><h1>Page not found</h1><p>Sorry, we could not find that page. Try the <a href="/">homepage</a> or search for a tool:</p>
<div class="search-wrap" style="position:relative;max-width:480px;margin:0 auto"><label class="sr-only" for="s404">Search PDF tools</label><input id="s404" class="search-input" type="search" placeholder="Search tools…" data-tool-search></div></div></div>`;
  // 404 may be served from any path, so use absolute asset URLs.
  let html = page({ title: 'Page Not Found | ' + BRAND, desc: 'The page you requested could not be found.', path: '404.html', base: '/', body, noindex: true });
  write('404.html', html);
}

function buildSeoFiles() {
  const urls = ['', 'all-tools/', ...TOOLS.map(t => t.id + '/'), 'about/', 'contact/', 'privacy-policy/', 'terms/', 'disclaimer/'];
  const prio = u => (u === '' ? '1.0' : u === 'all-tools/' ? '0.9' : toolById[u.replace('/', '')] ? (toolById[u.replace('/', '')].popular ? '0.9' : '0.8') : '0.3');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url>\n    <loc>${SITE_URL}/${u}</loc>\n    <lastmod>${UPDATED}</lastmod>\n    <changefreq>${u === '' ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${prio(u)}</priority>\n  </url>`).join('\n') + `\n</urlset>\n`;
  write('sitemap.xml', xml);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  // Cloudflare Pages headers: sensible caching + security headers
  write('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/vendor/*
  Cache-Control: public, max-age=31536000, immutable

/assets/css/*
  Cache-Control: public, max-age=86400

/assets/js/*
  Cache-Control: public, max-age=86400
`);
}

// ---------------------------------------------------------------- run
buildHome();
buildAllTools();
TOOLS.forEach(buildTool);
buildLegal();
build404();
buildSeoFiles();
console.log(`Built ${TOOLS.length} tool pages + home, all-tools, 5 info pages, 404, sitemap.xml, robots.txt for ${SITE_URL}`);
