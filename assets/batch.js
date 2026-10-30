/* 批量整理页：粘贴 → 实时解析 → 预览 + 报错
 * 解析规则来自 assets/parse-lib.js（与入库脚本同一份，保证预览和 CI 结果一致）
 */
(function () {
  const $ = s => document.querySelector(s);
  const elPaste = $('#paste');
  const elStat = $('#stat');
  const elErrs = $('#errs');
  const elList = $('#list');
  const elHint = $('#fmt');
  const elHelp = $('#bhelp');

  const TYPE_CLASS = { choice: 't-choice', fill: 't-fill', term: 't-term', calc: 't-calc' };
  const SUBMIT_URL = 'https://github.com/ABC-GIT-128/course-bank/issues/new?template=batch.yml';

  const HINT = `粘贴格式（题型标记 + 答案/解析/出处 各占一行）：

【选择】1. 题干（  ）
A. 选项一      B. 选项二    ← 每行一个
答案：A
解析：为什么选它、其它错在哪
出处：第 3 章 复习要点

【填空】2. 题干 ＿＿＿ ＿＿＿
答案：灵敏度 | 量程        ← 多个空用 | 分隔

【名词】3. 术语
答案：参考答案
关键词：要点一|要点二|要点三   ← 判分用，至少 3 组

【计算】4. 题干
答案：20 V
解析：第一步 | 第二步       ← 用 | 或换行分步

小贴士：同一种题型可以连着写多道题，题号起新行即可；「出处」里写「第X章」会自动识别章节。`;

  const DEMO = `【选择】
1. 差动变压器采用差动结构的主要目的是（　）。
A. 提高灵敏度并减小非线性误差
B. 降低对电源的要求
C. 减小体积
D. 便于标定
答案：A
解析：两线圈输出相减，非线性误差相互抵消，同时灵敏度约提高一倍。
出处：第4章 4.3 差动变压器

2. 下列传感器中属于有源（发电型）传感器的是（　）。
A. 电阻应变式
B. 压电式
C. 电容式
D. 电感式
答案：B
解析：压电式靠压电效应直接产生电荷，不需要外加激励电源；其余三种都属能量控制型。
出处：第1章 1.2 传感器的分类

【填空】
3. 应变片的主要参数有 ＿＿＿、＿＿＿。
答案：灵敏度 | 灵敏系数
解析：灵敏度以灵敏系数 K 表示，此外还有允许电流、横向效应等。
出处：第3章 3.1 电阻应变片

【名词】
4. 灵敏度
答案：输出增量与相应输入增量之比，反映传感器对被测量变化的敏感程度。
关键词：输出增量|输入增量|比值
解析：对线性传感器 S=Δy/Δx，非线性时用 dy/dx 表示。
出处：第2章 2.1 静态特性

【计算】
5. 某电阻 R=10Ω，通过电流 I=2A，求其两端电压 U。
答案：20 V
解析：由欧姆定律 U=IR|U=2×10=20V
出处：第1章 1.1 基本概念`;

  let timer = null;

  function toast(msg) {
    const t = $('#btoast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 1600);
  }

  function answerLine(q) {
    if (q.type === 'choice') {
      const opt = (q.opts || [])[q.ans] || '';
      return '答案：' + 'ABCD'[q.ans] + '．' + opt;
    }
    if (q.type === 'fill') return '答案：' + q.blanks.map(b => b[0]).join(' / ');
    if (q.type === 'term') return '要点：' + q.kw.map(g => g[0]).join('、');
    return '答案：' + q.ansText + (q.unit ? '（单位 ' + q.unit + '，容差 ' + Math.round((q.tol || .03) * 100) + '%）' : '');
  }

  function render() {
    const text = elPaste.value.trim();
    if (!text) {
      elStat.innerHTML = '<span class="chip">等待粘贴…</span>';
      elErrs.innerHTML = '';
      elList.innerHTML = '<div class="bempty">把题目粘到上面，这里会实时预览</div>';
      return;
    }

    const r = window.OCParse.parseBatch(text, { idPrefix: 'p' });
    const s = r.stats;
    const byType = s.byType || {};
    elStat.innerHTML =
      '<span class="chip">识别 <b>' + s.total + '</b> 题</span>' +
      (byType.choice ? '<span class="chip">选择 <b>' + byType.choice + '</b></span>' : '') +
      (byType.fill ? '<span class="chip">填空 <b>' + byType.fill + '</b></span>' : '') +
      (byType.term ? '<span class="chip">名词 <b>' + byType.term + '</b></span>' : '') +
      (byType.calc ? '<span class="chip">计算 <b>' + byType.calc + '</b></span>' : '') +
      '<span class="chip ' + (s.skipped ? 'bad' : 'ok') + '">' +
        (s.skipped ? '跳过 ' + s.skipped + ' 题' : '全部可用') + '</span>';

    if (r.errors.length) {
      elErrs.innerHTML = '<div class="berr"><h4>下面这些题还不能入库，改一下就能识别：</h4><ul>' +
        r.errors.map(e => '<li>' + e.msg.join('<br>') +
          (e.stem ? '<br><span style="color:#9ca3af">原文：' + escapeHtml(e.stem) + '…</span>' : '') +
          '</li>').join('') +
        '</ul></div>';
    } else {
      elErrs.innerHTML = '';
    }

    elList.innerHTML = r.questions.map((q, i) =>
      '<div class="bitem">' +
        '<div class="bh"><span class="no">' + (i + 1) + '</span>' +
          '<span class="t ' + (TYPE_CLASS[q.type] || '') + '">' + r.typeName[q.type] + '</span>' +
          '<span class="no">第' + q.ch + '章</span></div>' +
        '<div class="stem">' + escapeHtml(q.q) + '</div>' +
        '<div class="ans"><i>' + escapeHtml(answerLine(q)) + '</i></div>' +
        (q.warn && q.warn.length ? '<div class="warn">' + q.warn.map(escapeHtml).join('；') + '</div>' : '') +
      '</div>'
    ).join('') || '<div class="bempty">还没有识别出题目</div>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  elPaste.addEventListener('input', () => {
    /* 空的时候把「手上是原始文档？」这行标成主色，一旦开始打字就降为常态 */
    elHelp.classList.toggle('empty', !elPaste.value.trim());
    clearTimeout(timer);
    timer = setTimeout(render, 160);
  });

  $('#btnDemo').addEventListener('click', () => {
    elPaste.value = DEMO;
    render();
    elPaste.focus();
    toast('已填入示例，改成你的题目即可');
  });

  $('#btnClear').addEventListener('click', () => {
    elPaste.value = '';
    render();
    elPaste.focus();
  });

  $('#btnCopy').addEventListener('click', async () => {
    if (!elPaste.value.trim()) { toast('还没有内容'); return; }
    try {
      await navigator.clipboard.writeText(elPaste.value);
      toast('已复制，粘到投稿表单即可');
    } catch (e) {
      elPaste.select();
      document.execCommand && document.execCommand('copy');
      toast('已复制');
    }
  });

  $('#btnSubmit').addEventListener('click', async e => {
    if (!elPaste.value.trim()) { toast('先把题目粘进来'); return; }
    const r = window.OCParse.parseBatch(elPaste.value, { idPrefix: 'p' });
    if (r.errors.length) {
      if (!r.questions.length) {
        toast('全部 ' + r.errors.length + ' 题都有格式问题，先改一下');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      /* 与入库口径一致：允许「部分成功」，但要先说清会跳过几题 */
      const ok = window.confirm(
        '有 ' + r.errors.length + ' 题格式不对（会被跳过），' + r.questions.length + ' 题可入库。\n\n' +
        '继续提交的话，只有这 ' + r.questions.length + ' 题会进题库；跳过的题请改好后另发一条。\n\n确定提交吗？'
      );
      if (!ok) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    }
    /* 先把文本放进剪贴板，再打开表单——省掉用户手动复制粘贴 */
    let copied = false;
    try {
      await navigator.clipboard.writeText(elPaste.value);
      copied = true;
    } catch (err) {
      copied = false;
    }
    window.open(SUBMIT_URL, '_blank', 'noopener');
    toast(copied ? '已复制，打开的表单里直接粘贴即可' : '表单已打开，请手动复制上面的内容');
  });

  elHint.textContent = HINT;

  /* ---------- AI 指令：从 templates/ai-prompt.txt 载入，保证和仓库里那份一致 ---------- */
  const elPrompt = $('#aiPrompt');
  let promptText = '';

  function fallbackPrompt() {
    return '【任务】把下面的课程资料整理成题库格式，供刷题网站导入。\n\n' +
      '1) 只用【选择】【填空】【名词】【计算】四种标记，各占一行；\n' +
      '2) 每道题必须有：题干、（选择题的 ABCD 选项）、答案、解析、出处 五项；\n' +
      '3) 填空的空位写 ＿＿＿（三个全角下划线），空数必须等于答案组数，多组用 | 分隔；\n' +
      '4) 选择题答案只写一个大写字母；名词解释给 3~5 组关键词，用 | 分隔；\n' +
      '5) 计算题答案以数值开头并带单位，解析用 | 分步；\n' +
      '6) 不要编造答案和页码，缺答案写「答案：待补」并在末尾【未生成】里列出；\n' +
      '7) 只输出题目文本，不要 Markdown 代码块、不要前言总结，公式用普通字符。\n\n' +
      '下面是资料内容：\n（把你的文档粘贴在这里）';
  }

  /* 两份指令：gen = 原始资料出题；norm = 原文已是题目，只规整格式不改题 */
  const PROMPTS = {
    gen:  { url: 'templates/ai-prompt.txt', label: '原始资料 → 生成题目' },
    norm: { url: 'templates/ai-prompt-normalize.txt', label: '已是题目 → 只规整格式' }
  };
  const HINTS = {
    gen:  '适用于复习要点、课件文字这类"还不是题目"的资料：AI 会把知识点改写成题目，并自己写解析。',
    norm: '适用于往年卷、练习题、带答案的题库：AI 只做排版规整，题干/选项/答案逐字保留，缺答案或缺解析时标「待补」，不会自己编。'
  };
  let promptMode = 'gen';
  const promptCache = {};

  function applyMode(mode) {
    promptMode = mode;
    document.querySelectorAll('#segbar .seg').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-mode') === mode);
    });
    $('#seghint').textContent = HINTS[mode];
    if (promptCache[mode]) {
      promptText = promptCache[mode];
      elPrompt.textContent = promptText;
      return;
    }
    elPrompt.textContent = '指令加载中…';
    promptText = '';
    fetch(PROMPTS[mode].url)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error('404'))))
      .then(t => {
        promptCache[mode] = t.trim();
        if (promptMode === mode) { promptText = promptCache[mode]; elPrompt.textContent = promptText; }
      })
      .catch(() => {
        promptCache[mode] = fallbackPrompt();
        if (promptMode === mode) { promptText = promptCache[mode]; elPrompt.textContent = promptText; }
      });
  }

  $('#segbar').addEventListener('click', e => {
    const btn = e.target.closest('.seg');
    if (btn) applyMode(btn.getAttribute('data-mode'));
  });

  applyMode('gen');

  async function copyPrompt(btn) {
    if (!promptText) { toast('指令还没加载好，稍等一下'); return; }
    const label = btn ? btn.textContent : '';
    try {
      await navigator.clipboard.writeText(promptText);
      toast('已复制，粘给 AI 即可');
      if (btn) {
        btn.textContent = '已复制 ✓';
        setTimeout(() => { btn.textContent = label; }, 1800);
      }
    } catch (e) {
      /* 非 HTTPS 或旧浏览器：把面板展开、选中文本，让用户手动复制 */
      $('#aibox').open = true;
      const pre = $('#aiPrompt');
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast('已选中指令，按 Ctrl+C 复制');
    }
  }

  $('#btnCopyPrompt').addEventListener('click', e => copyPrompt(e.currentTarget));
  $('#btnAiCopy').addEventListener('click', e => copyPrompt(e.currentTarget));

  /* 「看格式要求」→ 平滑滚到底部格式说明并高亮一下 */
  $('#btnFmt').addEventListener('click', () => {
    elHint.scrollIntoView({ behavior: 'smooth', block: 'center' });
    elHint.classList.remove('flash');
    void elHint.offsetWidth;      /* 重启动画 */
    elHint.classList.add('flash');
    setTimeout(() => elHint.classList.remove('flash'), 1700);
  });

  render();
})();
