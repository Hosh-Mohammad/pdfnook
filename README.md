# pdfnook

Free, private, browser-based PDF tools: **27 tools**, no backend, no database, no sign-up.
Plain HTML + CSS + vanilla JavaScript. Every PDF is processed on the visitor's device.

| Library | Version | Used for |
|---|---|---|
| [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) | 6.5.438 | rendering, previews, text extraction |
| [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) | 2.11.1 | editing, merging, **AES-256 encryption and decryption** |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.2 | ZIP downloads |

> **Why `@cantoo/pdf-lib` and not `pdf-lib`?** The original `pdf-lib` (last release 2021) cannot encrypt or decrypt PDFs, so Protect/Unlock would be impossible. The actively maintained `@cantoo` fork is API-compatible and adds both.

All libraries are **copied into `assets/vendor/`** (with their licences), so the site has no CDN dependency and works offline after the first load.

---

## 1. Project structure

```
toolnest-pdf/
├── index.html                  Homepage (generated)
├── all-tools/ about/ contact/ privacy-policy/ terms/ disclaimer/   (generated, each has index.html)
├── merge-pdf/ split-pdf/ compress-pdf/ ... (27 tool folders, generated)   → URLs like /merge-pdf/
├── 404.html  robots.txt  sitemap.xml  _headers                       (generated)
├── build.js                    Page generator: edit tool text/SEO here, then run `node build.js`
├── serve.js                    Zero-dependency local web server
├── package.json
├── assets/
│   ├── css/style.css           Design system, dark mode, responsive layout
│   ├── images/                 favicon.svg, og-image.png
│   ├── vendor/                 PDF.js, pdf-lib, JSZip (+ licences)
│   └── js/
│       ├── tools-data.js       THE registry: names, SEO titles/descriptions, FAQs, related tools
│       ├── app.js              Theme toggle, nav, search, AdSense loader
│       ├── ads-config.js       AdSense switch (disabled by default)
│       ├── runtime.js          Shared tool UI: upload, validation, previews, progress, results
│       ├── pdf-helpers.js      Shared pdf-lib helpers (rotation-aware placement, image embedding)
│       └── tools-*.js          The actual PDF operations, grouped by category
└── tests/e2e.js                End-to-end tests (real browser, real PDFs)
```

The HTML pages are **generated** from `assets/js/tools-data.js` by `build.js`, so titles, descriptions, canonical URLs, structured data, related links and the sitemap always stay consistent. The generated files are committed, so hosting needs **no build step**.

## 2. Run it locally

