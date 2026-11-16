/* 英语四级 · 背单词（12 单元 × 4 课 + 艾宾浩斯按课排期、按词抽考）
 *
 * 设计要点
 * - 词库自己录；单词按录入顺序自动填进 48 课（每课 N 个，可调）
 * - 排期以「课」为单位：一课一个 due，到点整课进「今天」
 * - 复习是「抽考」：进词卡逐词评认识 / 模糊 / 不认识，一批 BATCH 个。
 *   本轮没考过的词优先考，答错的词排在最前面并当批重考一次，
 *   所以几轮下来全课的词都会轮一遍，不用一次背完整课。
 * - 遗忘曲线：学完当天算第 0 天，之后第 1、3、7、14、29 天各复习一次，第 5 次复习完成即「已完成」
 * - 间隔从「上次复习日」往后推（不是从首次学习日），逾期久了不会连环补点；
 *   逾期超过 2 倍间隔视为淡忘，这一课退回上一轮
 * - 到期未复习会一直留在「今天」列表里，并标出逾期天数
 */
(function () {
  const K_W = 'oc_vocab_words';
  const K_L = 'oc_vocab_lessons';
  const K_C = 'oc_vocab_cfg';
  const K_D = 'oc_vocab_dark';

  const UNITS = 12;
  const PER_UNIT = 4;
  const TOTAL = UNITS * PER_UNIT;          /* 48 课 */
  const OFF = [1, 3, 7, 14, 29];           /* 累计天数：+1 / +3 / +7 / +14 / +29 */
  const GAP = OFF.map((v, i) => (i ? v - OFF[i - 1] : v));   /* 每次复习距上次：1 / 2 / 4 / 7 / 15 */
  const BATCH = 20;                        /* 一批多少个词 */

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

  /* ---------- 连续学习天数（从今天/昨天往回数） ---------- */
  function streak() {
    const days = {};
    Object.keys(lessons).forEach(id => {
      const r = lessons[id];
      if (!r) return;
      if (r.at) days[r.at] = 1;
      (r.hist || []).forEach(d => { days[d] = 1; });
    });
    let n = 0;
    let d = today();
    if (!days[d]) d = addDays(d, -1);       /* 今天还没学，允许从昨天起算 */
    while (days[d]) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ---------- 深色模式 ---------- */
  function applyDark(on, save) {
    document.body.classList.toggle('dark', on);
    const b = $('#btnDark');
    if (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? '☀️' : '🌙';
      b.title = on ? '切换到浅色' : '切换到深色';
    }
    if (save) { try { localStorage.setItem(K_D, on ? '1' : '0'); } catch (e) {} }
  }
  (function initDark() {
    let on;
    try { on = localStorage.getItem(K_D); } catch (e) { on = null; }
    if (on == null) {
      on = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } else {
      on = on === '1';
    }
    applyDark(on, false);
  })();

  /* ---------- AI 提示词（复制后丢给 AI，按固定格式吐单词） ---------- */
  const PROMPT_TEXT = [
    '你是单词整理助手。请把下面我给你的单词内容（可能来自 PDF、讲义、表格或照片）整理成纯文本，每行一个单词，严格按这两种格式之一输出：',
    '',
    '  格式 A（有音标）：英文单词 /音标/ 中文释义',
    '  格式 B（无音标）：英文单词 中文释义',
    '',
    '要求：',
    '1. 每行只一个单词，不要序号、不要 Markdown、不要分组标题或空行解释',
    '2. 英文在前，中文在后；词组保留空格（如 take off 起飞）',
    '3. 多个中文释义用顿号「、」连接；没有音标就用格式 B',
    '4. 只输出整理后的行，不要任何前言、总结或代码块标记',
    '5. 看不清或不确定的词宁可跳过，不要瞎编',
    '',
    '现在开始整理以下内容：',
    '【在这里粘贴或上传你的内容】'
  ].join('\n');

  /* ---------- 文件 → 行 ---------- */
  function jsonToLines(data) {
    const out = [];
    const push = o => {
      if (!o || typeof o !== 'object') return;
      const en = String(o.word || o.en || '').trim();
      const zh = String(o.meaning || o.zh || '').trim();
      const ph = String(o.phonetic || o.ph || '').trim();
      if (en) out.push({ en: en, zh: zh, ph: ph });
    };
    if (Array.isArray(data)) data.forEach(push);
    else if (data && Array.isArray(data.units))
      data.units.forEach(u => (u.lessons || []).forEach(l => (l.words || []).forEach(push)));
    else if (data && Array.isArray(data.words)) data.words.forEach(push);
    return out;
  }
  function importFile(f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const text = String(rd.result || '');
      let lines = [];
      if (/\.json$/i.test(f.name)) {
        try { lines = jsonToLines(JSON.parse(text)); }
        catch (e) { $('#bulkHint').textContent = 'JSON 解析失败：' + e.message; return; }
      } else {
        lines = text.split(/\r?\n/).filter(l => l.trim());
      }
      if (!lines.length) { $('#bulkHint').textContent = '没有从「' + f.name + '」里解析到单词'; return; }
      const r = addWords(lines);
      $('#bulkHint').textContent = '从「' + f.name + '」导入 ' + r.added + ' 个' +
        (r.dup ? '，重复 ' + r.dup : '') + (r.bad ? '，无法识别 ' + r.bad : '');
    };
    rd.onerror = () => { $('#bulkHint').textContent = '读取文件失败'; };
    rd.readAsText(f, 'utf-8');
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

  /* ---------- 内置词库：按 教材 unit/lesson 落到对应课 ---------- */
  const SEED = window.OC_VOCAB_SEED || null;
  let seedAdded = 0;
  function seedMerge() {
    if (!SEED || !Array.isArray(SEED.units)) return 0;
    const ver = SEED.version || 'v1';
    if (cfg.seedVersion === ver) return 0;
    const exists = {};
    words.forEach(w => { exists[w.en.toLowerCase()] = 1; });
    let added = 0;
    SEED.units.forEach(u => {
      (u.lessons || []).forEach(l => {
        const slot = (Number(u.unit) - 1) * PER_UNIT + (Number(l.lesson) - 1);
        if (slot < 0 || slot >= TOTAL) return;
        (l.words || []).forEach((a, i) => {
          const en = String(a[0] || '').trim();
          const zh = String(a[2] || '').trim();
          if (!en || !zh) return;
          const key = en.toLowerCase();
          if (exists[key]) return;
          exists[key] = 1;
          words.push({
            id: 's' + u.unit + '-' + l.lesson + '-' + i,
            en: en, zh: zh, ph: String(a[1] || '').trim(),
            lsn: slot, reps: 0, lapses: 0, learned: false,
            added: today(), seed: 1
          });
          added++;
        });
      });
    });
    cfg.seedVersion = ver;
    try { localStorage.setItem(K_C, JSON.stringify(cfg)); } catch (e) {}
    if (added) saveAllNow();
    return added;
  }

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
  seedAdded = seedMerge();
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
    $('#capTip').textContent = '自建词每课上限 ' + perLesson + ' 个 · 新课每批 ' + BATCH +
      ' 词 · 复习每轮抽考约 ' + BATCH + ' 词' +
      (SEED ? (' · 内置《' + (SEED.book || '') + '》' + (SEED.scope || '')) : '');
    const sn = $('#streakN');
    if (sn) sn.textContent = streak();
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
        '<button class="btn plain dbtn" data-review="' + id + '">开始复习</button>' +
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
    if (rec && rec.at) return '';                  /* 已经排过复习的课不覆盖 */
    lessons[id] = { at: t, round: 0, due: addDays(t, GAP[0]), lastAt: t, hist: [t] };
    saveLessons();
    return 'learned';
  }

  /* 推进一课的复习轮次：间隔从「上次复习日」往后推 */
  function reviewDone(id) {
    const rec = lessons[id];
    if (!rec || !rec.at) return '';
    const t = today();
    const hist = rec.hist || (rec.hist = [rec.at]);
    /* 同一天只推进一次，避免连点把整轮刷完 */
    if (hist[hist.length - 1] === t) return 'same-day';

    const round = rec.round || 0;
    if (round >= OFF.length) return 'done';
    const last = rec.lastAt || hist[hist.length - 1] || rec.at;
    const late = diffDays(last, t);
    /* 逾期超过 2 倍间隔：这课基本淡忘了，退回上一轮重来 */
    const back = (late > GAP[round] * 2 && round > 0) ? 1 : 0;
    rec.round = round - back + 1;
    rec.lastAt = t;

    if (rec.round >= OFF.length) {
      rec.due = '';
      rec.finishedAt = t;
    } else {
      rec.due = addDays(t, GAP[rec.round]);
    }
    hist.push(t);
    saveLessons();
    return back ? 'reset' : 'reviewed';
  }

  /* 本轮抽考哪些词：最久没考过的优先，答错的再往前插 */
  function pickReview(id) {
    const round = (lessons[id] && lessons[id].round) || 0;
    const ws = wordsOf(id);
    if (ws.length <= BATCH) return ws;
    /* 每轮至少 BATCH 个，并且保证剩下的轮次足够把「还没考过的词」轮完
       （138 词的课 5 轮 × 20 只能覆盖 100 个，所以要按剩余词数自适应） */
    const fresh = ws.filter(w => typeof w.rAt !== 'number').length;
    const left = Math.max(1, OFF.length - round);
    const size = Math.max(BATCH, Math.min(40, Math.ceil(Math.max(fresh, BATCH) / left)));
    const eff = w => (w.last === 'no' ? -2 : (typeof w.rAt === 'number' ? w.rAt : -1));
    return ws.slice().sort((a, b) => {
      const ea = eff(a), eb = eff(b);
      if (ea !== eb) return ea - eb;
      const sa = (a.lapses || 0) * 10 + (a.last === 'no' ? 8 : a.last === 'fuzzy' ? 3 : 0);
      const sb = (b.lapses || 0) * 10 + (b.last === 'no' ? 8 : b.last === 'fuzzy' ? 3 : 0);
      return sb - sa;
    }).slice(0, size);
  }

  /* ---------- 学习 / 复习模式 ---------- */
  let study = {
    id: '', mode: 'learn', round: 0, words: [], pos: 0, end: 0,
    flipped: false, reiter: {}, stat: { yes: 0, fuzzy: 0, no: 0 }
  };

  function openStudy(id, mode) {
    const ws = wordsOf(id);
    if (!ws.length) return;
    const rec = lessons[id];
    const isRev = mode === 'review' && !!(rec && rec.at);
    const list = isRev ? pickReview(id) : ws;
    study = {
      id: id, mode: isRev ? 'review' : 'learn', round: (rec && rec.round) || 0,
      words: list, pos: 0, end: isRev ? list.length : Math.min(BATCH, list.length),
      flipped: false, reiter: {}, stat: { yes: 0, fuzzy: 0, no: 0 }
    };
    $('#study').hidden = false;
    $('#vdone').hidden = true;
    $('#vcard').style.display = '';
    $('#vbtns').hidden = true;
    $('#studyTitle').textContent = isRev
      ? label(id) + ' · 第 ' + (study.round + 1) + ' 次复习 · 抽考 ' + list.length + ' 词'
      : label(id) + ' · 共 ' + ws.length + ' 词' + (ws.length > BATCH ? '（每批 ' + BATCH + ' 个）' : '');
    $('#study').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showCard();
  }
  function closeStudy() {
    $('#study').hidden = true;
    renderAll();
  }
  function showCard() {
    const w = study.words[study.pos];
    if (!w || study.pos >= study.end) { finishStudy(); return; }
    study.flipped = false;
    $('#vcard').classList.remove('flipped');
    $('#vbtns').hidden = true;
    $('#vtag').textContent = (study.mode === 'review' ? '复习 ' : '') +
      (study.pos + 1) + ' / ' + study.words.length;
    $('#ven').textContent = w.en;
    $('#vph').textContent = w.ph ? '/' + w.ph + '/' : '';
    $('#vzh').textContent = w.zh;
    $('#vmeta').textContent = (w.lapses ? '记错过 ' + w.lapses + ' 次 · ' : '') +
      (study.mode === 'review' ? '第 ' + (study.round + 1) + ' 次复习' : label(study.id));
    $('#studyProgress').textContent = (study.pos + 1) + ' / ' + study.words.length;
  }
  function answer(kind) {
    if (!study.flipped) return;
    const w = study.words[study.pos];
    if (!w) return;
    w.reps = (w.reps || 0) + 1;
    w.last = kind;
    if (study.mode === 'review') w.rAt = study.round;   /* 记下「这一轮考过它了」 */
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
      /* 复习时答错的词，本批队尾再考一次 */
      if (study.mode === 'review' && !study.reiter[w.id]) {
        study.reiter[w.id] = 1;
        study.words.push(w);
        study.end = study.words.length;
      }
    }
    saveWords();
    study.pos++;
    if (study.pos >= study.end) finishStudy(); else showCard();
  }
  function finishStudy() {
    $('#vcard').style.display = 'none';
    $('#vbtns').hidden = true;
    $('#vdone').hidden = false;
    const s = study.stat;
    const total = study.words.length;
    const done = study.end;
    const isRev = study.mode === 'review';
    const more = !isRev && done < total;
    $('#vdoneTitle').textContent = isRev
      ? '本次复习考完了'
      : (more ? '这一批过完了（' + done + ' / ' + total + '）' : '这一课过完了');
    $('#vdoneText').textContent = '认识 ' + s.yes + ' · 模糊 ' + s.fuzzy + ' · 不认识 ' + s.no +
      (isRev
        ? (s.no ? '。答错的 ' + s.no + ' 个已在队尾重考一遍。' : '。')
        : (more ? '。可以先记下来，也可以继续下一批。' : '。记下来之后，明天会自动出现在复习列表里。'));
    $('#btnNextBatch').hidden = !more;
    $('#btnNextBatch').textContent = '继续下一批（' + (done + 1) + '–' + Math.min(done + BATCH, total) + '）';
    $('#btnFinish').textContent = isRev ? '完成本次复习，排下一次'
      : (more ? '记下这一课，排复习' : '记下今天学过，排复习');
    $('#studyProgress').textContent = done + ' / ' + total;
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

      /* 优先找没满 perLesson 的课；内置词库已把课填满时，放进总词数最少的那一课 */
      let slot = -1, lightest = 0, minN = Infinity;
      for (let i = 0; i < TOTAL; i++) {
        const c = countIn(i);
        if (c < perLesson) { slot = i; break; }
        if (c < minN) { minN = c; lightest = i; }
      }
      if (slot < 0) slot = lightest;

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
  const flip = () => {
    if (study.flipped) return;
    study.flipped = true;
    $('#vcard').classList.add('flipped');
    $('#vbtns').hidden = false;
  };
  $('#vcard').addEventListener('click', flip);

  /* 键盘：空格翻面，1 不认识 / 2 模糊 / 3 认识 */
  document.addEventListener('keydown', e => {
    const st = $('#study');
    if (!st || st.hidden) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); flip(); }
    else if (study.flipped && (e.key === '1' || e.key === '2' || e.key === '3')) {
      e.preventDefault();
      answer(e.key === '1' ? 'no' : e.key === '2' ? 'fuzzy' : 'yes');
    }
  });

  /* 深色模式切换 */
  const db = $('#btnDark');
  if (db) db.addEventListener('click', () => {
    applyDark(!document.body.classList.contains('dark'), true);
  });

  /* AI 提示词：填充 + 一键复制 */
  const ap = $('#aiprompt');
  if (ap) ap.value = PROMPT_TEXT;
  const cp = $('#btnCopyPrompt');
  if (cp) cp.addEventListener('click', () => {
    const txt = ap ? ap.value : PROMPT_TEXT;
    const done = () => {
      const old = cp.textContent;
      cp.textContent = '已复制 ✓';
      setTimeout(() => { cp.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, () => { ap.select(); document.execCommand('copy'); done(); });
    } else if (ap) {
      ap.select();
      try { document.execCommand('copy'); } catch (e) {}
      done();
    }
  });

  /* 文件导入 + 拖拽到文本框 */
  const fFile = $('#fFile');
  const btnFile = $('#btnFile');
  if (btnFile && fFile) btnFile.addEventListener('click', () => fFile.click());
  if (fFile) fFile.addEventListener('change', () => {
    importFile(fFile.files && fFile.files[0]);
    fFile.value = '';
  });
  const bulkEl = $('#bulk');
  if (bulkEl) {
    bulkEl.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    bulkEl.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importFile(f);
    });
  }
  $('#vbtns').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (b) answer(b.getAttribute('data-k'));
  });
  $('#btnLearn').addEventListener('click', () => {
    const nx = nextNewLesson();
    if (nx) openStudy(nx, 'learn');
  });
  $('#btnStudyExit').addEventListener('click', closeStudy);
  $('#btnNextBatch').addEventListener('click', () => {
    study.pos = study.end;
    study.end = Math.min(study.end + BATCH, study.words.length);
    $('#vdone').hidden = true;
    $('#vcard').style.display = '';
    showCard();
  });
  $('#btnFinish').addEventListener('click', () => {
    const id = study.id;
    const isRev = study.mode === 'review';
    let r = '';
    if (isRev) r = reviewDone(id); else markLearned(id);
    const due = lessons[id] && lessons[id].due;
    if (window.OCFish) {
      if (r === 'same-day') {
        window.OCFish.say('这一课今天已经复习过了，明天再来。', 'combo');
      } else if (r === 'reset') {
        window.OCFish.say('隔得有点久，这一课往后退了一轮，' +
          (due ? '下次 ' + due + '。' : '已经全部复习完了。'), 'combo');
      } else {
        window.OCFish.say((isRev ? '复习记下了，' : '这一课记下了，') +
          (due ? '下次复习 ' + due + '。' : '已完成全部复习。'), 'combo');
      }
    }
    closeStudy();
  });
  $('#btnFinishSkip').addEventListener('click', closeStudy);

  $('#dueList').addEventListener('click', e => {
    const b = e.target.closest('[data-review]');
    if (!b) return;
    openStudy(b.getAttribute('data-review'), 'review');
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
    const rec = lessons[id];
    openStudy(id, (rec && rec.at) ? 'review' : 'learn');
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
  (function seedInfo() {
    const el = $('#seedInfo');
    if (!el) return;
    if (!SEED) { el.hidden = true; return; }
    const n = words.filter(w => w.seed).length;
    el.innerHTML = '已内置《' + esc(SEED.book || '') + '》' + esc(SEED.scope || '') +
      '，共 <b>' + n + '</b> 词，已按教材的单元 / 课分好位置' +
      (seedAdded ? '（本次新增 ' + seedAdded + ' 词）' : '') + '。';
  })();

  renderAll();
})();
