/* 英语四级 · 背单词（12 单元 × 4 课 + 艾宾浩斯按课复习）
 *
 * 设计要点
 * - 词库自己录；单词按录入顺序自动填进 48 课（每课 N 个，可调）
 * - 复习以「课」为单位：勾一下就算复习完，不逐词排期
 * - 遗忘曲线：学完当天算第 0 天，之后第 1、3、7、14、29 天各复习一次，第 5 次复习完成即「已完成」
 * - 到期未复习会一直留在「今天」列表里，并标出逾期天数
 */
(function () {
  const K_W = 'oc_vocab_words';
  const K_L = 'oc_vocab_lessons';
  const K_C = 'oc_vocab_cfg';

  const UNITS = 12;
  const PER_UNIT = 4;
  const TOTAL = UNITS * PER_UNIT;          /* 48 课 */
  const OFF = [1, 3, 7, 14, 29];           /* 累计天数：+1 / +3 / +7 / +14 / +29 */

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
  function diffDays(from, to) {
    const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  /* ---------- 存储 ---------- */
  function loadJSON(k, dflt) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || 'null');
      return v == null ? dflt : v;
    } catch (e) { return dflt; }
  }
  let words = loadJSON(K_W, []);
  if (!Array.isArray(words)) words = [];
  let lessons = loadJSON(K_L, {});
  if (!lessons || typeof lessons !== 'object') lessons = {};
  let cfg = loadJSON(K_C, {});
  const perLesson = Number(cfg.perLesson) > 0 ? Number(cfg.perLesson) : 25;

  const debounce = (window.OCFish && window.OCFish.debounce)
    ? window.OCFish.debounce
    : function (fn, wait) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), wait); }; };

  const saveWords = debounce(() => {
    try { localStorage.setItem(K_W, JSON.stringify(words)); } catch (e) {}
  }, 250);
  const saveLessons = debounce(() => {
    try { localStorage.setItem(K_L, JSON.stringify(lessons)); } catch (e) {}
  }, 150);
  function saveAllNow() {
    try { localStorage.setItem(K_W, JSON.stringify(words)); } catch (e) {}
    try { localStorage.setItem(K_L, JSON.stringify(lessons)); } catch (e) {}
  }

  /* ---------- 课 id 与单词归属 ---------- */
  const lessonId = (u, l) => u + '-' + l;
  function parseId(id) {
    const p = String(id).split('-');
    return { u: Number(p[0]), l: Number(p[1]) };
  }
  const label = id => {
    const { u, l } = parseId(id);
    return 'U' + u + ' · L' + l;
  };

  function bucket(wordsPerLesson) {
    /* 按录入顺序分桶；已有 lsn 的保持不动 */
    const order = words.slice().sort((a, b) => (a.added || '') < (b.added || '') ? -1 : 1);
    let next = 0;
    const counts = new Array(TOTAL).fill(0);
    words.forEach(w => { if (typeof w.lsn === 'number' && w.lsn >= 0) counts[w.lsn]++; });
    order.forEach(w => {
      if (typeof w.lsn === 'number' && w.lsn >= 0 && w.lsn < TOTAL) return;
      while (next < TOTAL && counts[next] >= wordsPerLesson) next++;
      if (next >= TOTAL) { w.lsn = -1; return; }
      w.lsn = next;
      counts[next]++;
    });
  }
  bucket(perLesson);

  function slotOf(id) {
    const { u, l } = parseId(id);
    return (u - 1) * PER_UNIT + (l - 1);
  }
  function wordsOf(id) {
    const idx = slotOf(id);
    return words.filter(w => w.lsn === idx);
  }
  function countOf(id) {
    const idx = slotOf(id);
    return words.filter(w => w.lsn === idx).length;
  }

  /* ---------- 状态 ---------- */
  const t0 = today();
  function stateOf(id) {
    const rec = lessons[id];
    const n = countOf(id);
    if (!n) return { key: 'empty', text: '没有单词' };
    if (!rec || !rec.at) return { key: 'new', text: '未学' };
    if (rec.round >= OFF.length) return { key: 'done', text: '已完成' };
    if (rec.due && rec.due <= t0) {
      const late = diffDays(rec.due, t0);
      return { key: 'due', text: '待复习' + (late > 0 ? '（逾期 ' + late + ' 天）' : ''), late: late };
    }
    return { key: 'wait', text: '下次 ' + (rec.due || '—') };
  }

  function dueList() {
    return Object.keys(lessons)
      .filter(id => lessons[id] && lessons[id].at && lessons[id].round < OFF.length &&
        lessons[id].due && lessons[id].due <= t0)
      .sort((a, b) => (lessons[a].due < lessons[b].due ? -1 : 1));
  }

  function nextNewLesson() {
    for (let u = 1; u <= UNITS; u++) {
      for (let l = 1; l <= PER_UNIT; l++) {
        const id = lessonId(u, l);
        if (!lessons[id] && countOf(id) > 0) return id;
      }
    }
    return '';
  }

  function progress() {
    let n = 0;
    for (let u = 1; u <= UNITS; u++) for (let l = 1; l <= PER_UNIT; l++) {
      if (lessons[lessonId(u, l)]) n++;
    }
    return n;
  }

  /* ---------- 顶部信息 ---------- */
  function updateHead() {
    const d = new Date();
    $('#vday').textContent = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    const due = dueList().length;
    const learned = progress();
    $('#stat').textContent = '已学 ' + learned + '/' + TOTAL + ' 课 · 今日待复习 ' + due +
      ' · 词库 ' + words.length + ' 词';
    $('#bar').style.width = Math.round(learned / TOTAL * 100) + '%';
    $('#capTip').textContent = '每课 ' + perLesson + ' 词 · 总容量 ' + TOTAL * perLesson + ' 词';
  }

  /* ---------- 今日 ---------- */
  function renderToday() {
    const list = dueList();
    $('#dueCount').textContent = list.length;
    $('#dueEmpty').hidden = list.length > 0;
    $('#dueList').innerHTML = list.map(id => {
      const rec = lessons[id];
      const st = stateOf(id);
      return '<li data-due="' + id + '">' +
        '<span class="dname">' + label(id) + '<i class="dround">第 ' + (rec.round + 1) + ' 次复习</i></span>' +
        '<span class="dmeta">' + (st.late > 0 ? '<b class="late">逾期 ' + st.late + ' 天</b>' : '今天到期') +
        ' · 上次 ' + ((rec.hist && rec.hist.length) ? rec.hist[rec.hist.length - 1] : rec.at) + '</span>' +
        '<button class="btn plain dbtn" data-done="' + id + '">已复习</button>' +
        '</li>';
    }).join('');

    const nx = nextNewLesson();
    const nxEl = $('#nextLesson');
    if (nx) {
      nxEl.textContent = label(nx) + '（' + countOf(nx) + ' 词）';
      $('#btnLearn').disabled = false;
      $('#btnLearn').textContent = '开始学这一课';
    } else if (words.length && progress() >= TOTAL) {
      nxEl.textContent = '48 课都学过了';
      $('#btnLearn').disabled = true;
      $('#btnLearn').textContent = '没有新课';
    } else {
      nxEl.textContent = '词库还没单词';
      $('#btnLearn').disabled = true;
      $('#btnLearn').textContent = '先加单词';
    }

    $('#todayTip').textContent = list.length ? '先复习，再学新的' : (nx ? '今天没有到期复习' : '');
    updateHead();
  }

  /* ---------- 课程表 ---------- */
  function unitRow(u, editable, selected) {
    let cells = '';
    for (let l = 1; l <= PER_UNIT; l++) {
      const id = lessonId(u, l);
      const st = stateOf(id);
      const n = countOf(id);
      const on = !!(selected && selected.indexOf(id) >= 0);
      const dis = editable ? (st.key === 'empty' || (st.key !== 'new' && !on)) : false;
      cells += '<button class="lsn st-' + st.key + (on ? ' on' : '') + (dis ? ' dis' : '') + '"' +
        ' data-lsn="' + id + '"' + (dis ? ' disabled' : '') +
        ' title="' + esc(label(id) + ' · ' + st.text + ' · ' + n + ' 词') + '">' +
        'L' + l + '<i>' + (st.key === 'empty' ? '空' : n + ' 词') + '</i>' +
        '</button>';
    }
    return '<div class="unit"><span class="uname">U' + u + '</span><div class="ulsn">' + cells + '</div></div>';
  }

  function renderPlan() {
    let html = '';
    for (let u = 1; u <= UNITS; u++) html += unitRow(u, false, null);
    $('#units').innerHTML = html;
  }

  /* ---------- 勾选面板 ---------- */
  let picked = [];
  function renderPick() {
    let html = '';
    for (let u = 1; u <= UNITS; u++) html += unitRow(u, true, picked);
    $('#pickUnits').innerHTML = html;
    $('#pickN').textContent = picked.length;
  }

  /* ---------- 课程记录 ---------- */
  function markLearned(id) {
    const t = today();
    const rec = lessons[id];
    if (rec && rec.at) return reviewDone(id);      /* 学过就当作复习 */
    lessons[id] = { at: t, round: 0, due: addDays(t, OFF[0]), hist: [t] };
    saveLessons();
    return 'learned';
  }
  function reviewDone(id) {
    const rec = lessons[id];
    if (!rec || !rec.at) return '';
    /* 今天已经复习过就不再推进，避免连点把整轮刷完 */
    const hist = rec.hist || [rec.at];
    if (hist[hist.length - 1] === today()) return 'same-day';
    rec.round = (rec.round || 0) + 1;
    rec.hist = rec.hist || [rec.at];
    rec.hist.push(today());
    if (rec.round >= OFF.length) {
      rec.due = '';
      rec.finishedAt = today();
    } else {
      rec.due = addDays(rec.at, OFF[rec.round]);
    }
    saveLessons();
    return 'reviewed';
  }

  /* ---------- 学习模式 ---------- */
  let study = { id: '', words: [], pos: 0, flipped: false, stat: { yes: 0, fuzzy: 0, no: 0 } };

  function openStudy(id) {
    const ws = wordsOf(id);
    if (!ws.length) return;
    study = { id: id, words: ws, pos: 0, flipped: false, stat: { yes: 0, fuzzy: 0, no: 0 } };
    $('#study').hidden = false;
    $('#vdone').hidden = true;
    $('#vcard').style.display = '';
    $('#vbtns').hidden = true;
    $('#studyTitle').textContent = label(id) + ' · 共 ' + ws.length + ' 词';
    $('#study').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showCard();
  }
  function closeStudy() {
    $('#study').hidden = true;
    renderAll();
  }
  function showCard() {
    const w = study.words[study.pos];
    if (!w) { finishStudy(); return; }
    study.flipped = false;
    $('#vcard').classList.remove('flipped');
    $('#vbtns').hidden = true;
    $('#vtag').textContent = (study.pos + 1) + ' / ' + study.words.length;
    $('#ven').textContent = w.en;
    $('#vph').textContent = w.ph ? '/' + w.ph + '/' : '';
    $('#vzh').textContent = w.zh;
    $('#vmeta').textContent = (w.lapses ? '记错过 ' + w.lapses + ' 次 · ' : '') + label(study.id);
    $('#studyProgress').textContent = (study.pos + 1) + ' / ' + study.words.length;
  }
  function answer(kind) {
    if (!study.flipped) return;
    const w = study.words[study.pos];
    w.reps = (w.reps || 0) + 1;
    if (kind === 'yes') {
      w.learned = true;
      study.stat.yes++;
      if (window.OCFish) window.OCFish.correct();
    } else if (kind === 'fuzzy') {
      w.learned = true;
      study.stat.fuzzy++;
    } else {
      w.lapses = (w.lapses || 0) + 1;
      study.stat.no++;
      if (window.OCFish) window.OCFish.wrong();
    }
    saveWords();
    study.pos++;
    if (study.pos >= study.words.length) finishStudy(); else showCard();
  }
  function finishStudy() {
    $('#vcard').style.display = 'none';
    $('#vbtns').hidden = true;
    $('#vdone').hidden = false;
    const s = study.stat;
    $('#vdoneText').textContent = '认识 ' + s.yes + ' · 模糊 ' + s.fuzzy + ' · 不认识 ' + s.no +
      '。记下来之后，明天会自动出现在复习列表里。';
    $('#studyProgress').textContent = study.words.length + ' / ' + study.words.length;
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

  function countIn(l) { return words.filter(w => w.lsn === l).length; }

  function addWords(list) {
    const exists = {};
    words.forEach(w => { exists[w.en.toLowerCase()] = 1; });
    const t = today();
    let added = 0, dup = 0, bad = 0, over = 0;

    list.forEach(item => {
      const rec = typeof item === 'string' ? parseLine(item) : item;
      if (!rec) { bad++; return; }
      const key = rec.en.toLowerCase();
      if (exists[key]) { dup++; return; }
      exists[key] = 1;

      let slot = -1;
      for (let i = 0; i < TOTAL; i++) { if (countIn(i) < perLesson) { slot = i; break; } }
      if (slot < 0) { over++; return; }

      words.push({
        id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        en: rec.en, zh: rec.zh, ph: rec.ph || '',
        lsn: slot, reps: 0, lapses: 0, learned: false,
        added: t
      });
      added++;
    });

    saveAllNow();
    renderAll();
    return { added, dup, bad, over };
  }

  /* ---------- 词库列表 ---------- */
  function renderBank() {
    $('#bankCount').textContent = words.length + ' 词';
    const sorted = words.slice().sort((a, b) => (a.lsn || 0) - (b.lsn || 0));
    $('#vwords').innerHTML = sorted.slice(0, 300).map(w => {
      const id = (typeof w.lsn === 'number' && w.lsn >= 0)
        ? lessonId(Math.floor(w.lsn / PER_UNIT) + 1, w.lsn % PER_UNIT + 1) : '';
      return '<li><b>' + esc(w.en) + '</b><span class="vz">' + esc(w.zh) + '</span>' +
        (id ? '<i class="vbox">' + label(id) + '</i>' : '<i class="vbox new">未分课</i>') +
        (w.lapses ? '<i class="vbox new">错' + w.lapses + '</i>' : '') +
        '<button class="vdel" data-del="' + esc(w.id) + '" title="删除">×</button></li>';
    }).join('') || '<li class="muted">还没有单词</li>';
  }

  function renderAll() {
    renderToday();
    renderPlan();
    renderBank();
    if (!$('#pickBox').hidden) renderPick();
  }

  /* ---------- 事件 ---------- */
  $('#vcard').addEventListener('click', () => {
    if (study.flipped) return;
    study.flipped = true;
    $('#vcard').classList.add('flipped');
    $('#vbtns').hidden = false;
  });
  $('#vbtns').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (b) answer(b.getAttribute('data-k'));
  });
  $('#btnLearn').addEventListener('click', () => {
    const nx = nextNewLesson();
    if (nx) openStudy(nx);
  });
  $('#btnStudyExit').addEventListener('click', closeStudy);
  $('#btnFinish').addEventListener('click', () => {
    markLearned(study.id);
    const due = lessons[study.id] && lessons[study.id].due;
    if (window.OCFish) {
      window.OCFish.say('这一课记下了，' + (due ? '下次复习 ' + due : '已完成全部复习') + '。', 'combo');
    }
    closeStudy();
  });
  $('#btnFinishSkip').addEventListener('click', closeStudy);

  $('#dueList').addEventListener('click', e => {
    const b = e.target.closest('[data-done]');
    if (!b) return;
    reviewDone(b.getAttribute('data-done'));
    renderToday();
    renderPlan();
    if (window.OCFish) window.OCFish.correct();
  });

  $('#btnPick').addEventListener('click', () => {
    picked = [];
    renderPick();
    $('#pickBox').hidden = false;
    $('#pickBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#btnPickCancel').addEventListener('click', () => {
    picked = [];
    $('#pickBox').hidden = true;
  });
  $('#pickUnits').addEventListener('click', e => {
    const b = e.target.closest('[data-lsn]');
    if (!b || b.disabled) return;
    const id = b.getAttribute('data-lsn');
    const i = picked.indexOf(id);
    if (i >= 0) picked.splice(i, 1); else picked.push(id);
    renderPick();
  });
  $('#btnPickOk').addEventListener('click', () => {
    if (!picked.length) return;
    picked.forEach(id => markLearned(id));
    const n = picked.length;
    picked = [];
    $('#pickBox').hidden = true;
    renderAll();
    if (window.OCFish) window.OCFish.say('记下 ' + n + ' 课，明天开始按曲线复习。', 'combo');
  });

  $('#units').addEventListener('click', e => {
    const b = e.target.closest('[data-lsn]');
    if (!b || b.disabled) return;
    const id = b.getAttribute('data-lsn');
    if (stateOf(id).key === 'empty') return;
    openStudy(id);
  });

  $('#btnBulk').addEventListener('click', () => {
    const raw = $('#bulk').value;
    const lines = raw.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { $('#bulkHint').textContent = '先粘点内容进来'; return; }
    const r = addWords(lines);
    $('#bulkHint').textContent = '导入 ' + r.added + ' 个' +
      (r.dup ? '，重复 ' + r.dup : '') + (r.bad ? '，无法识别 ' + r.bad : '') +
      (r.over ? '，超出容量 ' + r.over : '');
    if (r.added) $('#bulk').value = '';
  });

  $('#btnOne').addEventListener('click', () => {
    const en = $('#fEn').value.trim(), zh = $('#fZh').value.trim(), ph = $('#fPh').value.trim();
    if (!en || !zh) { $('#bulkHint').textContent = '英文和中文都要填'; return; }
    const r = addWords([{ en, zh, ph }]);
    $('#bulkHint').textContent = r.added ? '已添加' : (r.over ? '48 课都满了' : '这个词已经在词库里了');
    if (r.added) { $('#fEn').value = ''; $('#fZh').value = ''; $('#fPh').value = ''; }
  });

  $('#vwords').addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const id = b.getAttribute('data-del');
    words = words.filter(w => w.id !== id);
    saveAllNow();
    renderAll();
  });

  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ words: words, lessons: lessons, cfg: { perLesson: perLesson } }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vocab-' + today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });

  $('#btnClear').addEventListener('click', () => {
    if (!words.length && !Object.keys(lessons).length) return;
    if (!confirm('清空词库和全部复习记录？不能撤销。')) return;
    words = []; lessons = {};
    saveAllNow();
    renderAll();
  });

  $('#fPer').value = String(perLesson);
  $('#fPer').addEventListener('change', e => {
    const v = Number(e.target.value);
    if (!confirm('改成每课 ' + v + ' 词？已分好课的单词不重排，只影响之后新加的。')) {
      e.target.value = String(perLesson); return;
    }
    cfg.perLesson = v;
    localStorage.setItem(K_C, JSON.stringify(cfg));
    location.reload();
  });

  /* ---------- 启动 ---------- */
  renderAll();
})();
