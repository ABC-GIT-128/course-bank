/* 英语四级 · 背单词
 * - 词库自己录（单条 / 批量粘贴），存 localStorage
 * - 简化 SM-2：认识 → 间隔 1/3/7/15/30 天；模糊 → 保持、明天再来；不认识 → 归零、明天再来
 * - 每天 10 个新词上限，复习优先
 * - 与全局大肥鱼联动：认识算一次连对，不认识算一次答错
 */
(function () {
  const K_WORDS = 'oc_vocab_words';
  const K_CFG = 'oc_vocab_cfg';
  const IV = [0, 1, 3, 7, 15, 30];   /* box 0~5 对应的间隔天数：第一次认识 → 明天，再 → 3 天… */
  const BOX_MAX = 5;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  /* ---------- 存储 ---------- */
  function loadWords() {
    try {
      const v = JSON.parse(localStorage.getItem(K_WORDS) || '[]');
      return Array.isArray(v) ? v.filter(w => w && w.en && w.zh) : [];
    } catch (e) { return []; }
  }
  function loadCfg() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(K_CFG) || '{}'); } catch (e) {}
    return { dailyNew: Number(c.dailyNew) > 0 ? Number(c.dailyNew) : 10 };
  }

  let words = loadWords();
  const cfg = loadCfg();

  /* 写盘防抖（连续作答时合并） */
  const debounce = (window.OCFish && window.OCFish.debounce)
    ? window.OCFish.debounce
    : function (fn, wait) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), wait); }; };
  const persist = debounce(() => {
    try { localStorage.setItem(K_WORDS, JSON.stringify(words)); } catch (e) {}
  }, 250);
  function persistNow() {
    try { localStorage.setItem(K_WORDS, JSON.stringify(words)); } catch (e) {}
  }

  /* ---------- 队列 ---------- */
  let queue = [];
  let pos = 0;
  let flipped = false;
  let answered = 0;
  let session = { yes: 0, fuzzy: 0, no: 0 };

  function newQuotaLeft() {
    const t = today();
    const used = words.filter(w => w.firstAt === t).length;
    return Math.max(0, cfg.dailyNew - used);
  }

  function buildQueue() {
    const t = today();
    const review = words
      .filter(w => w.learned && w.due && w.due <= t)
      .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    const fresh = words.filter(w => !w.learned).slice(0, newQuotaLeft());
    queue = review.concat(fresh);
    pos = 0; answered = 0; session = { yes: 0, fuzzy: 0, no: 0 };
  }

  /* ---------- 渲染卡片 ---------- */
  const cardEl = $('#vcard');
  const btnsEl = $('#vbtns');
  const nextEl = $('#vnext');
  const doneEl = $('#vdone');
  const studyEl = $('#study');

  function current() { return queue[pos]; }

  function renderCard() {
    const w = current();
    if (!w) { showDone(); return; }
    flipped = false;
    cardEl.classList.remove('flipped');
    btnsEl.hidden = true;
    nextEl.hidden = true;
    doneEl.hidden = true;

    $('#vtag').textContent = w.learned ? ('第 ' + (w.reps + 1) + ' 次') : '新词';
    $('#ven').textContent = w.en;
    $('#vph').textContent = w.ph ? '/' + w.ph + '/' : '';
    $('#vzh').textContent = w.zh;
    const dueTxt = w.learned ? ('上次 ' + (w.last || '—') + ' · 已复习 ' + w.reps + ' 次') : '第一次见';
    $('#vmeta').textContent = dueTxt + (w.lapses ? (' · 忘过 ' + w.lapses + ' 次') : '');
    updateStat();
  }

  function flip() {
    if (flipped || !current()) return;
    flipped = true;
    cardEl.classList.add('flipped');
    btnsEl.hidden = false;
  }

  function updateStat() {
    const t = today();
    const dueN = words.filter(w => w.learned && w.due && w.due <= t).length;
    const freshN = words.filter(w => !w.learned).length;
    const total = queue.length || 1;
    $('#bar').style.width = Math.round(answered / total * 100) + '%';
    $('#stat').textContent = '本轮 ' + answered + '/' + queue.length +
      ' · 待复习 ' + dueN + ' · 未学 ' + freshN + ' · 词库 ' + words.length;
    const d = new Date();
    $('#vday').textContent = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  /* ---------- 作答 ---------- */
  function answer(kind) {
    const w = current();
    if (!w || !flipped) return;
    const t = today();
    w.reps = (w.reps || 0) + 1;
    w.last = t;
    w.firstAt = w.firstAt || t;
    w.learned = true;

    if (kind === 'yes') {
      w.box = Math.min((w.box || 0) + 1, BOX_MAX);
      w.due = addDays(t, IV[w.box]);
      session.yes++;
      if (window.OCFish) window.OCFish.correct();
    } else if (kind === 'fuzzy') {
      w.due = addDays(t, 1);
      session.fuzzy++;
    } else {
      w.box = 0;
      w.due = addDays(t, 1);
      w.lapses = (w.lapses || 0) + 1;
      session.no++;
      if (window.OCFish) window.OCFish.wrong();
    }

    answered++;
    persist();
    pos++;
    if (pos >= queue.length) showDone();
    else { renderCard(); }
  }

  function showDone() {
    cardEl.style.display = 'none';
    btnsEl.hidden = true;
    nextEl.hidden = true;
    doneEl.hidden = false;
    $('#bar').style.width = '100%';
    const t = today();
    const tomorrow = addDays(t, 1);
    const dueN = words.filter(w => w.due === tomorrow).length;
    const laterN = words.filter(w => w.due > tomorrow).length;
    const freshN = words.filter(w => !w.learned).length;
    $('#vdoneText').textContent =
      '认识 ' + session.yes + ' · 模糊 ' + session.fuzzy + ' · 不认识 ' + session.no +
      '。明天要复习 ' + dueN + ' 个' + (laterN ? '，之后还有 ' + laterN + ' 个排着' : '') +
      '，词库里还有 ' + freshN + ' 个没学。';
    if (!queue.length) {
      $('#vdoneText').textContent = words.length
        ? '今天的复习都做完了，也没有新词可以学（每日上限 ' + cfg.dailyNew + ' 个）。'
        : '词库还是空的，先在下面「添加单词」里粘一批进来吧。';
    } else if (pos > 0 && window.OCFish && answered > 0) {
      window.OCFish.say('今日任务搞定，肥鱼允许你去玩会儿游戏！', 'super');
    }
    updateStat();
  }

  /* ---------- 解析一行 ---------- */
  function parseLine(raw) {
    let line = String(raw || '').replace(/\u3000/g, ' ').trim();
    if (!line) return null;
    line = line.replace(/^\s*(?:\d+[.、)）]\s*|[-*·•]\s*)/, '').trim();
    if (!line) return null;

    let ph = '';
    const mPh = line.match(/[\/\[]([^\/\]]{1,40})[\/\]]/);
    if (mPh) { ph = mPh[1].trim(); line = line.replace(mPh[0], ' ').replace(/\s{2,}/g, ' ').trim(); }

    let en = '', zh = '';
    if (/\t/.test(line)) {
      const p = line.split('\t');
      en = p[0]; zh = p.slice(1).join(' ');
    } else if (/[,，;；]/.test(line)) {
      const i = line.search(/[,，;；]/);
      en = line.slice(0, i); zh = line.slice(i + 1);
    } else {
      /* 英文在前、中文在后：以第一个汉字为分界，能处理 give up 放弃 这种词组 */
      const i = line.search(/[\u4e00-\u9fa5]/);
      if (i > 0) { en = line.slice(0, i); zh = line.slice(i); }
      else {
        const m = line.match(/^(\S+)[\s:：\-]+(.*)$/);
        if (m) { en = m[1]; zh = m[2]; } else { en = line; zh = ''; }
      }
    }

    en = en.replace(/[\s:：\-]+$/, '').trim();
    zh = zh.replace(/^[\s:：\-]+/, '').trim();
    if (!en || !zh) return null;
    if (!/^[A-Za-z][A-Za-z'’.\- ]{0,40}$/.test(en)) return null;
    return { en: en.replace(/\s{2,}/g, ' '), zh: zh, ph: ph };
  }

  function addWords(list) {
    const exists = {};
    words.forEach(w => { exists[w.en.toLowerCase()] = 1; });
    const t = today();
    let added = 0, dup = 0, bad = 0;
    list.forEach(item => {
      const rec = typeof item === 'string' ? parseLine(item) : item;
      if (!rec) { bad++; return; }
      const key = rec.en.toLowerCase();
      if (exists[key]) { dup++; return; }
      exists[key] = 1;
      words.push({
        id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        en: rec.en, zh: rec.zh, ph: rec.ph || '',
        box: 0, due: t, reps: 0, lapses: 0, learned: false,
        added: t, firstAt: ''
      });
      added++;
    });
    persistNow();
    renderBank();
    buildQueue();
    renderCard();
    return { added, dup, bad };
  }

  /* ---------- 词库列表 ---------- */
  function renderBank() {
    $('#bankCount').textContent = words.length + ' 词';
    $('#vwords').innerHTML = words.slice(0, 300).map(w =>
      '<li><b>' + esc(w.en) + '</b> <span class="vz">' + esc(w.zh) + '</span>' +
      (w.learned ? '<i class="vbox">第' + (w.box + 1) + '档</i>' : '<i class="vbox new">未学</i>') +
      '<button class="vdel" data-del="' + esc(w.id) + '" title="删除">×</button></li>'
    ).join('') || '<li class="muted">还没有单词</li>';
  }

  /* ---------- 事件 ---------- */
  cardEl.addEventListener('click', flip);
  btnsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (b) answer(b.getAttribute('data-k'));
  });
  $('#btnNext').addEventListener('click', () => { pos++; if (pos >= queue.length) showDone(); else renderCard(); });
  $('#btnAgain').addEventListener('click', () => {
    cardEl.style.display = '';
    buildQueue();
    if (!queue.length) { showDone(); return; }
    renderCard();
  });

  $('#btnBulk').addEventListener('click', () => {
    const raw = $('#bulk').value;
    const lines = raw.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { $('#bulkHint').textContent = '先粘点内容进来'; return; }
    const r = addWords(lines);
    $('#bulkHint').textContent = '导入 ' + r.added + ' 个' +
      (r.dup ? '，重复 ' + r.dup : '') + (r.bad ? '，无法识别 ' + r.bad : '');
    if (r.added) $('#bulk').value = '';
  });

  $('#btnOne').addEventListener('click', () => {
    const en = $('#fEn').value.trim(), zh = $('#fZh').value.trim(), ph = $('#fPh').value.trim();
    if (!en || !zh) { $('#bulkHint').textContent = '英文和中文都要填'; return; }
    const r = addWords([{ en, zh, ph }]);
    $('#bulkHint').textContent = r.added ? '已添加' : '这个词已经在词库里了';
    if (r.added) { $('#fEn').value = ''; $('#fZh').value = ''; $('#fPh').value = ''; }
  });

  $('#vwords').addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const id = b.getAttribute('data-del');
    words = words.filter(w => w.id !== id);
    persistNow();
    renderBank();
    buildQueue();
    renderCard();
  });

  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vocab-' + today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });

  $('#btnClear').addEventListener('click', () => {
    if (!words.length) return;
    if (!confirm('清空词库？' + words.length + ' 个单词和复习进度都会删除，不能撤销。')) return;
    words = [];
    persistNow();
    renderBank();
    buildQueue();
    renderCard();
  });

  /* ---------- 启动 ---------- */
  renderBank();
  buildQueue();
  if (queue.length) renderCard();
  else showDone();
})();
