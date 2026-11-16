/* ToolNest PDF — tool runtime.
 * Provides the shared tool-page UI (upload, validation, previews, progress, results)
 * and helpers. Individual tools register themselves with ToolNest.register(id, definition).
 * All processing happens locally in the browser.
 */
(function () {
  'use strict';
  var BASE = document.documentElement.getAttribute('data-base') || '';
  var MAX_MB = 150; // hard limit per file to protect low-memory devices
  var registry = {};
  var libs = {};
  var objectUrls = [];

  // ---------------------------------------------------------------- DOM helpers
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // ---------------------------------------------------------------- Lazy library loading
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadPdfLib() {
    if (libs.pdfLib) return Promise.resolve(libs.pdfLib);
    return loadScript(BASE + 'assets/vendor/pdf-lib.min.js').then(function () { libs.pdfLib = window.PDFLib; return libs.pdfLib; });
  }
  function loadJSZip() {
    if (libs.jszip) return Promise.resolve(libs.jszip);
    return loadScript(BASE + 'assets/vendor/jszip.min.js').then(function () { libs.jszip = window.JSZip; return libs.jszip; });
  }
  function loadPdfJs() {
    if (libs.pdfjs) return Promise.resolve(libs.pdfjs);
    var url = new URL(BASE + 'assets/vendor/pdf.min.mjs', document.baseURI).href;
    return import(url).then(function (m) {
      m.GlobalWorkerOptions.workerSrc = new URL(BASE + 'assets/vendor/pdf.worker.min.mjs', document.baseURI).href;
      libs.pdfjs = m;
      return m;
    });
  }

  // ---------------------------------------------------------------- PDF / file helpers
  function readBytes(file) { return file.arrayBuffer().then(function (b) { return new Uint8Array(b); }); }

  function looksLikePdf(bytes) {
    var head = '';
    for (var i = 0; i < Math.min(bytes.length, 1024); i++) head += String.fromCharCode(bytes[i]);
    return head.indexOf('%PDF-') !== -1;
  }

  // Parse "1-3, 5, 8-" into a sorted unique list of 1-based page numbers.
  function parseRanges(str, max) {
    var out = [], seen = {};
    String(str || '').split(',').forEach(function (part) {
      part = part.trim();
      if (!part) return;
      var m = part.match(/^(\d+)?\s*-\s*(\d+)?$/), a, b;
      if (m && (m[1] || m[2])) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : max; }
      else if (/^\d+$/.test(part)) { a = b = +part; }
      else throw new Error('Invalid page range “' + part + '”. Use a format like 1-3, 5, 8-10.');
      if (a < 1 || b > max || a > b) throw new Error('Page range “' + part + '” is outside 1–' + max + '.');
      for (var p = a; p <= b; p++) { if (!seen[p]) { seen[p] = 1; out.push(p); } }
    });
    return out.sort(function (x, y) { return x - y; });
  }
  // Same but keeps each range separate: returns [[1,2,3],[5],[8,9,10]]
  function parseRangeGroups(str, max) {
    var groups = [];
    String(str || '').split(',').forEach(function (part) {
      if (part.trim()) groups.push(parseRanges(part, max));
    });
    return groups;
  }
  function compactRanges(pages) {
    var out = [], i = 0;
    while (i < pages.length) {
      var j = i;
      while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
      out.push(i === j ? String(pages[i]) : pages[i] + '-' + pages[j]);
      i = j + 1;
    }
    return out.join(', ');
  }

  function baseName(name) { return name.replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '_') || 'document'; }

  function makeBlobUrl(blob) { var u = URL.createObjectURL(blob); objectUrls.push(u); return u; }
  function revokeUrls() { objectUrls.forEach(function (u) { URL.revokeObjectURL(u); }); objectUrls = []; }

  // Make text safe for the standard (WinAnsi) PDF fonts.
  function sanitizeText(str, font) {
    var cache = {}, replaced = 0, out = '';
    String(str).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('').forEach(function (ch) {
      if (ch === '\n') { out += ch; return; }
      if (cache[ch] === undefined) {
        try { cache[ch] = (ch !== '?' && String(font.encodeText(ch)) === '<3F>') ? '?' : ch; } catch (e) { cache[ch] = '?'; }
      }
      if (cache[ch] === '?' && ch !== '?') replaced++;
      out += cache[ch];
    });
    return { text: out, replaced: replaced };
  }
  function wrapText(text, font, size, maxWidth) {
    var lines = [];
    text.split('\n').forEach(function (para) {
      if (!para.trim()) { lines.push(''); return; }
      var line = '';
      para.split(/(\s+)/).forEach(function (tok) {
        if (!tok) return;
        var test = line + tok;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) { line = test; return; }
        if (line.trim()) { lines.push(line.replace(/\s+$/, '')); line = ''; tok = tok.replace(/^\s+/, ''); }
        // break very long words
        while (tok && font.widthOfTextAtSize(tok, size) > maxWidth) {
          var cut = tok.length;
          while (cut > 1 && font.widthOfTextAtSize(tok.slice(0, cut), size) > maxWidth) cut--;
          lines.push(tok.slice(0, cut)); tok = tok.slice(cut);
        }
        line = tok;
      });
      lines.push(line.replace(/\s+$/, ''));
    });
    return lines;
  }
  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    var n = m ? parseInt(m[1], 16) : 0;
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  var PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008], a5: [419.53, 595.28] };

  // Render a pdf.js page to a canvas.
  function renderPage(pdfDoc, pageNum, scale, canvas) {
    return pdfDoc.getPage(pageNum).then(function (page) {
      var vp = page.getViewport({ scale: scale });
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      var c2d = canvas.getContext('2d');
      c2d.fillStyle = '#fff';
      c2d.fillRect(0, 0, canvas.width, canvas.height);
      return page.render({ canvasContext: c2d, canvas: canvas, viewport: vp }).promise.then(function () {
        page.cleanup();
        return canvas;
      });
    });
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not create image.')); }, type, quality);
    });
  }
  function releaseCanvas(c) { c.width = 0; c.height = 0; }
  // pdf.js 6: documents are released through their loading task (PDFDocumentProxy has no destroy()).
  function closePdf(doc) {
    try {
      if (!doc) return;
      if (doc.loadingTask && doc.loadingTask.destroy) doc.loadingTask.destroy();
      else if (doc.destroy) doc.destroy();
    } catch (e) { /* already released */ }
  }

  // ---------------------------------------------------------------- Registration
  function register(id, def) { registry[id] = def; }

  // ---------------------------------------------------------------- Tool page UI
  function mount(root) {
    var id = root.getAttribute('data-tool');
    var def = registry[id];
    if (!def) { root.textContent = 'This tool is not available.'; return; }
    var accept = root.getAttribute('data-accept') || '';
    var multiple = root.getAttribute('data-multiple') === 'true';
    var kind = root.getAttribute('data-kind') || 'pdf';

    var ctx = {
      id: id, files: [], state: {}, settings: {}, pdfDoc: null, pageCount: 0,
      selected: {}, rotations: [], order: [], busy: false,
      libs: { pdfLib: loadPdfLib, pdfjs: loadPdfJs, jszip: loadJSZip },
      util: {
        el: el, fmtSize: fmtSize, readBytes: readBytes, parseRanges: parseRanges, parseRangeGroups: parseRangeGroups,
        compactRanges: compactRanges, baseName: baseName, sanitizeText: sanitizeText, wrapText: wrapText, hexToRgb: hexToRgb,
        PAGE_SIZES: PAGE_SIZES, renderPage: renderPage, canvasToBlob: canvasToBlob, releaseCanvas: releaseCanvas, closePdf: closePdf, tick: tick,
        makeBlobUrl: makeBlobUrl, looksLikePdf: looksLikePdf
      },
      get: function (k) { return ctx.settings[k] ? ctx.settings[k].getValue() : undefined; },
      progress: function (frac, label) {
        bar.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
        progWrap.setAttribute('aria-valuenow', Math.round(frac * 100));
        if (label) progLabel.textContent = label;
      },
      notice: showNotice
    };

    root.textContent = '';
    var noticeBox = el('div', { 'aria-live': 'polite' });
    var fileInput = el('input', { type: 'file', accept: accept, multiple: multiple ? 'multiple' : false, id: 'file-input' });
    var browseBtn = el('button', { type: 'button', class: 'btn btn-primary btn-lg', text: multiple ? 'Select files' : 'Select file' });
    var dz = el('div', { class: 'dropzone', id: 'dropzone' }, [
      el('div', { class: 'dz-icon', 'aria-hidden': 'true', text: '📂' }),
      el('p', { text: (multiple ? 'Drag and drop your files here' : 'Drag and drop your file here') + ' or' }),
      browseBtn, fileInput,
      el('p', { class: 'meta', text: 'Processed on your device. Files are never uploaded. Max ' + MAX_MB + ' MB per file.' })
    ]);
    var listPanel = el('div', { class: 'panel hidden' });
    var pagesPanel = el('div', { class: 'panel hidden' });
    var settingsPanel = el('div', { class: 'panel hidden' });
    var bar = el('span');
    var progWrap = el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, [bar]);
    var progLabel = el('div', { class: 'progress-label', text: 'Working…' });
    var progPanel = el('div', { class: 'panel hidden' }, [progWrap, progLabel]);
    var runBtn = el('button', { type: 'button', class: 'btn btn-primary btn-lg', text: def.runLabel || 'Process' });
    var resetBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Reset' });
    var actions = el('div', { class: 'actions hidden' }, [runBtn, resetBtn]);
    var resultPanel = el('div', { class: 'panel hidden' });

    root.appendChild(noticeBox);
    root.appendChild(dz);
    [listPanel, pagesPanel, settingsPanel, progPanel, actions, resultPanel].forEach(function (n) { root.appendChild(n); });

    function showNotice(msg, type) {
      noticeBox.textContent = '';
      if (!msg) return;
      noticeBox.appendChild(el('div', { class: 'notice ' + (type || 'info'), role: type === 'error' ? 'alert' : 'status', text: msg }));
    }

    // ---- settings form
    function buildSettings() {
      settingsPanel.textContent = '';
      ctx.settings = {};
      if (!def.settings || !def.settings.length) return;
      settingsPanel.appendChild(el('h2', { text: 'Settings' }));
      var grid = el('div', { class: 'settings' });
      def.settings.forEach(function (s) {
        var fid = 'set-' + s.id, input, getValue;
        var wrap = el('div', { class: 'field' + (s.type === 'checkbox' ? ' check' : '') + (s.full ? ' full' : '') });
        if (s.type === 'select') {
          input = el('select', { id: fid }, s.options.map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
          input.value = s.value;
          getValue = function () { return input.value; };
        } else if (s.type === 'textarea') {
          input = el('textarea', { id: fid, placeholder: s.placeholder || '' });
          input.value = s.value || '';
          getValue = function () { return input.value; };
        } else if (s.type === 'checkbox') {
          input = el('input', { type: 'checkbox', id: fid });
          input.checked = !!s.value;
          getValue = function () { return input.checked; };
        } else if (s.type === 'file') {
          input = el('input', { type: 'file', id: fid, accept: s.accept || '' });
          getValue = function () { return input.files && input.files[0] ? input.files[0] : null; };
        } else {
          input = el('input', { type: s.type || 'text', id: fid, placeholder: s.placeholder || '', autocomplete: s.type === 'password' ? 'new-password' : 'off' });
          if (s.min != null) input.min = s.min;
          if (s.max != null) input.max = s.max;
          if (s.step != null) input.step = s.step;
          input.value = s.value != null ? s.value : '';
          getValue = s.type === 'number'
            ? function () { return input.value === '' ? NaN : Number(input.value); }
            : function () { return input.value; };
        }
        if (s.type === 'checkbox') { wrap.appendChild(el('label', { 'for': fid }, [input, s.label])); }
        else { wrap.appendChild(el('label', { 'for': fid, text: s.label })); wrap.appendChild(input); }
        if (s.help) wrap.appendChild(el('small', { text: s.help }));
        ctx.settings[s.id] = { getValue: getValue, input: input, wrap: wrap, spec: s };
        grid.appendChild(wrap);
      });
      settingsPanel.appendChild(grid);
      function refreshVisibility() {
        def.settings.forEach(function (s) {
          if (s.showIf) ctx.settings[s.id].wrap.classList.toggle('hidden', !s.showIf(ctx.get));
        });
      }
      settingsPanel.addEventListener('input', refreshVisibility);
      settingsPanel.addEventListener('change', refreshVisibility);
      refreshVisibility();
      settingsPanel.classList.remove('hidden');
    }

    // ---- file list (multi-file tools)
    function renderFileList() {
      listPanel.textContent = '';
      if (!ctx.files.length) { listPanel.classList.add('hidden'); return; }
      listPanel.classList.remove('hidden');
      listPanel.appendChild(el('h2', { text: ctx.files.length + (ctx.files.length > 1 ? ' files' : ' file') }));
      var ul = el('ul', { class: 'file-list' });
      var dragIdx = null;
      ctx.files.forEach(function (f, i) {
        var li = el('li', { class: 'file-item', draggable: multiple && def.reorderFiles !== false ? 'true' : false }, [
          el('span', { 'aria-hidden': 'true', text: f.type && f.type.indexOf('image') === 0 ? '🖼️' : '📄' }),
          el('span', { class: 'name', title: f.name, text: f.name }),
          el('span', { class: 'meta', text: fmtSize(f.size) + (f.__pages ? ' · ' + f.__pages + ' pages' : '') })
        ]);
        if (multiple && def.reorderFiles !== false && ctx.files.length > 1) {
          li.appendChild(el('button', { type: 'button', 'aria-label': 'Move ' + f.name + ' up', text: '↑', disabled: i === 0 ? 'disabled' : false, onclick: function () { move(i, i - 1); } }));
          li.appendChild(el('button', { type: 'button', 'aria-label': 'Move ' + f.name + ' down', text: '↓', disabled: i === ctx.files.length - 1 ? 'disabled' : false, onclick: function () { move(i, i + 1); } }));
        }
        li.appendChild(el('button', { type: 'button', 'aria-label': 'Remove ' + f.name, text: '✕', onclick: function () { ctx.files.splice(i, 1); afterFilesChanged(); } }));
        li.addEventListener('dragstart', function () { dragIdx = i; li.classList.add('dragging'); });
        li.addEventListener('dragend', function () { li.classList.remove('dragging'); });
        li.addEventListener('dragover', function (e) { e.preventDefault(); });
        li.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); if (dragIdx !== null && dragIdx !== i) move(dragIdx, i); dragIdx = null; });
        ul.appendChild(li);
      });
      listPanel.appendChild(ul);
    }
    function move(from, to) {
      var f = ctx.files.splice(from, 1)[0];
      ctx.files.splice(to, 0, f);
      renderFileList();
    }

    // ---- page thumbnails (page tools)
    function selectedPages() { return Object.keys(ctx.selected).filter(function (k) { return ctx.selected[k]; }).map(Number).sort(function (a, b) { return a - b; }); }
    ctx.selectedPages = selectedPages;
    var thumbObjs = [];
    function buildPagesPanel() {
      pagesPanel.textContent = '';
      thumbObjs = [];
      if (!def.pages || !ctx.pdfDoc) { pagesPanel.classList.add('hidden'); return Promise.resolve(); }
      pagesPanel.classList.remove('hidden');
      var titles = { select: 'Select pages', reorder: 'Drag pages to reorder', rotate: 'Rotate pages' };
      pagesPanel.appendChild(el('h2', { text: titles[def.pages] }));
      var tools = el('div', { class: 'actions' });
      if (def.pages === 'select') {
        var rangeIn = el('input', { type: 'text', id: 'range-input', placeholder: 'e.g. 1-3, 5, 8-10', 'aria-label': 'Page ranges' });
        rangeIn.style.cssText = 'padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font:inherit;min-width:200px';
        rangeIn.addEventListener('input', function () {
          ctx.selected = {};
          try { parseRanges(rangeIn.value, ctx.pageCount).forEach(function (p) { ctx.selected[p] = true; }); showNotice(''); }
          catch (e) { if (rangeIn.value.trim()) showNotice(e.message, 'error'); }
          syncSel();
        });
        tools.appendChild(rangeIn);
        tools.appendChild(el('button', { type: 'button', class: 'btn btn-secondary', text: 'Select all', onclick: function () { for (var p = 1; p <= ctx.pageCount; p++) ctx.selected[p] = true; syncSel(true); } }));
        tools.appendChild(el('button', { type: 'button', class: 'btn btn-secondary', text: 'Clear', onclick: function () { ctx.selected = {}; syncSel(true); } }));
        ctx.rangeInput = rangeIn;
      }
      if (def.pages === 'rotate') {
        [['⟲ Rotate all left', -90], ['⟳ Rotate all right', 90], ['Reset rotation', 0]].forEach(function (b) {
          tools.appendChild(el('button', { type: 'button', class: 'btn btn-secondary', text: b[0], onclick: function () {
            for (var i = 0; i < ctx.pageCount; i++) ctx.rotations[i] = b[1] === 0 ? 0 : ((ctx.rotations[i] + b[1]) % 360 + 360) % 360;
            thumbObjs.forEach(function (t) { t.applyRot(); });
          } }));
        });
      }
      pagesPanel.appendChild(tools);
      var grid = el('div', { class: 'thumbs', id: 'thumbs' });
      pagesPanel.appendChild(grid);

      function syncSel(updateInput) {
        thumbObjs.forEach(function (t) { t.node.classList.toggle('selected', !!ctx.selected[t.page]); t.node.setAttribute('aria-pressed', ctx.selected[t.page] ? 'true' : 'false'); });
        if (updateInput && ctx.rangeInput) ctx.rangeInput.value = compactRanges(selectedPages());
      }

      var dragFrom = null;
      function rebuildOrderDom() {
        ctx.order.forEach(function (pg) { var t = thumbObjs[pg - 1]; grid.appendChild(t.node); });
        thumbObjs.forEach(function (t) { t.updateMoveButtons(); });
      }
      function moveOrder(from, to) {
        if (to < 0 || to >= ctx.order.length) return;
        var v = ctx.order.splice(from, 1)[0]; ctx.order.splice(to, 0, v);
        rebuildOrderDom();
      }

      var cap = Math.min(ctx.pageCount, 300);
      if (ctx.pageCount > cap) showNotice('Showing previews for the first ' + cap + ' pages. ' + (def.pages === 'select' ? 'Use the page range box for others.' : 'Large documents may be slow.'), 'info');
      var chain = Promise.resolve();
      for (var p = 1; p <= ctx.pageCount; p++) {
        (function (page) {
          var canvas = el('canvas', { 'aria-label': 'Page ' + page + ' preview' });
          var node = el('div', { class: 'thumb', role: def.pages === 'select' ? 'button' : false, tabindex: def.pages === 'select' ? '0' : false }, [canvas, el('div', { class: 'pn', text: 'Page ' + page })]);
          var t = { node: node, page: page, canvas: canvas, applyRot: function () { canvas.style.transform = 'rotate(' + ctx.rotations[page - 1] + 'deg)'; var r = ctx.rotations[page - 1] % 180 !== 0; canvas.style.margin = r ? '14% 0' : '0'; }, updateMoveButtons: function () {} };
          thumbObjs.push(t);
          if (def.pages === 'select') {
            var toggle = function () { ctx.selected[page] = !ctx.selected[page]; syncSel(true); };
            node.addEventListener('click', toggle);
            node.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
          }
          if (def.pages === 'rotate') {
            var rb = el('div', { class: 'actions', style: 'justify-content:center;margin-top:6px' }, [
              el('button', { type: 'button', 'aria-label': 'Rotate page ' + page + ' left', text: '⟲', onclick: function () { ctx.rotations[page - 1] = (ctx.rotations[page - 1] + 270) % 360; t.applyRot(); } }),
              el('button', { type: 'button', 'aria-label': 'Rotate page ' + page + ' right', text: '⟳', onclick: function () { ctx.rotations[page - 1] = (ctx.rotations[page - 1] + 90) % 360; t.applyRot(); } })
            ]);
            rb.querySelectorAll('button').forEach(function (b) { b.style.cssText = 'background:none;border:1px solid var(--border);border-radius:8px;padding:4px 10px;cursor:pointer;color:var(--text)'; });
            node.appendChild(rb);
          }
          if (def.pages === 'reorder') {
            node.setAttribute('draggable', 'true');
            var left = el('button', { type: 'button', 'aria-label': 'Move page earlier', text: '←' });
            var right = el('button', { type: 'button', 'aria-label': 'Move page later', text: '→' });
            [left, right].forEach(function (b) { b.style.cssText = 'background:none;border:1px solid var(--border);border-radius:8px;padding:4px 10px;cursor:pointer;color:var(--text)'; });
            left.addEventListener('click', function () { moveOrder(ctx.order.indexOf(page), ctx.order.indexOf(page) - 1); });
            right.addEventListener('click', function () { moveOrder(ctx.order.indexOf(page), ctx.order.indexOf(page) + 1); });
            node.appendChild(el('div', { class: 'actions', style: 'justify-content:center;margin-top:6px' }, [left, right]));
            t.updateMoveButtons = function () { var i = ctx.order.indexOf(page); left.disabled = i === 0; right.disabled = i === ctx.order.length - 1; };
            node.addEventListener('dragstart', function (e) { dragFrom = page; node.classList.add('dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(page)); } });
            node.addEventListener('dragend', function () { node.classList.remove('dragging'); });
            node.addEventListener('dragover', function (e) { e.preventDefault(); });
            node.addEventListener('drop', function (e) { e.preventDefault(); if (dragFrom && dragFrom !== page) moveOrder(ctx.order.indexOf(dragFrom), ctx.order.indexOf(page)); dragFrom = null; });
          }
          grid.appendChild(node);
          if (page <= cap) {
            chain = chain.then(function () {
              var scale = 150 / ctx.pdfDoc.__w1 || 0.3;
              return renderPage(ctx.pdfDoc, page, Math.min(0.5, scale), canvas);
            }).then(tick);
          }
        })(p);
      }
      if (def.pages === 'reorder') thumbObjs.forEach(function (t) { t.updateMoveButtons(); });
      return chain;
    }

    // ---- loading files
    function validate(f) {
      if (f.size === 0) return f.name + ' is empty.';
      if (f.size > MAX_MB * 1048576) return f.name + ' is larger than ' + MAX_MB + ' MB.';
      var ext = (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      var allowed = accept.split(',').map(function (s) { return s.trim().toLowerCase(); });
      if (accept && allowed.indexOf(ext) === -1 && allowed.indexOf((f.type || '').toLowerCase()) === -1) {
        return f.name + ' is not a supported file type (' + accept.split(',').filter(function (a) { return a[0] === '.'; }).join(', ') + ').';
      }
      return null;
    }

    function addFiles(fileList) {
      if (ctx.busy) return;
      var incoming = Array.prototype.slice.call(fileList);
      var errors = [], good = [];
      incoming.forEach(function (f) { var e = validate(f); if (e) errors.push(e); else good.push(f); });
      if (!multiple && good.length > 1) { good = good.slice(0, 1); errors.push('Only one file can be processed at a time; using the first.'); }
      if (errors.length) showNotice(errors.join(' '), 'error');
      if (!good.length) return;
      if (multiple) ctx.files = ctx.files.concat(good); else ctx.files = good;
      resultReset();
      afterFilesChanged();
    }

    function afterFilesChanged() {
      if (!ctx.files.length) { fullReset(); return; }
      ctx.busy = true;
      progPanel.classList.remove('hidden');
      ctx.progress(0.05, 'Reading file…');
      var chain = Promise.resolve();
      // validate every PDF really is a PDF and (for page tools) open it
      chain = chain.then(function () {
        if (kind !== 'pdf' && kind !== 'pdf-any') return;
        return Promise.all(ctx.files.map(function (f) {
          if (f.__checked) return;
          return readBytes(f.slice(0, 1024)).then(function (b) {
            if (!looksLikePdf(b)) throw new Error(f.name + ' does not look like a valid PDF file.');
            f.__checked = true;
          });
        }));
      }).then(function () {
        if (def.pages && ctx.files[0]) {
          return loadPdfJs().then(function (pdfjs) {
            return readBytes(ctx.files[0]).then(function (bytes) {
              closePdf(ctx.pdfDoc);
              return pdfjs.getDocument({ data: bytes }).promise;
            });
          }).then(function (doc) {
            ctx.pdfDoc = doc;
            ctx.pageCount = doc.numPages;
            ctx.rotations = new Array(doc.numPages).fill(0);
            ctx.order = []; for (var i = 1; i <= doc.numPages; i++) ctx.order.push(i);
            ctx.selected = {};
            return doc.getPage(1).then(function (pg) { doc.__w1 = pg.getViewport({ scale: 1 }).width; });
          }).catch(function (e) {
            if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Please unlock it first with the Unlock PDF tool.');
            throw e;
          });
        }
      }).then(function () {
        if (def.onLoad) return def.onLoad(ctx);
      }).then(function () {
        renderFileList();
        if (!ctx.settingsBuilt) { buildSettings(); ctx.settingsBuilt = true; if (def.afterSettings) def.afterSettings(ctx); }
        else if (def.allowNoFile && def.afterSettings) def.afterSettings(ctx);
        actions.classList.remove('hidden');
        dz.querySelector('p').textContent = multiple ? 'Drop more files here to add them, or' : 'Drop a different file here to replace it, or';
        browseBtn.textContent = multiple ? 'Add more files' : 'Choose another file';
        ctx.progress(0, '');
        progPanel.classList.add('hidden');
        showNotice('');
        return buildPagesPanel();
      }).catch(function (e) {
        console.warn(e);
        showNotice(e.message || 'Could not read the file.', 'error');
        ctx.files = []; ctx.pdfDoc = null; ctx.settingsBuilt = false;
        listPanel.classList.add('hidden'); pagesPanel.classList.add('hidden'); settingsPanel.classList.add('hidden'); actions.classList.add('hidden');
        progPanel.classList.add('hidden');
      }).then(function () { ctx.busy = false; });
    }

    // ---- results
    function resultReset() { revokeUrls(); resultPanel.textContent = ''; resultPanel.classList.add('hidden'); }
    function showResults(results, summary) {
      resultPanel.textContent = '';
      resultPanel.classList.remove('hidden');
      resultPanel.appendChild(el('h2', { text: 'Your result is ready' }));
      if (summary) resultPanel.appendChild(el('div', { class: 'notice success', role: 'status', text: summary }));
      var ul = el('ul', { class: 'result-list' });
      results.forEach(function (r) {
        var url = makeBlobUrl(r.blob);
        ul.appendChild(el('li', {}, [
          el('span', {}, [el('strong', { text: r.name }), ' ', el('span', { class: 'meta', text: fmtSize(r.blob.size) })]),
          el('a', { class: 'btn btn-primary', href: url, download: r.name, text: 'Download' })
        ]));
      });
      resultPanel.appendChild(ul);
      if (results.length > 1) {
        var zipBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Download all as ZIP' });
        zipBtn.addEventListener('click', function () {
          zipBtn.disabled = true; zipBtn.textContent = 'Creating ZIP…';
          loadJSZip().then(function (JSZip) {
            var zip = new JSZip();
            results.forEach(function (r) { zip.file(r.name, r.blob); });
            return zip.generateAsync({ type: 'blob', compression: 'STORE' });
          }).then(function (blob) {
            var a = el('a', { href: makeBlobUrl(blob), download: baseName(ctx.files[0] ? ctx.files[0].name : 'files') + '-toolnest.zip' });
            document.body.appendChild(a); a.click(); a.remove();
          }).catch(function (e) { showNotice(e.message, 'error'); }).then(function () { zipBtn.disabled = false; zipBtn.textContent = 'Download all as ZIP'; });
        });
        resultPanel.appendChild(el('div', { class: 'actions' }, [zipBtn]));
      }
      if (def.afterResult) def.afterResult(ctx, resultPanel, results);
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    ctx.showResults = showResults;

    // ---- run
    runBtn.addEventListener('click', function () {
      if (ctx.busy || (!ctx.files.length && !def.allowNoFile)) return;
      ctx.busy = true; runBtn.disabled = true; resetBtn.disabled = true;
      resultReset(); showNotice('');
      progPanel.classList.remove('hidden');
      ctx.progress(0.02, 'Starting…');
      Promise.resolve().then(function () { return def.run(ctx); }).then(function (out) {
        if (!out) return; // tool rendered its own output
        var results = out.files || out;
        showResults(results, out.summary);
        toast('Done! Your file is ready to download.', 'success');
      }).catch(function (e) {
        console.warn(e);
        var msg = (e && e.message) || 'Something went wrong while processing the file.';
        if (e && e.name === 'PasswordException') msg = 'This PDF is password-protected. Use the Unlock PDF tool first.';
        showNotice(msg, 'error');
        toast('Could not process the file.', 'error');
      }).then(function () {
        ctx.busy = false; runBtn.disabled = false; resetBtn.disabled = false;
        progPanel.classList.add('hidden');
      });
    });

    function fullReset() {
      resultReset(); showNotice('');
      closePdf(ctx.pdfDoc);
      if (def.onReset) def.onReset(ctx);
      ctx.files = []; ctx.pdfDoc = null; ctx.pageCount = 0; ctx.selected = {}; ctx.rotations = []; ctx.order = []; ctx.settingsBuilt = false; ctx.state = {};
      thumbObjs = []; fileInput.value = '';
      [listPanel, pagesPanel, settingsPanel, progPanel, actions].forEach(function (n) { n.classList.add('hidden'); n.textContent = n === progPanel ? '' : ''; });
      progPanel.appendChild(progWrap); progPanel.appendChild(progLabel);
      dz.querySelector('p').textContent = (multiple ? 'Drag and drop your files here' : 'Drag and drop your file here') + ' or';
      browseBtn.textContent = multiple ? 'Select files' : 'Select file';
      ctx.progress(0, '');
      if (def.allowNoFile) enableNoFileMode();
    }
    // Tools that also work from pasted text (TXT/HTML to PDF) show their settings straight away.
    function enableNoFileMode() {
      buildSettings(); ctx.settingsBuilt = true;
      actions.classList.remove('hidden');
    }
    resetBtn.addEventListener('click', fullReset);

    // ---- dropzone events
    browseBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('dragover'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('dragover'); }); });
    dz.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
    window.addEventListener('beforeunload', revokeUrls);

    // expose for tests / tools
    root.__ctx = ctx;
    if (def.allowNoFile) enableNoFileMode();
    if (def.init) def.init(ctx, { dz: dz, noticeBox: noticeBox, resultPanel: resultPanel, actions: actions, runBtn: runBtn, buildSettings: buildSettings, settingsPanel: settingsPanel });
  }

  window.ToolNest = {
    register: register, mount: mount, el: el, fmtSize: fmtSize, loadPdfLib: loadPdfLib, loadPdfJs: loadPdfJs, loadJSZip: loadJSZip,
    registry: registry, util: { parseRanges: parseRanges, compactRanges: compactRanges, wrapText: wrapText, sanitizeText: sanitizeText }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('tool-app');
    if (root) mount(root);
  });
})();
