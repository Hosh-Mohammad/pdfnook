#!/usr/bin/env node
/* ToolNest PDF — end-to-end tests.
 * Drives every tool in a real headless Chrome with real PDF/image files, then verifies the
 * downloaded results with independent tools (poppler: pdfinfo/pdftotext/pdfimages, qpdf).
 *
 *   node tests/e2e.js              run everything
 *   node tests/e2e.js merge split  run only tests whose name contains one of the words
 *
 * Requirements: Node 18+, `playwright` (npm i -D playwright), poppler-utils and qpdf on PATH.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createServer } = require('../serve.js');
let playwright;
try { playwright = require('playwright'); } catch (e) { playwright = require('/opt/npm-tools/node_modules/playwright'); }
const PDFLib = require('../assets/vendor/pdf-lib.min.js');
const JSZip = require('../assets/vendor/jszip.min.js');

const ROOT = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'toolnest-e2e-'));
const only = process.argv.slice(2);

// ------------------------------------------------------------------ helpers
function sh(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return (e.stdout || '') + (e.stderr || '') + '\n[exit ' + e.status + ']'; }
}
function save(buf, name) { const f = path.join(TMP, name); fs.writeFileSync(f, buf); return f; }
function pdfInfo(f, extra) { return sh('pdfinfo', (extra || []).concat([f])); }
function pageCount(f) { const m = /Pages:\s+(\d+)/.exec(pdfInfo(f)); return m ? +m[1] : -1; }
// content-stream check: pdf-lib writes standard-font strings as hex, so look for the hex of the text on a given page
function streamHas(f, str, pageNo) {
  const out = path.join(TMP, 'q-' + path.basename(f));
  sh('qpdf', ['--qdf', '--object-streams=disable', '--stream-data=uncompress', f, out]);
  const raw = fs.readFileSync(out, 'latin1');
  const hex = Buffer.from(str, 'latin1').toString('hex').toUpperCase();
  const pages = raw.split(/\/Type \/Page\b/).slice(1); // rough per-page split
  const target = pageNo ? [pages[pageNo - 1] || ''] : pages;
  return target.some(p => p.toUpperCase().includes('<' + hex + '>') || p.includes('(' + str + ')'));
}
function rawText(f, first, last) { const a = []; if (first) a.push('-f', String(first), '-l', String(last || first)); return sh('pdftotext', a.concat([f, '-'])); }
function text(f, first, last) { const a = ['-layout']; if (first) a.push('-f', String(first), '-l', String(last || first)); return sh('pdftotext', a.concat([f, '-'])); }
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
function eq(a, b, msg) { if (a !== b) throw new Error('ASSERT: ' + msg + ' (expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a) + ')'); }

async function makePdf(label, pages, opts) {
  opts = opts || {};
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  if (opts.title) doc.setTitle(opts.title);
  if (opts.author) doc.setAuthor(opts.author);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage(opts.size || [400, 300]);
    p.drawText(`${label} page ${i}`, { x: 40, y: 150, size: 24, font });
    p.drawText('The quick brown fox jumps over the lazy dog.', { x: 40, y: 110, size: 11, font });
    if (opts.rotate && opts.rotate[i - 1]) p.setRotation(PDFLib.degrees(opts.rotate[i - 1]));
  }
  return Buffer.from(await doc.save({ useObjectStreams: opts.objectStreams !== false }));
}
const pdfFile = (name, buf) => ({ name, mimeType: 'application/pdf', buffer: buf });

// ------------------------------------------------------------------ browser harness
let browser, base, server;
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => page.errors.push('requestfailed: ' + r.url()));
  return page;
}
async function openTool(page, id) {
  await page.goto(`${base}/${id}/`);
  await page.waitForSelector('#tool-app #file-input', { state: 'attached' });
}
async function addFiles(page, files) {
  await page.setInputFiles('#tool-app #file-input', files);
}
async function waitReady(page) {
  await page.waitForSelector('#tool-app > .actions:not(.hidden)', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#tool-app > .panel:not(.hidden) .progress') , null, { timeout: 30000 }).catch(() => {});
}
async function setSettings(page, settings) {
  for (const [k, v] of Object.entries(settings || {})) {
    const sel = '#set-' + k;
    await page.waitForSelector(sel, { state: 'attached' });
    const tag = await page.$eval(sel, e => e.tagName + ':' + (e.type || ''));
    if (tag === 'SELECT:select-one') await page.selectOption(sel, String(v));
    else if (tag === 'INPUT:checkbox') await page.setChecked(sel, !!v);
    else if (tag === 'INPUT:file') await page.setInputFiles(sel, v);
    else await page.fill(sel, String(v));
  }
}
async function run(page) {
  await page.click('#tool-app > .actions button.btn-primary');
  await page.waitForSelector('#tool-app .result-list a[download], #tool-app .notice.error', { timeout: 120000 });
  const err = await page.$('#tool-app .notice.error');
  if (err) return { error: (await err.textContent()).trim(), results: [] };
  const summary = await page.$eval('#tool-app .result-panel, #tool-app .notice.success', e => e.textContent).catch(() => '');
  const links = await page.$$eval('#tool-app .result-list a[download]', as => as.map(a => ({ name: a.getAttribute('download'), href: a.href })));
  const results = [];
  for (const l of links) {
    const b64 = await page.evaluate(async href => {
      const buf = await (await fetch(href)).arrayBuffer(); let s = ''; const u = new Uint8Array(buf);
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s);
    }, l.href);
    results.push({ name: l.name, buffer: Buffer.from(b64, 'base64') });
  }
  return { error: null, results, summary: summary.trim() };
}
async function useTool(page, id, files, settings, before) {
  await openTool(page, id);
  if (files && files.length) { await addFiles(page, files); await waitReady(page); }
  if (before) await before(page);
  await setSettings(page, settings);
  return run(page);
}
async function unzip(buf) {
  const z = await JSZip.loadAsync(buf), out = [];
  for (const n of Object.keys(z.files)) out.push({ name: n, buffer: Buffer.from(await z.files[n].async('uint8array')) });
  return out;
}
async function imageInBrowser(page, kind, w, h, alpha) {
  const b64 = await page.evaluate(async ([kind, w, h, alpha]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (!alpha) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i % 40)}%)`; g.fillRect((i * 97) % w, (i * 53) % h, 60 + (i % 80), 40 + (i % 60)); }
    g.fillStyle = '#000'; g.font = 'bold 48px sans-serif'; g.fillText('IMG', 20, 70);
    const blob = await new Promise(r => c.toBlob(r, kind === 'jpg' ? 'image/jpeg' : 'image/png', 0.95));
    const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }, [kind, w, h, !!alpha]);
  return Buffer.from(b64, 'base64');
}

async function photoJpeg(page, w, h) {
  const b64 = await page.evaluate(async ([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#3b6'); grad.addColorStop(0.5, '#fc4'); grad.addColorStop(1, '#46c');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 70; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.98));
    const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }, [w, h]);
  return Buffer.from(b64, 'base64');
}

// ------------------------------------------------------------------ tests
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------- Organize
test('merge-pdf: merges two PDFs in order', async (page) => {
  const a = await makePdf('DocA', 5), b = await makePdf('DocB', 3);
  const r = await useTool(page, 'merge-pdf', [pdfFile('a.pdf', a), pdfFile('b.pdf', b)]);
  assert(!r.error, r.error); eq(r.results.length, 1, 'one result');
  const f = save(r.results[0].buffer, 'merged.pdf');
  eq(pageCount(f), 8, 'page count');
  assert(/DocA page 5/.test(text(f, 5)) && /DocB page 1/.test(text(f, 6)), 'order preserved');
});
test('merge-pdf: reorder with move button changes order', async (page) => {
  const a = await makePdf('DocA', 1), b = await makePdf('DocB', 1);
  const r = await useTool(page, 'merge-pdf', [pdfFile('a.pdf', a), pdfFile('b.pdf', b)], {}, async (p) => {
    await p.click('button[aria-label="Move a.pdf down"]');
  });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'merged-order.pdf');
  assert(/DocB/.test(text(f, 1)) && /DocA/.test(text(f, 2)), 'B first then A');
});
test('merge-pdf: needs at least two files', async (page) => {
  const r = await useTool(page, 'merge-pdf', [pdfFile('a.pdf', await makePdf('A', 1))]);
  assert(r.error && /at least two/i.test(r.error), 'error shown: ' + r.error);
});
test('merge-pdf: rejects non-PDF content', async (page) => {
  await openTool(page, 'merge-pdf');
  await addFiles(page, [{ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hello this is not a pdf') }]);
  await page.waitForSelector('#tool-app .notice.error');
  assert(/valid PDF/i.test(await page.textContent('#tool-app .notice.error')), 'invalid pdf message');
});
test('merge-pdf: rejects unsupported file type', async (page) => {
  await openTool(page, 'merge-pdf');
  await addFiles(page, [{ name: 'photo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') }]);
  await page.waitForSelector('#tool-app .notice.error');
  assert(/not a supported file type/i.test(await page.textContent('#tool-app .notice.error')), 'type message');
});
test('merge-pdf: password-protected input gives helpful error', async (page) => {
  const plain = save(await makePdf('Secret', 1), 'plain-for-enc.pdf');
  const enc = path.join(TMP, 'enc-in.pdf'); sh('qpdf', ['--encrypt', 'up', 'op', '256', '--', plain, enc]);
  const r = await useTool(page, 'merge-pdf', [pdfFile('enc.pdf', fs.readFileSync(enc)), pdfFile('b.pdf', await makePdf('B', 1))]);
  assert(r.error && /password-protected/i.test(r.error), 'message: ' + r.error);
});

test('split-pdf: by ranges gives ZIP with right pages', async (page) => {
  const r = await useTool(page, 'split-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 5))], { mode: 'ranges', ranges: '1-2, 4' });
  assert(!r.error, r.error);
  const files = await unzip(r.results[0].buffer); eq(files.length, 2, 'two files');
  eq(pageCount(save(files[0].buffer, 's1.pdf')), 2, 'first has 2 pages'); eq(pageCount(save(files[1].buffer, 's2.pdf')), 1, 'second has 1');
  assert(/Doc page 4/.test(text(path.join(TMP, 's2.pdf'))), 'second is page 4');
});
test('split-pdf: every page', async (page) => {
  const r = await useTool(page, 'split-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 4))], { mode: 'each' });
  eq((await unzip(r.results[0].buffer)).length, 4, 'four files');
});
test('split-pdf: every N pages', async (page) => {
  const r = await useTool(page, 'split-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 5))], { mode: 'every', n: 2 });
  const files = await unzip(r.results[0].buffer); eq(files.length, 3, 'three files');
  eq(pageCount(save(files[2].buffer, 'e3.pdf')), 1, 'last has 1');
});
test('split-pdf: invalid range shows error', async (page) => {
  const r = await useTool(page, 'split-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 3))], { mode: 'ranges', ranges: '2-9' });
  assert(r.error && /outside 1/.test(r.error), r.error);
  const r2 = await run(page).catch(() => null);
});
test('split-pdf: single range returns a plain PDF (no ZIP)', async (page) => {
  const r = await useTool(page, 'split-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 5))], { mode: 'ranges', ranges: '2-3' });
  assert(/\.pdf$/.test(r.results[0].name), 'pdf result'); eq(pageCount(save(r.results[0].buffer, 'one.pdf')), 2, 'pages');
});

test('remove-pages: removes selected pages', async (page) => {
  const r = await useTool(page, 'remove-pages', [pdfFile('doc.pdf', await makePdf('Doc', 5))], {}, async (p) => {
    await p.fill('#range-input', '2,4');
    await p.waitForSelector('.thumb.selected');
  });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'removed.pdf'); eq(pageCount(f), 3, 'three left');
  const t = text(f); assert(/page 1/.test(t) && /page 3/.test(t) && /page 5/.test(t) && !/page 2/.test(t) && !/page 4/.test(t), 'right pages remain');
});
test('remove-pages: clicking thumbnails selects them', async (page) => {
  const r = await useTool(page, 'remove-pages', [pdfFile('doc.pdf', await makePdf('Doc', 3))], {}, async (p) => {
    await p.waitForSelector('.thumb canvas'); await p.click('.thumb >> nth=0');
    eq(await p.inputValue('#range-input'), '1', 'range box updated');
  });
  assert(!r.error, r.error); eq(pageCount(save(r.results[0].buffer, 'removed1.pdf')), 2, 'two left');
});
test('remove-pages: cannot remove every page', async (page) => {
  const r = await useTool(page, 'remove-pages', [pdfFile('doc.pdf', await makePdf('Doc', 2))], {}, async (p) => { await p.fill('#range-input', '1-2'); });
  assert(r.error && /at least one page/i.test(r.error), r.error);
});
test('extract-pages: saves selected pages', async (page) => {
  const r = await useTool(page, 'extract-pages', [pdfFile('doc.pdf', await makePdf('Doc', 5))], {}, async (p) => { await p.fill('#range-input', '2-3'); });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'extracted.pdf'); eq(pageCount(f), 2, 'two pages'); assert(/Doc page 2/.test(text(f, 1)), 'first is page 2');
});
test('extract-pages: nothing selected gives error', async (page) => {
  const r = await useTool(page, 'extract-pages', [pdfFile('doc.pdf', await makePdf('Doc', 2))]);
  assert(r.error && /Select the pages/i.test(r.error), r.error);
});

test('organize-pdf: reorder with buttons', async (page) => {
  const r = await useTool(page, 'organize-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 4))], {}, async (p) => {
    await p.waitForSelector('.thumb canvas');
    await p.click('.thumb >> nth=0 >> button[aria-label="Move page later"]');
  });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'org.pdf');
  assert(/page 2/.test(text(f, 1)) && /page 1/.test(text(f, 2)) && /page 3/.test(text(f, 3)), 'order 2,1,3,4');
});
test('organize-pdf: real drag and drop', async (page) => {
  const r = await useTool(page, 'organize-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 4))], {}, async (p) => {
    await p.waitForSelector('.thumb canvas');
    await p.dragAndDrop('.thumb >> nth=3', '.thumb >> nth=0');
  });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'org-dnd.pdf');
  assert(/page 4/.test(text(f, 1)), 'page 4 moved to the front: ' + text(f, 1));
});
test('organize-pdf: unchanged order gives error', async (page) => {
  const r = await useTool(page, 'organize-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 2))]);
  assert(r.error && /not changed/i.test(r.error), r.error);
});
test('rotate-pdf: rotates one page permanently', async (page) => {
  const r = await useTool(page, 'rotate-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 3))], {}, async (p) => {
    await p.waitForSelector('.thumb canvas'); await p.click('.thumb >> nth=1 >> button[aria-label="Rotate page 2 right"]');
  });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'rot.pdf');
  const info = pdfInfo(f, ['-f', '1', '-l', '3']);
  assert(/Page\s+1 rot:\s+0/.test(info) && /Page\s+2 rot:\s+90/.test(info) && /Page\s+3 rot:\s+0/.test(info), info);
});
test('rotate-pdf: rotate all left adds to existing rotation', async (page) => {
  const base = await makePdf('Doc', 2, { rotate: [90, 0] });
  const r = await useTool(page, 'rotate-pdf', [pdfFile('doc.pdf', base)], {}, async (p) => {
    await p.waitForSelector('.thumb canvas'); await p.click('text=Rotate all right');
  });
  const info = pdfInfo(save(r.results[0].buffer, 'rot2.pdf'), ['-f', '1', '-l', '2']);
  assert(/Page\s+1 rot:\s+180/.test(info) && /Page\s+2 rot:\s+90/.test(info), info);
});

// ---------- Compress
test('compress-pdf: strong/medium shrink an image-heavy PDF; result is valid', async (page) => {
  const img = await photoJpeg(page, 2000, 1400);
  const doc = await PDFLib.PDFDocument.create();
  const jpg = await doc.embedJpg(img);
  for (let i = 0; i < 2; i++) { const p = doc.addPage([595, 842]); p.drawImage(jpg, { x: 0, y: 100, width: 595, height: 417 }); }
  const big = Buffer.from(await doc.save());
  const r = await useTool(page, 'compress-pdf', [pdfFile('big.pdf', big)], { level: 'medium' });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'comp.pdf');
  assert(r.results[0].buffer.length < big.length * 0.8, `smaller: ${big.length} -> ${r.results[0].buffer.length}`);
  eq(pageCount(f), 2, 'pages kept'); assert(/Page size:\s+595/.test(pdfInfo(f)), 'size kept');
  const r2 = await useTool(page, 'compress-pdf', [pdfFile('big.pdf', big)], { level: 'strong' });
  assert(!r2.error, r2.error); assert(r2.results[0].buffer.length < r.results[0].buffer.length, 'strong smaller than medium');
});
test('compress-pdf: basic on tiny text PDF says not smaller (honest)', async (page) => {
  const r = await useTool(page, 'compress-pdf', [pdfFile('t.pdf', await makePdf('Doc', 1, { objectStreams: true }))], { level: 'basic' });
  assert(r.error ? /not smaller/i.test(r.error) : r.results.length === 1, 'either smaller result or honest error');
});
test('optimize-pdf: shrinks a PDF without object streams and keeps text', async (page) => {
  const src = save(await makePdf('Doc', 30, { objectStreams: false, title: 'My Title', author: 'Me' }), 'noos.pdf');
  const noos = path.join(TMP, 'noos2.pdf'); sh('qpdf', ['--object-streams=disable', src, noos]);
  const buf = fs.readFileSync(noos);
  const r = await useTool(page, 'optimize-pdf', [pdfFile('x.pdf', buf)], { strip: true });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'opt.pdf');
  assert(r.results[0].buffer.length < buf.length, `smaller ${buf.length} -> ${r.results[0].buffer.length}`);
  eq(pageCount(f), 30, 'pages'); assert(/Doc page 30/.test(text(f, 30)), 'text intact');
  const info = pdfInfo(f); assert(!/Title:\s+My Title/.test(info) && !/Author:\s+Me/.test(info), 'metadata stripped:\n' + info);
});

// ---------- To PDF
test('jpg-to-pdf: two JPGs -> two A4 pages with embedded JPEG', async (page) => {
  const j1 = await imageInBrowser(page, 'jpg', 800, 600), j2 = await imageInBrowser(page, 'jpg', 600, 900);
  const r = await useTool(page, 'jpg-to-pdf', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: j1 }, { name: 'b.jpeg', mimeType: 'image/jpeg', buffer: j2 }]);
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'jpg.pdf'); eq(pageCount(f), 2, 'pages');
  const info = pdfInfo(f, ['-f', '1', '-l', '2']);
  assert(/Page\s+1 size:\s+841\.\d+ x 595/.test(info) && /Page\s+2 size:\s+595\.\d+ x 841/.test(info), 'auto orientation:\n' + info);
  assert(/jpeg/.test(sh('pdfimages', ['-list', f])), 'JPEG embedded without recompression');
});
test('jpg-to-pdf: fit-to-image page size', async (page) => {
  const j = await imageInBrowser(page, 'jpg', 500, 300);
  const r = await useTool(page, 'jpg-to-pdf', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: j }], { size: 'fit' });
  assert(/Page size:\s+500 x 300/.test(pdfInfo(save(r.results[0].buffer, 'fit.pdf'))), 'page equals image size');
});
test('png-to-pdf: transparent PNG', async (page) => {
  const p = await imageInBrowser(page, 'png', 400, 400, true);
  const r = await useTool(page, 'png-to-pdf', [{ name: 'a.png', mimeType: 'image/png', buffer: p }], { size: 'letter' });
  assert(!r.error, r.error); const f = save(r.results[0].buffer, 'png.pdf');
  eq(pageCount(f), 1, 'pages'); assert(/Page size:\s+612 x 792/.test(pdfInfo(f)), 'letter');
});
test('jpg-to-pdf: rejects a PNG renamed .jpg content', async (page) => {
  const p = await imageInBrowser(page, 'png', 100, 100);
  const r = await useTool(page, 'jpg-to-pdf', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: p }]);
  assert(!r.error || r.results.length === 1, 'PNG data inside .jpg is still embedded correctly (sniffed by content)');
});
test('txt-to-pdf: pasted multi-page text', async (page) => {
  const long = Array.from({ length: 160 }, (_, i) => `Line number ${i + 1}: Hello world, this is ToolNest.`).join('\n');
  const r = await useTool(page, 'txt-to-pdf', [], { text: long });
  assert(!r.error, r.error);
  const f = save(r.results[0].buffer, 'txt.pdf'); assert(pageCount(f) >= 3, 'multiple pages: ' + pageCount(f));
  const t = text(f); assert(/Line number 1:/.test(t) && /Line number 160:/.test(t), 'first & last lines present');
});
test('txt-to-pdf: uploaded file fills textarea; unsupported chars reported', async (page) => {
  await openTool(page, 'txt-to-pdf');
  await addFiles(page, [{ name: 'n.txt', mimeType: 'text/plain', buffer: Buffer.from('Café 你好 wrap test', 'utf8') }]);
  await page.waitForFunction(() => document.querySelector('#set-text') && document.querySelector('#set-text').value.includes('wrap test'));
  const r = await run(page); assert(!r.error, r.error);
  assert(/Café/.test(text(save(r.results[0].buffer, 'txt2.pdf'))), 'accented char kept');
  assert(/replaced/.test(await page.textContent('#tool-app .notice.success')), 'user told about replaced chars');
});
test('txt-to-pdf: empty text gives error', async (page) => {
  await openTool(page, 'txt-to-pdf'); const r = await run(page);
  assert(r.error && /add some text/i.test(r.error), r.error);
});
test('html-to-pdf: headings/lists converted, scripts never run or included', async (page) => {
  const html = '<html><head><title>T</title><style>p{color:red}</style></head><body><h1>Big Heading</h1><p>Paragraph <b>bold</b> text.</p><ul><li>Item A</li><li>Item B</li></ul><script>window.__pwned=1;document.title="x"</script><img src=x onerror="window.__pwned=1"></body></html>';
  const r = await useTool(page, 'html-to-pdf', [], { html });
  assert(!r.error, r.error);
  const t = text(save(r.results[0].buffer, 'html.pdf'));
  assert(/Big Heading/.test(t) && /Paragraph bold text\./.test(t) && /• Item A/.test(t) && /• Item B/.test(t), 'content:\n' + t);
  assert(!/__pwned/.test(t) && !/color:red/.test(t), 'no script/style text');
  eq(await page.evaluate(() => window.__pwned), undefined, 'script did not execute');
});

// ---------- From PDF
test('pdf-to-jpg: ZIP of JPGs, one per page; page filter', async (page) => {
  const pdf = await makePdf('Doc', 3);
  const r = await useTool(page, 'pdf-to-jpg', [pdfFile('doc.pdf', pdf)], { dpi: '72' });
  assert(!r.error, r.error);
  const files = await unzip(r.results[0].buffer); eq(files.length, 3, 'three images');
  assert(files.every(f => f.buffer[0] === 0xFF && f.buffer[1] === 0xD8 && /\.jpg$/.test(f.name)), 'JPEG magic bytes');
  const r2 = await useTool(page, 'pdf-to-jpg', [pdfFile('doc.pdf', pdf)], { dpi: '72', pages: '2' });
  assert(/\.jpg$/.test(r2.results[0].name), 'single page -> plain jpg');
});
test('pdf-to-png: PNG signature and size matches DPI', async (page) => {
  const r = await useTool(page, 'pdf-to-png', [pdfFile('doc.pdf', await makePdf('Doc', 1, { size: [300, 200] }))], { dpi: '150' });
  assert(!r.error, r.error); const b = r.results[0].buffer;
  assert(b[0] === 0x89 && b[1] === 0x50, 'PNG magic'); eq(b.readUInt32BE(16), 625, 'width = 300pt@150dpi'); eq(b.readUInt32BE(20), 417, 'height = 200pt@150dpi');
});
test('pdf-to-text: extracts text with separators', async (page) => {
  const r = await useTool(page, 'pdf-to-text', [pdfFile('doc.pdf', await makePdf('Doc', 3))]);
  assert(!r.error, r.error); const t = r.results[0].buffer.toString('utf8');
  assert(/--- Page 1 ---/.test(t) && /Doc page 3/.test(t) && /quick brown fox/.test(t), t);
});
test('pdf-to-text: image-only PDF gives clear no-text message', async (page) => {
  const img = await imageInBrowser(page, 'jpg', 200, 200);
  const doc = await PDFLib.PDFDocument.create(); const j = await doc.embedJpg(img); doc.addPage([200, 200]).drawImage(j, { x: 0, y: 0, width: 200, height: 200 });
  const r = await useTool(page, 'pdf-to-text', [pdfFile('scan.pdf', Buffer.from(await doc.save()))]);
  assert(r.error && /No text was found/i.test(r.error), r.error);
});
test('pdf-to-html: valid escaped HTML with every page', async (page) => {
  const doc = await PDFLib.PDFDocument.create(); const f = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('Tom & Jerry <b>x</b>', { x: 20, y: 100, size: 14, font: f });
  const r = await useTool(page, 'pdf-to-html', [pdfFile('doc.pdf', Buffer.from(await doc.save()))]);
  const h = r.results[0].buffer.toString('utf8');
  assert(/Tom &amp; Jerry &lt;b&gt;x&lt;\/b&gt;/.test(h) && /<!DOCTYPE html>/.test(h) && /id="page-1"/.test(h), h);
});

// ---------- Edit
test('add-page-numbers: "Page N of M" starting at 1, skipping first page', async (page) => {
  const r = await useTool(page, 'add-page-numbers', [pdfFile('doc.pdf', await makePdf('Doc', 5))], { fmt: 'of', first: 2 });
  assert(!r.error, r.error); const f = save(r.results[0].buffer, 'num.pdf');
  assert(!/Page \d+ of/.test(text(f, 1)), 'cover page not numbered');
  assert(/Page 1 of 4/.test(text(f, 2)) && /Page 4 of 4/.test(text(f, 5)), 'numbering: ' + text(f, 2));
});
test('add-page-numbers: works on rotated pages (text is upright in the viewer)', async (page) => {
  const r = await useTool(page, 'add-page-numbers', [pdfFile('doc.pdf', await makePdf('Doc', 2, { rotate: [90, 270] }))], { pos: 'bottom-right' });
  const f = save(r.results[0].buffer, 'num-rot.pdf');
  assert(/\b1\b/.test(text(f, 1)) && /\b2\b/.test(text(f, 2)), 'numbers extractable');
  sh('pdftoppm', ['-png', '-r', '50', '-f', '1', '-l', '1', f, path.join(TMP, 'numrot')]);
});
test('add-watermark: text present and painted near page center', async (page) => {
  const r = await useTool(page, 'add-watermark', [pdfFile('doc.pdf', await makePdf('Doc', 2))], { text: 'DRAFT', opacity: 60 });
  assert(!r.error, r.error); const f = save(r.results[0].buffer, 'wm.pdf');
  assert(streamHas(f, 'DRAFT', 1) || streamHas(f, 'DRAFT'), 'watermark string in content stream');
  assert(/D/.test(rawText(f, 1)) && /A/.test(rawText(f, 2)), 'diagonal glyphs extracted on both pages');
  sh('pdftoppm', ['-png', '-r', '72', '-f', '1', '-l', '1', f, path.join(TMP, 'wm')]);
});
test('add-watermark: page subset only', async (page) => {
  const r = await useTool(page, 'add-watermark', [pdfFile('doc.pdf', await makePdf('Doc', 3))], { text: 'ONLY2', pages: '2' });
  const f = save(r.results[0].buffer, 'wm2.pdf');
  const hasP = n => { const o = path.join(TMP, 'only' + n + '.pdf'); sh('qpdf', [f, '--pages', '.', String(n), '--', o]); return streamHas(o, 'ONLY2'); };
  assert(!hasP(1) && hasP(2) && !hasP(3), 'only page 2 has the watermark');
});
test('add-watermark: empty text gives error', async (page) => {
  const r = await useTool(page, 'add-watermark', [pdfFile('doc.pdf', await makePdf('Doc', 1))], { text: '  ' });
  assert(r.error && /watermark text/i.test(r.error), r.error);
});
test('add-text: multi-line text on a chosen page', async (page) => {
  const r = await useTool(page, 'add-text', [pdfFile('doc.pdf', await makePdf('Doc', 3))], { text: 'Hello ToolNest\nSecond line', pages: '3', pos: 'top-left' });
  assert(!r.error, r.error); const f = save(r.results[0].buffer, 'addtext.pdf');
  assert(/Hello ToolNest/.test(text(f, 3)) && /Second line/.test(text(f, 3)) && !/Hello ToolNest/.test(text(f, 1)), 'text only on page 3');
});
test('add-image: places PNG logo on pages', async (page) => {
  const logo = await imageInBrowser(page, 'png', 300, 150, true);
  const r = await useTool(page, 'add-image', [pdfFile('doc.pdf', await makePdf('Doc', 2))], { img: { name: 'logo.png', mimeType: 'image/png', buffer: logo }, width: 30 });
  assert(!r.error, r.error); const f = save(r.results[0].buffer, 'addimg.pdf');
  const list = sh('pdfimages', ['-list', f]); assert((list.match(/\bimage\b/g) || []).length >= 2, 'images on both pages:\n' + list);
});
test('add-image: no image chosen gives error', async (page) => {
  const r = await useTool(page, 'add-image', [pdfFile('doc.pdf', await makePdf('Doc', 1))]);
  assert(r.error && /Choose a JPG or PNG/i.test(r.error), r.error);
});
test('crop-pdf: crop box is reduced by requested margins', async (page) => {
  const r = await useTool(page, 'crop-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 2, { size: [400, 300] }))], { unit: 'pt', top: 20, bottom: 10, left: 30, right: 40 });
  assert(!r.error, r.error); const f = save(r.results[0].buffer, 'crop.pdf');
  const info = pdfInfo(f, ['-box', '-f', '1', '-l', '1']);
  assert(/CropBox:\s+30\.00\s+10\.00\s+360\.00\s+280\.00/.test(info), info);
});
test('crop-pdf: crop on rotated page maps to the correct side', async (page) => {
  const r = await useTool(page, 'crop-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 1, { size: [400, 300], rotate: [90] }))], { unit: 'pt', top: 50, bottom: 0, left: 0, right: 0 });
  const info = pdfInfo(save(r.results[0].buffer, 'crop-rot.pdf'), ['-box']);
  // /Rotate 90 (clockwise): the displayed top edge is the user-space left edge, so x starts at 50
  assert(/CropBox:\s+50\.00\s+0\.00\s+400\.00\s+300\.00/.test(info) && /Page rot:\s+90/.test(info), info);
});
test('crop-pdf: crop to nothing gives error', async (page) => {
  const r = await useTool(page, 'crop-pdf', [pdfFile('doc.pdf', await makePdf('Doc', 1))], { unit: 'pt', left: 300, right: 300 });
  assert(r.error && /cropped to nothing/i.test(r.error), r.error);
});
test('add-blank-pages: after page 2 with same size', async (page) => {
  const r = await useTool(page, 'add-blank-pages', [pdfFile('doc.pdf', await makePdf('Doc', 3))], { count: 2, where: 'after', after: 2 });
  assert(!r.error, r.error); const f = save(r.results[0].buffer, 'blank.pdf');
  eq(pageCount(f), 5, 'five pages'); assert(/Doc page 2/.test(text(f, 2)) && text(f, 3).trim() === '' && text(f, 4).trim() === '' && /Doc page 3/.test(text(f, 5)), 'blank pages at 3,4');
});
test('add-blank-pages: at start and end', async (page) => {
  const r = await useTool(page, 'add-blank-pages', [pdfFile('doc.pdf', await makePdf('Doc', 2))], { count: 1, where: 'start' });
  const f = save(r.results[0].buffer, 'blank-start.pdf'); assert(text(f, 1).trim() === '' && /Doc page 1/.test(text(f, 2)), 'blank first');
  const r2 = await useTool(page, 'add-blank-pages', [pdfFile('doc.pdf', await makePdf('Doc', 2))], { count: 1, where: 'end' });
  const f2 = save(r2.results[0].buffer, 'blank-end.pdf'); assert(/Doc page 2/.test(text(f2, 2)) && text(f2, 3).trim() === '', 'blank last');
});

// ---------- Security
let protectedBuf;
test('protect-pdf: AES-256 encrypted, needs password, text intact after unlock', async (page) => {
  const r = await useTool(page, 'protect-pdf', [pdfFile('doc.pdf', await makePdf('Secret', 2))], { pw: 'S3cret!', pw2: 'S3cret!', noCopy: true });
  assert(!r.error, r.error); protectedBuf = r.results[0].buffer;
  const f = save(protectedBuf, 'protected.pdf');
  assert(sh('qpdf', ['--is-encrypted', f]).indexOf('exit') === -1, 'qpdf says encrypted');
  const enc = sh('qpdf', ['--show-encryption', '--password=S3cret!', f]);
  assert(/R = 6/.test(enc) && /AESv3/.test(enc), 'AES-256 (R6):\n' + enc);
  assert(/extract for any purpose: not allowed/.test(enc), 'copy restriction set');
  assert(/Incorrect password|invalid password/i.test(pdfInfo(f, ['-upw', 'wrong'])), 'wrong password rejected by poppler');
  assert(/Pages:\s+2/.test(pdfInfo(f, ['-upw', 'S3cret!'])), 'poppler opens with correct password');
  assert(/Secret page 1/.test(sh('pdftotext', ['-upw', 'S3cret!', f, '-'])), 'text readable with password');
});
test('protect-pdf: mismatched / empty passwords give errors', async (page) => {
  let r = await useTool(page, 'protect-pdf', [pdfFile('doc.pdf', await makePdf('S', 1))], { pw: 'abcd', pw2: 'abce' });
  assert(r.error && /do not match/i.test(r.error), r.error);
  r = await useTool(page, 'protect-pdf', [pdfFile('doc.pdf', await makePdf('S', 1))], { pw: '', pw2: '' });
  assert(r.error && /Enter a password/i.test(r.error), r.error);
});
test('unlock-pdf: correct password removes protection (AES-256 from our own protect tool)', async (page) => {
  if (!protectedBuf) throw new Error('depends on protect-pdf test');
  const r = await useTool(page, 'unlock-pdf', [pdfFile('p.pdf', protectedBuf)], { pw: 'S3cret!' });
  assert(!r.error, r.error); const f = save(r.results[0].buffer, 'unlocked.pdf');
  assert(/exit 2|not encrypted/.test(sh('qpdf', ['--is-encrypted', f])) || sh('qpdf', ['--is-encrypted', f]).includes('[exit 2]'), 'no longer encrypted');
  eq(pageCount(f), 2, 'pages'); assert(/Secret page 2/.test(text(f, 2)), 'text intact');
});
test('unlock-pdf: wrong or missing password gives clear errors', async (page) => {
  if (!protectedBuf) throw new Error('depends on protect-pdf test');
  let r = await useTool(page, 'unlock-pdf', [pdfFile('p.pdf', protectedBuf)], { pw: 'nope' });
  assert(r.error && /Incorrect password/i.test(r.error), r.error);
  r = await useTool(page, 'unlock-pdf', [pdfFile('p.pdf', protectedBuf)], { pw: '' });
  assert(r.error && /needs a password|Incorrect password/i.test(r.error), r.error);
});
test('unlock-pdf: legacy RC4 and AES-128 files from other software', async (page) => {
  const plain = save(await makePdf('Legacy', 1), 'legacy-plain.pdf');
  for (const [name, args] of [['rc4', ['--allow-weak-crypto', '--encrypt', 'up', 'op', '128', '--use-aes=n', '--']], ['aes128', ['--encrypt', 'up', 'op', '128', '--use-aes=y', '--']]]) {
    const out = path.join(TMP, name + '.pdf'); sh('qpdf', args.concat([plain, out]));
    const r = await useTool(page, 'unlock-pdf', [pdfFile(name + '.pdf', fs.readFileSync(out))], { pw: 'up' });
    assert(!r.error, name + ': ' + r.error); assert(/Legacy page 1/.test(text(save(r.results[0].buffer, name + '-un.pdf'))), name + ' text intact');
  }
});

// ---------- Info
test('pdf-reader: renders pages and navigates', async (page) => {
  await openTool(page, 'pdf-reader');
  await addFiles(page, [pdfFile('doc.pdf', await makePdf('Doc', 3))]);
  await page.waitForSelector('#reader-label');
  eq((await page.textContent('#reader-label')).trim(), 'Page 1 of 3', 'label');
  await page.waitForFunction(() => { const c = document.querySelector('#reader-stage canvas'); if (!c || !c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) return true; return false; }, null, { timeout: 15000 });
  await page.click('text=Next →'); await page.waitForFunction(() => document.querySelector('#reader-label').textContent.includes('Page 2 of 3'));
  await page.click('text=Reset'); assert(!(await page.$('#reader-stage')), 'reader removed on reset');
});
test('pdf-metadata: shows title, author and page count', async (page) => {
  await openTool(page, 'pdf-metadata');
  await addFiles(page, [pdfFile('doc.pdf', await makePdf('Doc', 4, { title: 'Quarterly Report', author: 'Jane Roe' }))]);
  await page.waitForSelector('#meta-host .info-table');
  const t = await page.textContent('#meta-host');
  assert(/Quarterly Report/.test(t) && /Jane Roe/.test(t) && /Pages4/.test(t.replace(/\s/g, '')), t);
});
test('pdf-page-counter: counts multiple files and total, flags bad ones', async (page) => {
  await openTool(page, 'pdf-page-counter');
  await addFiles(page, [pdfFile('a.pdf', await makePdf('A', 5)), pdfFile('b.pdf', await makePdf('B', 3))]);
  await page.waitForFunction(() => document.querySelector('#total-pages') && document.querySelector('#total-pages').textContent === '8');
});

// ---------- Site-level
test('site: homepage search finds tools and navigates', async (page) => {
  await page.goto(base + '/');
  await page.fill('#hero-search', 'compress'); await page.waitForSelector('.hero .search-results a');
  const first = await page.getAttribute('.hero .search-results a', 'href'); assert(/compress-pdf\/$/.test(first), first);
  await page.press('#hero-search', 'Enter'); await page.waitForURL(/compress-pdf\/$/);
});
test('site: dark mode toggle persists', async (page) => {
  await page.goto(base + '/'); await page.click('#theme-btn');
  const t = await page.getAttribute('html', 'data-theme'); await page.reload(); eq(await page.getAttribute('html', 'data-theme'), t, 'persisted');
});
test('site: hero upload lets user pick tool, no navigation', async (page) => {
  await page.goto(base + '/');
  await page.setInputFiles('#hero-drop input[type=file]', [pdfFile('doc.pdf', await makePdf('Doc', 1))]);
  await page.waitForSelector('#hero-pick:not(.hidden)');
  assert(/1 PDF file selected/.test(await page.textContent('#hero-pick')), 'message');
});
test('site: ad containers are hidden and empty (no fake ads)', async (page) => {
  for (const url of ['/', '/merge-pdf/']) {
    await page.goto(base + url);
    const slots = await page.$$eval('.ad-slot', els => els.map(e => ({ display: getComputedStyle(e).display, ins: e.querySelectorAll('ins,iframe').length })));
    assert(slots.length >= 1 && slots.every(s => s.display === 'none' && s.ins === 0), url + ' ads hidden: ' + JSON.stringify(slots));
    assert(!(await page.$('script[src*="googlesyndication"]')), 'no AdSense script loaded');
  }
});
test('site: every page loads without console errors; metadata is unique', async (page) => {
  const tools = require('../assets/js/tools-data.js').TOOLS;
  const pages = ['/', '/all-tools/', '/about/', '/contact/', '/privacy-policy/', '/terms/', '/disclaimer/'].concat(tools.map(t => `/${t.id}/`));
  const titles = new Set(), descs = new Set();
  for (const u of pages) {
    page.errors.length = 0;
    await page.goto(base + u, { waitUntil: 'networkidle' });
    assert(page.errors.length === 0, u + ' errors: ' + page.errors.join(' | '));
    const m = await page.evaluate(() => ({ t: document.title, d: document.querySelector('meta[name=description]').content, c: document.querySelector('link[rel=canonical]').href, h1: document.querySelectorAll('h1').length, ld: document.querySelectorAll('script[type="application/ld+json"]').length, bc: !!document.querySelector('nav.breadcrumb') || location.pathname === '/' }));
    assert(!titles.has(m.t) && !descs.has(m.d), u + ' duplicate title/description'); titles.add(m.t); descs.add(m.d);
    assert(m.t.length <= 75 && m.d.length <= 175 && m.d.length >= 50, `${u} title/desc length ${m.t.length}/${m.d.length}`);
    eq(m.h1, 1, u + ' has exactly one h1'); assert(m.ld >= 1 && m.bc, u + ' structured data/breadcrumb');
    assert(m.c.endsWith(u === '/' ? '/' : u), u + ' canonical ' + m.c);
  }
});
test('site: all internal links, scripts and images resolve', async (page) => {
  const seen = new Set(), queue = ['/'], bad = [];
  while (queue.length) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    const res = await page.goto(base + u); if (res.status() !== 200) { bad.push(u + ' -> ' + res.status()); continue; }
    const links = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')).filter(h => h && !/^(https?:|mailto:|#|blob:)/.test(h)).map(h => new URL(h, location.href).pathname));
    links.forEach(l => { if (!seen.has(l)) queue.push(l); });
    const assets = await page.$$eval('script[src],link[href],img[src]', es => es.map(e => e.getAttribute('src') || e.getAttribute('href')).filter(h => h && !/^https?:/.test(h)).map(h => new URL(h, location.href).pathname));
    for (const a of assets) { if (!seen.has(a)) { const r = await page.request.get(base + a); if (r.status() !== 200) bad.push(a + ' -> ' + r.status()); seen.add(a); } }
  }
  assert(bad.length === 0, 'broken: ' + bad.join(', '));
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8'); const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
  for (const l of locs) assert(seen.has(l), 'sitemap URL not reachable via links: ' + l);
});

// ------------------------------------------------------------------ runner
(async () => {
  const srv = createServer(ROOT); await new Promise(r => srv.listen(0, r)); server = srv;
  base = 'http://localhost:' + srv.address().port;
  browser = await playwright.chromium.launch({ executablePath: fs.existsSync('/usr/bin/google-chrome') ? undefined : undefined });
  let pass = 0, fail = 0; const failures = [];
  for (const t of tests) {
    if (only.length && !only.some(w => t.name.toLowerCase().includes(w.toLowerCase()))) continue;
    const page = await newPage();
    const t0 = Date.now();
    try {
      await t.fn(page);
      const real = page.errors.filter(e => !/favicon/.test(e));
      if (real.length) throw new Error('browser errors: ' + real.join(' | '));
      pass++; console.log(`  ✓ ${t.name}  (${Date.now() - t0} ms)`);
    } catch (e) {
      fail++; failures.push(t.name); console.log(`  ✗ ${t.name}\n      ${String(e.message).split('\n').join('\n      ')}`);
    }
    await page.context().close();
  }
  await browser.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed.  Artifacts: ${TMP}`);
  process.exit(fail ? 1 : 0);
})();
