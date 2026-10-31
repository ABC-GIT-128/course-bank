#!/usr/bin/env node
/* 把一条题目追加进课程数据文件（保持原有排版，只多一行 diff）
 *
 * 用法：
 *   node scripts/add-question.js --json /tmp/q.json
 *   node scripts/add-question.js --json /tmp/q.json --title "电路分析基础"   # 课程文件不存在时创建
 *
 * 输入 JSON：{ "course": "sensor", "title": "", "question": { ... } }
 */
const fs = require('fs');
const cf = require('./course-file.js');
const path = require('path');

const args = process.argv.slice(2);
const flag = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : undefined;
};

const jsonPath = flag('json');
if (!jsonPath) {
  console.log('用法：node scripts/add-question.js --json q.json [--title 课程名]');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const courseId = payload.course;
/* 单题：{ question }；批量：{ questions: [...] } */
const list = Array.isArray(payload.questions)
  ? payload.questions.slice()
  : (payload.question ? [payload.question] : []);
if (!courseId || !list.length) {
  console.error('JSON 里缺少 course，或没有 question / questions');
  process.exit(1);
}


const assertCourseId = cf.assertCourseId;
const cleanTitle = cf.cleanTitle;

const dataDir = path.join(__dirname, '..', 'data');
const file = cf.coursePath(courseId);

/* ---------- 课程不存在：建一个新文件 ---------- */
if (!fs.existsSync(file)) {
  const title = cleanTitle(flag('title') || payload.title);
  if (!title) {
    console.error('data/' + courseId + '.js 不存在，创建需要 --title');
    process.exit(1);
  }
  const term = flag('term') || payload.term || (new Date().getFullYear() + '-autumn');
  const label = term.replace(/-?autumn/, ' 秋').replace(/-?spring/, ' 春').trim();
  const chNames = payload.chapterNames || list.reduce((m, x) => { m[x.ch || 1] = '第' + (x.ch || 1) + '章'; return m; }, {});
  const OC = {
    course: {
      id: courseId,
      title,
      subtitle: '期末刷题',
      college: flag('college') || payload.college || '专业基础课',
      teacher: '',
      terms: [term],
      termLabels: { [term]: label },
      updatedAt: new Date().toISOString().slice(0, 10),
      license: 'CC BY-NC-SA 4.0',
      chapterNames: chNames,
      keywords: [title].concat(Object.values(chNames))
    },
    questions: list
  };
  cf.writeCourse(courseId, OC);
  console.log('✓ 已新建 data/' + courseId + '.js，含 ' + list.length + ' 题');
  process.exit(0);
}

/* ---------- 课程已存在：文本层追加，保住原有排版 ---------- */
const src = fs.readFileSync(file, 'utf8');
const eol = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

/* 先确认 id 不重复 */
const win = {};
new Function('window', src)(win);
const existing = (win.OC && win.OC.questions) || [];
const existIds = new Set(existing.map(x => x.id));

const todo = [];
list.forEach(x => {
  if (existIds.has(x.id)) { console.log('跳过已存在的 id：' + x.id); return; }
  existIds.add(x.id);
  todo.push(x);
});
if (!todo.length) {
  console.log('没有需要新增的题目（id 全部已存在）');
  process.exit(0);
}

/* 定位 questions 数组的收尾：最后一段 "换行 + 空白 + ] + 换行 + };" */
const m = /(\r?\n)([ \t]*)\]\s*(\}?;?\s*)$/.exec(src);
if (!m) {
  console.error('无法定位 questions 数组结尾，请手工添加');
  process.exit(1);
}
const closeIdx = m.index;
const head = src.slice(0, closeIdx);
const tail = src.slice(closeIdx);

/* 去掉尾部空白与多余逗号；数组为空时不能再加逗号 */
const body = head.replace(/[\s,]+$/, '');
const emptyArray = /\[[\s]*$/.test(body);
const indent = '  ';
const sep = emptyArray ? eol : ',' + eol;

const chunk = todo
  .map(x => JSON.stringify(x, null, 2).split('\n').join(eol + indent))
  .join(',' + eol + indent);

fs.writeFileSync(file, body + sep + indent + chunk + tail, 'utf8');
console.log('✓ 已追加 ' + todo.length + ' 题到 data/' + courseId + '.js，共 ' + (existing.length + todo.length) + ' 题');
todo.forEach(x => console.log('   · ' + x.id + '  ' + x.type + '  第' + x.ch + '章'));
