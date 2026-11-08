/* 题型注册表：名称、展示、解析、校验集中在这里
 *
 * 目的：新增一种题型时，只改这一个文件 + 前端一处渲染，而不是散在 8 个脚本里。
 * 浏览器（assets/parse-lib.js、quiz.js）与 Node 脚本共用同一份。
 *
 * 字段说明：
 *   name      卡片/模板上的完整名称
 *   chip     筛选栏上的短标签（缺省用 name）
 *   group     展示用大类（客观题 / 大题）
 *   tag       卡片标签的 CSS 类名
 *   answer    答案写法说明（给表单和提示词用）
 *   parse     把「答案：xxx」的原文规范化成结构化答案，返回 null 表示无法识别
 *   judge     判分方式：single=单值相等 / bool=布尔 / set=集合相等 / seq=顺序 / self=自评
 *   render    渲染方式：与 judge 配套的前端交互
 *   auto      能否自动判分（false 表示只展示、不计分，例如 note）
 *
 * 新增一种题型的最小成本：
 *   - 判分与渲染都能复用上面的取值 → 只加一条声明（改这个文件即可）
 *   - 需要新的判分或交互 → 声明 + 在 quiz.js 里加一个分支（注册表负责认出它并给出提示）
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.OCQTypes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TRUE_WORDS = /^(对|是|正确|真|√|✓|T|true|True|YES|Y)$/;
  const FALSE_WORDS = /^(错|否|错误|假|×|✗|X|F|false|False|NO|N)$/;

  const TYPES = {
    choice: {
      name: '单项选择题',
      chip: '单选',
      group: '客观题',
      tag: 't-choice',
      answer: '一个选项字母（A/B/C/D）',
      judge: 'single',
      render: 'choice',
      auto: true
    },
    tf: {
      name: '判断题',
      chip: '判断',
      group: '客观题',
      tag: 't-tf',
      answer: '「正确」或「错误」（也认 对/错、√/×、T/F）',
      judge: 'bool',
      render: 'tf',
      auto: true,
      /* 判断题答案：把各种写法收敛成 true / false */
      parse: function (raw) {
        const s = String(raw == null ? '' : raw).trim().replace(/\s+/g, '');
        if (!s) return null;
        if (TRUE_WORDS.test(s)) return true;
        if (FALSE_WORDS.test(s)) return false;
        return null;
      }
    },
    fill: {
      name: '填空题',
      chip: '填空',
      group: '客观题',
      tag: 't-fill',
      answer: '每个空一组，多组用 | 分隔，同一空多种说法用 / 分隔',
      judge: 'set',
      render: 'fill',
      auto: true
    },
    term: {
      name: '名词解释',
      chip: '名词解释',
      group: '主观题',
      tag: 't-term',
      answer: '参考答案 + 至少 3 组关键词（用 | 分隔）',
      judge: 'self',
      render: 'term',
      auto: true
    },
    essay: {
      name: '简答题',
      chip: '简答',
      group: '主观题',
      tag: 't-essay',
      answer: '按要点分条作答，提交后对照参考答案自评',
      judge: 'self',
      render: 'text',
      auto: false
    },
    comp: {
      name: '综合设计题',
      chip: '综合',
      group: '大题',
      tag: 't-comp',
      answer: '按小问分条作答，写清传感器选型、工作原理与系统组成',
      judge: 'self',
      render: 'text',
      auto: false
    },
    calc: {
      name: '计算题',
      chip: '计算',
      group: '大题',
      tag: 't-calc',
      answer: '以数值开头并带单位；解析按步骤用 | 分隔',
      judge: 'single',
      render: 'calc',
      auto: true
    },
    /* 待确认：不是可投稿题型，只用于「题型暂不支持」的降级收录，不计分不计进度 */
    note: {
      name: '待确认',
      chip: '待确认',
      group: '其它',
      tag: 't-note',
      answer: '',
      judge: 'none',
      render: 'note',
      auto: false
    }
  };

  /* 展示顺序（筛选栏与模板下拉都按这个顺序） */
  const ORDER = ['choice', 'fill', 'tf', 'term', 'essay', 'calc', 'comp'];

  const BY_CHIP = {};
  ORDER.forEach(k => { BY_CHIP[TYPES[k].chip] = k; });

  /* 「判断题」「大题」这类写法也认 */
  const ALIAS = {
    '判断': 'tf', '判断题': 'tf', '是非': 'tf', '是非题': 'tf', '对错题': 'tf',
    '选择': 'choice', '单选': 'choice', '单项选择题': 'choice', '单项选择': 'choice',
    '填空': 'fill', '填空题': 'fill', '空': 'fill',
    '名词': 'term', '名词解释': 'term', '名词解释题': 'term', '术语': 'term',
    '简答': 'essay', '简答题': 'essay',
    '综合': 'comp', '综合题': 'comp', '综合设计': 'comp', '综合设计题': 'comp',
    '综合设计分析题': 'comp', '设计题': 'comp',
    '计算': 'calc', '计算题': 'calc', '大题': 'calc'
  };

  function typeOf(label) {
    return ALIAS[String(label == null ? '' : label).trim()] || null;
  }

  function meta(type) {
    return TYPES[type] || { name: type || '未知题型', chip: type || '?', group: '其它', tag: 't-note', answer: '' };
  }

  /* 生成「题型清单」文本，供两份 AI 提示词与投稿模板使用。
   * 提示词不再手写清单，避免注册表加了新题型、提示词还停在旧版本。 */
  function typeListText() {
    const lines = ORDER.map(k => {
      const t = TYPES[k];
      return '- 【' + t.chip + '】' + t.name + ' —— 答案：' + t.answer;
    });
    return [
      '【可用题型清单】',
      lines.join('\n'),
      '',
      '只允许使用上面这 ' + ORDER.length + ' 种题型标记，不要自创标记（不要写【多选】【排序】【连线】【简答】等）。',
      '原文题型不在这份清单里时：不要改写成本库支持的题型，整题跳过，并在末尾【未生成】里写明',
      '「第 N 题（原文是XX题，本库暂不支持）」。'
    ].join('\n');
  }

  return { TYPES, ORDER, ALIAS, typeOf, meta, typeListText };
});
