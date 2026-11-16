/* ToolNest PDF — organize tools: merge, split, remove pages, extract pages, organize, rotate. */
(function () {
  'use strict';
  var T = window.ToolNest;

  var H = window.ToolNestPdf, loadPdf = H.loadPdf, newDoc = H.newDoc, toBlob = H.toBlob, copyInto = H.copyInto;

  // ------------------------------------------------------------------ Merge
  T.register('merge-pdf', {
    runLabel: 'Merge PDF',
    onLoad: function (ctx) {
      if (ctx.files.length === 0) return;
    },
    run: function (ctx) {
      if (ctx.files.length < 2) throw new Error('Please add at least two PDF files to merge.');
      var PDFLib, out, total = ctx.files.length, pagesTotal = 0;
      return ctx.libs.pdfLib().then(function (L) { PDFLib = L; return newDoc(L); }).then(function (d) {
        out = d;
        var chain = Promise.resolve();
        ctx.files.forEach(function (f, i) {
          chain = chain.then(function () {
            ctx.progress(0.05 + 0.8 * (i / total), 'Merging ' + f.name + ' (' + (i + 1) + '/' + total + ')');
            return ctx.util.readBytes(f).then(function (b) { return loadPdf(PDFLib, b, f.name); }).then(function (src) {
              pagesTotal += src.getPageCount();
              return copyInto(out, src, src.getPageIndices());
            }).then(ctx.util.tick);
          });
        });
        return chain;
      }).then(function () {
        ctx.progress(0.92, 'Saving…');
        return toBlob(out);
      }).then(function (blob) {
        return { files: [{ name: 'merged.pdf', blob: blob }], summary: 'Merged ' + total + ' files into one PDF with ' + pagesTotal + ' pages.' };
      });
    }
  });

  // ------------------------------------------------------------------ Split
  T.register('split-pdf', {
    runLabel: 'Split PDF',
    pages: 'select',
    settings: [
      { id: 'mode', label: 'Split mode', type: 'select', value: 'ranges', options: [['ranges', 'By page ranges'], ['each', 'Every page into its own PDF'], ['every', 'Every N pages'], ['selected', 'Selected pages (one PDF per page)']] },
      { id: 'ranges', label: 'Page ranges', type: 'text', placeholder: '1-3, 5, 8-10', help: 'Each range becomes its own PDF.', showIf: function (g) { return g('mode') === 'ranges'; } },
      { id: 'n', label: 'Pages per file', type: 'number', value: 2, min: 1, showIf: function (g) { return g('mode') === 'every'; } }
    ],
    run: function (ctx) {
      var mode = ctx.get('mode'), PDFLib, src, groups = [], name = ctx.util.baseName(ctx.files[0].name);
      return ctx.libs.pdfLib().then(function (L) { PDFLib = L; return ctx.util.readBytes(ctx.files[0]); })
        .then(function (b) { return loadPdf(PDFLib, b, ctx.files[0].name); })
        .then(function (d) {
          src = d;
          var n = src.getPageCount(), i;
          if (mode === 'each') { for (i = 1; i <= n; i++) groups.push([i]); }
          else if (mode === 'every') {
            var k = Math.floor(ctx.get('n'));
            if (!(k >= 1)) throw new Error('Enter a valid number of pages per file.');
            for (i = 1; i <= n; i += k) { var g = []; for (var j = i; j < i + k && j <= n; j++) g.push(j); groups.push(g); }
          } else if (mode === 'selected') {
            var sel = ctx.selectedPages();
            if (!sel.length) throw new Error('Select at least one page.');
            sel.forEach(function (p) { groups.push([p]); });
          } else {
            var txt = ctx.get('ranges');
            if (!String(txt).trim()) throw new Error('Enter the page ranges to split, for example 1-3, 5.');
            groups = ctx.util.parseRangeGroups(txt, n);
          }
          var outputs = [], chain = Promise.resolve();
          groups.forEach(function (g, idx) {
            chain = chain.then(function () {
              ctx.progress(0.05 + 0.85 * (idx / groups.length), 'Creating file ' + (idx + 1) + ' of ' + groups.length);
              return newDoc(PDFLib).then(function (nd) {
                return copyInto(nd, src, g.map(function (p) { return p - 1; })).then(function () { return toBlob(nd); });
              }).then(function (blob) {
                outputs.push({ name: name + '-' + (g.length === 1 ? 'page-' + g[0] : 'pages-' + g[0] + '-' + g[g.length - 1]) + '.pdf', blob: blob });
              }).then(ctx.util.tick);
            });
          });
          return chain.then(function () { return outputs; });
        }).then(function (outputs) {
          if (outputs.length === 1) return { files: outputs, summary: 'Created 1 PDF.' };
          ctx.progress(0.95, 'Creating ZIP…');
          return ctx.libs.jszip().then(function (JSZip) {
            var zip = new JSZip(), seen = {};
            outputs.forEach(function (o) { var n = o.name; if (seen[n]) { seen[n]++; n = n.replace(/\.pdf$/, '-' + seen[n] + '.pdf'); } else seen[n] = 1; zip.file(n, o.blob); });
            return zip.generateAsync({ type: 'blob', compression: 'STORE' });
          }).then(function (blob) { return { files: [{ name: name + '-split.zip', blob: blob }], summary: 'Created ' + outputs.length + ' PDF files in a ZIP archive.' }; });
        });
    }
  });

  // ------------------------------------------------------------------ Remove / Extract
  function selectTool(removeMode) {
    return {
      runLabel: removeMode ? 'Remove pages' : 'Extract pages',
      pages: 'select',
      run: function (ctx) {
        var sel = ctx.selectedPages(), PDFLib, src, n = ctx.pageCount;
        if (!sel.length) throw new Error(removeMode ? 'Select the pages you want to remove.' : 'Select the pages you want to extract.');
        var keep = removeMode ? ctx.util.parseRanges('1-' + n, n).filter(function (p) { return sel.indexOf(p) === -1; }) : sel;
        if (!keep.length) throw new Error('You cannot remove every page. At least one page must remain.');
        return ctx.libs.pdfLib().then(function (L) { PDFLib = L; return ctx.util.readBytes(ctx.files[0]); })
          .then(function (b) { ctx.progress(0.3, 'Reading PDF…'); return loadPdf(PDFLib, b, ctx.files[0].name); })
          .then(function (d) { src = d; return newDoc(PDFLib); })
          .then(function (nd) { ctx.progress(0.6, 'Building new PDF…'); return copyInto(nd, src, keep.map(function (p) { return p - 1; })).then(function () { return toBlob(nd); }); })
          .then(function (blob) {
            var nm = ctx.util.baseName(ctx.files[0].name) + (removeMode ? '-pages-removed.pdf' : '-extracted.pdf');
            return { files: [{ name: nm, blob: blob }], summary: removeMode ? 'Removed ' + sel.length + ' page(s). The new PDF has ' + keep.length + ' pages.' : 'Extracted ' + keep.length + ' page(s) into a new PDF.' };
          });
      }
    };
  }
  T.register('remove-pages', selectTool(true));
  T.register('extract-pages', selectTool(false));

  // ------------------------------------------------------------------ Organize (reorder)
  T.register('organize-pdf', {
    runLabel: 'Save PDF',
    pages: 'reorder',
    run: function (ctx) {
      var PDFLib, src, order = ctx.order.slice();
      var changed = order.some(function (p, i) { return p !== i + 1; });
      if (!changed) throw new Error('The page order has not changed. Drag some pages first.');
      return ctx.libs.pdfLib().then(function (L) { PDFLib = L; return ctx.util.readBytes(ctx.files[0]); })
        .then(function (b) { ctx.progress(0.3, 'Reading PDF…'); return loadPdf(PDFLib, b, ctx.files[0].name); })
        .then(function (d) { src = d; return newDoc(PDFLib); })
        .then(function (nd) { ctx.progress(0.6, 'Reordering pages…'); return copyInto(nd, src, order.map(function (p) { return p - 1; })).then(function () { return toBlob(nd); }); })
        .then(function (blob) { return { files: [{ name: ctx.util.baseName(ctx.files[0].name) + '-organized.pdf', blob: blob }], summary: 'Pages reordered.' }; });
    }
  });

  // ------------------------------------------------------------------ Rotate
  T.register('rotate-pdf', {
    runLabel: 'Save PDF',
    pages: 'rotate',
    run: function (ctx) {
      var PDFLib, doc;
      if (!ctx.rotations.some(function (r) { return r !== 0; })) throw new Error('No pages are rotated yet. Use the rotate buttons first.');
      return ctx.libs.pdfLib().then(function (L) { PDFLib = L; return ctx.util.readBytes(ctx.files[0]); })
        .then(function (b) { ctx.progress(0.3, 'Reading PDF…'); return loadPdf(PDFLib, b, ctx.files[0].name); })
        .then(function (d) {
          doc = d; ctx.progress(0.6, 'Rotating pages…');
          doc.getPages().forEach(function (page, i) {
            if (!ctx.rotations[i]) return;
            var cur = page.getRotation().angle || 0;
            page.setRotation(PDFLib.degrees(((cur + ctx.rotations[i]) % 360 + 360) % 360));
          });
          doc.setProducer('ToolNest PDF');
          return toBlob(doc);
        })
        .then(function (blob) { return { files: [{ name: ctx.util.baseName(ctx.files[0].name) + '-rotated.pdf', blob: blob }], summary: 'Rotation saved permanently.' }; });
    }
  });
})();
