/* ToolNest PDF — site-wide behaviour: theme, mobile nav, tool search, toasts. */
(function () {
  'use strict';
  var BASE = document.documentElement.getAttribute('data-base') || '';

  // ---------- Theme ----------
  var KEY = 'toolnest-theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var b = document.getElementById('theme-btn');
    if (b) {
      b.textContent = t === 'dark' ? '☀️' : '🌙';
      b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }
  function initialTheme() {
    try { var s = localStorage.getItem(KEY); if (s) return s; } catch (e) {}
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(initialTheme());
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#theme-btn');
    if (!btn) return;
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (err) {}
  });

  // ---------- Mobile nav ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('.nav-toggle');
    var nav = document.getElementById('main-nav');
    if (t && nav) {
      var open = nav.classList.toggle('open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  });

  // ---------- Toasts ----------
  window.toast = function (msg, type) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg; // textContent: never inject HTML
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, type === 'error' ? 7000 : 3500);
  };

  // ---------- Tool search ----------
  function initSearch(input) {
    var T = window.TOOLNEST && window.TOOLNEST.TOOLS;
    if (!T || !input) return;
    var box = document.createElement('div');
    box.className = 'search-results hidden';
    box.setAttribute('role', 'listbox');
    input.parentNode.appendChild(box);

    function render(q) {
      q = q.trim().toLowerCase();
      box.textContent = '';
      if (!q) { box.classList.add('hidden'); return; }
      var hits = T.filter(function (t) {
        return (t.name + ' ' + t.short + ' ' + t.id.replace(/-/g, ' ')).toLowerCase().indexOf(q) !== -1;
      }).slice(0, 8);
      if (!hits.length) {
        var none = document.createElement('div');
        none.className = 'empty';
        none.textContent = 'No tools found for “' + q + '”.';
        box.appendChild(none);
      }
      hits.forEach(function (t) {
        var a = document.createElement('a');
        a.href = BASE + t.id + '/';
        a.setAttribute('role', 'option');
        a.textContent = t.icon + ' ' + t.name;
        var s = document.createElement('small');
        s.textContent = t.short;
        a.appendChild(s);
        box.appendChild(a);
      });
      box.classList.remove('hidden');
    }
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var first = box.querySelector('a'); if (first) location.href = first.href; }
      if (e.key === 'Escape') { box.classList.add('hidden'); }
    });
    document.addEventListener('click', function (e) {
      if (!input.parentNode.contains(e.target)) box.classList.add('hidden');
    });
  }
  document.querySelectorAll('[data-tool-search]').forEach(initSearch);

  // ---------- Homepage hero dropzone: pick a tool for the dropped PDF ----------
  var hero = document.getElementById('hero-drop');
  if (hero) {
    var fi = hero.querySelector('input[type=file]');
    var pick = document.getElementById('hero-pick');
    hero.querySelector('[data-browse]').addEventListener('click', function () { fi.click(); });
    function handle(files) {
      var pdfs = Array.prototype.filter.call(files, function (f) {
        return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      });
      if (!pdfs.length) { toast('Please choose a PDF file.', 'error'); return; }
      pick.classList.remove('hidden');
      pick.querySelector('strong').textContent = pdfs.length + (pdfs.length > 1 ? ' PDF files' : ' PDF file') + ' selected. Which tool do you want to use?';
      pick.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Files cannot be passed between pages without uploading, so we only guide the user.
      pick.querySelector('small').textContent = 'Choose a tool below, then add your file there. Your file has not been uploaded anywhere.';
    }
    fi.addEventListener('change', function () { handle(fi.files); });
    ['dragenter', 'dragover'].forEach(function (ev) { hero.addEventListener(ev, function (e) { e.preventDefault(); hero.classList.add('dragover'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { hero.addEventListener(ev, function (e) { e.preventDefault(); hero.classList.remove('dragover'); }); });
    hero.addEventListener('drop', function (e) { handle(e.dataTransfer.files); });
  }

  // ---------- AdSense (activated only when ads-config.js sets a publisher id) ----------
  var cfg = window.TOOLNEST_ADS;
  if (cfg && cfg.enabled && /^ca-pub-\d+$/.test(cfg.client || '')) {
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + cfg.client;
    document.head.appendChild(s);
    document.querySelectorAll('.ad-slot').forEach(function (slot) {
      var id = (cfg.slots || {})[slot.getAttribute('data-ad-slot')];
      if (!id) return; // no slot id configured -> container stays hidden
      slot.classList.add('ad-active');
      if (slot.classList.contains('ad-sidebar')) { var lay = slot.closest('.tool-layout'); if (lay) lay.classList.add('has-sidebar'); }
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', cfg.client);
      ins.setAttribute('data-ad-slot', id);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      slot.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  }
})();
