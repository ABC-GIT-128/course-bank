/* 批量文本解析：把「粘贴的整段内容」拆成题目数组
 *
 * 同一份代码同时给浏览器预览页（batch.html）和 Node 入库脚本（scripts/parse-batch.js）用，
 * 避免「预览说没问题、入库却报错」这种两套规则的问题。
 *
 * 格式约定（宽松，能认半角/全角标点）：
 *
 *   【选择】1. 题干（ ）
 *   A. 选项一
 *   B. 选项二
 *   答案：A
 *   解析：……
 *   出处：第3章
 *
 *   【填空】2. 题干 ＿＿＿ ＿＿＿
 *   答案：灵敏度 | 量程
 *
 * 题型标记也可以写成 [选择] / ## 选择 / 一、选择题 / 选择题
 * 同一种题型下可以连着写多道题（以 "3." 这类题号开头，且上一题已有答案行）
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.OCParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 浏览器里 factory 拿不到外层 IIFE 的 global 参数，这里自己取一次 */
  const G = (typeof self !== 'undefined') ? self
          : (typeof window !== 'undefined') ? window
          : (typeof globalThis !== 'undefined') ? globalThis : {};
  const QT = (typeof module === 'object' && module.exports)
    ? require('./qtypes.js')
    : (G.OCQTypes || { typeOf: () => null, meta: t => ({ name: t, chip: t, tag: 't-note', answer: '' }) });
  const QTypes = QT;

  const TYPE_MAP = {
    '选择': 'choice', '单选': 'choice', '单项选择': 'choice', '选择题': 'choice',
    '填空': 'fill', '填空题': 'fill', '空': 'fill',
    '名词': 'term', '名词解释': 'term', '名词解释题': 'term', '术语': 'term',
    '计算': 'calc', '计算题': 'calc', '计算题答案': 'calc'
  };

  /* 题型名称统一由注册表提供（新增题型不用改这里） */
  const TYPE_NAME = new Proxy({}, { get: (o, k) => QTypes.meta(k).name || k });

  /* 把全角标点、各种破折号统一掉，方便后续正则 */
  function normalize(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/：/g, ':')
      .replace(/＿{2,}/g, '＿＿＿')
      .replace(/(^|[^＿])_{2,}/g, '$1＿＿＿')
      .replace(/[ \t]+$/gm, '');
  }

  /* 这些【xxx】不是题型：要么是 AI 输出的统计段落，要么是字段名，直接忽略 */
  const NON_TYPE_LABELS = /^(未生成|核对|说明|备注|注意|提示|总计|合计|统计|清单|答案|参考答案|正确答案|解析|分析|出处|来源|关键词|要点|题干|选项|题目|题型|格式|规则|任务|要求)$/;

  /* 题型标记行：支持「【选择】」独占一行，也支持「【选择】1. 题干…」写在同一行 */
  function matchTypeHeader(line) {
    let m = /^[\s]*[【\[]\s*([^\】\]]{1,10}?)\s*[】\]]\s*(.*)$/.exec(line);
    if (m) {
      const label = m[1].trim();
      const key = QTypes.typeOf(label) || TYPE_MAP[label];
      if (key) return { type: key, rest: (m[2] || '').trim() };
      if (NON_TYPE_LABELS.test(label)) return { type: '__ignore__', rest: '' };
      /* 有【】标记但注册表里没有这种题型：不猜测、不改写，
       * 按「待确认」收录（只展示不判分），并记入 unregistered 上报给维护者 */
      return { type: 'note', unknown: label, rest: (m[2] || '').trim() };
    }
    m = /^[\s]*#{1,4}\s*([^\s#]{1,10}题?)\s*$/.exec(line);
    if (!m) m = /^[\s]*[一二三四五六七八九十]+[、.]\s*([^\s]{1,10})\s*$/.exec(line);
    if (!m) m = /^[\s]*([^\s:]{2,6}题?)\s*$/.exec(line);
    if (!m) return null;
    const raw = m[1].replace(/^[一二三四五六七八九十]+[、.]?/, '').trim();
    const key = TYPE_MAP[raw];
    return key ? { type: key, rest: '' } : null;
  }

  const isAnswerLine = l => /^\s*(答案|参考答案|正确答案)\s*:/.test(l);

  /* 题号开头：1. / 1、/ 1) / 1． */
  function stripNumber(line) {
    const m = /^\s*(\d{1,3})\s*[.、)．]\s*(.*)$/.exec(line);
    return m ? { no: Number(m[1]), text: m[2] } : null;
  }

  function parseChunk(lines, type, ctx) {
    const q = { type, ch: ctx.defaultCh };
    let stem = [];
    let opts = [];
    let ansRaw = '';
    let expRaw = '';
    let refRaw = '';
    let kwRaw = '';
    let unitRaw = '';
    let chRaw = '';
    let mode = 'stem';

    const KEY = [
      [/^\s*(答案|参考答案|正确答案)\s*:\s*(.*)$/, 'ans'],
      [/^\s*(解析|说明|分析)\s*:\s*(.*)$/, 'exp'],
      [/^\s*(出处|来源)\s*:\s*(.*)$/, 'ref'],
      [/^\s*(关键词|要点|得分点)\s*:\s*(.*)$/, 'kw'],
      [/^\s*(单位|单位与容差|容差)\s*:\s*(.*)$/, 'unit'],
      [/^\s*(章节|章)\s*:\s*(.*)$/, 'ch']
    ];

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) continue;

      let matched = false;
      for (const [re, which] of KEY) {
        const m = re.exec(line);
        if (!m) continue;
        matched = true;
        const val = m[2].trim();
        mode = which;
        if (which === 'ans') ansRaw = val;
        else if (which === 'exp') expRaw = val;
        else if (which === 'ref') refRaw = val;
        else if (which === 'kw') kwRaw = val;
        else if (which === 'unit') unitRaw = val;
        else if (which === 'ch') chRaw = val;
        break;
      }
      if (matched) continue;

      /* 选项行 */
      const om = /^\s*([A-Da-d])\s*[.、)．]\s*(.+)$/.exec(line);
      if (om && type === 'choice') {
        opts[om[1].toUpperCase().charCodeAt(0) - 65] = om[2].trim();
        mode = 'opt';
        continue;
      }

      /* 续行：属于当前字段 */
      if (mode === 'exp') { expRaw += '\n' + line.trim(); continue; }
      if (mode === 'ans') { ansRaw += '\n' + line.trim(); continue; }
      if (mode === 'ref') { refRaw += '\n' + line.trim(); continue; }
      if (mode === 'kw') { kwRaw += '\n' + line.trim(); continue; }
      if (mode === 'opt') { continue; }
      stem.push(line.trim());
    }

    /* 章节：优先「章节:」，没写就从「出处：第 3 章 …」里认 */
    const chNum = /(\d+)/.exec(chRaw) || /第\s*(\d+)\s*章/.exec(String(refRaw));
    if (chNum) q.ch = Number(chNum[1]);
    q.raw = { ans: ansRaw, exp: expRaw, ref: refRaw, kw: kwRaw, unit: unitRaw };

    /* 题干：去掉题号 */
    let stemText = stem.join('\n').trim();
    /* 单行题干直接剥题号；多行（例如待确认题把选项也留在题干里）按首行剥 */
    const sn = stripNumber(stemText);
    if (sn) {
      stemText = sn.text;
    } else {
      const ls = stemText.split('\n');
      const sn0 = stripNumber(ls[0]);
      if (sn0) { ls[0] = sn0.text; stemText = ls.join('\n').trim(); }
    }
    /* 待确认题保留换行（选项各占一行更好读），其它题型压成一行 */
    stemText = stemText.replace(/\s*\n\s*/g, type === 'note' ? '\n' : ' ').trim();
    q.q = stemText;

    /* ---------- 按题型组装 ---------- */
    if (type === 'choice') {
      opts = opts.filter(o => o != null && String(o).trim());
      q.opts = opts;
      const a = String(ansRaw).trim().split('\n')[0].trim();
      let idx = -1;
      if (/^[A-Da-d]$/.test(a)) idx = a.toUpperCase().charCodeAt(0) - 65;
      else if (/^\d$/.test(a)) idx = Number(a) - 1;
      else {
        const k = opts.findIndex(o => o.trim() === a);
        if (k >= 0) idx = k;
      }
      q.ans = idx;
    }

    if (type === 'fill') {
      const groups = String(ansRaw)
        .split(/[|\n]/)
        .map(s => s.split('/').map(x => x.trim()).filter(Boolean))
        .filter(a => a.length);
      q.blanks = groups;
      q.blankCount = (stemText.match(/＿＿＿/g) || []).length;
    }

    if (type === 'term') {
      let kw = String(kwRaw || ansRaw)
        .split(/[|\n]/)
        .map(s => s.split('/').map(x => x.trim()).filter(Boolean))
        .filter(a => a.length);
      if (!kw.length) {
        kw = String(ansRaw).split(/[、，,；;\s]+/).map(x => x.trim()).filter(x => x.length >= 2).map(x => [x]);
      }
      q.kw = kw;
    }

    if (type === 'tf') {
      const parsed = QTypes.meta('tf').parse ? QTypes.meta('tf').parse(ansRaw) : null;
      q.ans = parsed;
      q.ansText = ansRaw ? String(ansRaw).trim() : '';
    }

    if (type === 'calc') {
      const a = String(ansRaw).trim().split('\n')[0].trim();
      const v = Number(a.replace(/[^\d.eE+-]/g, ''));
      q.value = isNaN(v) ? NaN : v;
      q.ansText = a;
      const uInAns = (/[A-Za-z%℃Ωμ./²³]+$/.exec(a) || [''])[0];
      const uLine = String(unitRaw || '');
      q.unit = (/[A-Za-z%℃Ωμ./²³]+/.exec(uLine) || [uInAns])[0] || uInAns || '';
      const tol = (/0?\.\d+/.exec(uLine) || [])[0];
      q.tol = tol ? Number(tol) : 0.03;
      q.sol = String(expRaw).split(/[|\n]/).map(s => s.trim()).filter(Boolean);
    }

    if (type === 'note') {
      q.why = ctx.unknown
        ? '原文题型「' + ctx.unknown + '」本库暂不支持自动判分，已按待确认收录；内容仅供参考。'
        : '题型未确认，暂不参与判分。';
    }

    /* 解析统一包一层 (calc 的解析也保留一份) */
    const expLines = String(expRaw).split('\n').map(s => s.trim()).filter(Boolean);
    q.exp = expLines.length ? '<p>' + expLines.join('</p><p>') + '</p>' : '';
    q.ref = String(refRaw).trim();
    return q;
  }

  /* 逐题检查，返回错误描述数组 */
  function validate(q, idx) {
    const errs = [];
    const tag = '第 ' + idx + ' 题';

    /* 答案写「待补」是最常见的情况（AI 规整时原文没答案），单独给一句人话 */
    const rawAns = (q.raw && String(q.raw.ans || '')) || '';
    const pending = /待补|待定|未知|\?|？/.test(rawAns);
    if (pending && q.type !== 'term') {
      errs.push(tag + '：答案是「' + rawAns.slice(0, 12) + '」，需要先补上正确答案再提交');
    }
    if (!q.q) errs.push(tag + '：没有题干');
    if (!q.exp || q.exp.length < 8) errs.push(tag + '：缺少解析（或解析太短）');
    if (!q.ref) errs.push(tag + '：缺少出处（不阻断，但建议补上）');

    if (q.type === 'choice') {
      if (!Array.isArray(q.opts) || q.opts.length < 2) errs.push(tag + '：选项少于 2 个');
      if (!pending && (typeof q.ans !== 'number' || q.ans < 0 || q.ans >= (q.opts || []).length)) {
        errs.push(tag + '：答案要写成选项字母（A/B/C/D），当前无法识别');
      }
    }
    if (q.type === 'fill') {
      if (!q.blanks || !q.blanks.length) errs.push(tag + '：缺少答案');
      else if (!pending && q.blankCount !== q.blanks.length) {
        errs.push(tag + '：题干有 ' + q.blankCount + ' 个空，答案给了 ' + q.blanks.length + ' 组');
      }
    }
    if (q.type === 'tf') {
      if (typeof q.ans !== 'boolean') {
        errs.push(tag + '：判断题答案要写成「正确 / 错误」（也认 对/错、√/×、T/F）');
      }
    }
    if (q.type === 'term') {
      if (!q.kw || q.kw.length < 3) errs.push(tag + '：关键词不足 3 组（用 | 分隔，或在「关键词:」里列出）');
    }
    if (q.type === 'calc') {
      if (!pending && isNaN(q.value)) errs.push(tag + '：计算题答案要以数值开头');
      if (!q.sol || !q.sol.length) errs.push(tag + '：计算题需要解题步骤（解析里每行一步或用 | 分隔）');
    }
    return errs;
  }

  /* 主入口：text 为粘贴内容，opts = { defaultCh, idPrefix } */
  function parseBatch(text, opts) {
    opts = opts || {};
    const defaultCh = Number(opts.defaultCh) || 1;
    const idPrefix = opts.idPrefix || 'b';
    /* AI 输出末尾常带【未生成】清单（提示词要求的），它不是题目，直接截掉 */
    const src = normalize(text).replace(/\n\s*【\s*未生成\s*】[\s\S]*$/, '\n');

    const blocks = [];      // { type, lines[] }
    let cur = null;
    for (const line of src.split('\n')) {
      const h = matchTypeHeader(line);
      if (h) {
        cur = { type: h.type, unknown: h.unknown || '', lines: [] };
        blocks.push(cur);
        if (h.rest) cur.lines.push(h.rest);   /* 【选择】1. 题干… 写在同一行 */
        continue;
      }
      if (!cur) {
        if (line.trim()) { cur = { type: 'choice', lines: [], guessed: true }; blocks.push(cur); }
        else continue;
      }
      cur.lines.push(line);
    }

    const questions = [];
    const errors = [];
    const unregistered = [];   // 用了注册表里没有的题型（已降级为「待确认」）
    let seq = 0;

    blocks.forEach(block => {
      if (block.type === '__ignore__') return;
      /* 多题拆分：遇到题号且上一段已有答案行，就切一刀 */
      const chunks = [];
      let buf = [];
      let hasAns = false;
      for (const line of block.lines) {
        const n = stripNumber(line);
        if (n && hasAns) { chunks.push(buf); buf = [line]; hasAns = false; continue; }
        buf.push(line);
        if (isAnswerLine(line)) hasAns = true;
      }
      if (buf.length) chunks.push(buf);

      chunks.forEach(lines => {
        const textJoined = lines.join('\n').trim();
        if (!textJoined) return;
        seq += 1;
        const q = parseChunk(lines, block.type, { defaultCh, unknown: block.unknown });
        const errs = validate(q, seq);

        /* 「缺少出处」只是建议，不阻断 */
        const fatal = errs.filter(e => e.indexOf('缺少出处') < 0);
        if (fatal.length) {
          errors.push({ index: seq, type: block.type, msg: fatal, stem: q.q.slice(0, 40) });
          return;
        }
        q.id = idPrefix + String(seq).padStart(2, '0');
        q.warn = errs.length ? errs : [];
        if (block.type === 'note' && block.unknown) {
          unregistered.push({ index: seq, label: block.unknown, stem: q.q.slice(0, 30) });
        }
        questions.push(q);
      });
    });

    return {
      questions,
      errors,
      unregistered,
      stats: {
        total: seq,
        ok: questions.length,
        skipped: errors.length,
        byType: questions.reduce((m, q) => (m[q.type] = (m[q.type] || 0) + 1, m), {})
      },
      typeName: TYPE_NAME
    };
  }

  return { parseBatch, TYPE_MAP, TYPE_NAME };
});
