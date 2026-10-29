#!/usr/bin/env node
/* 批量投稿：把 Issue 里粘贴的一整段题目解析成题目数组
 *
 * 用法：
 *   node scripts/parse-batch.js --body-file issue.md --issue-number 12 --out .tmp/batch.json
 *   node scripts/parse-batch.js --text-file 题目.txt --course sensor --check      # 本地自测
 *
 * 输出：
 *   { "course": "sensor", "questions": [ ... ], "errors": [ ... ] }
 *
 * 说明：
 *   - 格式解析交给 assets/parse-lib.js（与网页预览同一份代码）
 *   - 部分成功也照常输出：能入库的先入库，跳过的一并在 errors 里说明原因
 *   - 一道都没成时退出码 1，机器人会把原因贴回 Issue
 */
const fs = require('fs');
const path = require('path');
const { parseBatch } = require(path.join(__dirname, '..', 'assets', 'parse-lib.js'));

const args = process.argv.slice(2);
const flag = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : undefined;
};

/* ---------- 拆 Issue 表单的章节 ---------- */
function sections(text) {
  const map = {};
  let cur = null;
  for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) { cur = m[1]; map[cur] = []; continue; }
    if (cur) map[cur].push(line);
  }
  const out = {};
  Object.keys(map).forEach(k => { out[k] = map[k].join('\n').trim(); });
  return out;
}

function getByKeyword(S) {
  const keys = Object.keys(S);
  for (const want of arguments) {
    const hit = keys.find(k => k.indexOf(want) >= 0);
    if (hit && S[hit] && S[hit].trim() !== '_No response_') return S[hit];
  }
  return '';
}

/* ---------- 取文本与课程 ---------- */
let text = '';
let course = flag('course') || '';
let defaultCh = Number(flag('ch')) || 1;

const bodyFile = flag('body-file');
const textFile = flag('text-file');

if (bodyFile) {
  const S = sections(fs.readFileSync(bodyFile, 'utf8'));
  text = getByKeyword(S, '题目内容', '题目文本', '粘贴', '内容');
  const courseRaw = getByKeyword(S, '所属课程');
  if (!course) {
    const m = /[（(]\s*([A-Za-z0-9_-]+)\s*[）)]/.exec(courseRaw);
    course = m ? m[1] : (courseRaw.indexOf('其它') >= 0 ? getByKeyword(S, '课程 ID', '课程ID') : courseRaw.trim());
  }
  const chRaw = getByKeyword(S, '默认章节', '章节');
  if (chRaw) defaultCh = Number(/(\d+)/.exec(chRaw)[1]) || defaultCh;
} else if (textFile) {
  text = fs.readFileSync(textFile, 'utf8');
} else {
  console.log('用法：node scripts/parse-batch.js --body-file issue.md [--issue-number 12] [--out out.json]\n' +
              '      node scripts/parse-batch.js --text-file 题目.txt --course sensor [--check]');
  process.exit(1);
}

if (!text) {
  console.error('✗ 没找到「题目内容」这一栏，或者它是空的');
  process.exit(1);
}

const issueNumber = flag('issue-number') || '0';
const idPrefix = 'b' + (issueNumber !== '0' ? issueNumber + '-' : '');

const r = parseBatch(text, { defaultCh, idPrefix });

/* ---------- 报告 ---------- */
console.log('识别 ' + r.stats.total + ' 题：可用 ' + r.stats.ok + ' 题' +
  (r.stats.skipped ? '，跳过 ' + r.stats.skipped + ' 题' : ''));
if (r.questions.length) {
  const names = { choice: '选择', fill: '填空', term: '名词', calc: '计算' };
  const by = Object.entries(r.stats.byType).map(([k, v]) => names[k] + ' ' + v).join(' / ');
  console.log('题型分布：' + by);
  console.log('章节分布：第' + [...new Set(r.questions.map(q => q.ch))].sort((a, b) => a - b).join('、') + '章');
}
if (r.errors.length) {
  console.log('');
  console.log('跳过的题目（改好后可以重新提交）：');
  r.errors.forEach(e => {
    console.log('  ✗ 第 ' + e.index + ' 题（' + (e.stem || '').slice(0, 24) + '…）');
    e.msg.forEach(m => console.log('      · ' + m));
  });
}

if (!r.questions.length) {
  console.error('\n✗ 没有任何题目可以入库，请按上面的提示修改格式');
  process.exit(1);
}

const payload = { course, questions: r.questions, errors: r.errors };
const out = flag('out');

if (args.indexOf('--check') >= 0) {
  console.log('\n✓ 可以入库：' + course + ' / ' + r.questions.length + ' 题（仅校验，未写文件）');
} else if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8');
  console.log('\n✓ 已写出 ' + out + '（课程 ' + course + '，' + r.questions.length + ' 题）');
} else {
  console.log(JSON.stringify(payload, null, 2));
}
