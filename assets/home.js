/* 首页逻辑：搜索（中文二元组匹配）+ 课程卡片渲染 */
(function () {
  const COURSES = window.OC_COURSES || [];
  const RET = window.OC_RETENTION || { keepYears: 2, cutoff: new Date().getFullYear() - 1 };

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    const terms = c.terms.map(t => '<span class="term">' + esc(c.termLabels[t] || t) + '</span>').join('') +
      (c.status === 'archived' ? '<span class="term pill-arc">归档</span>' : '');
    const hid = c.hidden ? '<i class="hiddennote">' + c.hidden + ' 题已下架</i>' : '';
    const typeLine = ['choice', 'fill', 'term', 'calc']
      .filter(k => c.tags[k])
      .map(k => ({ choice: '选择', fill: '填空', term: '名词解释', calc: '计算' }[k] + ' ' + c.tags[k]))
      .join(' · ');
    return '<a class="ccard' + (c.status === 'archived' ? ' is-arc' : '') + '" href="' + encodeURIComponent(c.id) + '/">' +
      '<div class="cchd"><h3>' + esc(c.title) + '</h3>' + terms + '</div>' +
      '<p class="ccsub">' + esc(c.subtitle || '') + '</p>' +
      '<p class="ccmeta">' + esc(c.college) + ' · <b>' + c.count + '</b> 题 · ' + c.chapters.length + ' 章 · 更新 ' + esc(c.updatedAt) + '</p>' +
      '<p class="cctypes">' + esc(typeLine) + (hid ? ' · ' + hid : '') + '</p>' +
      '<div class="ccfoot">' + tagOf(c) + '<span class="go">' + (c.status === 'archived' ? '查看归档 →' : '开始练习 →') + '</span></div>' +
      '</a>';
  }

  /* ---------- 渲染 ---------- */
  const cardsEl = $('#cards');
  const emptyEl = $('#empty');
  const titleEl = $('#listtitle');
  const metaEl = $('#listmeta');

  function render(list, q) {
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
      cardsEl.innerHTML = '<div class="grid">' + items.map(card).join('') + '</div>';
      titleEl.textContent = '搜索结果';
      metaEl.textContent = '共 ' + items.length + ' 门 · ' +
        items.reduce((s, c) => s + c.count, 0) + ' 题，关键词「' + q + '」';
      return;
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
    cardsEl.innerHTML = html;

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
