#!/usr/bin/env node
/* 数据校验 + 隐私扫描
 * 用法：node scripts/check-data.js
 * 退出码：0 通过；1 有错误（CI 应据此阻断合并）
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'courses.js' && f !== '_status.js');

const errors = [];
const warns = [];
const TYPES = ['choice', 'fill', 'term', 'calc', 'note'];

// 红线：可能泄露个人信息
const PII = [
  { re: /\b1[3-9]\d{9}\b/, msg: '疑似手机号' },
  { re: /\b\d{17}[\dXx]\b/, msg: '疑似身份证号' },
  { re: /\b(20\d{2})\d{6,9}\b/, msg: '疑似学号' },
  { re: /(成绩单|花名册|学生名单|答题卡)/, msg: '疑似学生信息' }
];

function walk(v, cb) {
  if (v == null) return;
  if (typeof v === 'string') return cb(v);
  if (Array.isArray(v)) return v.forEach(x => walk(x, cb));
  if (typeof v === 'object') return Object.values(v).forEach(x => walk(x, cb));
}

let total = 0;
const idOwners = new Map();   /* 题目 id → 课程文件，用于跨课程查重 */

for (const f of files) {
  const code = fs.readFileSync(path.join(dir, f), 'utf8');
  const win = {};
  try {
    new Function('window', code)(win);
  } catch (e) {
    errors.push(`${f}: 语法错误 —— ${e.message}`);
    continue;
  }
  const OC = win.OC;
  if (!OC || !OC.course || !Array.isArray(OC.questions)) {
    errors.push(`${f}: 缺少 window.OC.course / window.OC.questions`);
    continue;
  }
  const c = OC.course;
  ['id', 'title'].forEach(k => { if (!c[k]) errors.push(`${f}: course.${k} 为空`); });
  if (!Array.isArray(c.terms) || !c.terms.length) errors.push(`${f}: course.terms 为空`);

  const ids = new Set();
  OC.questions.forEach((q, i) => {
    const tag = `${f} 第${i + 1}题${q.id ? '（' + q.id + '）' : ''}`;
    total++;
    if (!q.id) errors.push(`${tag}: 缺少 id`);
    else if (ids.has(q.id)) errors.push(`${tag}: id 重复`);
    else {
      ids.add(q.id);
      /* _status.js 的题目级下架只按 id 记录，跨课程同 id 会互相影响 */
      const owner = idOwners.get(q.id);
      if (owner && owner !== f) {
        errors.push(`${tag}: 题目 id 与 ${owner} 重复（跨课程同 id 会让下架互相影响）`);
      } else {
        idOwners.set(q.id, f);
      }
    }

    if (!TYPES.includes(q.type)) errors.push(`${tag}: type 非法（${q.type}）`);
    if (typeof q.ch !== 'number' && typeof q.ch !== 'string') errors.push(`${tag}: 缺少 ch`);
    if (!q.exp || String(q.exp).length < 8) errors.push(`${tag}: 解析过短或为空`);
    if (!q.ref) warns.push(`${tag}: 缺少出处（ref）`);

    if (q.type === 'choice') {
      if (!Array.isArray(q.opts) || q.opts.length < 2) errors.push(`${tag}: 选项不足`);
      if (typeof q.ans !== 'number' || q.ans < 0 || q.ans >= (q.opts || []).length)
        errors.push(`${tag}: ans 越界`);
    }
    if (q.type === 'fill') {
      const n = (String(q.q).match(/＿{3}/g) || []).length;
      if (!Array.isArray(q.blanks) || !q.blanks.length) errors.push(`${tag}: 缺少 blanks`);
      else if (n !== q.blanks.length) errors.push(`${tag}: 题干空位 ${n} 个，blanks ${q.blanks.length} 组`);
    }
    if (q.type === 'term') {
      if (!Array.isArray(q.kw) || q.kw.length < 3) errors.push(`${tag}: kw 关键词组不足 3 组`);
    }
    if (q.type === 'calc') {
      if (typeof q.value !== 'number') errors.push(`${tag}: 缺少数值答案 value`);
      if (!q.ansText) errors.push(`${tag}: 缺少 ansText`);
      if (!Array.isArray(q.sol) || !q.sol.length) errors.push(`${tag}: 缺少解题步骤 sol`);
    }
    if (q.type === 'note' && !q.why) errors.push(`${tag}: note 缺少 why 说明`);

    walk(q, s => {
      PII.forEach(p => {
        if (p.re.test(s)) errors.push(`${tag}: ${p.msg} —— 「${s.slice(0, 40)}」`);
      });
    });
  });
}

warns.slice(0, 8).forEach(w => console.log('  ⚠ ' + w));
if (warns.length > 8) console.log(`  ⚠ …另有 ${warns.length - 8} 条警告`);

if (errors.length) {
  console.log(`\n✗ 校验失败：${errors.length} 个问题`);
  errors.slice(0, 30).forEach(e => console.log('  · ' + e));
  process.exit(1);
}
console.log(`\n✓ 校验通过：${files.length} 门课程，${total} 道题，无个人信息命中`);
