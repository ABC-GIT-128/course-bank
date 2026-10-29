#!/usr/bin/env node
/* 从表格（CSV）导入题目 —— 给"手机上填问卷、电脑上一键入库"用的
 *
 * 用法：
 *   node scripts/import-form.js --file 导出.csv --course circuit
 *   （课程不存在时加 --title "电路分析基础" [--college 专业基础课] [--term 2026-autumn]）
 *
 * 表头（顺序随意，缺列按空处理）：
 *   题型,章节,题干,选项,答案,解析,出处,关键词,单位,容差,标签,ID
 *
 * 约定：
 *   选择题  选项用 | 分隔（A|B|C|D），答案写字母 A
 *   填空题  答案按空顺序用 | 分隔；同一空多个可接受答案用 / 分隔
 *   名词解释 关键词用 | 分隔；答案列写参考答案
 *   计算题  答案写数值，单位/容差单列
 *   标签    ppt 或 key，可留空
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : undefined;
};

const csvPath = flag('file');
const courseId = flag('course');
if (!csvPath || !courseId) {
  console.log('用法：node scripts/import-form.js --file 导出.csv --course <课程id> [--title 课程名]');
  process.exit(1);
}

/* ---------- CSV 解析（支持引号包裹、逗号、换行） ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  text = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
if (rows.length < 2) { console.error('CSV 至少要有表头 + 1 行数据'); process.exit(1); }

const header = rows[0].map(h => h.trim());
const idx = name => header.indexOf(name);
const col = (r, name) => {
  const i = idx(name);
  return i >= 0 ? (r[i] || '').trim() : '';
};

const TYPE_MAP = {
  '选择': 'choice', '单选': 'choice', 'choice': 'choice',
  '填空': 'fill', 'fill': 'fill',
  '名词': 'term', '名词解释': 'term', 'term': 'term',
  '计算': 'calc', 'calc': 'calc'
};

/* ---------- 读现有课程或新建 ---------- */
const dataFile = path.join(__dirname, '..', 'data', courseId + '.js');
let OC;
if (fs.existsSync(dataFile)) {
  const win = {};
  new Function('window', fs.readFileSync(dataFile, 'utf8'))(win);
  OC = win.OC;
  if (!OC || !OC.questions) { console.error('data/' + courseId + '.js 结构不对'); process.exit(1); }
} else {
  const title = flag('title');
  if (!title) { console.error('课程文件不存在，创建需要 --title'); process.exit(1); }
  const term = flag('term') || (new Date().getFullYear() + '-autumn');
  OC = {
    course: {
      id: courseId, title, subtitle: '期末刷题',
      college: flag('college') || '专业基础课', teacher: '',
      terms: [term], termLabels: { [term]: term.replace('autumn', ' 秋').replace('spring', ' 春') },
      updatedAt: new Date().toISOString().slice(0, 10),
      license: 'CC BY-NC-SA 4.0', chapterNames: {}, keywords: [title]
    },
    questions: []
  };
}

/* 清掉 new-course.js 生成的示例题，避免占位内容混进正式题库 */
const before = OC.questions.length;
OC.questions = OC.questions.filter(q => !(String(q.q).indexOf('在这里写题干') === 0 || String(q.exp || '').indexOf('在这里写解析') >= 0));
if (OC.questions.length !== before) console.log(`已移除 ${before - OC.questions.length} 道示例占位题`);

/* ---------- 逐行转换 ---------- */
const added = [], skipped = [];
const has = new Set(OC.questions.map(q => q.id));
let seq = OC.questions.length;

rows.slice(1).forEach((r, n) => {
  const line = n + 2;
  const rawType = col(r, '题型');
  const type = TYPE_MAP[rawType];
  const qText = col(r, '题干');
  if (!type) { skipped.push(`第${line}行：题型不认识「${rawType}」`); return; }
  if (!qText) { skipped.push(`第${line}行：题干为空`); return; }

  const ch = Number(col(r, '章节')) || 1;
  const ansText = col(r, '答案');
  const expText = col(r, '解析');
  const refText = col(r, '出处');
  const tagText = col(r, '标签');
  const q = { id: col(r, 'ID') || `${courseId}-${String(++seq).padStart(3, '0')}`, type, ch };
  if (tagText === 'ppt' || tagText === 'key') q.src = tagText;

  if (type === 'choice') {
    const opts = col(r, '选项').split('|').map(s => s.trim()).filter(Boolean);
    let ans = -1;
    if (/^[A-Da-d]$/.test(ansText)) ans = ansText.toUpperCase().charCodeAt(0) - 65;
    else if (/^\d+$/.test(ansText)) ans = Number(ansText) - 1;
    if (opts.length < 2) { skipped.push(`第${line}行：选项少于 2 个`); return; }
    if (ans < 0 || ans >= opts.length) { skipped.push(`第${line}行：答案「${ansText}」与选项数不匹配`); return; }
    q.q = qText; q.opts = opts; q.ans = ans;
  } else if (type === 'fill') {
    const blanks = ansText.split('|').map(s => s.split('/').map(x => x.trim()).filter(Boolean)).filter(a => a.length);
    if (!blanks.length) { skipped.push(`第${line}行：填空题缺答案`); return; }
    q.q = qText; q.blanks = blanks;
  } else if (type === 'term') {
    const kw = col(r, '关键词').split('|').map(s => s.split('/').map(x => x.trim()).filter(Boolean)).filter(a => a.length);
    if (kw.length < 3) { skipped.push(`第${line}行：名词解释关键词不足 3 组`); return; }
    q.q = qText; q.kw = kw;
  } else {
    const v = Number(String(ansText).replace(/[^\d.\-eE]/g, ''));
    if (isNaN(v)) { skipped.push(`第${line}行：计算题答案不是数字「${ansText}」`); return; }
    q.q = qText; q.value = v;
    q.unit = col(r, '单位');
    q.tol = Number(col(r, '容差')) || 0.03;
    q.ansText = ansText + (q.unit ? ' ' + q.unit : '');
    q.sol = expText ? expText.split('|').map(s => s.trim()).filter(Boolean) : ['（待补充解题步骤）'];
  }

  q.exp = expText ? (type === 'calc' ? `<p>${expText.split('|')[0]}</p>` : `<p>${expText}</p>`) : '<p>（待补充解析）</p>';
  q.ref = refText || '（待补出处）';

  if (has.has(q.id)) { skipped.push(`第${line}行：id 重复「${q.id}」`); return; }
  has.add(q.id);
  OC.questions.push(q);
  added.push(q.id);
});

/* ---------- 写回 ---------- */
const head = `/* 课程数据：${OC.course.title}\n * 由 scripts/import-form.js 生成，可继续手工编辑。\n * 字段说明见 README.md「数据格式」。\n */\n`;
fs.writeFileSync(dataFile, head + 'window.OC = ' + JSON.stringify(OC, null, 2) + ';\n', 'utf8');

console.log(`导入完成：新增 ${added.length} 题，跳过 ${skipped.length} 行`);
if (skipped.length) skipped.slice(0, 10).forEach(s => console.log('  · ' + s));
console.log('\n下一步：node scripts/build-index.js && node scripts/check-data.js');
