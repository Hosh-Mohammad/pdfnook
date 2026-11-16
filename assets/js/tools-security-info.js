/* ToolNest PDF — security + information tools:
 * protect-pdf, unlock-pdf, pdf-reader, pdf-metadata, pdf-page-counter
 */
(function () {
  'use strict';
  var T = window.ToolNest, H = window.ToolNestPdf, el = T.el;

  function isEncryptedError(e) { return e && /encrypted|password/i.test(e.message || ''); }

  // ------------------------------------------------------------ Protect PDF (AES-256)
  T.register('protect-pdf', {
    runLabel: 'Protect PDF',
    settings: [
      { id: 'pw', label: 'Password', type: 'password', placeholder: 'Choose a password', help: 'Needed to open the PDF. It cannot be recovered if lost.' },
      { id: 'pw2', label: 'Confirm password', type: 'password', placeholder: 'Repeat the password' },
      { id: 'noPrint', label: 'Disallow printing', type: 'checkbox', value: false },
      { id: 'noCopy', label: 'Disallow copying text', type: 'checkbox', value: false },
      { id: 'noEdit', label: 'Disallow editing', type: 'checkbox', value: false }
    ],
    run: function (ctx) {
      var pw = ctx.get('pw'), pw2 = ctx.get('pw2');
      if (!pw) throw new Error('Enter a password.');
      if (pw.length < 4) throw new Error('Use a password with at least 4 characters (8 or more is recommended).');
      if (pw !== pw2) throw new Error('The passwords do not match.');
      var file = ctx.files[0], PDFLib;
      return Promise.all([ctx.libs.pdfLib(), ctx.util.readBytes(file)]).then(function (r) {
        PDFLib = r[0];
        ctx.progress(0.3, 'Reading PDF…');
        return H.loadPdf(PDFLib, r[1], file.name);
      }).then(function (doc) {
        ctx.progress(0.6, 'Encrypting with AES-256…');
        doc.setProducer('ToolNest PDF');
        // The owner password differs from the user password so the permission flags are enforceable
        // by viewers while the user password still opens the file.
        var owner = pw + '·' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        doc.encrypt({
          userPassword: pw,
          ownerPassword: owner,
          algorithm: 'AES-256',
          permissions: {
            printing: ctx.get('noPrint') ? false : 'highResolution',
            copying: !ctx.get('noCopy'),
            modifying: !ctx.get('noEdit'),
            annotating: !ctx.get('noEdit'),
            fillingForms: true,
            contentAccessibility: true,
            documentAssembly: !ctx.get('noEdit')
          }
        });
        return doc.save();
      }).then(function (bytes) {
        return {
          files: [{ name: ctx.util.baseName(file.name) + '-protected.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) }],
          summary: 'Your PDF is now encrypted with AES-256. Remember your password: it cannot be recovered.'
        };
      });
    }
  });

  // ------------------------------------------------------------ Unlock PDF
  T.register('unlock-pdf', {
    runLabel: 'Unlock PDF',
    settings: [
      { id: 'pw', label: 'PDF password', type: 'password', placeholder: 'Enter the password', help: 'Leave empty if the PDF opens without a password but has editing/printing restrictions.', full: true }
    ],
    run: function (ctx) {
      var pw = ctx.get('pw') || '', file = ctx.files[0], PDFLib;
      return Promise.all([ctx.libs.pdfLib(), ctx.util.readBytes(file)]).then(function (r) {
        PDFLib = r[0];
        ctx.progress(0.3, 'Opening PDF…');
        return PDFLib.PDFDocument.load(r[1], { password: pw, updateMetadata: false });
      }).catch(function (e) {
        var m = (e && e.message) || '';
        if (/Password incorrect/i.test(m)) throw new Error('Incorrect password. Please check it and try again.');
        if (/needs password/i.test(m)) throw new Error('This PDF needs a password to open. Enter it above.');
        if (/encrypted/i.test(m)) throw new Error(pw ? 'Could not unlock this PDF with that password.' : 'This PDF needs a password to open. Enter it above.');
        throw new Error('Could not read this PDF. It may be damaged or use an unsupported encryption method.');
      }).then(function (doc) {
        ctx.progress(0.7, 'Removing protection…');
        return doc.save({ useObjectStreams: true });
      }).then(function (bytes) {
        return {
          files: [{ name: ctx.util.baseName(file.name) + '-unlocked.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) }],
          summary: 'Password protection removed. Only use this on files you are allowed to unlock.'
        };
      });
    }
  });

  // ------------------------------------------------------------ PDF Reader
  T.register('pdf-reader', {
    runLabel: 'Open',
    pages: null,
    init: function (ctx, parts) {
      // The reader has no "run" step; hide the run button (Reset stays) and render on load instead.
      parts.runBtn.style.display = 'none';
    },
    onLoad: function (ctx) {
      var pdfjs, doc, scale = 1.3, pageNo = 1, token = 0;
      return ctx.libs.pdfjs().then(function (m) { pdfjs = m; return ctx.util.readBytes(ctx.files[0]); }).then(function (bytes) {
        return pdfjs.getDocument({ data: bytes }).promise;
      }).catch(function (e) {
        if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Please unlock it first with the Unlock PDF tool.');
        throw e;
      }).then(function (d) {
        doc = d;
        var stage = el('div', { class: 'preview-stage', id: 'reader-stage' });
        var canvas = el('canvas', { 'aria-label': 'PDF page preview' });
        stage.appendChild(canvas);
        var label = el('span', { id: 'reader-label', 'aria-live': 'polite' });
        var prev = el('button', { type: 'button', class: 'btn btn-secondary', text: '← Previous' });
        var next = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Next →' });
        var zin = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Zoom +', 'aria-label': 'Zoom in' });
        var zout = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Zoom −', 'aria-label': 'Zoom out' });
        var jump = el('input', { type: 'number', min: '1', max: String(doc.numPages), value: '1', 'aria-label': 'Go to page', style: 'width:80px;padding:8px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font:inherit' });
        var bar = el('div', { class: 'actions', style: 'align-items:center' }, [prev, label, next, jump, zout, zin]);
        if (ctx.state.reader) ctx.util.closePdf(ctx.state.reader.doc);
        var panel = document.getElementById('reader-host');
        if (!panel) { panel = el('div', { id: 'reader-host', class: 'panel' }); document.getElementById('tool-app').appendChild(panel); }
        panel.textContent = '';
        panel.appendChild(bar); panel.appendChild(stage);
        function show(n) {
          pageNo = Math.min(Math.max(1, n), doc.numPages);
          jump.value = pageNo;
          prev.disabled = pageNo === 1; next.disabled = pageNo === doc.numPages;
          label.textContent = 'Page ' + pageNo + ' of ' + doc.numPages;
          var my = ++token;
          ctx.util.renderPage(doc, pageNo, scale * (window.devicePixelRatio > 1 ? 1.5 : 1), canvas).then(function () {
            if (my !== token) return;
            canvas.style.width = Math.round(canvas.width / (window.devicePixelRatio > 1 ? 1.5 : 1)) + 'px';
            canvas.style.maxWidth = '100%'; canvas.style.height = 'auto';
          });
        }
        prev.addEventListener('click', function () { show(pageNo - 1); });
        next.addEventListener('click', function () { show(pageNo + 1); });
        zin.addEventListener('click', function () { scale = Math.min(4, scale + 0.25); show(pageNo); });
        zout.addEventListener('click', function () { scale = Math.max(0.5, scale - 0.25); show(pageNo); });
        jump.addEventListener('change', function () { show(parseInt(jump.value, 10) || 1); });
        ctx.state.reader = { doc: doc, panel: panel };
        show(1);
      });
    },
    onReset: function (ctx) {
      if (ctx.state.reader) { ctx.util.closePdf(ctx.state.reader.doc); ctx.state.reader.panel.remove(); }
    },
    run: function () { return null; }
  });

  // ------------------------------------------------------------ Metadata viewer
  function fmtDate(d) { return d instanceof Date && !isNaN(d) ? d.toLocaleString() + ' (' + d.toISOString() + ')' : '—'; }
  function parsePdfDate(s) {
    var m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?/.exec(s || '');
    if (!m) return null;
    var tz = m[7] && m[7] !== 'Z' ? m[7].replace(/'/g, '').replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : 'Z';
    var iso = m[1] + '-' + (m[2] || '01') + '-' + (m[3] || '01') + 'T' + (m[4] || '00') + ':' + (m[5] || '00') + ':' + (m[6] || '00') + tz;
    var d = new Date(iso);
    return isNaN(d) ? null : d;
  }

  function readMeta(ctx, file) {
    var pdfjs;
    return ctx.libs.pdfjs().then(function (m) { pdfjs = m; return ctx.util.readBytes(file); }).then(function (bytes) {
      return pdfjs.getDocument({ data: bytes }).promise.then(function (doc) {
        return Promise.all([doc.getMetadata(), doc.getPage(1)]).then(function (r) {
          var info = r[0].info || {}, vp = r[1].getViewport({ scale: 1 });
          var out = { info: info, pages: doc.numPages, w: vp.width, h: vp.height, encrypted: false };
          ctx.util.closePdf(doc);
          return out;
        });
      });
    });
  }

  T.register('pdf-metadata', {
    runLabel: 'Show metadata',
    init: function (ctx, parts) { parts.runBtn.style.display = 'none'; },
    onLoad: function (ctx) {
      var file = ctx.files[0];
      return readMeta(ctx, file).catch(function (e) {
        if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Please unlock it first with the Unlock PDF tool.');
        throw e;
      }).then(function (m) {
        var i = m.info, rows = [
          ['File name', file.name], ['File size', T.fmtSize(file.size)], ['Title', i.Title || '—'], ['Author', i.Author || '—'],
          ['Subject', i.Subject || '—'], ['Keywords', i.Keywords || '—'], ['Creator (software)', i.Creator || '—'], ['Producer', i.Producer || '—'],
          ['Created', fmtDate(parsePdfDate(i.CreationDate))], ['Modified', fmtDate(parsePdfDate(i.ModDate))],
          ['PDF version', i.PDFFormatVersion || '—'], ['Pages', String(m.pages)],
          ['Page size (page 1)', Math.round(m.w) + ' × ' + Math.round(m.h) + ' pt  (' + (m.w / 72 * 25.4).toFixed(0) + ' × ' + (m.h / 72 * 25.4).toFixed(0) + ' mm)'],
          ['Tagged / accessible', i.IsAcroFormPresent ? 'Contains form fields' : 'No form fields'],
          ['Linearized (fast web view)', i.IsLinearized ? 'Yes' : 'No']
        ];
        var table = el('table', { class: 'info-table' });
        rows.forEach(function (r) { table.appendChild(el('tr', {}, [el('th', { scope: 'row', text: r[0] }), el('td', { text: r[1] })])); });
        var host = document.getElementById('meta-host');
        if (!host) { host = el('div', { id: 'meta-host', class: 'panel' }); document.getElementById('tool-app').appendChild(host); }
        host.textContent = ''; host.appendChild(el('h2', { text: 'Document properties' })); host.appendChild(table);
        ctx.state.metaHost = host;
      });
    },
    onReset: function (ctx) { if (ctx.state.metaHost) ctx.state.metaHost.remove(); },
    run: function () { return null; }
  });

  // ------------------------------------------------------------ Page counter
  T.register('pdf-page-counter', {
    runLabel: 'Count pages',
    reorderFiles: false,
    init: function (ctx, parts) { parts.runBtn.style.display = 'none'; },
    onLoad: function (ctx) {
      var total = 0, rows = [], chain = Promise.resolve();
      ctx.files.forEach(function (f) {
        chain = chain.then(function () {
          return readMeta(ctx, f).then(function (m) { f.__pages = m.pages; rows.push([f.name, String(m.pages), true]); total += m.pages; })
            .catch(function (e) { rows.push([f.name, e && e.name === 'PasswordException' ? 'Password-protected' : 'Could not read', false]); });
        });
      });
      return chain.then(function () {
        var host = document.getElementById('count-host');
        if (!host) { host = el('div', { id: 'count-host', class: 'panel' }); document.getElementById('tool-app').appendChild(host); }
        host.textContent = '';
        host.appendChild(el('h2', { text: 'Page count' }));
        host.appendChild(el('div', { class: 'big-number', id: 'total-pages', text: String(total) }));
        host.appendChild(el('p', { class: 'meta', text: 'total pages in ' + rows.filter(function (r) { return r[2]; }).length + ' file(s)' }));
        var table = el('table', { class: 'info-table' });
        rows.forEach(function (r) { table.appendChild(el('tr', {}, [el('th', { scope: 'row', text: r[0] }), el('td', { text: r[1] })])); });
        host.appendChild(table);
        ctx.state.countHost = host;
      });
    },
    onReset: function (ctx) { if (ctx.state.countHost) ctx.state.countHost.remove(); },
    run: function () { return null; }
  });
})();
