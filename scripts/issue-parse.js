#!/usr/bin/env node
/* 把 GitHub Issue 表单（投稿）解析成题目的 JSON
 *
 * 用法：
 *   node scripts/issue-parse.js --body-file issue.md --issue-number 12 --out /tmp/q.json
 *   node scripts/issue-parse.js --body-file issue.md --issue-number 12 --check   # 只校验不写文件
 *
 * 输出格式：
 *   { "course": "sensor", "title": "", "college": "", "term": "",
 *     "question": { id, type, ch, q, ... } }
 *
 * 说明：
 *   - 只做"能不能用"的判定，不判断答案对不对（那由人 review）
 *   - 缺字段、格式不对时退出码为 1，并打印具体原因，供机器人回帖给投稿人
 */
const fs = require('fs');

/* ---------- 参数 ---------- */
const args = process.argv.slice(2);
const flag = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : undefined;
};

const bodyFile = flag('body-file');
const issueNumber = flag('issue-number') || '0';
const outFile = flag('out');

if (!bodyFile) {
  console.log('用法：node scripts/issue-parse.js --body-file issue.md --issue-number 12 [--out q.json]');
  process.exit(1);
}

const body = fs.readFileSync(bodyFile, 'utf8');

/* ---------- 拆章节：GitHub 表单每项渲染成 "### 标题\n值" ---------- */
function sections(text) {
  const map = {};
  let cur = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) { cur = m[1]; map[cur] = []; continue; }
    if (cur) map[cur].push(line);
  }
  const out = {};
  Object.keys(map).forEach(k => { out[k] = map[k].join('\n').trim(); });
  return out;
}

const S = sections(body);

/* 表单标题可能改字，所以按关键词模糊取 */
function get() {
  const keys = Object.keys(S);
  for (const want of arguments) {
    const hit = keys.find(k => k.indexOf(want) >= 0);
    if (hit && S[hit] && S[hit].trim() !== '_No response_') return S[hit];
  }
  return '';
}

const fail = [];
const need = (val, msg) => { if (!val) fail.push(msg); return val; };

/* ---------- 课程 ---------- */
const courseRaw = need(get('所属课程'), '没有填「所属课程」');
let course = '';
const idMatch = /[（(]\s*([A-Za-z0-9_-]+)\s*[）)]/.exec(courseRaw);
if (idMatch) course = idMatch[1];
else if (courseRaw && courseRaw.indexOf('其它') < 0) course = courseRaw.trim();
if (!course) course = (get('课程 ID', '课程ID') || '').trim();
need(course, '课程 id 为空：请在「课程 ID」里填写，或让维护者先建课');

/* ---------- 基本信息 ---------- */
const chRaw = get('章节');
const chNum = (/(\d+)/.exec(chRaw) || [])[1];
const ch = chNum ? Number(chNum) : 1;

const typeRaw = get('题型');
const TYPE_MAP = {
  '单项选择': 'choice', '选择': 'choice', '单选': 'choice',
  '填空': 'fill',
  '名词解释': 'term', '名词': 'term',
  '计算': 'calc', '计算题': 'calc'
};
let type = '';
Object.keys(TYPE_MAP).forEach(k => { if (!type && typeRaw.replace(/\s/g, '') === k) type = TYPE_MAP[k]; });
if (!type) Object.keys(TYPE_MAP).forEach(k => { if (!type && typeRaw.indexOf(k) >= 0) type = TYPE_MAP[k]; });
need(type, '「题型」没选或无法识别：' + typeRaw);

/* 题干：填空统一成三个全角下划线 */
let qText = need(get('题干'), '没有填「题干」');
qText = qText.replace(/_{2,}/g, '＿＿＿').replace(/＿{2,}/g, '＿＿＿');

const answer = need(get('答案'), '没有填「答案」');
const expText = need(get('解析'), '没有填「解析」');
const refText = need(get('出处'), '没有填「出处」');

/* ---------- 版权确认 ---------- */
const promise = get('版权确认', '确认');
const checked = (promise.match(/\[[xX]\]/g) || []).length;
const totalBoxes = (promise.match(/\[[ xX]\]/g) || []).length;
if (totalBoxes && checked < totalBoxes) fail.push('版权确认里有未勾选的项，请两条都确认后再提交');
if (!totalBoxes) fail.push('没有找到版权确认（请使用「新增题目」模板提交，不要直接写自由文本）');