You need [Node.js](https://nodejs.org) 18 or newer (only for the tiny local server).

```bash
cd toolnest-pdf
node serve.js          # open http://localhost:8080
```

Do not open `index.html` by double-click (`file://`): browsers block ES modules and workers there. Any static server works, e.g. `python3 -m http.server 8080`.

After changing `tools-data.js` or `build.js`, regenerate pages:

```bash
SITE_URL=https://pdfnook.hoshmuhammad2001.workers.dev CONTACT_EMAIL=aaliyasoomro786@gmail.com node build.js
```

## 3. Test all tools

**Manual:** open each tool from the homepage with a few of your own PDFs. Try a password-protected PDF, a very large file, a scan, and a phone-camera JPG too.

**Automated (recommended before each deploy):**

```bash
npm install --save-dev playwright     # once
npx playwright install chromium        # once
# also needs poppler-utils (pdfinfo, pdftotext, pdfimages, pdftoppm) and qpdf on PATH
node tests/e2e.js                      # all 64 tests
node tests/e2e.js merge split          # only tests whose name contains these words
```

The suite opens every tool in headless Chrome, processes generated sample PDFs/images, then verifies the downloads with independent tools (page counts, extracted text, encryption flags, image types, crop boxes). It also checks every page for console errors, unique titles/descriptions, canonical URLs, structured data, broken links, and that ad containers stay empty.

## 4. Put the code on GitHub

1. Create a free account at <https://github.com>, then **New repository** → name it `toolnest-pdf` → Public → *Create repository* (don't add a README).
2. In the project folder:

```bash
git init
git add .
git commit -m "Initial commit: ToolNest PDF"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/toolnest-pdf.git
git push -u origin main
```

(No Git? Use GitHub's **Add file → Upload files** and drag the whole folder contents in.)

## 5. Deploy on Cloudflare Pages (free, gives you `*.pages.dev`)

1. Sign up at <https://dash.cloudflare.com> (free).
2. **Workers & Pages → Create → Pages → Connect to Git** → authorize GitHub → pick `toolnest-pdf`.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`/`** (root)
4. **Save and Deploy.** In about a minute you get a `*.pages.dev` address.
5. **Important — set your real URL.** Canonical links, Open Graph tags and the sitemap contain the site URL. Run
   `SITE_URL=https://pdfnook.hoshmuhammad2001.workers.dev node build.js`, commit and push. Cloudflare redeploys automatically.

Alternative: **GitHub Pages** (repo → Settings → Pages → Deploy from branch `main` / root). If your address is `username.github.io/toolnest-pdf/` (a sub-folder), absolute URLs like `/merge-pdf/` in `404.html` and the canonical tags need that prefix; Cloudflare Pages (served from the domain root) is simpler.

## 6. Google Search Console

1. Go to <https://search.google.com/search-console> → **Add property** → **URL prefix** → enter your full `https://….pages.dev/` address.
2. Verify with the **HTML tag** method: copy the `<meta name="google-site-verification" …>` tag into the `<head>` of `build.js` (inside the `page()` template, next to the other `<meta>` tags), run `node build.js`, push, then click **Verify**.
3. **Sitemaps** (left menu) → enter `sitemap.xml` → **Submit**. Status should become *Success* and list 37 URLs.
4. Use **URL inspection** on the homepage and a few tool pages → **Request indexing**.

Indexing takes days to weeks. Keep expectations realistic: a new site with no backlinks ranks slowly for competitive keywords like "merge pdf".

## 7. Prepare for Google AdSense

Ads are **off**: every ad container is hidden and empty, and no AdSense script loads, until you enable it. No fake or placeholder ads are shown anywhere.

**Before you apply:**
- Use a domain AdSense accepts. AdSense generally does **not** approve `*.pages.dev` / free sub-domains, so plan to buy a domain (≈ $10/yr) and attach it in Cloudflare Pages → *Custom domains*. Then re-run `build.js` with the new `SITE_URL`.
- The site already has About, Contact, Privacy Policy (with advertising/cookie section), Terms, Disclaimer and a clear navigation. Replace the placeholder contact e-mail (`CONTACT_EMAIL`) with a real, monitored address.
- Have real traffic and original content. Pages that are only a tool + short text can be judged "low value": expand each tool page's text over time (use cases, tips, comparisons) and add a few helpful guides/blog posts.
- If you serve visitors in the EEA/UK, add a Google-certified consent banner (CMP) before enabling personalized ads.

**After approval:** edit `assets/js/ads-config.js`: set `enabled: true`, your `ca-pub-…` id, and the slot ids for `home`, `tool`, `sidebar` and `incontent`. Also add the AdSense-required `ads.txt` file at the site root (`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`). Never click your own ads; keep ads away from buttons.

## 8. Features and known limitations (honest list)

Everything below is implemented and covered by the automated tests. These are the technical limits you should know about:

| Tool | Limitation |
|---|---|
| Compress PDF | "Basic" is lossless but saves little. "Recommended/Strong" rasterise pages to JPEG: **text becomes non-selectable**. If the result isn't smaller, it is refused and the original kept. No true selective image recompression (would need a heavier engine such as Ghostscript/WASM). |
| Optimize PDF | Lossless object packing and optional metadata removal only; many files can't shrink further (the tool says so). |
| HTML to PDF / PDF to HTML | Basic **text** conversion. No CSS, images or layout; scripts never run. PDF to HTML does not preserve layout. |
| TXT / HTML to PDF | Standard fonts only: Western-European characters. Other scripts (Arabic, CJK, Cyrillic…) become `?` and the user is told. Embedding a Unicode font is the next step if needed. |
| PDF to Text / HTML | No OCR: scanned PDFs return a clear "no text found" message. |
| Protect PDF | AES-256 (PDF 2.0 R6). Very old PDF viewers may not open it. |
| Unlock PDF | Needs the correct password. Verified with AES-256, AES-128, RC4-128 and RC4-40. Never cracks passwords. |
| Add Text / Watermark | Standard fonts, Western-European characters. No click-to-place on the page preview; position is chosen from presets. |
| Crop PDF | Sets the visible crop box; hidden content is not erased. |
| All tools | 150 MB per-file limit; very large files can be slow or run out of memory on phones. Form fields/annotations in merged or split PDFs may lose interactivity (pdf-lib limitation). |

**Not built (not in the brief's required list):** OCR, Word/Excel/PowerPoint conversion, e-signatures, true PDF editing of existing text, a consent banner (CMP), blog/guide content.

## 9. Pre-launch checklist

- [ ] `SITE_URL` and `CONTACT_EMAIL` set, `node build.js` re-run, committed and pushed
- [ ] `node tests/e2e.js` → all green
- [ ] Try 3–4 tools on your phone and in Firefox/Safari
- [ ] Deployed on Cloudflare Pages; `https://YOUR-SITE/sitemap.xml` and `/robots.txt` load
- [ ] Search Console verified, sitemap submitted, key pages inspected
- [ ] Privacy Policy / Terms reviewed (they're sensible templates, **not legal advice**)
- [ ] Custom domain connected (needed for AdSense)
- [ ] Consent banner added if you have EU/UK visitors, then enable ads in `ads-config.js`, add `ads.txt`

## Licences

Site code: yours to use. Third-party libraries in `assets/vendor/` keep their own licences (Apache-2.0 PDF.js, MIT pdf-lib, MIT/GPLv3 JSZip), included alongside.
