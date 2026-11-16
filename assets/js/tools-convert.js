/* ToolNest PDF — conversion tools.
 * To PDF:   jpg-to-pdf, png-to-pdf, txt-to-pdf, html-to-pdf
 * From PDF: pdf-to-jpg, pdf-to-png, pdf-to-text, pdf-to-html
 */
(function () {
  'use strict';
  var T = window.ToolNest, H = window.ToolNestPdf;

  // ------------------------------------------------------------ image helpers
  var embedImage = H.embedImage;

  function imagesToPdf(label) {
    return {
      runLabel: 'Convert to PDF',
      settings: [
        { id: 'size', label: 'Page size', type: 'select', value: 'a4', options: [['fit', 'Same as image'], ['a4', 'A4'], ['letter', 'US Letter']] },
        { id: 'orient', label: 'Orientation', type: 'select', value: 'auto', options: [['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], showIf: function (g) { return g('size') !== 'fit'; } },
        { id: 'margin', label: 'Margin (points)', type: 'number', value: 24, min: 0, max: 200, help: '72 points = 1 inch.', showIf: function (g) { return g('size') !== 'fit'; } }
      ],
      run: function (ctx) {
        var PDFLib, doc, size = ctx.get('size'), orient = ctx.get('orient'), margin = Math.max(0, ctx.get('margin') || 0), total = ctx.files.length;
        return ctx.libs.pdfLib().then(function (L) { PDFLib = L; return H.newDoc(L); }).then(function (d) {
          doc = d;
          var chain = Promise.resolve();
          ctx.files.forEach(function (f, i) {
            chain = chain.then(function () {
              ctx.progress(0.05 + 0.85 * (i / total), 'Adding image ' + (i + 1) + ' of ' + total);
              return ctx.util.readBytes(f).then(function (bytes) { return embedImage(doc, f, bytes); }).then(function (img) {
                var w = img.width, h = img.height, pw, ph;
                if (size === 'fit') { pw = w; ph = h; }
                else {
                  var s = ctx.util.PAGE_SIZES[size];
                  var land = orient === 'landscape' || (orient === 'auto' && w > h);
                  pw = land ? s[1] : s[0]; ph = land ? s[0] : s[1];
                }
                var page = doc.addPage([pw, ph]);
                var m = size === 'fit' ? 0 : Math.min(margin, Math.min(pw, ph) / 2 - 1);
                var scale = Math.min((pw - 2 * m) / w, (ph - 2 * m) / h);
                if (size === 'fit') scale = 1;
                var dw = w * scale, dh = h * scale;
                page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
              }).then(ctx.util.tick);
            });
          });
          return chain;
        }).then(function () { ctx.progress(0.95, 'Saving…'); return H.toBlob(doc); })
          .then(function (blob) { return { files: [{ name: (total === 1 ? ctx.util.baseName(ctx.files[0].name) : 'images') + '.pdf', blob: blob }], summary: 'Created a PDF with ' + total + ' page' + (total > 1 ? 's' : '') + '.' }; });
      }
    };
  }
  T.register('jpg-to-pdf', imagesToPdf('JPG'));
  T.register('png-to-pdf', imagesToPdf('PNG'));

  // ------------------------------------------------------------ text layout (txt + html)
  // blocks: [{ text, font: 'body'|'bold'|'mono', size: multiplier, indent: pts, gapBefore: pts }]
  function layoutToPdf(ctx, blocks, opts) {
    var PDFLib, doc, fonts = {};
    var ps = ctx.util.PAGE_SIZES[opts.pageSize] || ctx.util.PAGE_SIZES.a4;
    var margin = opts.margin, base = opts.fontSize;
    return ctx.libs.pdfLib().then(function (L) { PDFLib = L; return H.newDoc(L); }).then(function (d) {
      doc = d;
      var fam = opts.family; // 'Helvetica' | 'TimesRoman' | 'Courier'
      var SF = PDFLib.StandardFonts;
      return Promise.all([doc.embedFont(SF[fam]), doc.embedFont(SF[fam + 'Bold'] || SF[fam]), doc.embedFont(SF.Courier)]);
    }).then(function (f) {
      fonts.body = f[0]; fonts.bold = f[1]; fonts.mono = f[2];
      var page = doc.addPage(ps), y = ps[1] - margin, replaced = 0, pageNo = 1, first = true;
      var maxW = ps[0] - 2 * margin;
      blocks.forEach(function (b, bi) {
        var font = fonts[b.font || 'body'], size = base * (b.size || 1), lh = size * 1.35;
        var s = ctx.util.sanitizeText(b.text, font); replaced += s.replaced;
        var lines = ctx.util.wrapText(s.text, font, size, maxW - (b.indent || 0));
        if (!first) y -= (b.gapBefore || 0);
        first = false;
        lines.forEach(function (line) {
          if (y - lh < margin) { page = doc.addPage(ps); y = ps[1] - margin; pageNo++; }
          y -= lh;
          if (line) page.drawText(line, { x: margin + (b.indent || 0), y: y + lh * 0.25, size: size, font: font, color: PDFLib.rgb(0.1, 0.1, 0.1) });
        });
        if (bi % 50 === 0) ctx.progress(0.1 + 0.8 * (bi / blocks.length), 'Laying out text…');
      });
      ctx.progress(0.95, 'Saving…');
      return H.toBlob(doc).then(function (blob) { return { blob: blob, pages: pageNo, replaced: replaced }; });
    });
  }
  function layoutSettings(withMargin) {
    return [
      { id: 'family', label: 'Font', type: 'select', value: 'Helvetica', options: [['Helvetica', 'Helvetica (sans-serif)'], ['TimesRoman', 'Times (serif)'], ['Courier', 'Courier (monospace)']] },
      { id: 'fontSize', label: 'Font size (pt)', type: 'number', value: 12, min: 6, max: 36 },
      { id: 'pageSize', label: 'Page size', type: 'select', value: 'a4', options: [['a4', 'A4'], ['letter', 'US Letter'], ['legal', 'US Legal'], ['a5', 'A5']] },
      { id: 'margin', label: 'Margin (points)', type: 'number', value: 56, min: 20, max: 150 }
    ];
  }
  function readLayout(ctx) {
    var fs = ctx.get('fontSize'), mg = ctx.get('margin');
    if (!(fs >= 6 && fs <= 36)) throw new Error('Font size must be between 6 and 36.');
    if (!(mg >= 20 && mg <= 150)) throw new Error('Margin must be between 20 and 150 points.');
    return { family: ctx.get('family'), fontSize: fs, pageSize: ctx.get('pageSize'), margin: mg };
  }
  function resultSummary(r) {
    return 'Created a PDF with ' + r.pages + ' page' + (r.pages > 1 ? 's' : '') + '.' + (r.replaced ? ' ' + r.replaced + ' unsupported character(s) were replaced with “?” (only Western European characters are supported).' : '');
  }

  // ------------------------------------------------------------ TXT to PDF
  T.register('txt-to-pdf', {
    runLabel: 'Convert to PDF',
    allowNoFile: true,
    settings: [{ id: 'text', label: 'Text', type: 'textarea', value: '', placeholder: 'Paste or type your text here, or upload a .txt file above', full: true }].concat(layoutSettings()),
    onLoad: function (ctx) {
      return ctx.files[0].text().then(function (t) { ctx.state.loadedText = t; });
    },
    afterSettings: function (ctx) {
      if (ctx.state.loadedText != null) ctx.settings.text.input.value = ctx.state.loadedText;
    },
    run: function (ctx) {
      var text = ctx.get('text');
      if (!String(text).trim()) throw new Error('Please add some text first: paste it or upload a .txt file.');
      var opts = readLayout(ctx);
      var blocks = [{ text: text, font: opts.family === 'Courier' ? 'mono' : 'body', size: 1 }];
      return layoutToPdf(ctx, blocks, opts).then(function (r) {
        return { files: [{ name: (ctx.files[0] ? ctx.util.baseName(ctx.files[0].name) : 'text') + '.pdf', blob: r.blob }], summary: resultSummary(r) };
      });
    }
  });

  // ------------------------------------------------------------ HTML to PDF (text content only)
  function htmlToBlocks(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html'); // inert: scripts do not run
    ['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'head'].forEach(function (t) {
      doc.querySelectorAll(t).forEach(function (n) { n.remove(); });
    });
    var blocks = [], buf = '';
    function flush(style) {
      var t = buf.replace(/[ \t\r\n]+/g, ' ').trim();
      buf = '';
      if (t) blocks.push(Object.assign({ text: t, gapBefore: 6 }, style || {}));
    }
    var HEAD = { H1: 2, H2: 1.6, H3: 1.35, H4: 1.2, H5: 1.1, H6: 1.05 };
    function walk(node, ctxStyle) {
      node.childNodes.forEach(function (c) {
        if (c.nodeType === 3) { buf += c.nodeValue; return; }
        if (c.nodeType !== 1) return;
        var tag = c.tagName;
        if (tag === 'BR') { buf += '\n'; return; }
        if (HEAD[tag]) { flush(ctxStyle); buf = c.textContent; flush({ font: 'bold', size: HEAD[tag], gapBefore: 14 }); return; }
        if (tag === 'PRE') { flush(ctxStyle); blocks.push({ text: c.textContent.replace(/\s+$/, ''), font: 'mono', gapBefore: 8 }); return; }
        if (tag === 'LI') { flush(ctxStyle); buf = '• ' + c.textContent; flush({ indent: 14, gapBefore: 3 }); return; }
        if (tag === 'TR') { flush(ctxStyle); var cells = []; c.querySelectorAll('th,td').forEach(function (x) { cells.push(x.textContent.replace(/\s+/g, ' ').trim()); }); buf = cells.join('  |  '); flush({ gapBefore: 3 }); return; }
        if (tag === 'BLOCKQUOTE') { flush(ctxStyle); walk(c, { indent: 18 }); flush({ indent: 18 }); return; }
        var block = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|UL|OL|TABLE|FORM|FIGURE|ADDRESS|ASIDE|NAV|HR|DL|DT|DD)$/.test(tag);
        if (block) flush(ctxStyle);
        if (/^(UL|OL|TABLE|TBODY|THEAD|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|FORM|NAV|ASIDE|DL)$/.test(tag)) walk(c, ctxStyle);
        else { walk(c, ctxStyle); }
        if (block) flush(ctxStyle);
      });
    }
    walk(doc.body || doc.documentElement, null);
    flush(null);
    return { blocks: blocks, title: (doc.title || '').trim() };
  }
  T.register('html-to-pdf', {
    runLabel: 'Convert to PDF',
    allowNoFile: true,
    settings: [{ id: 'html', label: 'HTML', type: 'textarea', value: '', placeholder: '<h1>Title</h1><p>Paste HTML here, or upload an .html file above</p>', full: true }].concat(layoutSettings()),
    onLoad: function (ctx) { return ctx.files[0].text().then(function (t) { ctx.state.loadedText = t; }); },
    afterSettings: function (ctx) { if (ctx.state.loadedText != null) ctx.settings.html.input.value = ctx.state.loadedText; },
    run: function (ctx) {
      var html = ctx.get('html');
      if (!String(html).trim()) throw new Error('Please paste some HTML or upload an .html file first.');
      var opts = readLayout(ctx), parsed = htmlToBlocks(html);
      if (!parsed.blocks.length) throw new Error('No readable text was found in this HTML.');
      return layoutToPdf(ctx, parsed.blocks, opts).then(function (r) {
        return { files: [{ name: (ctx.files[0] ? ctx.util.baseName(ctx.files[0].name) : 'page') + '.pdf', blob: r.blob }], summary: resultSummary(r) + ' Styles, images and scripts are not rendered.' };
      });
    }
  });
  window.__htmlToBlocks = htmlToBlocks; // exposed for automated tests

  // ------------------------------------------------------------ PDF to images
  function pdfToImages(ext, mime) {
    var settings = [
      { id: 'dpi', label: 'Resolution', type: 'select', value: '150', options: [['72', '72 DPI – small (screen)'], ['150', '150 DPI – good'], ['220', '220 DPI – high'], ['300', '300 DPI – print']] },
      { id: 'pages', label: 'Pages (optional)', type: 'text', placeholder: 'All pages, or e.g. 1-3, 5', help: 'Leave empty to convert every page.' }
    ];
    if (ext === 'jpg') settings.unshift({ id: 'quality', label: 'JPG quality', type: 'select', value: '0.85', options: [['0.6', 'Low (smallest)'], ['0.85', 'Good'], ['0.95', 'High']] });
    return {
      runLabel: 'Convert to ' + ext.toUpperCase(),
      settings: settings,
      run: function (ctx) {
        var pdfjs, doc, name = ctx.util.baseName(ctx.files[0].name), dpi = +ctx.get('dpi'), q = +ctx.get('quality') || 0.9, pages, outputs = [], scaled = false;
        return Promise.all([ctx.libs.pdfjs(), ctx.util.readBytes(ctx.files[0])]).then(function (r) {
          pdfjs = r[0];
          return pdfjs.getDocument({ data: r[1] }).promise;
        }).catch(function (e) {
          if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Please unlock it first with the Unlock PDF tool.');
          throw e;
        }).then(function (d) {
          doc = d;
          var rng = String(ctx.get('pages') || '').trim();
          pages = rng ? ctx.util.parseRanges(rng, doc.numPages) : ctx.util.parseRanges('1-' + doc.numPages, doc.numPages);
          var chain = Promise.resolve();
          pages.forEach(function (pn, i) {
            chain = chain.then(function () {
              ctx.progress(0.05 + 0.85 * (i / pages.length), 'Converting page ' + pn + ' (' + (i + 1) + '/' + pages.length + ')');
              return doc.getPage(pn).then(function (pg) {
                var base = pg.getViewport({ scale: 1 }), s = dpi / 72;
                while (base.width * s * base.height * s > 16000000 && s > 0.3) { s *= 0.85; scaled = true; }
                var canvas = document.createElement('canvas');
                return ctx.util.renderPage(doc, pn, s, canvas).then(function () { return ctx.util.canvasToBlob(canvas, mime, q); }).then(function (blob) {
                  ctx.util.releaseCanvas(canvas);
                  var num = String(pn); while (num.length < String(doc.numPages).length) num = '0' + num;
                  outputs.push({ name: name + '-page-' + num + '.' + ext, blob: blob });
                });
              }).then(ctx.util.tick);
            });
          });
          return chain;
        }).then(function () {
          ctx.util.closePdf(doc);
          var note = scaled ? ' Very large pages were scaled down to stay within browser limits.' : '';
          if (outputs.length === 1) return { files: outputs, summary: 'Converted 1 page.' + note };
          ctx.progress(0.95, 'Creating ZIP…');
          return ctx.libs.jszip().then(function (JSZip) {
            var zip = new JSZip(); outputs.forEach(function (o) { zip.file(o.name, o.blob); });
            return zip.generateAsync({ type: 'blob', compression: 'STORE' });
          }).then(function (blob) { return { files: [{ name: name + '-' + ext + '-images.zip', blob: blob }], summary: 'Converted ' + outputs.length + ' pages. Images are in the ZIP.' + note }; });
        });
      }
    };
  }
  T.register('pdf-to-jpg', pdfToImages('jpg', 'image/jpeg'));
  T.register('pdf-to-png', pdfToImages('png', 'image/png'));

  // ------------------------------------------------------------ PDF text extraction
  function extractPages(ctx) {
    var pdfjs, doc, texts = [];
    return Promise.all([ctx.libs.pdfjs(), ctx.util.readBytes(ctx.files[0])]).then(function (r) {
      pdfjs = r[0];
      return pdfjs.getDocument({ data: r[1] }).promise;
    }).catch(function (e) {
      if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Please unlock it first with the Unlock PDF tool.');
      throw e;
    }).then(function (d) {
      doc = d;
      var chain = Promise.resolve();
      for (var p = 1; p <= doc.numPages; p++) {
        (function (pn) {
          chain = chain.then(function () {
            ctx.progress(0.05 + 0.85 * ((pn - 1) / doc.numPages), 'Reading page ' + pn + ' of ' + doc.numPages);
            return doc.getPage(pn).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
              var s = '';
              tc.items.forEach(function (it) { if (it.str !== undefined) { s += it.str; if (it.hasEOL) s += '\n'; } });
              texts.push(s.trim());
            }).then(ctx.util.tick);
          });
        })(p);
      }
      return chain;
    }).then(function () { ctx.util.closePdf(doc); return texts; });
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  T.register('pdf-to-text', {
    runLabel: 'Extract text',
    settings: [{ id: 'sep', label: 'Add page separators (--- Page N ---)', type: 'checkbox', value: true, full: true }],
    run: function (ctx) {
      return extractPages(ctx).then(function (texts) {
        var all = texts.join('').trim();
        if (!all) throw new Error('No text was found. This PDF may be a scan (images only). This tool does not include OCR.');
        var out = ctx.get('sep') ? texts.map(function (t, i) { return '--- Page ' + (i + 1) + ' ---\n' + t; }).join('\n\n') : texts.join('\n\n');
        return { files: [{ name: ctx.util.baseName(ctx.files[0].name) + '.txt', blob: new Blob([out], { type: 'text/plain;charset=utf-8' }) }], summary: 'Extracted text from ' + texts.length + ' page(s).' };
      });
    }
  });

  T.register('pdf-to-html', {
    runLabel: 'Convert to HTML',
    run: function (ctx) {
      return extractPages(ctx).then(function (texts) {
        if (!texts.join('').trim()) throw new Error('No text was found. This PDF may be a scan (images only). This tool does not include OCR.');
        var title = ctx.util.baseName(ctx.files[0].name);
        var body = texts.map(function (t, i) {
          var paras = t.split(/\n{2,}/).map(function (p) { return '    <p>' + esc(p).replace(/\n/g, '<br>\n    ') + '</p>'; }).join('\n');
          return '  <section id="page-' + (i + 1) + '">\n    <h2>Page ' + (i + 1) + '</h2>\n' + paras + '\n  </section>';
        }).join('\n');
        var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>' + esc(title) + '</title>\n  <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6}section{border-top:1px solid #ddd;padding-top:1rem;margin-top:1rem}</style>\n</head>\n<body>\n  <h1>' + esc(title) + '</h1>\n' + body + '\n</body>\n</html>\n';
        return { files: [{ name: title + '.html', blob: new Blob([html], { type: 'text/html;charset=utf-8' }) }], summary: 'Converted ' + texts.length + ' page(s). Layout, fonts and images are not preserved.' };
      });
    }
  });
})();