/* ---------- 组装题目 ---------- */
const q = {
  id: 'gh' + issueNumber,
  type,
  ch
};

if (type === 'choice') {
  const rawOpts = get('选项');
  let opts = rawOpts.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^[-*]\s*/, '').replace(/^[A-Da-d]\s*[.、．:：)）]\s*/, ''))
    .filter(Boolean);

  if (opts.length < 2) fail.push('选择题至少要有 2 个选项（每行一个，写成「A. 选项内容」）');

  let ans = -1;
  const a = answer.trim();
  if (/^[A-Da-d]$/.test(a)) ans = a.toUpperCase().charCodeAt(0) - 65;
  else if (/^\d+$/.test(a)) ans = Number(a) - 1;
  else {
    /* 答案直接写了选项原文 */
    const k = opts.findIndex(o => o === a);
    if (k >= 0) ans = k;
  }
  if (ans < 0 || ans >= opts.length) fail.push('「答案」要写选项字母（A/B/C/D），当前是：' + a);

  q.q = qText; q.opts = opts; q.ans = ans;
}

if (type === 'fill') {
  const nBlank = (qText.match(/＿{3}/g) || []).length;
  if (!nBlank) fail.push('填空题的题干里没有 ＿＿＿ 空位标记');
  const blanks = answer.split(/[|\n]/)
    .map(s => s.split('/').map(x => x.trim()).filter(Boolean))
    .filter(a => a.length);
  if (blanks.length !== nBlank) {
    fail.push('题干有 ' + nBlank + ' 个空，但「答案」给了 ' + blanks.length + ' 组（多个空用 | 或换行分隔）');
  }
  q.q = qText; q.blanks = blanks;
}

if (type === 'term') {
  let kw = get('关键词', '要点')
    .split(/[|\n]/)
    .map(s => s.split('/').map(x => x.trim()).filter(Boolean))
    .filter(a => a.length);
  if (!kw.length) {
    /* 没单独填关键词：退回用答案里的顿号/逗号切 */
    kw = answer.split(/[、，,；;\s]+/).map(x => x.trim()).filter(x => x.length >= 2).map(x => [x]);
  }
  if (kw.length < 3) {
    fail.push('名词解释需要至少 3 组关键词（在「关键词」里用 | 分隔，或写更多要点），当前 ' + kw.length + ' 组');
  }
  q.q = qText; q.kw = kw;
}

if (type === 'calc') {
  const v = Number(String(answer).replace(/[^\d.eE+-]/g, ''));
  if (isNaN(v)) fail.push('计算题的「答案」要以数值开头，当前是：' + answer);
  const ua = get('单位', '容差');
  const unit = (/[A-Za-z%℃Ωμ./²³]+/.exec(ua) || [''])[0];
  const tol = (/0?\.\d+/.exec(ua) || [])[0];
  q.q = qText;
  q.value = v;
  q.unit = unit;
  q.tol = tol ? Number(tol) : 0.03;
  q.ansText = String(answer).trim();
  q.sol = expText.split(/[|\n]/).map(s => s.trim()).filter(Boolean);
  if (!q.sol.length) fail.push('计算题需要写解题步骤（解析里每行一步，或用 | 分隔）');
}

q.exp = '<p>' + expText.split('\n').filter(Boolean).join('</p><p>') + '</p>';
q.ref = refText;

/* ---------- 输出 ---------- */
if (fail.length) {
  console.error('✗ 这条投稿还不能自动入库：');
  fail.forEach(f => console.error('  · ' + f));
  process.exit(1);
}

const payload = { course, question: q };

if (args.indexOf('--check') >= 0) {
  console.log('✓ 可以入库：' + course + ' / ' + q.id + ' / ' + q.type);
} else if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log('✓ 已解析：' + course + ' / ' + q.id + ' / ' + q.type + ' → ' + outFile);
} else {
  console.log(JSON.stringify(payload, null, 2));
}
