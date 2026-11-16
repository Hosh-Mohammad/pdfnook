/* ToolNest PDF — editing tools: page numbers, watermark, add text, add image, crop, blank pages. */
(function () {
  'use strict';
  var T = window.ToolNest, H = window.ToolNestPdf;

  var POS = [
    ['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'],
    ['top-center', 'Top center'], ['top-right', 'Top right'], ['top-left', 'Top left'],
    ['middle-center', 'Center']
  ];
  // visual anchor for a box of width w/height h inside a page of vw x vh with margin m
  function anchor(pos, vw, vh, w, h, m) {
    var parts = pos.split('-'), v = parts[0], hz = parts[1], x, y;
    x = hz === 'left' ? m : hz === 'right' ? vw - m - w : (vw - w) / 2;
    y = v === 'top' ? vh - m - h : v === 'bottom' ? m : (vh - h) / 2;
    return { x: x, y: y };
  }
  function pageList(ctx, n, text) {
    var t = String(text || '').trim();
    if (!t) return ctx.util.parseRanges('1-' + n, n);
    return ctx.util.parseRanges(t, n);
  }
  function openDoc(ctx) {
    var PDFLib;
    return Promise.all([ctx.libs.pdfLib(), ctx.util.readBytes(ctx.files[0])]).then(function (r) {
      PDFLib = r[0];
      ctx.progress(0.15, 'Reading PDF…');
      return H.loadPdf(PDFLib, r[1], ctx.files[0].name);
    }).then(function (doc) { doc.setProducer('ToolNest PDF'); return { PDFLib: PDFLib, doc: doc }; });
  }
  function finish(ctx, doc, suffix, summary) {
    ctx.progress(0.95, 'Saving…');
    return H.toBlob(doc).then(function (blob) {
      return { files: [{ name: ctx.util.baseName(ctx.files[0].name) + suffix + '.pdf', blob: blob }], summary: summary };
    });
  }
  var PAGES_SETTING = { id: 'pages', label: 'Pages (optional)', type: 'text', placeholder: 'All pages, or e.g. 1-3, 5', help: 'Leave empty to apply to every page.' };
  var FONTS = [['Helvetica', 'Helvetica'], ['TimesRoman', 'Times'], ['Courier', 'Courier']];

  // ------------------------------------------------------------ Page numbers
  T.register('add-page-numbers', {
    runLabel: 'Add page numbers',
    settings: [
      { id: 'pos', label: 'Position', type: 'select', value: 'bottom-center', options: POS.slice(0, 6) },
      { id: 'fmt', label: 'Format', type: 'select', value: 'n', options: [['n', '1, 2, 3'], ['page', 'Page 1'], ['of', 'Page 1 of N'], ['slash', '1 / N']] },
      { id: 'start', label: 'Start numbering at', type: 'number', value: 1, min: 0, max: 9999, step: 1 },
      { id: 'first', label: 'First page to number', type: 'number', value: 1, min: 1, step: 1, help: 'Set 2 to skip a cover page.' },
      { id: 'size', label: 'Font size (pt)', type: 'number', value: 11, min: 6, max: 48 },
      { id: 'color', label: 'Color', type: 'color', value: '#333333' }
    ],
    run: function (ctx) {
      var start = Math.floor(ctx.get('start')), first = Math.floor(ctx.get('first')), size = ctx.get('size');
      if (isNaN(start) || start < 0) throw new Error('Enter a valid starting number.');
      if (isNaN(first) || first < 1) throw new Error('First page to number must be 1 or more.');
      if (!(size >= 6 && size <= 48)) throw new Error('Font size must be between 6 and 48.');
      return openDoc(ctx).then(function (o) {
        var doc = o.doc, L = o.PDFLib, col = ctx.util.hexToRgb(ctx.get('color'));
        return doc.embedFont(L.StandardFonts.Helvetica).then(function (font) {
          var pages = doc.getPages(), n = pages.length, fmt = ctx.get('fmt'), pos = ctx.get('pos'), count = 0;
          if (first > n) throw new Error('This PDF only has ' + n + ' pages.');
          pages.forEach(function (page, i) {
            if (i + 1 < first) return;
            var num = start + (i + 1 - first), total = start + (n - first);
            var label = fmt === 'page' ? 'Page ' + num : fmt === 'of' ? 'Page ' + num + ' of ' + total : fmt === 'slash' ? num + ' / ' + total : String(num);
            var pl = H.placement(page), w = font.widthOfTextAtSize(label, size);
            var a = anchor(pos, pl.vw, pl.vh, w, size, 28), u = pl.toUser(a.x, a.y);
            page.drawText(label, { x: u.x, y: u.y, size: size, font: font, color: L.rgb(col.r, col.g, col.b), rotate: L.degrees(pl.angle) });
            count++;
            if (i % 20 === 0) ctx.progress(0.2 + 0.7 * (i / n));
          });
          return finish(ctx, doc, '-numbered', 'Added page numbers to ' + count + ' page(s).');
        });
      });
    }
  });

  // ------------------------------------------------------------ Watermark
  T.register('add-watermark', {
    runLabel: 'Add watermark',
    settings: [
      { id: 'text', label: 'Watermark text', type: 'text', value: 'CONFIDENTIAL', full: true },
      { id: 'size', label: 'Font size (pt)', type: 'number', value: 60, min: 8, max: 200 },
      { id: 'angle', label: 'Angle (degrees)', type: 'number', value: 45, min: -180, max: 180 },
      { id: 'opacity', label: 'Opacity (%)', type: 'number', value: 25, min: 5, max: 100 },
      { id: 'color', label: 'Color', type: 'color', value: '#cc0000' },
      PAGES_SETTING
    ],
    run: function (ctx) {
      var text = String(ctx.get('text') || '').trim(), size = ctx.get('size'), angle = ctx.get('angle'), op = ctx.get('opacity');
      if (!text) throw new Error('Enter the watermark text.');
      if (!(size >= 8 && size <= 200)) throw new Error('Font size must be between 8 and 200.');
      if (isNaN(angle)) throw new Error('Enter a valid angle.');
      if (!(op >= 5 && op <= 100)) throw new Error('Opacity must be between 5 and 100.');
      return openDoc(ctx).then(function (o) {
        var doc = o.doc, L = o.PDFLib, col = ctx.util.hexToRgb(ctx.get('color'));
        return doc.embedFont(L.StandardFonts.HelveticaBold).then(function (font) {
          var s = ctx.util.sanitizeText(text.replace(/\n/g, ' '), font), label = s.text;
          var pages = doc.getPages(), list = pageList(ctx, pages.length, ctx.get('pages'));
          var w = font.widthOfTextAtSize(label, size), th = size * 0.7, rad = angle * Math.PI / 180;
          list.forEach(function (pn, i) {
            var page = pages[pn - 1], pl = H.placement(page);
            // start point so that the text's center sits at the page center
            var cx = pl.vw / 2, cy = pl.vh / 2;
            var sx = cx - (w / 2) * Math.cos(rad) + (th / 2) * Math.sin(rad);
            var sy = cy - (w / 2) * Math.sin(rad) - (th / 2) * Math.cos(rad);
            var u = pl.toUser(sx, sy);
            page.drawText(label, { x: u.x, y: u.y, size: size, font: font, color: L.rgb(col.r, col.g, col.b), opacity: op / 100, rotate: L.degrees(pl.angle + angle) });
            if (i % 20 === 0) ctx.progress(0.2 + 0.7 * (i / list.length));
          });
          return finish(ctx, doc, '-watermarked', 'Watermark added to ' + list.length + ' page(s).' + (s.replaced ? ' Some characters are unsupported and were replaced with “?”.' : ''));
        });
      });
    }
  });

  // ------------------------------------------------------------ Add text
  T.register('add-text', {
    runLabel: 'Add text',
    settings: [
      { id: 'text', label: 'Text', type: 'textarea', value: '', placeholder: 'Type the text to add', full: true },
      { id: 'family', label: 'Font', type: 'select', value: 'Helvetica', options: FONTS },
      { id: 'size', label: 'Font size (pt)', type: 'number', value: 14, min: 6, max: 120 },
      { id: 'color', label: 'Color', type: 'color', value: '#000000' },
      { id: 'pos', label: 'Position', type: 'select', value: 'top-center', options: POS },
      { id: 'margin', label: 'Distance from edge (pt)', type: 'number', value: 36, min: 0, max: 400 },
      PAGES_SETTING
    ],
    run: function (ctx) {
      var text = String(ctx.get('text') || ''), size = ctx.get('size'), m = ctx.get('margin');
      if (!text.trim()) throw new Error('Enter the text you want to add.');
      if (!(size >= 6 && size <= 120)) throw new Error('Font size must be between 6 and 120.');
      if (isNaN(m) || m < 0) throw new Error('Enter a valid distance from the edge.');
      return openDoc(ctx).then(function (o) {
        var doc = o.doc, L = o.PDFLib, col = ctx.util.hexToRgb(ctx.get('color'));
        return doc.embedFont(L.StandardFonts[ctx.get('family')]).then(function (font) {
          var s = ctx.util.sanitizeText(text, font), pages = doc.getPages(), list = pageList(ctx, pages.length, ctx.get('pages')), pos = ctx.get('pos');
          list.forEach(function (pn, i) {
            var page = pages[pn - 1], pl = H.placement(page);
            var lines = ctx.util.wrapText(s.text, font, size, Math.max(40, pl.vw - 2 * m)), lh = size * 1.25;
            var maxLine = Math.max.apply(null, lines.map(function (l) { return font.widthOfTextAtSize(l, size); }));
            var boxH = lines.length * lh, a = anchor(pos, pl.vw, pl.vh, maxLine, boxH, m);
            lines.forEach(function (line, li) {
              var lw = font.widthOfTextAtSize(line, size), hz = pos.split('-')[1];
              var lx = hz === 'center' ? a.x + (maxLine - lw) / 2 : hz === 'right' ? a.x + maxLine - lw : a.x;
              var ly = a.y + boxH - (li + 1) * lh + (lh - size) / 2 + size * 0.15;
              var u = pl.toUser(lx, ly);
              if (line) page.drawText(line, { x: u.x, y: u.y, size: size, font: font, color: L.rgb(col.r, col.g, col.b), rotate: L.degrees(pl.angle) });
            });
            if (i % 20 === 0) ctx.progress(0.2 + 0.7 * (i / list.length));
          });
          return finish(ctx, doc, '-text', 'Text added to ' + list.length + ' page(s).' + (s.replaced ? ' Some characters are unsupported and were replaced with “?”.' : ''));
        });
      });
    }
  });

  // ------------------------------------------------------------ Add image
  T.register('add-image', {
    runLabel: 'Add image',
    settings: [
      { id: 'img', label: 'Image (JPG or PNG)', type: 'file', accept: '.jpg,.jpeg,.png,image/jpeg,image/png', full: true },
      { id: 'width', label: 'Image width (% of page width)', type: 'number', value: 25, min: 2, max: 100 },
      { id: 'opacity', label: 'Opacity (%)', type: 'number', value: 100, min: 5, max: 100 },
      { id: 'pos', label: 'Position', type: 'select', value: 'bottom-right', options: POS },
      { id: 'margin', label: 'Distance from edge (pt)', type: 'number', value: 30, min: 0, max: 400 },
      PAGES_SETTING
    ],
    run: function (ctx) {
      var file = ctx.get('img'), wp = ctx.get('width'), op = ctx.get('opacity'), m = ctx.get('margin');
      if (!file) throw new Error('Choose a JPG or PNG image to add.');
      if (file.size > 25 * 1048576) throw new Error('The image is larger than 25 MB.');
      if (!(wp >= 2 && wp <= 100)) throw new Error('Image width must be between 2 and 100 percent.');
      if (!(op >= 5 && op <= 100)) throw new Error('Opacity must be between 5 and 100.');
      if (isNaN(m) || m < 0) throw new Error('Enter a valid distance from the edge.');
      return openDoc(ctx).then(function (o) {
        var doc = o.doc, L = o.PDFLib;
        return ctx.util.readBytes(file).then(function (bytes) { return H.embedImage(doc, file, bytes); }).then(function (img) {
          var pages = doc.getPages(), list = pageList(ctx, pages.length, ctx.get('pages')), pos = ctx.get('pos');
          list.forEach(function (pn, i) {
            var page = pages[pn - 1], pl = H.placement(page);
            var w = pl.vw * wp / 100, h = w * img.height / img.width;
            if (h > pl.vh) { h = pl.vh; w = h * img.width / img.height; }
            var a = anchor(pos, pl.vw, pl.vh, w, h, m), u = pl.toUser(a.x, a.y);
            page.drawImage(img, { x: u.x, y: u.y, width: w, height: h, opacity: op / 100, rotate: L.degrees(pl.angle) });
            if (i % 20 === 0) ctx.progress(0.3 + 0.6 * (i / list.length));
          });
          return finish(ctx, doc, '-image', 'Image added to ' + list.length + ' page(s).');
        });
      });
    }
  });

  // ------------------------------------------------------------ Crop
  var UNIT = { pt: 1, mm: 72 / 25.4, in: 72 };
  T.register('crop-pdf', {
    runLabel: 'Crop PDF',
    settings: [
      { id: 'unit', label: 'Unit', type: 'select', value: 'mm', options: [['mm', 'Millimetres'], ['pt', 'Points'], ['in', 'Inches']], full: true },
      { id: 'top', label: 'Crop from top', type: 'number', value: 10, min: 0, step: 0.5 },
      { id: 'bottom', label: 'Crop from bottom', type: 'number', value: 10, min: 0, step: 0.5 },
      { id: 'left', label: 'Crop from left', type: 'number', value: 10, min: 0, step: 0.5 },
      { id: 'right', label: 'Crop from right', type: 'number', value: 10, min: 0, step: 0.5 },
      PAGES_SETTING
    ],
    run: function (ctx) {
      var k = UNIT[ctx.get('unit')], t = ctx.get('top') * k, b = ctx.get('bottom') * k, l = ctx.get('left') * k, r = ctx.get('right') * k;
      if ([t, b, l, r].some(function (v) { return isNaN(v) || v < 0; })) throw new Error('Enter valid, non-negative crop values.');
      if (t + b + l + r === 0) throw new Error('Enter an amount to crop from at least one side.');
      return openDoc(ctx).then(function (o) {
        var doc = o.doc, pages = doc.getPages(), list = pageList(ctx, pages.length, ctx.get('pages'));
        list.forEach(function (pn) {
          var page = pages[pn - 1], pl = H.placement(page);
          if (l + r >= pl.vw - 10 || t + b >= pl.vh - 10) throw new Error('Page ' + pn + ' would be cropped to nothing. Use smaller crop values.');
          var p1 = pl.toUser(l, b), p2 = pl.toUser(pl.vw - r, pl.vh - t);
          var x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
          page.setCropBox(x, y, w, h);
        });
        return finish(ctx, doc, '-cropped', 'Cropped ' + list.length + ' page(s). The visible page area was reduced; hidden content is not erased.');
      });
    }
  });

  // ------------------------------------------------------------ Blank pages
  T.register('add-blank-pages', {
    runLabel: 'Add blank pages',
    settings: [
      { id: 'count', label: 'Number of blank pages', type: 'number', value: 1, min: 1, max: 200, step: 1 },
      { id: 'where', label: 'Insert', type: 'select', value: 'end', options: [['start', 'At the beginning'], ['end', 'At the end'], ['after', 'After a specific page']] },
      { id: 'after', label: 'After page number', type: 'number', value: 1, min: 1, step: 1, showIf: function (g) { return g('where') === 'after'; } },
      { id: 'size', label: 'Page size', type: 'select', value: 'same', options: [['same', 'Same as neighbouring page'], ['a4', 'A4'], ['letter', 'US Letter']] }
    ],
    run: function (ctx) {
      var count = Math.floor(ctx.get('count')), where = ctx.get('where'), after = Math.floor(ctx.get('after')), size = ctx.get('size');
      if (!(count >= 1 && count <= 200)) throw new Error('Enter between 1 and 200 blank pages.');
      return openDoc(ctx).then(function (o) {
        var doc = o.doc, n = doc.getPageCount(), idx;
        if (where === 'start') idx = 0;
        else if (where === 'end') idx = n;
        else {
          if (!(after >= 1 && after <= n)) throw new Error('This PDF has ' + n + ' pages. Choose a page between 1 and ' + n + '.');
          idx = after;
        }
        var ref = doc.getPage(Math.min(Math.max(idx === n ? n - 1 : idx === 0 ? 0 : idx - 1, 0), n - 1));
        var dim = size === 'same' ? [ref.getWidth(), ref.getHeight()] : ctx.util.PAGE_SIZES[size];
        for (var i = 0; i < count; i++) doc.insertPage(idx + i, dim);
        return finish(ctx, doc, '-blank-pages', 'Added ' + count + ' blank page(s). The PDF now has ' + doc.getPageCount() + ' pages.');
      });
    }
  });
})();
