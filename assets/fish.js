/* 大肥鱼 · 全局陪伴系统
 * - 左下角悬浮，纯 CSS 动效（颤抖 / 弹跳 / 睡觉）
 * - 连击台词：3 连、5 连、10 连 逐级提升
 * - 安静模式：右上角开关，隐藏肥鱼并阻断全部台词
 * - 所有高频写盘与台词触发都走 debounce，避免答题时卡顿
 */
(function () {
  const KEY_QUIET = 'oc_fish_quiet';

  const $ = (s, r) => (r || document).querySelector(s);

  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  }

  function read(k, dflt) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? dflt : JSON.parse(v);
    } catch (e) { return dflt; }
  }
  /* 写盘统一走这里，配合 debounce 使用 */
  function writeNow(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  const LINES = {
    ok: ['稳。', '对了，继续。', '有点东西。', '这题拿下了。', '嗯，鱼点头了。'],
    bad: ['这题你都能选错？', '唔……先看解析吧。', '错一次，长一分。', '别慌，回头再来一遍。'],
    combo3: ['三连对！鱼尾巴都翘起来了。', '三连了，手感不错啊。'],
    combo5: ['五连对！你是不是偷偷背过？', '五连！鱼开始佩服你了。'],
    combo10: ['超神了！大肥鱼已经找不到词来夸你了！'],
    pinFull: ['喂！首页都快放不下啦，取消一个再置顶吧！'],
    wake: ['你终于回来了，鱼都睡醒两觉了。'],
    quietOn: ['那我先眯一会儿，有事再叫我。']
  };

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  let quiet = !!read(KEY_QUIET, false);
  let combo = 0;
  let bubbleTimer = null;
  let sleepTimer = null;
  let asleep = false;

  /* ---------- DOM ---------- */
  const wrap = document.createElement('div');
  wrap.className = 'fishwrap';
  wrap.setAttribute('aria-live', 'polite');
  wrap.innerHTML =
    '<div class="fishbubble" id="fishbubble" hidden>' +
      '<span class="fhearts" aria-hidden="true"></span>' +
      '<span class="ftext"></span>' +
    '</div>' +
    '<button class="fishbody" id="fishbody" type="button" aria-label="大肥鱼">' +
      '<span class="fzzz">Z</span><span class="fzzz fz2">z</span><span class="fzzz fz3">z</span>' +
      '<span class="femoji" aria-hidden="true">🐟</span>' +
    '</button>';
  document.body.appendChild(wrap);

  const bubble = $('#fishbubble', wrap);
  const ftext = $('.ftext', wrap);
  const body = $('#fishbody', wrap);

  /* ---------- 安静模式开关 ---------- */
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn plain quietbtn';
  toggle.id = 'fishquiet';
  toggle.textContent = '安静模式';
  toggle.setAttribute('aria-pressed', String(quiet));
  const slot = document.querySelector('[data-fish="toggle-slot"]');
  if (slot) slot.appendChild(toggle);
  else {
    toggle.classList.add('quietbtn-fixed');
    document.body.appendChild(toggle);
  }

  const persistQuiet = debounce(() => writeNow(KEY_QUIET, quiet), 300);

  function applyQuiet() {
    wrap.hidden = quiet;
    toggle.textContent = quiet ? '陪伴模式' : '安静模式';
    toggle.setAttribute('aria-pressed', String(quiet));
    if (quiet) hideBubble();
  }

  toggle.addEventListener('click', () => {
    quiet = !quiet;
    persistQuiet();
    applyQuiet();
    if (!quiet) say(pick(LINES.combo3).replace(/.*/, '我回来了。'), 'happy');
  });

  /* ---------- 气泡 ---------- */
  const hideBubble = debounce(() => {
    bubble.hidden = true;
    bubble.className = 'fishbubble';
  }, 3600);

  const showBubble = debounce((text, mood) => {
    ftext.textContent = text;
    bubble.className = 'fishbubble show' + (mood ? ' m-' + mood : '');
    bubble.hidden = false;
    hideBubble();
  }, 60);

  function say(text, mood) {
    if (quiet || !text) return;
    showBubble(text, mood);
  }

  /* ---------- 动效 ---------- */
  const animTimers = {};
  function anim(cls, ms) {
    body.classList.remove(cls);
    /* 强制重排，保证连续两次同类动画都能重新播放 */
    void body.offsetWidth;
    body.classList.add(cls);
    /* 连续答对会重复触发：清掉上一个定时器，否则前一次会提前摘掉类 */
    clearTimeout(animTimers[cls]);
    animTimers[cls] = setTimeout(() => body.classList.remove(cls), ms);
  }

  function wake() {
    if (!asleep) return;
    asleep = false;
    body.classList.remove('fish-sleep');
    say(pick(LINES.wake), 'happy');
    resetIdle();
  }

  /* ---------- 闲置 2 分钟：睡觉 ---------- */
  const startIdle = debounce(() => {
    if (quiet) return;
    asleep = true;
    body.classList.add('fish-sleep');
    bubble.hidden = true;
  }, 120000);

  function resetIdle() {
    clearTimeout(sleepTimer);
    if (asleep) return;              /* 睡着时不再重置，等用户叫醒 */
    startIdle();
  }

  ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => {
    window.addEventListener(ev, debounce(() => { if (asleep) wake(); resetIdle(); }, 400), { passive: true });
  });

  body.addEventListener('click', e => {
    e.stopPropagation();
    if (asleep) { wake(); return; }
    say('别戳我，做题去。', 'idle');
  });

  /* ---------- 对外 API ---------- */
  window.OCFish = {
    debounce: debounce,
    say: say,
    isQuiet: () => quiet,

    /* 答对：连击 +1，按 3/5/10 升级台词 */
    correct: function () {
      if (quiet) return;
      combo++;
      anim('fish-jump', 1600);
      if (combo === 10) say(pick(LINES.combo10), 'super');
      else if (combo === 5) say(pick(LINES.combo5), 'combo');
      else if (combo === 3) say(pick(LINES.combo3), 'combo');
      else if (combo < 3) say(pick(LINES.ok), 'happy');
      else say(pick(LINES.ok), 'happy');
      resetIdle();
    },

    /* 答错：连击清零 + 颤抖 + 黑线 */
    wrong: function () {
      if (quiet) return;
      combo = 0;
      anim('fish-shake', 620);
      say(pick(LINES.bad), 'angry');
      resetIdle();
    },

    /* 主观题自评 */
    selfMark: function (ok) { ok ? this.correct() : this.wrong(); },

    /* 置顶超过 3 门 */
    pinFull: function () {
      combo = 0;
      anim('fish-shake', 620);
      say(pick(LINES.pinFull), 'angry');
    },

    combo: () => combo
  };

  applyQuiet();
  resetIdle();
})();
