/* ToolNest PDF — compression tools: compress-pdf, optimize-pdf. */
(function () {
  'use strict';
  var T = window.ToolNest, H = window.ToolNestPdf;

  // Re-render every page as a JPEG and rebuild the PDF. Much smaller for scans/photos; text is no longer selectable.
  function rasterCompress(ctx, scale, quality) {
    var PDFLib, pdfjs, srcDoc, out, total;
    return Promise.all([ctx.libs.pdfLib(), ctx.libs.pdfjs(), ctx.util.readBytes(ctx.files[0])]).then(function (r) {
      PDFLib = r[0]; pdfjs = r[1];
      return pdfjs.getDocument({ data: r[2] }).promise;
    }).catch(function (e) {
      if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Please unlock it first with the Unlock PDF tool.');
      throw e;
    }).then(function (d) {
      srcDoc = d; total = d.numPages;
      return H.newDoc(PDFLib);
    }).then(function (nd) {
      out = nd;
      var chain = Promise.resolve();
      for (var p = 1; p <= total; p++) {
        (function (pn) {
          chain = chain.then(function () {
            ctx.progress(0.05 + 0.88 * ((pn - 1) / total), 'Compressing page ' + pn + ' of ' + total);
            return srcDoc.getPage(pn).then(function (page) {
              var base = page.getViewport({ scale: 1 });
              var s = scale;
              // keep canvas within safe browser limits
              while (base.width * s * base.height * s > 16000000 && s > 0.2) s *= 0.8;
              var canvas = document.createElement('canvas');
              return ctx.util.renderPage(srcDoc, pn, s, canvas).then(function () {
                return ctx.util.canvasToBlob(canvas, 'image/jpeg', quality);
              }).then(function (blob) {
                ctx.util.releaseCanvas(canvas);
                return blob.arrayBuffer();
              }).then(function (buf) {
                return out.embedJpg(new Uint8Array(buf));
              }).then(function (img) {
                var np = out.addPage([base.width, base.height]);
                np.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
              });
            }).then(ctx.util.tick);
          });
        })(p);
      }
      return chain;
    }).then(function () {
      ctx.util.closePdf(srcDoc);
      ctx.progress(0.96, 'Saving…');
      return H.toBlob(out);
    });
  }

  T.register('compress-pdf', {
    runLabel: 'Compress PDF',
    settings: [
      {
        id: 'level', label: 'Compression level', type: 'select', value: 'medium', full: true,
        options: [
          ['basic', 'Basic – lossless, keeps text selectable (small savings)'],
          ['medium', 'Recommended – pages as images, good quality'],
          ['strong', 'Strong – pages as images, smallest size']
        ],
        help: 'Recommended and Strong turn pages into images: text can no longer be selected or searched.'
      }
    ],
    run: function (ctx) {
      var level = ctx.get('level'), file = ctx.files[0], original = file.size, promise, usedStrongFallback = false;
      if (level === 'basic') {
        promise = Promise.all([ctx.libs.pdfLib(), ctx.util.readBytes(file)]).then(function (r) {
          ctx.progress(0.3, 'Reading PDF…');
          return H.loadPdf(r[0], r[1], file.name);
        }).then(function (doc) {
          ctx.progress(0.7, 'Rewriting PDF structure…');
          return H.toBlob(doc);
        });
      } else if (level === 'medium') {
        promise = rasterCompress(ctx, 1.5, 0.72).then(function (blob) {
          if (blob.size < original) return blob;
          usedStrongFallback = true;
          blob = null;
          ctx.progress(0.05, 'Recommended compression did not reduce the file. Retrying with Strong…');
          return rasterCompress(ctx, 1.0, 0.5);
        });
      } else promise = rasterCompress(ctx, 1.0, 0.5);

      return promise.then(function (blob) {
        if (blob.size >= original) {
          var advice = usedStrongFallback
            ? 'Recommended and Strong compression did not reduce the file. Try Basic compression to preserve text, or keep the original.'
            : level === 'strong'
              ? 'Strong compression did not reduce the file. Try Basic compression to preserve text, or keep the original.'
              : 'Your PDF may already be well compressed. Try a stronger compression level.';
          throw new Error('The result (' + T.fmtSize(blob.size) + ') is not smaller than your original (' + T.fmtSize(original) + '), so it was not kept. ' + advice);
        }
        var saved = Math.round((1 - blob.size / original) * 100);
        return {
          files: [{ name: ctx.util.baseName(file.name) + '-compressed.pdf', blob: blob }],
          summary: 'Reduced from ' + T.fmtSize(original) + ' to ' + T.fmtSize(blob.size) + ' (' + saved + '% smaller).' +
            (usedStrongFallback ? ' Strong compression was used because Recommended would have increased the file size.' : '')
        };
      });
    }
  });

  T.register('optimize-pdf', {
    runLabel: 'Optimize PDF',
    settings: [
      { id: 'strip', label: 'Remove metadata (title, author, keywords, XMP)', type: 'checkbox', value: false, full: true }
    ],
    run: function (ctx) {
      var file = ctx.files[0], PDFLib;
      return Promise.all([ctx.libs.pdfLib(), ctx.util.readBytes(file)]).then(function (r) {
        PDFLib = r[0];
        ctx.progress(0.3, 'Reading PDF…');
        return PDFLib.PDFDocument.load(r[1], { updateMetadata: false }).catch(function (e) {
          if (/encrypted/i.test(e.message)) throw new Error('This PDF is password-protected. Please unlock it first with the Unlock PDF tool.');
          throw new Error('Could not read the PDF. It may be damaged or use an unsupported feature.');
        });
      }).then(function (doc) {
        ctx.progress(0.6, 'Optimizing…');
        if (ctx.get('strip')) {
          doc.context.trailerInfo.Info = undefined;
          doc.catalog.delete(PDFLib.PDFName.of('Metadata'));
        }
        return doc.save({ useObjectStreams: true, updateFieldAppearances: false });
      }).then(function (bytes) {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        if (blob.size >= file.size && !ctx.get('strip')) {
          throw new Error('No savings found: the optimized file (' + T.fmtSize(blob.size) + ') is not smaller than the original (' + T.fmtSize(file.size) + '). Your PDF is already efficiently stored. Try Compress PDF for image-heavy files.');
        }
        var saved = file.size - blob.size;
        return {
          files: [{ name: ctx.util.baseName(file.name) + '-optimized.pdf', blob: blob }],
          summary: saved > 0 ? 'Reduced from ' + T.fmtSize(file.size) + ' to ' + T.fmtSize(blob.size) + '. Content is unchanged.' : 'Metadata removed. File size: ' + T.fmtSize(blob.size) + '.'
        };
      });
    }
  });
})();
