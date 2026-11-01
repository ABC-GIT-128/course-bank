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
 *   check     校验一条题目，返回错误描述数组
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
      chip: '选择',
      group: '客观题',
      tag: 't-choice',
      answer: '一个选项字母（A/B/C/D）'
    },
    tf: {
      name: '判断题',
      chip: '判断',
      group: '客观题',
      tag: 't-tf',
      answer: '「正确」或「错误」（也认 对/错、√/×、T/F）',
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
      answer: '每个空一组答案，多组用 | 分隔，同一空多种说法用 / 分隔'
    },
    term: {
      name: '名词解释',
      chip: '名词解释',
      group: '主观题',
      tag: 't-term',
      answer: '参考答案 + 至少 3 组关键词（用 | 分隔）'
    },
    calc: {
      name: '计算题',
      chip: '大题',
      group: '大题',
      tag: 't-calc',
      answer: '以数值开头并带单位；解析按步骤用 | 分隔'
    }
  };

  /* 展示顺序（筛选栏与模板下拉都按这个顺序） */
  const ORDER = ['choice', 'fill', 'tf', 'term', 'calc'];

  const BY_CHIP = {};
  ORDER.forEach(k => { BY_CHIP[TYPES[k].chip] = k; });

  /* 「判断题」「大题」这类写法也认 */
  const ALIAS = {
    '判断': 'tf', '判断题': 'tf', '是非': 'tf', '是非题': 'tf', '对错题': 'tf',
    '选择': 'choice', '单选': 'choice', '单项选择题': 'choice', '单项选择': 'choice',
    '填空': 'fill', '填空题': 'fill', '空': 'fill',
    '名词': 'term', '名词解释': 'term', '名词解释题': 'term', '术语': 'term',
    '计算': 'calc', '计算题': 'calc', '大题': 'calc', '简答': 'calc', '简答题': 'calc'
  };

  function typeOf(label) {
    return ALIAS[String(label == null ? '' : label).trim()] || null;
  }

  function meta(type) {
    return TYPES[type] || { name: type || '未知题型', chip: type || '?', group: '其它', tag: 't-note', answer: '' };
  }

  return { TYPES, ORDER, ALIAS, typeOf, meta };
});
