/*!
 * Forum Theme Installer for Forumotion / Forumactif (phpBB3 version)
 *
 * Three layers, kept apart on purpose:
 *   1. THIS FILE                  generic installer code (shared by every theme)
 *   2. installer/catalog.json     every template that exists: name, ID, group (shared)
 *   3. <theme repo>/manifest.json what that theme installs: templates, JavaScript
 *                                 modules and (optionally) the stylesheet
 *
 * What it does, in order:
 *   scan     reads the theme from GitHub and the current templates / JS modules
 *            from the Administration Panel (nothing is written)
 *   review   shows what changes, with a line-by-line diff for each item
 *   backup   downloads a JSON file of everything that will be overwritten
 *   install  writes templates (and publishes them), JavaScript modules, CSS
 *   restore  puts a backup file back
 *
 * JavaScript modules: the installer opens Forumotion's own "Javascript codes
 * management" pages, fills in the form it finds there (title, placement, code)
 * and saves it. A module with the same title is updated instead of duplicated.
 */
(function () {
  'use strict';

  var L = (typeof window !== 'undefined' && (window.UNIVERSAL_INSTALLER || window.AURUM_INSTALLER)) || {};
  var CORE = L.core || { owner: L.owner, repo: L.repo, ref: L.ref };
  var CFG = { delay: 150, concurrency: 4, retries: 2 };

  /* ------------------------------------------------------------------ *
   * Pure helpers (unit-testable without a browser)
   * ------------------------------------------------------------------ */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function norm(s) { return String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim(); }

  // Encode one form value the way the forum's charset expects.
  // UTF-8 pages: normal encoding. Latin-1 pages (most Forumotion forums): Latin-1
  // percent-encoding, and anything above U+00FF becomes a numeric HTML entity.
  function encVal(s, charset) {
    s = String(s);
    if (/^utf-?8$/i.test(charset || 'utf-8')) { return encodeURIComponent(s); }
    var out = '';
    Array.from(s).forEach(function (ch) {
      var c = ch.codePointAt(0);
      if (c > 255) { out += '%26%23' + c + '%3B'; }
      else if (/[A-Za-z0-9\-_.~]/.test(ch)) { out += ch; }
      else { out += '%' + (c < 16 ? '0' : '') + c.toString(16).toUpperCase(); }
    });
    return out;
  }

  function encodeForm(data, charset) {
    return Object.keys(data).map(function (k) {
      return encodeURIComponent(k) + '=' + encVal(data[k], charset);
    }).join('&');
  }

  // same, for [[name, value], ...] (forms with repeated names, e.g. checkboxes)
  function encodePairs(pairs, charset) {
    return pairs.map(function (p) {
      return encodeURIComponent(p[0]) + '=' + encVal(p[1], charset);
    }).join('&');
  }

  // Line diff. Returns [{t:'=' | '-' | '+' | '…', s:text}], unchanged runs collapsed.
  function diffLines(a, b, ctx) {
    ctx = ctx == null ? 2 : ctx;
    var A = norm(a).split('\n'), B = norm(b).split('\n');
    var s = 0;
    while (s < A.length && s < B.length && A[s] === B[s]) { s++; }
    var ea = A.length, eb = B.length;
    while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
    var a2 = A.slice(s, ea), b2 = B.slice(s, eb), ops = [], i, j;

    if (a2.length * b2.length > 4000000) {            // too big for LCS: show as replace
      a2.forEach(function (x) { ops.push({ t: '-', s: x }); });
      b2.forEach(function (x) { ops.push({ t: '+', s: x }); });
    } else {
      var n = a2.length, m = b2.length, dp = [];
      for (i = 0; i <= n; i++) { dp.push(new Uint16Array(m + 1)); }
      for (i = n - 1; i >= 0; i--) {
        for (j = m - 1; j >= 0; j--) {
          dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
      i = 0; j = 0;
      while (i < n && j < m) {
        if (a2[i] === b2[j]) { ops.push({ t: '=', s: a2[i] }); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: '-', s: a2[i++] }); }
        else { ops.push({ t: '+', s: b2[j++] }); }
      }
      while (i < n) { ops.push({ t: '-', s: a2[i++] }); }
      while (j < m) { ops.push({ t: '+', s: b2[j++] }); }
    }

    var full = A.slice(Math.max(0, s - ctx), s).map(function (x) { return { t: '=', s: x }; })
      .concat(ops)
      .concat(A.slice(ea, ea + ctx).map(function (x) { return { t: '=', s: x }; }));

    var res = [], run = [];
    function flush() {
      if (run.length > ctx * 2 + 2) {
        run.slice(0, ctx).forEach(function (x) { res.push(x); });
        res.push({ t: '…', s: (run.length - ctx * 2) + ' unchanged lines' });
        run.slice(run.length - ctx).forEach(function (x) { res.push(x); });
      } else { run.forEach(function (x) { res.push(x); }); }
      run = [];
    }
    full.forEach(function (x) { if (x.t === '=') { run.push(x); } else { flush(); res.push(x); } });
    flush();
    return res;
  }

  // catalog.json -> lookup by key. Mobile templates use the key "mobile/<name>".
  function catalogIndex(catalog) {
    var idx = {}, n = 0;
    ((catalog && catalog.groups) || []).forEach(function (g) {
      var mobile = g.lang === 'mobile';
      Object.keys(g.templates || {}).forEach(function (name) {
        var key = (mobile ? 'mobile/' : '') + name;
        idx[key] = { key: key, name: name, id: g.templates[name], group: g.name, lang: mobile ? 'mobile' : 'main', ord: n++ };
      });
    });
    return idx;
  }

  // manifest + catalog (+ the repo's file list, or null) -> what to install, what is untouched.
  function buildPlan(manifest, catalog, paths) {
    var idx = catalogIndex(catalog), extraIds = manifest.ids || {}, dir = manifest.templatesDir == null ? 'templates/' : manifest.templatesDir;
    if (dir && dir.slice(-1) !== '/') { dir += '/'; }
    var list = manifest.templates || [], explicit = !Array.isArray(list);
    var keys = explicit ? Object.keys(list) : list.slice(), byBase = {}, used = {}, seen = {}, items = [], untouched = [], ignored = [];
    var have = {};
    (paths || []).forEach(function (p) { have[p] = 1; });

    (paths || []).forEach(function (p) {
      if (p.indexOf(dir) === 0 && /\.html?$/i.test(p)) {
        var b = p.split('/').pop().replace(/\.html?$/i, ''), mob = /(^|\/)mobile/i.test(p.slice(dir.length)), k = (mob ? 'mobile/' : '') + b;
        if (!byBase[k]) { byBase[k] = p; }
      }
    });

    keys.forEach(function (key) {
      if (seen[key]) { return; }
      seen[key] = 1;
      var cat = idx[key], id = extraIds[key] || (cat && cat.id) || null, mobile = key.indexOf('mobile/') === 0;
      var path = explicit ? list[key] : (byBase[key] || (paths ? null : dir + key.replace(/^mobile\//, '') + '.html'));
      var it = { kind: 'template', key: key, name: key.replace(/^mobile\//, ''), id: id, lang: mobile ? 'mobile' : 'main', path: path,
        group: cat ? cat.group : 'Other', ord: cat ? cat.ord : 9000 + items.length };
      if (!path || (paths && !have[path])) { it.missing = true; } else { used[path] = 1; }
      items.push(it);
    });

    (manifest.javascript || []).forEach(function (js, n) {
      var file = typeof js === 'string' ? js : js.file;
      var title = (typeof js === 'string' ? '' : js.title) || file.split('/').pop().replace(/\.js$/i, '');
      items.push({ kind: 'js', key: 'js:' + file, name: title, path: file, id: null, lang: null,
        placement: (typeof js === 'string' ? '' : js.placement) || 'all', group: 'JavaScript', ord: n,
        missing: !!(paths && !have[file]) });
    });

    if (manifest.css) {
      items.push({ kind: 'css', key: 'css', name: 'Stylesheet', path: manifest.css, id: null, lang: null, group: 'Stylesheet', ord: -1,
        missing: !!(paths && !have[manifest.css]) });
    } else {
      untouched.push({ key: 'css', name: 'Stylesheet (CSS)', group: 'Stylesheet' });
    }
    Object.keys(idx).forEach(function (k) {
      if (!seen[k]) { untouched.push({ key: k, name: idx[k].name + (idx[k].lang === 'mobile' ? ' (mobile)' : ''), group: idx[k].group }); }
    });
    (paths || []).forEach(function (p) {
      if (p.indexOf(dir) === 0 && /\.html?$/i.test(p) && !used[p] && p.split('/').pop().charAt(0) !== '.') { ignored.push(p.slice(dir.length)); }
    });

    var order = ['Stylesheet', 'JavaScript'].concat(((catalog && catalog.groups) || []).map(function (g) { return g.name; }), ['Other']);
    items.sort(function (a, b) {
      var ga = order.indexOf(a.group), gb = order.indexOf(b.group);
      if (ga !== gb) { return ga - gb; }
      return a.ord !== b.ord ? a.ord - b.ord : (a.name < b.name ? -1 : 1);
    });
    return { items: items, untouched: untouched, ignored: ignored, groupOrder: order };
  }

  // A form from the admin panel -> [[name, value], ...] like the browser would send it.
  function formPairs(form, submitter) {
    var pairs = [];
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) { return; }
      var type = (el.type || '').toLowerCase(), tag = el.tagName;
      if (type === 'submit' || type === 'button' || type === 'image' || type === 'reset' || type === 'file') { return; }
      if ((type === 'checkbox' || type === 'radio') && !el.checked) { return; }
      if (tag === 'SELECT') {
        Array.prototype.forEach.call(el.options, function (o) { if (o.selected) { pairs.push([el.name, o.value]); } });
        return;
      }
      pairs.push([el.name, el.value]);
    });
    if (submitter && submitter.name) { pairs.push([submitter.name, submitter.value || '']); }
    return pairs;
  }

  // the text shown next to a checkbox / radio
  function labelOf(el) {
    var doc = el.ownerDocument, t = '';
    var lab = el.closest('label') || (el.id && doc.querySelector('label[for="' + el.id + '"]'));
    if (lab) { t = lab.textContent; }
    if (!t) {
      var n = el.nextSibling;
      while (n && !t) { t = (n.textContent || '').trim(); n = n.nextSibling; }
    }
    if (!t && el.parentNode) { t = el.parentNode.textContent; }
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  var ALL_PAGES = /all\s*(the\s*)?pages|toutes\s*les\s*pages|todas\s*las\s*p|alle\s*seiten|tutte\s*le\s*pagine|todas\s*as\s*p|sve\s*stranice|^all$/i;

  function fmtBytes(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; }
  function fmtDelta(n) { return n === 0 ? '±0' : (n > 0 ? '+' : '−') + fmtBytes(Math.abs(n)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function pool(list, limit, fn) {
    return new Promise(function (resolve) {
      var i = 0, active = 0, done = 0;
      if (!list.length) { return resolve(); }
      (function next() {
        while (active < limit && i < list.length) {
          active++;
          Promise.resolve(fn(list[i++])).then(function () {}, function () {}).then(function () {
            active--; done++;
            if (done === list.length) { resolve(); } else { next(); }
          });
        }
      })();
    });
  }

  if (typeof module === 'object' && module.exports) {   // node: export helpers for tests and stop
    module.exports = { esc: esc, norm: norm, encVal: encVal, encodeForm: encodeForm, encodePairs: encodePairs, diffLines: diffLines,
      catalogIndex: catalogIndex, buildPlan: buildPlan, ALL_PAGES: ALL_PAGES };
    return;
  }

  /* ------------------------------------------------------------------ *
   * Network
   * ------------------------------------------------------------------ */
  function rawBase(o) { return 'https://raw.githubusercontent.com/' + o.owner + '/' + o.repo + '/' + (o.ref || 'main') + '/'; }
  function treeUrl(o) { return 'https://api.github.com/repos/' + o.owner + '/' + o.repo + '/git/trees/' + encodeURIComponent(o.ref || 'main') + '?recursive=1'; }
  function catalogUrl() { return L.catalog || rawBase(CORE) + 'installer/catalog.json'; }

  var tid = null, theme = null;

  function getText(url) {
    return fetch(url, { credentials: url.charAt(0) === '/' ? 'same-origin' : 'omit' }).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status + ' for ' + url.split('?')[0]); }
      return r.text();
    });
  }
  function getJson(url) { return getText(url).then(function (t) { return JSON.parse(t); }); }
  function getDoc(url) { return getText(url).then(function (h) { return new DOMParser().parseFromString(h, 'text/html'); }); }
  function adminUrl(q) { return '/admin/?' + q + '&tid=' + tid; }
  function post(q, data) {
    return postTo(adminUrl(q), encodeForm(data, document.characterSet));
  }
  function postTo(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.text(); });
  }
  function retry(fn, n) {
    return fn().catch(function (e) {
      if (n <= 0) { throw e; }
      return sleep(700).then(function () { return retry(fn, n - 1); });
    });
  }

  function findTid() {
    var re = /[?&]tid=([0-9a-f]{32})/i, m, links = document.getElementsByTagName('a'), i;
    for (i = 0; i < links.length; i++) { m = re.exec(links[i].href); if (m) { return Promise.resolve(m[1]); } }
    m = re.exec(location.href); if (m) { return Promise.resolve(m[1]); }
    return getText('/admin/').then(function (t) { m = /tid=([0-9a-f]{32})/i.exec(t); return m ? m[1] : null; }, function () { return null; });
  }

  // a link or form action from an admin page -> absolute URL that carries the tid
  function adminHref(href) {
    var u = new URL(href || '', location.origin + '/admin/');
    if (!u.searchParams.get('tid') && tid) { u.searchParams.set('tid', tid); }
    return u.href;
  }

  /* --- templates and CSS --- */

  var TPL_EDIT = 'part=themes&sub=templates&mode=edit_main&extended_admin=1';
  function tplReadUrl(id, lang) { return adminUrl(TPL_EDIT + '&main_mode=edit&t=' + id + '&l=' + lang); }

  function readCss() {
    return getDoc(adminUrl('part=themes&sub=logos&mode=css&extended_admin=1')).then(function (doc) {
      var ta = doc.querySelector('textarea[name="edit_code"]');
      if (!ta) { throw new Error('editor not found (not logged in to the admin panel?)'); }
      return ta.value;
    });
  }
  function readTemplate(it) {
    return getDoc(tplReadUrl(it.id, it.lang)).then(function (doc) {
      var ta = doc.querySelector('textarea[name="template"]');
      if (!ta) { throw new Error('editor not found (not logged in to the admin panel?)'); }
      var nm = doc.querySelector('input[name="tpl_name"]');
      it.tplName = nm ? nm.value : '';          // the forum's own name for this template, reused when saving
      return ta.value;
    });
  }
  function writeTemplate(id, lang, name, content) {
    return post(TPL_EDIT, { t: id, l: lang, tpl_name: name, template: content, submit: 'Save' }).then(function () {
      return getText(adminUrl(TPL_EDIT + '&main_mode=edit&t=' + id + '&l=' + lang + '&pub=1'));   // publish
    });
  }
  function writeCss(content) {
    return post('part=themes&sub=logos&mode=css&extended_admin=1', { edit_code: content, submit: 'Submit' });
  }

  /* --- JavaScript modules (Modules > HTML & JavaScript > Javascript codes management) --- */

  var JS_LIST = 'part=modules&sub=html&mode=js&extended_admin=1';
  var JS_NEW = 'part=modules&sub=html&mode=js_edit&extended_admin=1';
  var jsAdmin = null;   // { modules: {lowercase title: edit url}, enabled: bool, doc }

  function readJsList() {
    return getDoc(adminUrl(JS_LIST)).then(function (doc) {
      var modules = {};
      Array.prototype.forEach.call(doc.querySelectorAll('a[href*="mode=js_edit"]'), function (a) {
        var href = a.getAttribute('href') || '';
        if (!/[?&]id=\d+/.test(href)) { return; }
        var row = a.closest('tr'), title = '';
        if (row && row.cells && row.cells.length) { title = row.cells[0].textContent; }
        if (!title) { title = a.getAttribute('title') || a.textContent; }
        title = title.replace(/\s+/g, ' ').trim().toLowerCase();
        if (title && !modules[title]) { modules[title] = adminHref(href); }
      });
      var radios = doc.querySelectorAll('input[type="radio"]'), on = null;
      Array.prototype.forEach.call(radios, function (r) { if (r.value === '1' && /js|allow|activ/i.test(r.name)) { on = r; } });
      jsAdmin = { modules: modules, enabled: on ? on.checked : true, enableRadio: on, doc: doc };
      return jsAdmin;
    });
  }

  function readJs(it) {
    var go = jsAdmin ? Promise.resolve(jsAdmin) : readJsList();
    return go.then(function (j) {
      var url = j.modules[it.name.toLowerCase()];
      it.jsEdit = url || null;
      if (!url) { return ''; }                        // not installed yet
      return getDoc(url).then(function (doc) {
        var ta = doc.querySelector('form textarea');
        if (!ta) { throw new Error('JavaScript editor not found'); }
        return ta.value;
      });
    });
  }

  // fill and send Forumotion's own JS form: title, placement, code
  function writeJs(it, content) {
    var url = it.jsEdit || adminUrl(JS_NEW);
    return getDoc(url).then(function (doc) {
      var ta = doc.querySelector('form textarea');
      if (!ta) { throw new Error('JavaScript form not found (is "Javascript codes management" enabled?)'); }
      var form = ta.closest('form');
      ta.value = content;

      var title = form.querySelector('input[name="title"]') ||
        Array.prototype.filter.call(form.querySelectorAll('input'), function (i) { return !i.type || i.type === 'text'; })[0];
      if (!title) { throw new Error('title field not found'); }
      title.value = it.name;

      // placement: tick "In all the pages" (or the value given in the manifest), untick the rest
      var boxes = Array.prototype.filter.call(form.querySelectorAll('input[type="checkbox"]'), function (b) { return /place|page|js/i.test(b.name); });
      if (!boxes.length) { boxes = Array.prototype.slice.call(form.querySelectorAll('input[type="checkbox"]')); }
      var want = it.placement === 'all' ? null : String(it.placement).toLowerCase();
      var hit = boxes.filter(function (b) {
        return want ? (b.value.toLowerCase() === want || labelOf(b).toLowerCase().indexOf(want) !== -1) : (ALL_PAGES.test(labelOf(b)) || /^all/i.test(b.value));
      })[0];
      if (!hit) { throw new Error('placement "' + (want || 'In all the pages') + '" not found in the JavaScript form'); }
      boxes.forEach(function (b) { b.checked = b === hit; });

      var submit = form.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
      return postTo(adminHref(form.getAttribute('action') || url), encodePairs(formPairs(form, submit), document.characterSet));
    }).then(function () {
      jsAdmin = null;                                 // the list changed
    });
  }

  function enableJs() {
    return readJsList().then(function (j) {
      if (j.enabled || !j.enableRadio) { return; }
      var r = j.enableRadio, form = r.closest('form');
      if (!form) { return; }
      Array.prototype.forEach.call(form.querySelectorAll('input[name="' + r.name + '"]'), function (x) { x.checked = x === r; });
      var submit = form.querySelector('input[type="submit"], button[type="submit"]');
      return postTo(adminHref(form.getAttribute('action') || adminUrl(JS_LIST)), encodePairs(formPairs(form, submit), document.characterSet))
        .then(function () { jsAdmin = null; });
    });
  }

  function readCurrent(it) {
    if (it.kind === 'css') { return readCss(); }
    if (it.kind === 'js') { return readJs(it); }
    return readTemplate(it);
  }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var state = {
    stage: 'scan', scanMsg: 'Starting…', scanDone: 0, scanTotal: 0,
    themes: [], items: [], untouched: [], ignored: [], groupOrder: [], showUntouched: false,
    filter: 'all', backupDone: false, open: {},
    opts: { verify: true, baseCss: false, phpbb3: false },
    log: [], progress: { done: 0, total: 0 }, failed: null, pending: null,
    summary: { ok: 0, warn: 0 }, errorMsg: '', modal: null, mode: 'install', theme: 'auto', notes: []
  };
  var root, host;

  function pinned(r) { return /^[0-9a-f]{40}$/i.test(r) || /^v?\d/.test(r); }
  function refKind() {
    var tr = theme ? theme.ref : '', cr = CORE.ref || 'main', bad = [];
    if (theme && !pinned(tr)) { bad.push('theme @' + tr); }
    if (!pinned(cr)) { bad.push('installer @' + cr); }
    if (!bad.length) { return { cls: 'ok', txt: 'Pinned' + (theme ? ' · ' + (/^[0-9a-f]{40}$/i.test(tr) ? tr.slice(0, 7) : tr) : ''), tip: 'Fixed version: it cannot change later.' }; }
    return { cls: 'warn', txt: 'Follows ' + bad.join(', '), tip: 'Not pinned to a version: what gets installed can change when the repository changes.' };
  }

  /* ------------------------------------------------------------------ *
   * Themes list, scan
   * ------------------------------------------------------------------ */
  function loadThemes() {
    var p = L.themes ? Promise.resolve(L.themes) : (L.registry ? getJson(L.registry) : Promise.resolve(L.owner ? [{ id: 'default', owner: L.owner, repo: L.repo, ref: L.ref }] : []));
    return p.then(function (list) {
      return (list.themes || list).map(function (t) { t.ref = t.ref || 'main'; t.id = t.id || t.repo; return t; });
    });
  }

  function choose(t) {
    theme = t; state.backupDone = false; state.filter = 'all'; state.showUntouched = false; state.open = {};
    return scan();
  }

  function scan() {
    state.stage = 'scan'; state.scanMsg = 'Checking your admin session…'; state.items = []; state.untouched = []; state.ignored = []; state.notes = [];
    state.scanDone = 0; state.scanTotal = 0; jsAdmin = null; render();
    var catalog, manifest;
    return findTid().then(function (t) {
      if (!t) { throw new Error('admin'); }
      tid = t;
      state.scanMsg = 'Reading ' + theme.owner + '/' + theme.repo + '…'; render();
      return Promise.all([
        getJson(catalogUrl()).catch(function (e) { throw new Error('Could not load the template catalog (' + e.message + ').'); }),
        getJson(rawBase(theme) + 'manifest.json').catch(function (e) {
          throw new Error('Could not load manifest.json from ' + theme.owner + '/' + theme.repo + '@' + theme.ref + ' (' + e.message + '). Every theme repo needs a manifest.json in its root.');
        })
      ]);
    }).then(function (r) {
      catalog = r[0]; manifest = r[1];
      theme.name = manifest.name || theme.name || theme.repo; theme.version = manifest.version || '';
      theme.description = manifest.description || theme.description || '';
      state.notes = manifest.notes || [];
      var nTpl = manifest.templates ? (Array.isArray(manifest.templates) ? manifest.templates.length : Object.keys(manifest.templates).length) : 0;
      if (!manifest.css && !nTpl && !(manifest.javascript && manifest.javascript.length)) {
        throw new Error('manifest.json lists no templates, no JavaScript and no CSS, so there is nothing to install.');
      }
      state.scanMsg = 'Reading the theme’s file list…'; render();
      return getJson(treeUrl(theme)).then(function (t) {
        return (t.tree || []).filter(function (x) { return x.type === 'blob'; }).map(function (x) { return x.path; });
      }, function () { return null; });   // GitHub API unavailable (rate limit): trust the manifest
    }).then(function (paths) {
      var plan = buildPlan(manifest, catalog, paths);
      state.items = plan.items; state.untouched = plan.untouched; state.ignored = plan.ignored; state.groupOrder = plan.groupOrder;
      state.scanTotal = plan.items.length * 2; state.scanDone = 0;
      state.scanMsg = 'Downloading the theme and reading your forum…'; render();
      var hasJs = plan.items.some(function (it) { return it.kind === 'js'; });
      return (hasJs ? readJsList().catch(function (e) { state.jsErr = e.message; }) : Promise.resolve()).then(function () {
        return pool(plan.items, CFG.concurrency, function (it) {
          if (it.missing) { state.scanDone += 2; renderProgressOnly(); return; }
          return getText(rawBase(theme) + it.path).then(function (c) { it.remote = c; }, function (e) { it.remoteErr = e.message; })
            .then(function () { state.scanDone++; renderProgressOnly(); })
            .then(function () {
              if (it.kind === 'template' && !it.id) { return; }
              return readCurrent(it).then(function (c) { it.current = c; }, function (e) { it.currentErr = e.message; });
            }).then(function () { state.scanDone++; renderProgressOnly(); });
        });
      });
    }).then(function () {
      var readable = state.items.filter(function (it) { return it.current != null; }).length;
      if (!readable) { throw new Error('admin'); }
      state.items.forEach(classify);
      state.stage = 'review'; render();
    }).catch(function (e) {
      state.stage = 'fatal';
      state.errorMsg = e.message === 'admin'
        ? 'Could not reach the Administration Panel. Open the Administration Panel once and log in (re-enter your password if asked), then come back to this page and reload it.'
        : e.message;
      render();
    });
  }

  function classify(it) {
    if (it.missing) { it.status = 'missing'; it.selected = false; return; }
    if (it.remote == null) { it.status = 'bad'; it.selected = false; return; }
    if (it.kind === 'template' && !it.id) { it.status = 'noid'; it.selected = false; return; }
    if (it.current == null) { it.status = 'unreadable'; it.selected = false; return; }
    if (norm(it.current) === norm(it.remote)) { it.status = 'same'; it.selected = false; return; }
    it.status = norm(it.current) === '' ? 'new' : 'diff';
    it.selected = true;
    it.delta = it.remote.length - it.current.length;
  }

  /* ------------------------------------------------------------------ *
   * Install / restore
   * ------------------------------------------------------------------ */
  function log(msg, cls) { state.log.push({ m: msg, c: cls || '' }); if (state.log.length > 400) { state.log.shift(); } updateLog(); }

  function buildTasks(entries) {   // entries: [{kind,name,tplName,id,lang,content,jsEdit,placement}]
    var tasks = [], anyTpl = false, anyJs = entries.some(function (e) { return e.kind === 'js'; });
    if (state.mode === 'install') {
      if (state.opts.phpbb3) {
        tasks.push({ label: 'Switching the forum version to phpBB3', run: function () { return post('part=themes&sub=styles&mode=version&extended_admin=1', { tpl: 'prosilver', keep_theme: 2, code: 1, change_version: 'Save' }); } });
      }
      if (state.opts.baseCss) {
        tasks.push({ label: 'Turning off Forumotion’s default CSS', run: function () { return post('part=themes&sub=logos&mode=css&extended_admin=1', { allow_css_perso: 0, css_base: 0, optimize_css: 0, submit_base_css: 'Save' }); } });
      }
    }
    if (anyJs) {
      tasks.push({ label: 'Turning on Javascript codes management', run: enableJs });
    }
    entries.forEach(function (e) {
      if (e.kind === 'css') {
        tasks.push({ label: 'Stylesheet', run: function () {
          return writeCss(e.content).then(function () {
            if (state.mode !== 'install' || !state.opts.verify) { return; }
            return readCss().then(function (c) { if (norm(c) !== norm(e.content)) { return { warn: 'stylesheet saved, but the stored text differs slightly' }; } });
          });
        } });
      } else if (e.kind === 'js') {
        tasks.push({ label: 'JavaScript: ' + e.name, run: function () {
          var it = { kind: 'js', name: e.name, placement: e.placement || 'all' };
          // look the module up again: it may have been created by an earlier step or run
          return readJs(it).then(function () { return writeJs(it, e.content); }).then(function () {
            if (state.mode !== 'install' || !state.opts.verify) { return; }
            var check = { kind: 'js', name: e.name };
            return readJs(check).then(function (c) {
              if (!check.jsEdit) { return { warn: e.name + ' was sent, but it does not show in the JavaScript list' }; }
              if (norm(c) !== norm(e.content)) { return { warn: e.name + ' saved, but the stored code differs slightly' }; }
            });
          });
        } });
      } else {
        anyTpl = true;
        tasks.push({ label: 'Template: ' + e.name + (e.lang === 'mobile' ? ' (mobile)' : ''), run: function () {
          return writeTemplate(e.id, e.lang, e.tplName || e.name, e.content).then(function () {
            if (state.mode !== 'install' || !state.opts.verify) { return; }
            return readTemplate({ kind: 'template', id: e.id, lang: e.lang }).then(function (c) {
              if (norm(c) !== norm(e.content)) { return { warn: e.name + ' saved, but the stored text differs slightly' }; }
            });
          });
        } });
      }
    });
    if (anyTpl) {
      tasks.push({ label: 'Turning on custom templates', run: function () { return post('mode=main&part=themes&sub=templates', { switchTemplates: 2, submit: 'Save' }); } });
    }
    return tasks;
  }

  function exec(tasks, fresh) {
    if (fresh) { state.log = []; state.summary = { ok: 0, warn: 0 }; state.progress = { done: 0, total: tasks.length }; }
    state.stage = 'installing'; state.failed = null; render();
    window.onbeforeunload = function () { return 'Installation in progress.'; };
    var idx = 0;
    (function step() {
      if (idx >= tasks.length) { return finish(); }
      var t = tasks[idx];
      log(t.label + '…');
      retry(t.run, CFG.retries).then(function (res) {
        if (res && res.warn) { state.summary.warn++; log('⚠ ' + res.warn, 'warn'); } else { state.summary.ok++; }
        idx++; state.progress.done++; renderProgressOnly();
        return sleep(CFG.delay).then(step);
      }, function (err) {
        state.failed = { label: t.label, msg: err.message };
        state.pending = tasks.slice(idx);
        log('✖ ' + t.label + ' — ' + err.message, 'bad');
        window.onbeforeunload = null;
        state.stage = 'error'; render();
      });
    })();
  }
  function finish() {
    window.onbeforeunload = null;
    log(state.mode === 'restore' ? 'Restore finished.' : 'Installation finished.', 'ok');
    state.stage = 'done'; render();
  }

  function selectedEntries() {
    return state.items.filter(function (it) { return it.selected && (it.status === 'diff' || it.status === 'new' || it.status === 'same' || it.status === 'unreadable'); })
      .map(function (it) { return { kind: it.kind, name: it.name, tplName: it.tplName, id: it.id, lang: it.lang, content: it.remote, placement: it.placement }; });
  }

  function downloadBackup() {
    var sel = state.items.filter(function (it) { return it.selected && it.current != null; });
    var data = {
      format: 'forum-theme-installer-backup', version: 3, created: new Date().toISOString(), forum: location.host,
      theme: theme ? theme.name : '',
      items: sel.map(function (it) {
        return { kind: it.kind, name: it.name, tplName: it.tplName, id: it.id, lang: it.lang, content: it.current, placement: it.placement, existed: it.kind !== 'js' || !!it.jsEdit };
      })
    };
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'forum-backup-' + location.host + '-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json';
    root.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    state.backupDone = true; render();
  }

  function startInstall() {
    var entries = selectedEntries();
    if (!entries.length) { return; }
    state.mode = 'install';
    exec(buildTasks(entries), true);
  }

  function startRestore(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { alert('That file is not valid JSON.'); return; }
      if (!data || (data.format !== 'forum-theme-installer-backup' && data.format !== 'aurum-installer-backup') || !data.items) { alert('That is not a backup made by this installer.'); return; }
      // JS modules that did not exist before the install: nothing to put back (delete them by hand if needed)
      var items = data.items.filter(function (x) { return x.kind !== 'js' || x.existed; });
      var skipped = data.items.length - items.length;
      if (!confirm('Restore ' + items.length + ' item(s) from the backup made on ' + data.created + '?\nThis overwrites what is on the forum now.' +
        (skipped ? '\n\n' + skipped + ' JavaScript module(s) were new with that install; remove them by hand in Modules > HTML & JavaScript if you want them gone.' : ''))) { return; }
      var go = function () { state.mode = 'restore'; exec(buildTasks(items), true); };
      if (tid) { go(); } else { findTid().then(function (t) { if (!t) { alert('Admin session not found. Log in to the Administration Panel first.'); return; } tid = t; go(); }); }
    };
    fr.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * UI
   * ------------------------------------------------------------------ */
  var ICON = {
    css: '<path d="M4 4h16v16H4z" fill="none"/><path d="M8 9l-3 3 3 3M16 9l3 3-3 3M14 6l-4 12"/>',
    js: '<path d="M10 8l-4 4 4 4M14 8l4 4-4 4"/>',
    tpl: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    up: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    gh: '<path d="M9 19c-4 1.5-4-2-6-2.5m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 2.2 5.8 2.5 5.8 2.5a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    box: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>'
  };
  function ico(n, cls) {
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>';
  }

  var CSS = [
    // all:initial stops the forum's own page styles leaking in
    ':host{all:initial;display:block;',
    '--bg:#15120f;--card:#1e1a16;--card2:#26211b;--line:#362e26;--soft:#2b251e;--ink:#f3ebe2;--ink2:#ffffff;--mut:#a3968a;',
    '--acc:#e0873a;--acc2:#f2a65e;--onacc:#1d1208;--tint:rgba(224,135,58,.14);',
    '--ok:#5fc48a;--okt:rgba(95,196,138,.14);--warn:#e8b04b;--warnt:rgba(232,176,75,.14);--bad:#ef6a5b;--badt:rgba(239,106,91,.14);--new:#5aa9ff;--newt:rgba(90,169,255,.14);',
    '--logbg:#100d0b;--addbg:rgba(95,196,138,.12);--addtx:#a7e9c0;--delbg:rgba(239,106,91,.12);--deltx:#f6b7ae;--shadow:0 18px 50px rgba(0,0,0,.45)}',
    ':host([data-theme="light"]){',
    '--bg:#f6f1ea;--card:#ffffff;--card2:#f8f3ec;--line:#e6dbcd;--soft:#efe6da;--ink:#2a221b;--ink2:#120c07;--mut:#85776a;',
    '--acc:#c8691f;--acc2:#a9530f;--onacc:#ffffff;--tint:rgba(200,105,31,.10);',
    '--ok:#23894f;--okt:rgba(35,137,79,.10);--warn:#a86a00;--warnt:rgba(168,106,0,.10);--bad:#c43b2c;--badt:rgba(196,59,44,.09);--new:#2268c9;--newt:rgba(34,104,201,.09);',
    '--logbg:#fbf8f3;--addbg:#e6f5ec;--addtx:#1c6b3d;--delbg:#fbe8e5;--deltx:#922b1f;--shadow:0 18px 40px rgba(80,50,20,.12)}',
    '*{box-sizing:border-box}',
    '.wrap{max-width:1000px;margin:18px auto;color:var(--ink);text-align:left;font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif;-webkit-font-smoothing:antialiased}',
    '.wrap div,.wrap span,.wrap label,.wrap td,.wrap th,.wrap p{color:inherit;font-size:inherit;font-family:inherit}',
    'button{font:inherit}',
    '.i{width:18px;height:18px;flex:0 0 auto;vertical-align:middle}',

    /* frame */
    '.app{background:var(--bg);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:var(--shadow)}',
    '.top{position:relative;display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:22px 24px;background:radial-gradient(120% 140% at 0 0,var(--tint),transparent 55%),var(--card);border-bottom:1px solid var(--line)}',
    '.logo{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,var(--acc2),var(--acc));color:var(--onacc);font-weight:800;font-size:20px;letter-spacing:-.5px;box-shadow:0 8px 20px var(--tint)}',
    '.ttl{min-width:0}',
    '.ttl h1{margin:0;font-size:19px;font-weight:750;letter-spacing:-.2px;color:var(--ink2)}',
    '.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:4px;font-size:12.5px;color:var(--mut)}',
    '.meta a{color:var(--mut);text-decoration:none;display:inline-flex;align-items:center;gap:5px}.meta a:hover{color:var(--acc)}.meta .i{width:14px;height:14px}',
    '.tools{margin-left:auto;display:flex;align-items:center;gap:8px}',
    '.ib{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:var(--card2);color:var(--ink);cursor:pointer}',
    '.ib:hover{border-color:var(--acc);color:var(--acc)}',

    /* stepper rail */
    '.rail{display:grid;grid-template-columns:repeat(4,1fr);gap:0;padding:16px 24px;border-bottom:1px solid var(--line);background:var(--card)}',
    '.st{position:relative;display:flex;align-items:center;gap:10px;color:var(--mut);font-size:13px;font-weight:600;padding-right:12px}',
    '.st:not(:last-child)::after{content:"";flex:1;height:2px;border-radius:2px;background:var(--line);margin-left:4px}',
    '.st.done:not(:last-child)::after{background:var(--ok)}',
    '.dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;font-size:12px;font-weight:800;border:2px solid var(--line);background:var(--card2);color:var(--mut)}',
    '.dot .i{width:14px;height:14px}',
    '.st.on{color:var(--ink2)}.st.on .dot{border-color:var(--acc);background:var(--acc);color:var(--onacc);box-shadow:0 0 0 4px var(--tint)}',
    '.st.done .dot{border-color:var(--ok);background:var(--ok);color:#fff}',
    '.body{padding:22px 24px 24px}',

    /* bits */
    '.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:14px}',
    '.card h3{margin:0 0 4px;font-size:15px;color:var(--ink2)}',
    '.note{color:var(--mut);font-size:12.5px;margin:6px 0 0}',
    '.pill{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:650;white-space:nowrap;background:var(--soft);color:var(--mut)}',
    '.pill .i{width:13px;height:13px}',
    '.pill.ok{background:var(--okt);color:var(--ok)}.pill.warn{background:var(--warnt);color:var(--warn)}.pill.bad{background:var(--badt);color:var(--bad)}.pill.new{background:var(--newt);color:var(--new)}.pill.acc{background:var(--tint);color:var(--acc)}',
    '.btn{display:inline-flex;align-items:center;gap:8px;cursor:pointer;border:0;border-radius:11px;padding:11px 18px;font-size:14px;font-weight:700;background:var(--acc);color:var(--onacc);text-decoration:none;box-shadow:0 6px 16px var(--tint)}',
    '.btn:hover{filter:brightness(1.07)}',
    '.btn.sec{background:var(--card2);color:var(--ink);border:1px solid var(--line);box-shadow:none}',
    '.btn.sec:hover{border-color:var(--acc);color:var(--acc);filter:none}',
    '.btn:disabled{opacity:.45;cursor:not-allowed;filter:none}',
    '.lk{background:none;border:0;color:var(--acc);cursor:pointer;padding:0;font-size:12.5px;font-weight:600}',
    '.lk:hover{text-decoration:underline}',
    '.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}',

    /* theme picker */
    '.picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}',
    '.pick{display:flex;flex-direction:column;gap:6px;padding:18px;border-radius:14px;border:1px solid var(--line);background:var(--card);text-align:left;cursor:pointer;color:var(--ink)}',
    '.pick:hover{border-color:var(--acc);box-shadow:0 0 0 4px var(--tint)}',
    '.pick b{font-size:16px;color:var(--ink2)}.pick span{color:var(--mut);font-size:12.5px}',

    /* scan */
    '.scan{display:flex;flex-direction:column;align-items:center;text-align:center;padding:34px 20px}',
    '.spin{width:44px;height:44px;border-radius:50%;border:4px solid var(--soft);border-top-color:var(--acc);animation:sp 0.9s linear infinite;margin-bottom:14px}',
    '@keyframes sp{to{transform:rotate(360deg)}}',
    '.prog{width:100%;max-width:520px;height:8px;background:var(--soft);border-radius:99px;overflow:hidden;margin:14px auto 0}',
    '.prog i{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));width:0;border-radius:99px;transition:width .25s}',

    /* summary tiles */
    '.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}',
    '.tile{padding:14px 16px;border-radius:14px;background:var(--card);border:1px solid var(--line)}',
    '.tile .n{font-size:28px;font-weight:800;line-height:1.05;letter-spacing:-.5px;color:var(--ink2)}.tile .l{color:var(--mut);font-size:12px;margin-top:3px}',
    '.tile.w .n{color:var(--warn)}.tile.o .n{color:var(--ok)}.tile.b .n{color:var(--bad)}',

    /* options as switches */
    '.opts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}',
    '.opt{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;background:var(--card);border:1px solid var(--line);cursor:pointer}',
    '.opt:hover{border-color:color-mix(in srgb,var(--acc) 45%,var(--line))}',
    '.opt input{position:absolute;opacity:0;pointer-events:none}',
    '.sw{position:relative;flex:0 0 auto;width:36px;height:20px;border-radius:99px;background:var(--soft);border:1px solid var(--line);margin-top:1px;transition:background .15s}',
    '.sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--mut);transition:transform .15s,background .15s}',
    'input:checked + .sw{background:var(--acc);border-color:var(--acc)}input:checked + .sw::after{transform:translateX(16px);background:var(--onacc)}',
    'input:focus-visible + .sw{box-shadow:0 0 0 3px var(--tint)}',
    '.opt b{display:block;font-size:13px;color:var(--ink2);font-weight:650}.opt small{display:block;color:var(--mut);font-size:12px;margin-top:2px;line-height:1.4}',

    /* filters */
    '.bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0 10px}',
    '.f{cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--mut);border-radius:99px;padding:5px 13px;font-size:12.5px;font-weight:600}',
    '.f:hover{color:var(--ink)}.f.on{background:var(--ink2);border-color:var(--ink2);color:var(--bg)}',
    '.bar .cnt{margin-left:auto;color:var(--mut);font-size:12.5px}',

    /* groups */
    '.grp{border:1px solid var(--line);border-radius:14px;background:var(--card);margin-bottom:10px;overflow:hidden}',
    '.gh{display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;user-select:none}',
    '.gh:hover{background:var(--card2)}',
    '.gh .chev{color:var(--mut);transition:transform .15s}.grp.open .gh .chev{transform:rotate(90deg)}',
    '.gi{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--tint);color:var(--acc)}',
    '.gh .gn{font-weight:700;color:var(--ink2)}.gh .gc{color:var(--mut);font-size:12.5px}',
    '.gh .sp{flex:1}',
    '.items{border-top:1px solid var(--line)}',
    '.it{display:grid;grid-template-columns:28px minmax(0,1fr) auto auto 80px;align-items:center;gap:12px;padding:9px 14px 9px 16px;border-bottom:1px solid var(--soft)}',
    '.it:last-child{border-bottom:0}.it:hover{background:var(--card2)}',
    '.nm{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.nm small{font-family:system-ui,sans-serif;color:var(--mut);margin-left:8px}',
    '.dl{color:var(--mut);font-size:12px;text-align:right;font-variant-numeric:tabular-nums}',
    '.ck{appearance:none;-webkit-appearance:none;width:18px;height:18px;margin:0;border-radius:6px;border:2px solid var(--line);background:var(--card2);display:grid;place-items:center;cursor:pointer}',
    '.ck:checked{background:var(--acc);border-color:var(--acc)}',
    '.ck:checked::after{content:"";width:9px;height:5px;border:2px solid var(--onacc);border-top:0;border-right:0;transform:translateY(-1px) rotate(-45deg)}',
    '.ck:indeterminate{background:var(--acc);border-color:var(--acc)}.ck:indeterminate::after{content:"";width:8px;height:2px;background:var(--onacc)}',
    '.ck:disabled{opacity:.35;cursor:not-allowed}',
    '.ck:focus-visible{box-shadow:0 0 0 3px var(--tint);outline:0}',

    /* untouched */
    '.un{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px}.ug{margin-top:12px;font-weight:700;color:var(--ink2);font-size:12.5px}',

    /* action bar */
    '.act{position:sticky;bottom:0;display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:16px -24px -24px;padding:16px 24px;background:color-mix(in srgb,var(--card) 92%,transparent);backdrop-filter:blur(8px);border-top:1px solid var(--line)}',
    '.act .sp{flex:1}',
    '.stepno{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:800;background:rgba(0,0,0,.18)}',
    '.btn.sec .stepno{background:var(--soft)}',

    /* installing */
    '.big{display:flex;align-items:center;gap:18px;margin-bottom:14px}',
    '.ring{--p:0;width:74px;height:74px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;background:conic-gradient(var(--acc) calc(var(--p)*1%),var(--soft) 0)}',
    '.ring b{display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:var(--card);font-size:15px;color:var(--ink2)}',
    '.log{background:var(--logbg);border:1px solid var(--line);border-radius:12px;padding:12px 14px;height:240px;overflow:auto;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--mut)}',
    '.log .ok{color:var(--ok)}.log .warn{color:var(--warn)}.log .bad{color:var(--bad)}',
    '.err{border-color:color-mix(in srgb,var(--bad) 45%,var(--line));background:linear-gradient(var(--badt),var(--badt)),var(--card)}',
    '.err h3{color:var(--bad)}',
    '.okc{border-color:color-mix(in srgb,var(--ok) 45%,var(--line));background:linear-gradient(var(--okt),var(--okt)),var(--card)}',
    '.okc h3{color:var(--ok);font-size:17px}',
    '.badge{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--ok);color:#fff;flex:0 0 auto}.badge .i{width:24px;height:24px}',

    /* diff modal */
    '.mo{position:fixed;inset:0;background:rgba(10,8,6,.62);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:99999;padding:20px}',
    '.mb{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:16px;max-width:920px;width:100%;max-height:86vh;display:flex;flex-direction:column;text-align:left;box-shadow:var(--shadow);font:14px/1.5 system-ui,sans-serif}',
    '.mh{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}',
    '.mh b{font-family:ui-monospace,Consolas,monospace;color:var(--ink2)}.mh .sp{flex:1}',
    '.leg{display:flex;gap:8px;font-size:12px;color:var(--mut)}.leg span{display:inline-flex;align-items:center;gap:5px}.leg i{width:10px;height:10px;border-radius:3px;display:inline-block}',
    '.df{overflow:auto;padding:8px 0;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}',
    '.df div{padding:0 16px;white-space:pre-wrap;word-break:break-all}',
    '.df .a{background:var(--addbg);color:var(--addtx)}.df .d{background:var(--delbg);color:var(--deltx)}.df .u{color:var(--mut)}.df .g{color:var(--acc);text-align:center;padding:4px 16px;font-family:system-ui,sans-serif}',

    '@media (max-width:760px){.tiles{grid-template-columns:repeat(2,1fr)}.opts{grid-template-columns:1fr}.rail{grid-template-columns:repeat(4,auto);overflow:auto}.st span.lb{display:none}',
    '.it{grid-template-columns:24px minmax(0,1fr) auto;row-gap:4px}.it .dl{display:none}.it .dv{grid-column:2/-1}.top{padding:18px}.body{padding:18px}.act{margin:16px -18px -18px;padding:14px 18px}}'
  ].join('');

  var STATUS = {
    diff: ['warn', 'warn', 'Will overwrite'], 'new': ['new', 'up', 'New'], same: ['ok', 'check', 'Identical'],
    noid: ['bad', 'x', 'Unknown template ID'], missing: ['bad', 'x', 'Not in the repo'], unreadable: ['warn', 'warn', 'Can’t read current'], bad: ['bad', 'x', 'Download failed']
  };

  function counts() {
    var c = { diff: 0, same: 0, bad: 0, sel: 0, nt: state.untouched.length };
    state.items.forEach(function (it) {
      if (it.status === 'diff' || it.status === 'new') { c.diff++; }
      else if (it.status === 'same') { c.same++; }
      else { c.bad++; }
      if (it.selected) { c.sel++; }
    });
    return c;
  }

  function rail() {
    var labels = ['Scan', 'Review', 'Install', 'Done'];
    var cur = { pick: 0, scan: 0, fatal: 0, review: 1, installing: 2, error: 2, done: 3 }[state.stage];
    if (state.stage === 'done') { cur = 4; }
    return '<div class="rail">' + labels.map(function (l, i) {
      var cls = i === cur ? 'on' : i < cur ? 'done' : '';
      return '<div class="st ' + cls + '"><span class="dot">' + (i < cur ? ico('check') : (i + 1)) + '</span><span class="lb">' + l + '</span></div>';
    }).join('') + '</div>';
  }

  function top() {
    var k = refKind(), nm = theme && theme.name ? theme.name : 'Forum Theme Installer';
    var mark = (nm.replace(/^the\s+/i, '').match(/[A-Za-z0-9]/g) || ['T']).slice(0, 2).join('');
    mark = mark.charAt(0).toUpperCase() + mark.slice(1).toLowerCase();
    var light = host.getAttribute('data-theme') === 'light';
    return '<div class="top"><div class="logo">' + esc(mark) + '</div><div class="ttl"><h1>' + esc(theme ? 'Install ' + nm : nm) + '</h1>' +
      '<div class="meta">' + (theme ? (theme.version ? '<span>Version ' + esc(theme.version) + '</span>' : '') +
        '<a href="https://github.com/' + esc(theme.owner + '/' + theme.repo) + '" target="_blank" rel="noopener">' + ico('gh') + esc(theme.owner + '/' + theme.repo) + '</a>' : '<span>Forumotion · phpBB3</span>') +
      '<span class="pill ' + k.cls + '" title="' + esc(k.tip) + '">' + esc(k.txt) + '</span></div></div>' +
      '<div class="tools">' +
      (state.themes.length > 1 && state.stage !== 'pick' && state.stage !== 'installing' ? '<button class="btn sec" data-action="themes">Other themes</button>' : '') +
      '<button class="ib" data-action="theme" title="' + (light ? 'Dark mode' : 'Light mode') + '" aria-label="' + (light ? 'Dark mode' : 'Light mode') + '">' + ico(light ? 'moon' : 'sun') + '</button></div></div>';
  }

  function viewPick() {
    if (!state.themes.length) { return '<div class="card err"><h3>No themes configured</h3><div class="note">Add at least one theme to the themes list in the installer page.</div></div>'; }
    return '<div class="card"><h3>Choose a theme</h3><div class="note">Nothing changes on your forum until you have reviewed the list and confirmed.</div></div><div class="picks">' +
      state.themes.map(function (t, i) {
        return '<button class="pick" data-action="pick" data-i="' + i + '"><b>' + esc(t.name || t.id) + '</b><span>' + esc(t.description || (t.owner + '/' + t.repo)) + '</span></button>';
      }).join('') + '</div>';
  }

  function viewScan() {
    var pct = state.scanTotal ? Math.round(state.scanDone / state.scanTotal * 100) : 4;
    return '<div class="card scan"><div class="spin"></div><h3>' + esc(state.scanMsg) + '</h3>' +
      '<div class="note">Only reading for now: nothing is changed during the scan.</div><div class="prog"><i id="sbar" style="width:' + pct + '%"></i></div></div>';
  }

  function viewFatal() {
    return '<div class="card err"><h3>Can’t continue</h3><div style="margin-top:6px">' + esc(state.errorMsg) + '</div>' +
      '<div class="row" style="margin-top:14px"><button class="btn" data-action="rescan">Try again</button><a class="btn sec" href="/admin/" target="_blank">Open the Administration Panel</a></div></div>';
  }

  function visible(it) {
    var s = it.status, f = state.filter;
    return f === 'all' || (f === 'diff' && (s === 'diff' || s === 'new')) || (f === 'same' && s === 'same') ||
      (f === 'bad' && (s === 'noid' || s === 'bad' || s === 'unreadable' || s === 'missing'));
  }
  function installable(it) { return it.status === 'diff' || it.status === 'new'; }
  function selectable(it) { return it.status !== 'noid' && it.status !== 'bad' && it.status !== 'missing'; }

  function viewUntouched() {
    if (!state.untouched.length) { return ''; }
    var h = '<div class="card"><button class="lk" data-action="untouched">' + (state.showUntouched ? 'Hide' : 'Show') + ' what this theme does not touch (' + state.untouched.length + ')</button>';
    if (state.showUntouched) {
      state.groupOrder.forEach(function (g) {
        var l = state.untouched.filter(function (u) { return u.group === g; });
        if (!l.length) { return; }
        h += '<div class="ug">' + esc(g) + '</div><div class="un">' + l.map(function (u) { return '<span class="pill">' + esc(u.name) + '</span>'; }).join('') + '</div>';
      });
      h += '<div class="note">These stay exactly as they are on your forum.</div>';
    }
    return h + '</div>';
  }

  function groupIcon(g) { return g === 'Stylesheet' ? 'css' : g === 'JavaScript' ? 'js' : 'tpl'; }

  function opt(field, title, text) {
    return '<label class="opt"><input type="checkbox" data-field="' + field + '"' + (state.opts[field] ? ' checked' : '') + '><span class="sw"></span><span><b>' + title + '</b><small>' + text + '</small></span></label>';
  }

  function viewReview() {
    var c = counts(), h = '';
    h += '<div class="tiles">' +
      '<div class="tile w"><div class="n">' + c.diff + '</div><div class="l">will change</div></div>' +
      '<div class="tile o"><div class="n">' + c.same + '</div><div class="l">already identical</div></div>' +
      '<div class="tile b"><div class="n">' + c.bad + '</div><div class="l">can’t be installed</div></div>' +
      '<div class="tile"><div class="n">' + c.nt + '</div><div class="l">not touched</div></div></div>';

    if (state.notes.length) {
      h += '<div class="card"><h3>Before you install</h3>' + state.notes.map(function (n) { return '<div class="note">• ' + esc(n) + '</div>'; }).join('') + '</div>';
    }
    if (state.jsErr) {
      h += '<div class="card err"><h3>JavaScript modules</h3><div class="note">The JavaScript list could not be read (' + esc(state.jsErr) + '). Templates still install normally.</div></div>';
    }

    h += '<div class="opts">' +
      opt('verify', 'Check every item after saving', 'Reads each one back and compares. Slower, catches silent failures.') +
      opt('baseCss', 'Turn off Forumotion’s default CSS', 'Only if the theme replaces it completely.') +
      opt('phpbb3', 'Switch the forum to phpBB3 first', 'Template IDs are for phpBB3. Leave off if it already is.') +
      '</div>';

    h += '<div class="bar">' + [['all', 'All'], ['diff', 'Will change'], ['same', 'Identical'], ['bad', 'Problems']].map(function (f) {
      return '<button class="f ' + (state.filter === f[0] ? 'on' : '') + '" data-action="filter" data-v="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '<button class="lk" style="margin-left:8px" data-action="expand">' + (Object.keys(state.open).length ? 'Collapse all' : 'Expand all') + '</button>' +
      '<span class="cnt">' + c.sel + ' of ' + state.items.length + ' selected</span></div>';

    var any = false;
    state.groupOrder.forEach(function (g) {
      var gi = [];
      state.items.forEach(function (it, i) { if (it.group === g) { gi.push({ it: it, i: i }); } });
      var shown = gi.filter(function (r) { return visible(r.it); });
      if (!shown.length) { return; }
      any = true;
      var n = { change: 0, same: 0, bad: 0 }, inst = [];
      gi.forEach(function (r) {
        if (installable(r.it)) { n.change++; inst.push(r); } else if (r.it.status === 'same') { n.same++; } else { n.bad++; }
      });
      var onN = inst.filter(function (r) { return r.it.selected; }).length;
      var open = !!state.open[g] || state.filter !== 'all';
      h += '<div class="grp' + (open ? ' open' : '') + '"><div class="gh" data-action="grptoggle" data-g="' + esc(g) + '">' +
        '<input type="checkbox" class="ck" data-action="grp" data-g="' + esc(g) + '"' + (inst.length && onN === inst.length ? ' checked' : '') +
        (onN && onN < inst.length ? ' data-ind="1"' : '') + (inst.length ? '' : ' disabled') + ' aria-label="Select group">' +
        '<span class="gi">' + ico(groupIcon(g)) + '</span><span><div class="gn">' + esc(g) + '</div><div class="gc">' + gi.length + (gi.length === 1 ? ' item' : ' items') + '</div></span><span class="sp"></span>' +
        (n.change ? '<span class="pill warn">' + n.change + ' to change</span>' : '') +
        (n.same ? '<span class="pill ok">' + n.same + ' identical</span>' : '') +
        (n.bad ? '<span class="pill bad">' + n.bad + ' problem' + (n.bad === 1 ? '' : 's') + '</span>' : '') +
        ico('chev', 'chev') + '</div>';
      if (open) {
        h += '<div class="items">' + shown.map(function (r) {
          var it = r.it, st = STATUS[it.status], dis = !selectable(it);
          var sub = it.kind === 'template' ? (it.id ? 'ID ' + it.id : 'no ID') + (it.lang === 'mobile' ? ' · mobile' : '') : it.kind === 'js' ? 'In all the pages' : it.path;
          var tip = it.remoteErr || it.currentErr || '';
          return '<div class="it"><input type="checkbox" class="ck" data-action="toggle" data-i="' + r.i + '"' + (it.selected ? ' checked' : '') + (dis ? ' disabled' : '') + ' aria-label="Select">' +
            '<div class="nm" title="' + esc(it.path || '') + '">' + esc(it.name) + '<small>' + esc(sub) + '</small></div>' +
            '<span class="pill ' + st[0] + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + ico(st[1]) + st[2] + '</span>' +
            '<span class="dl">' + (it.delta != null ? fmtDelta(it.delta) : '') + '</span>' +
            '<span class="dv" style="text-align:right">' + (installable(it) ? '<button class="lk" data-action="diff" data-i="' + r.i + '">' + ico('eye') + ' Changes</button>' : '') + '</span></div>';
        }).join('') + '</div>';
      }
      h += '</div>';
    });
    if (!any) { h += '<div class="card" style="text-align:center;color:var(--mut)">Nothing in this filter.</div>'; }

    h += '<div class="note" style="margin:10px 2px 14px">Forumotion shows its default version of any template you haven’t customised, so “Will overwrite” also covers templates that are still on the default. Identical items are skipped unless you tick them yourself.</div>';
    if (state.ignored.length) {
      h += '<div class="note" style="margin:0 2px 14px">' + state.ignored.length + ' file' + (state.ignored.length === 1 ? '' : 's') + ' in the repo ' + (state.ignored.length === 1 ? 'is' : 'are') + ' not listed in manifest.json and will be ignored: ' +
        esc(state.ignored.slice(0, 6).join(', ')) + (state.ignored.length > 6 ? ', …' : '') + '</div>';
    }
    h += viewUntouched();

    h += '<div class="act"><button class="btn sec" data-action="backup">' + (state.backupDone ? ico('check') + 'Backup saved' : '<span class="stepno">1</span>' + ico('dl') + 'Download backup') + '</button>' +
      '<button class="btn" data-action="install"' + (state.backupDone && c.sel ? '' : ' disabled') + '><span class="stepno">2</span>Install ' + c.sel + ' item' + (c.sel === 1 ? '' : 's') + '</button>' +
      (state.backupDone ? '' : '<button class="lk" data-action="skipbackup">Install without a backup</button>') +
      '<span class="sp"></span><button class="lk" data-action="restore">' + ico('up') + ' Restore a backup…</button>' +
      '<input type="file" id="rf" accept=".json,application/json" style="display:none"></div>';
    return h;
  }

  function viewInstalling() {
    var p = state.progress, pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return '<div class="card"><div class="big"><div class="ring" id="rg" style="--p:' + pct + '"><b id="pc">' + pct + '%</b></div>' +
      '<div><h3>' + (state.mode === 'restore' ? 'Restoring your backup…' : 'Installing…') + '</h3><div class="note"><span id="pt">' + p.done + ' of ' + p.total + '</span> steps. Keep this tab open until it finishes.</div></div></div>' +
      '<div class="log" id="lg"></div></div>';
  }

  function viewError() {
    return '<div class="card err"><h3>Stopped at: ' + esc(state.failed.label) + '</h3><div style="margin-top:4px">' + esc(state.failed.msg) +
      '</div><div class="note">Nothing after this step was written. Steps before it are already done.</div>' +
      '<div class="row" style="margin-top:14px"><button class="btn" data-action="retry">Retry from this step</button><button class="btn sec" data-action="restore">' + ico('up') + 'Restore a backup…</button>' +
      '<input type="file" id="rf" accept=".json,application/json" style="display:none"></div></div>' +
      '<div class="log" id="lg"></div>';
  }

  function viewDone() {
    var s = state.summary;
    return '<div class="card okc"><div class="big" style="margin:0"><span class="badge">' + ico('check') + '</span><div><h3>' + (state.mode === 'restore' ? 'Backup restored' : 'Theme installed') + '</h3>' +
      '<div>' + s.ok + ' step' + (s.ok === 1 ? '' : 's') + ' done' + (s.warn ? ', <span style="color:var(--warn)">' + s.warn + ' with a warning</span>' : '') + '.</div></div></div>' +
      '<div class="note" style="margin-top:12px">Reload the forum with Ctrl+F5 to see it. If something looks wrong, restore your backup file.</div>' +
      '<div class="row" style="margin-top:14px"><a class="btn" href="/" target="_blank">Open the forum</a>' +
      '<button class="btn sec" data-action="restore">' + ico('up') + 'Restore a backup…</button><input type="file" id="rf" accept=".json,application/json" style="display:none"></div></div>' +
      '<div class="log" id="lg"></div>';
  }

  function viewModal() {
    var it = state.modal;
    var rows = diffLines(it.current || '', it.remote || '', 2).map(function (d) {
      var cls = d.t === '+' ? 'a' : d.t === '-' ? 'd' : d.t === '…' ? 'g' : 'u';
      return '<div class="' + cls + '">' + (d.t === '…' ? '⋯ ' + esc(d.s) + ' ⋯' : (d.t === '=' ? '  ' : d.t + ' ') + esc(d.s)) + '</div>';
    }).join('');
    return '<div class="mo" data-action="closemodal"><div class="mb"><div class="mh"><b>' + esc(it.name) + '</b>' +
      '<span class="leg"><span><i style="background:var(--deltx)"></i>on your forum now</span><span><i style="background:var(--addtx)"></i>from the theme</span></span><span class="sp"></span>' +
      '<button class="ib" data-action="closemodal" aria-label="Close">' + ico('x') + '</button></div><div class="df">' + (rows || '<div class="u">No line differences.</div>') + '</div></div></div>';
  }

  function render() {
    var body = { pick: viewPick, scan: viewScan, fatal: viewFatal, review: viewReview, installing: viewInstalling, error: viewError, done: viewDone }[state.stage]();
    root.innerHTML = '<style>' + CSS + '</style><div class="wrap"><div class="app">' + top() + rail() + '<div class="body">' + body + '</div></div></div>' + (state.modal ? viewModal() : '');
    Array.prototype.forEach.call(root.querySelectorAll('[data-ind]'), function (x) { x.indeterminate = true; });
    updateLog();
  }
  function renderProgressOnly() {
    var p = state.progress, pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    var rg = root.querySelector('#rg');
    if (rg) {
      rg.style.setProperty('--p', pct);
      root.querySelector('#pc').textContent = pct + '%';
      root.querySelector('#pt').textContent = p.done + ' of ' + p.total;
    }
    var s = root.querySelector('#sbar');
    if (s) { s.style.width = (state.scanTotal ? state.scanDone / state.scanTotal * 100 : 4) + '%'; }
  }
  function updateLog() {
    var el = root && root.querySelector('#lg');
    if (!el) { return; }
    el.innerHTML = state.log.map(function (l) { return '<div class="' + l.c + '">' + esc(l.m) + '</div>'; }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function bind() {
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-action]');
      if (!t) { return; }
      var a = t.getAttribute('data-action'), i = +t.getAttribute('data-i');
      if (a === 'grp' || a === 'toggle' || a === 'all') { return; }   // handled on change
      if (a === 'closemodal') { if (t.classList.contains('mo') && e.target !== t) { return; } state.modal = null; render(); }
      else if (a === 'filter') { state.filter = t.getAttribute('data-v'); render(); }
      else if (a === 'grptoggle') {
        if (e.target.closest('input')) { return; }
        var g = t.getAttribute('data-g');
        if (state.open[g]) { delete state.open[g]; } else { state.open[g] = 1; }
        render();
      }
      else if (a === 'expand') {
        if (Object.keys(state.open).length) { state.open = {}; } else { state.groupOrder.forEach(function (g) { state.open[g] = 1; }); }
        render();
      }
      else if (a === 'diff') { state.modal = state.items[i]; render(); }
      else if (a === 'backup') { downloadBackup(); }
      else if (a === 'skipbackup') { if (confirm('Install without a backup? You will not be able to undo this.')) { state.backupDone = true; render(); } }
      else if (a === 'install') { if (confirm('Install the selected items now? This overwrites them on your forum.')) { startInstall(); } }
      else if (a === 'retry') { exec(state.pending, false); }
      else if (a === 'rescan') { if (theme) { scan(); } else { state.stage = 'pick'; render(); } }
      else if (a === 'pick') { choose(state.themes[i]); }
      else if (a === 'themes') { state.stage = 'pick'; render(); }
      else if (a === 'untouched') { state.showUntouched = !state.showUntouched; render(); }
      else if (a === 'theme') {
        state.theme = host.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        try { localStorage.setItem('forum-installer-theme', state.theme); } catch (x) { /* storage blocked: fine */ }
        applyTheme(); render();
      }
      else if (a === 'restore') { var f = root.querySelector('#rf'); if (f) { f.click(); } }
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.modal) { state.modal = null; render(); }
    });
    root.addEventListener('change', function (e) {
      var t = e.target, a = t.getAttribute('data-action'), f = t.getAttribute('data-field');
      if (t.id === 'rf' && t.files && t.files[0]) { startRestore(t.files[0]); t.value = ''; }
      else if (f) { state.opts[f] = t.checked; }
      else if (a === 'toggle') { var it = state.items[+t.getAttribute('data-i')]; it.selected = t.checked; state.backupDone = false; render(); }
      else if (a === 'grp') {
        var g = t.getAttribute('data-g');
        state.items.forEach(function (it) { if (it.group === g && installable(it)) { it.selected = t.checked; } });
        state.backupDone = false; render();
      }
    });
  }

  function applyTheme() {
    var t = state.theme;
    if (t !== 'light' && t !== 'dark') { t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    host.setAttribute('data-theme', t);
  }

  function init() {
    host = document.getElementById('theme-installer') || document.getElementById('aurum-installer');
    if (!host) { return; }
    var saved = null;
    try { saved = localStorage.getItem('forum-installer-theme'); } catch (x) { /* ignore */ }
    state.theme = saved || L.theme || 'auto';
    applyTheme();
    host.removeAttribute('style');
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    bind();
    state.stage = 'scan'; state.scanMsg = 'Loading themes…'; render();
    loadThemes().then(function (list) {
      state.themes = list;
      var hash = (location.hash || '').replace('#', ''), pick = list.length === 1 ? list[0] : list.filter(function (t) { return t.id === hash; })[0];
      if (pick) { return choose(pick); }
      state.stage = 'pick'; render();
    }).catch(function (e) { state.stage = 'fatal'; state.errorMsg = 'Could not load the themes list: ' + e.message; render(); });
  }
  init();
})();
