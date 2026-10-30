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
  const raw = fs.readFileSync(bodyFile, 'utf8');
  const S = sections(raw);

  /* 优先取表单里的「题目内容」；没有表单结构（直接粘贴正文）就退回整份正文 */
  text = getByKeyword(S, '题目内容', '题目文本', '粘贴');
  if (!text) {
    text = raw
      .split('\n')
      .filter(l => !/^###\s/.test(l))          /* 去掉表单小标题 */
      .join('\n')
      .trim();
    console.log('（正文没有「题目内容」小节，按整份正文解析）');
  }

  const courseRaw = getByKeyword(S, '所属课程');
  if (!course) {
    const m = /[（(]\s*([A-Za-z0-9_-]+)\s*[）)]/.exec(courseRaw);
    course = m ? m[1] : (courseRaw.indexOf('其它') >= 0 ? getByKeyword(S, '课程 ID', '课程ID') : courseRaw.trim());
  }
  /* 再兜底：正文里手写的「所属课程：sensor」/「课程：sensor」 */
  if (!course) {
    const m2 = /(?:所属课程|课程)\s*[:：]\s*([A-Za-z0-9_-]+)/.exec(raw);
    if (m2) { course = m2[1]; console.log('（从正文里的「' + m2[0] + '」取到课程）'); }
  }

  /* 最后兜底：用 Issue 标题当课程 id（仅当标题是英文/数字） */
  if (!course) {
    const t = flag('issue-title') || '';
    const slug = String(t).replace(/^\[[^\]]*\]\s*/, '')
      .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) { course = slug; console.log('（用 Issue 标题推出课程 id：' + slug + '）'); }
  }

  /* 去掉手写的元信息行（如「所属课程：linux」），免得被当成第一题的题干 */
  text = text.split('\n')
    .filter(l => !/^\s*(所属课程|课程|默认章节|章节)\s*[:：]/.test(l))
    .join('\n')
    .trim();

  /* 版权确认：模板要求两项都勾；手工建的 Issue 没有这一节，只提示不拦 */
  const promiseRaw = getByKeyword(S, '版权确认', '版权');
  if (promiseRaw) {
    const checked = (promiseRaw.match(/-\s*\[[xX]\]/g) || []).length;
    if (checked < 2) {
      console.error('✗ 版权确认没勾全（当前 ' + checked + '/2 项）');
      console.error('  请在 Issue 表单里把两个确认都勾上后重新提交，或由维护者手工确认后处理。');
      process.exit(1);
    }
    console.log('版权确认：两项均已勾选');
  } else {
    console.log('⚠ 未检测到「版权确认」小节（可能是手工建的 Issue），请人工确认版权与个人信息');
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

if (!course) {
  const dir = path.join(__dirname, '..', 'data');
  const ids = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js') && f !== 'courses.js' && f !== '_status.js')
    .map(f => f.replace(/\.js$/, ''));
  console.error('✗ 没找到「所属课程」。');
  console.error('  请在本条 Issue 里补一行，例如：所属课程：' + (ids[0] || 'sensor'));
  console.error('  现有课程：' + (ids.join('、') || '（还没有课程）'));
  process.exit(1);
}


/* 课程 id 只允许小写字母/数字/-/_，防止路径穿越写到 data/ 之外 */
function assertCourseId(id) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(id || ''))) {
    console.error('✗ 非法课程 ID：' + id + '（只允许小写字母、数字、- 和 _）');
    process.exit(1);
  }
}

if (course) assertCourseId(course);

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
