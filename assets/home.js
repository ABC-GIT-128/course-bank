/* 首页逻辑：搜索（中文二元组匹配）+ 课程卡片渲染 */
(function () {
  const COURSES = window.OC_COURSES || [];
  const RET = window.OC_RETENTION || { keepYears: 2, cutoff: new Date().getFullYear() - 1 };

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- 置顶（最多 3 门） ---------- */
  const PINS_KEY = 'oc_pins';
  const MAX_PINS = 3;
  const debounce = (window.OCFish && window.OCFish.debounce)
    ? window.OCFish.debounce
    : function (fn, wait) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), wait); }; };

  function readPins() {
    try {
      const v = JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
      return Array.isArray(v) ? v.filter(id => typeof id === 'string').slice(0, MAX_PINS) : [];
    } catch (e) { return []; }
  }
  let PINS = readPins();
  /* 写盘防抖：连续点图钉时只落一次 */
  const persistPins = debounce(() => {
    try { localStorage.setItem(PINS_KEY, JSON.stringify(PINS)); } catch (e) {}
  }, 250);

  let hintTimer = null;
  function flash(msg) {
    const head = document.querySelector('.listhead');
    if (!head) return;
    let el = document.getElementById('pinhint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pinhint';
      el.className = 'pinhint';
      head.parentNode.insertBefore(el, head.nextSibling);
    }
    el.textContent = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { if (el) el.textContent = ''; }, 3200);
  }

  /* ---------- 搜索索引 ---------- */
  function courseText(c) {
    const chNames = c.chapters.map(n => '第' + n + '章 ' + (c.chapterNames[n] || '')).join(' ');
    const tags = Object.keys(c.tags || {}).map(k => ({ ppt: 'PPT 专节', key: '重点', choice: '选择', fill: '填空', term: '名词解释', calc: '计算', note: '待确认' }[k] || '')).join(' ');
    return [c.title, c.subtitle, c.college, c.keywords.join(' '), chNames, tags,
      c.terms.map(t => (c.termLabels[t] || t)).join(' ')].join(' ').toLowerCase();
  }
  const INDEX = COURSES.map(c => ({ c, text: courseText(c) }));

  const norm = s => String(s || '').toLowerCase().replace(/[\s，。、；：""''（）()【】\[\]?!！,.]/g, '');

  function bigrams(s) {
    const out = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    if (s.length === 1) out.push(s);
    return out;
  }

  /* 打分：整串命中 > 二元组覆盖率 */
  function score(text, q) {
    if (!q) return 0;
    if (text.indexOf(q) >= 0) return 100 + Math.min(q.length, 10);
    const g = bigrams(q);
    if (!g.length) return 0;
    let hit = 0;
    g.forEach(x => { if (text.indexOf(x) >= 0) hit++; });
    const ratio = hit / g.length;
    return ratio >= 0.5 ? ratio * 80 : 0;
  }

  /* ---------- 卡片 ---------- */
  function tagOf(c) {
    const t = c.tags || {};
    const out = [];
    if (t.key) out.push('<i class="pill pill-key">含重点标注 ' + t.key + '</i>');
    if (t.ppt) out.push('<i class="pill pill-ppt">PPT 专节 ' + t.ppt + '</i>');
    return out.join('');
  }

  function card(c) {
    const pinned = PINS.indexOf(c.id) >= 0;
    const terms = c.terms.map(t => '<span class="term">' + esc(c.termLabels[t] || t) + '</span>').join('') +
      (c.status === 'archived' ? '<span class="term pill-arc">归档</span>' : '');
    const hid = c.hidden ? '<i class="hiddennote">' + c.hidden + ' 题已下架</i>' : '';
    const typeLine = ['choice', 'fill', 'term', 'calc']
      .filter(k => c.tags[k])
      .map(k => ({ choice: '选择', fill: '填空', term: '名词解释', calc: '计算' }[k] + ' ' + c.tags[k]))
      .join(' · ');
    return '<div class="cwrap' + (pinned ? ' is-pinned' : '') + '" data-cid="' + esc(c.id) + '">' +
      '<button class="pinbtn' + (pinned ? ' on' : '') + '" type="button" data-pin="' + esc(c.id) + '"' +
        ' aria-pressed="' + pinned + '" title="' + (pinned ? '取消置顶' : '置顶这门课') + '">📌</button>' +
      '<a class="ccard' + (c.status === 'archived' ? ' is-arc' : '') + '" href="' + encodeURIComponent(c.id) + '/">' +
      '<div class="cchd"><h3>' + esc(c.title) + '</h3>' + terms + '</div>' +
      '<p class="ccsub">' + esc(c.subtitle || '') + '</p>' +
      '<p class="ccmeta">' + esc(c.college) + ' · ' +
        (c.count ? '<b>' + c.count + '</b> 题' : '<b>' + (c.fileCount || 0) + '</b> 份资料') +
        (c.count ? ' · ' + c.chapters.length + ' 章' : '') +
        ' · 更新 ' + esc(c.updatedAt) + '</p>' +
      '<p class="cctypes">' + esc(typeLine) + (hid ? ' · ' + hid : '') + '</p>' +
      '<div class="ccfoot">' + tagOf(c) + '<span class="go">' + (c.status === 'archived' ? '查看归档 →' : '开始练习 →') + '</span></div>' +
      '</a></div>';
  }

  /* ---------- 渲染 ---------- */
  const cardsEl = $('#cards');
  const emptyEl = $('#empty');
  const titleEl = $('#listtitle');
  const metaEl = $('#listmeta');

  let VIEW = { list: INDEX, q: '' };

  /* 重排时用 FLIP：先量旧位置，重绘后从旧位置平滑滑到新位置 */
  function paint(html) {
    const before = {};
    cardsEl.querySelectorAll('[data-cid]').forEach(el => {
      before[el.getAttribute('data-cid')] = el.getBoundingClientRect();
    });
    cardsEl.innerHTML = html;
    if (!Object.keys(before).length) return;
    cardsEl.querySelectorAll('[data-cid]').forEach(el => {
      const b = before[el.getAttribute('data-cid')];
      if (!b) return;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(() => {
        el.style.transition = 'transform .38s cubic-bezier(.2,.7,.3,1)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 420);
      });
    });
  }

  function render(list, q) {
    VIEW = { list: list, q: q || '' };
    const items = list.map(x => x.c || x).filter(c => c.status !== 'hidden');
    if (!items.length) {
      cardsEl.innerHTML = '';
      emptyEl.hidden = false;
      titleEl.textContent = q ? '搜索结果' : '全部课程';
      metaEl.textContent = '';
      return;
    }
    emptyEl.hidden = true;

    if (q) {
      /* 搜索：在架 + 归档一起显示，归档带角标 */
      paint('<div class="grid">' + items.map(card).join('') + '</div>');
      titleEl.textContent = '搜索结果';
      metaEl.textContent = '共 ' + items.length + ' 门 · ' +
        items.reduce((s, c) => s + c.count, 0) + ' 题，关键词「' + q + '」';
      return;
    }

    /* 置顶优先；搜索时保持相关度排序 */
    if (!q) {
      const rank = c => { const i = PINS.indexOf(c.id); return i < 0 ? 999 : i; };
      items.sort((a, b) => rank(a) - rank(b));
    }

    const act = items.filter(c => c.status === 'active');
    const arc = items.filter(c => c.status === 'archived');
    let html = '<div class="grid">' + act.map(card).join('') + contribCard() + '</div>';
    if (arc.length) {
      html += '<div class="arcbar"><b>往期课程（' + arc.length + ' 门）</b>' +
        '<span>超过' + RET.keepYears + ' 年（' + RET.cutoff + ' 年之前）的课程已归档，仅作参考，可能与本学期考纲不一致</span>' +
        '<button id="arctoggle">展开查看</button></div>' +
        '<div class="arcwrap" id="arcwrap" hidden><div class="grid">' + arc.map(card).join('') + '</div></div>';
    }
    paint(html);

    const btn = document.getElementById('arctoggle');
    const wrap = document.getElementById('arcwrap');
    if (btn && wrap) {
      btn.addEventListener('click', () => {
        wrap.hidden = !wrap.hidden;
        btn.textContent = wrap.hidden ? '展开查看' : '收起';
      });
    }

    titleEl.textContent = '全部课程';
    metaEl.textContent = '在架 ' + act.length + ' 门 · ' +
      act.reduce((s, c) => s + c.count, 0) + ' 题' +
      (arc.length ? ' · 归档 ' + arc.length + ' 门' : '') +
      ' · 内容保留最近 ' + RET.keepYears + ' 年';
  }

  function contribCard() {
    return '<a class="ccard ccard-add" href="batch.html">' +
      '<div class="plus">＋</div>' +
      '<h3>提交题目</h3>' +
      '<p class="ccsub">整段粘贴、一次多题，实时检查格式，审核通过后署上你的名字。</p>' +
      '</a>';
  }

  function search(v) {
    const q = norm(v);
    $('#clear').hidden = !v;
    if (!q) { render(INDEX, ''); return; }
    const hits = INDEX
      .map(x => ({ x, s: score(x.text, q) }))
      .filter(o => o.s > 0)
      .sort((a, b) => b.s - a.s);
    render(hits.map(o => o.x), v.trim());
  }

  /* ---------- 热门标签 ---------- */
  const hotWords = [];
  COURSES.forEach(c => (c.keywords || []).slice(0, 6).forEach(k => {
    if (hotWords.indexOf(k) < 0) hotWords.push(k);
  }));
  $('#hot').innerHTML = '<span class="muted">试试：</span>' +
    hotWords.slice(0, 8).map(w => '<button class="hchip">' + esc(w) + '</button>').join('');
  $('#hot').addEventListener('click', e => {
    const b = e.target.closest('.hchip');
    if (!b) return;
    $('#q').value = b.textContent;
    search(b.textContent);
    $('#q').focus();
  });

  /* ---------- 置顶交互 ---------- */
  function togglePin(id) {
    const i = PINS.indexOf(id);
    if (i >= 0) {
      PINS.splice(i, 1);
      flash('已取消置顶');
    } else {
      if (PINS.length >= MAX_PINS) {
        /* 满了：肥鱼跳出来劝阻，同时在列表上方留一句提示 */
        if (window.OCFish) window.OCFish.pinFull();
        flash('最多置顶 ' + MAX_PINS + ' 门课程，先取消一个吧');
        return;
      }
      PINS.push(id);
      flash('已置顶（' + PINS.length + '/' + MAX_PINS + '）');
    }
    persistPins();
    render(VIEW.list, VIEW.q);
  }

  cardsEl.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-pin]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    togglePin(btn.getAttribute('data-pin'));
  });

  /* ---------- 事件 ---------- */
  let timer = null;
  $('#q').addEventListener('input', e => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => search(v), 90);
  });
  $('#q').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      search(e.target.value);
      const first = cardsEl.querySelector('.ccard:not(.ccard-add)');
      if (first && norm(e.target.value)) first.click();
    }
    if (e.key === 'Escape') { e.target.value = ''; search(''); }
  });
  $('#clear').addEventListener('click', () => { $('#q').value = ''; search(''); $('#q').focus(); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); }
  });

  render(INDEX, '');
})();

/* ---------- 页脚：显示数据构建时间，方便判断新旧 ---------- */
(function () {
  var el = document.getElementById('buildline');
  if (!el) return;
  var r = window.OC_RETENTION || {};
  if (!r.generatedAt) return;
  var d = new Date(r.generatedAt);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var s = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
          ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  el.textContent = '题库数据更新于 ' + s + '（若刚更新过看不到，刷新一次即可）';
  /* 有构建版本号就带上，方便核对是不是最新一次部署 */
  fetch('data/build-info.json', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(v => { if (v && v.commit) el.textContent = '题库数据更新于 ' + s + ' · 版本 ' + v.commit; })
    .catch(() => {});
})();
