#!/usr/bin/env node
/* 发布前裁剪：让「下架」在部署产物里真正生效
 *
 * 用法：node scripts/prune-build.js .build
 *
 * 为什么需要它：
 *   hidden 只影响首页是否显示，原始 data/*.js 仍会被整份部署，
 *   任何人直接访问 /data/xxx.js 都能下载到"已下架"的题目。
 *   涉及版权/隐私的删除请求，这是硬伤。
 *
 * 做的事：
 *   1) 下架课程的 data/<id>.js 不进产物；
 *   2) 其短地址页 <id>/index.html 换成一个不含任何数据的静态提示页；
 *   3) 在架课程里被下架的题目，从数据文件中剔除；
 *   4) data/courses.js 里移除下架课程的条目。
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('用法：node scripts/prune-build.js <构建输出目录>');
  process.exit(1);
}

const dataDir = path.join(dir, 'data');
if (!fs.existsSync(dataDir)) {
  console.error('找不到 ' + dataDir);
  process.exit(1);
}

/* ---------- 读状态表 ---------- */
let STATUS = { questions: {}, courses: {} };
const statusFile = path.join(dataDir, '_status.js');
if (fs.existsSync(statusFile)) {
  const win = {};
  try {
    new Function('window', fs.readFileSync(statusFile, 'utf8'))(win);
    STATUS = win.OC_STATUS || STATUS;
  } catch (e) {
    console.error('✗ _status.js 解析失败，无法裁剪：' + e.message);
    console.error('  为避免把已下架内容发出去，这里直接失败。');
    process.exit(1);
  }
}
const hiddenCourse = id => (STATUS.courses || {})[id] && STATUS.courses[id].status === 'hidden';
const hiddenQuestion = id => (STATUS.questions || {})[id] && STATUS.questions[id].status === 'hidden';

/* ---------- 逐个课程文件裁剪 ---------- */
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.js') && f !== 'courses.js' && f !== '_status.js');
const dropped = [];
const trimmed = [];

files.forEach(f => {
  const full = path.join(dataDir, f);
  const win = {};
  let OC;
  try {
    new Function('window', fs.readFileSync(full, 'utf8'))(win);
    OC = win.OC;
  } catch (e) {
    console.error('✗ 解析失败：' + f + ' —— ' + e.message);
    process.exit(1);
  }
  if (!OC || !OC.course) return;

  const id = OC.course.id;

  /* 整门课下架：数据文件不进产物 */
  if (hiddenCourse(id)) {
    fs.rmSync(full, { force: true });
    dropped.push(id);
    writeStubPage(path.join(dir, id, 'index.html'), OC.course.title, (STATUS.courses[id] || {}).reason);
    return;
  }

  /* 单题下架：从数据里剔除 */
  const before = (OC.questions || []).length;
  const kept = (OC.questions || []).filter(q => !hiddenQuestion(q.id));
  if (kept.length !== before) {
    const out = '/* 发布产物：已剔除下架题目（' + (before - kept.length) + ' 道） */\n'
      + 'window.OC = ' + JSON.stringify({ course: OC.course, questions: kept }, null, 2) + ';\n';
    fs.writeFileSync(full, out, 'utf8');
    trimmed.push(id + ' -' + (before - kept.length));
  }
});

/* ---------- 索引里移除下架课程 ---------- */
const idxFile = path.join(dataDir, 'courses.js');
if (fs.existsSync(idxFile)) {
  const src = fs.readFileSync(idxFile, 'utf8');
  const win = {};
  try {
    new Function('window', src)(win);
    const list = (win.OC_COURSES || []).filter(c => !hiddenCourse(c.id));
    const head = '/* 发布产物：已移除下架课程 */\n'
      + 'window.OC_RETENTION = ' + JSON.stringify(win.OC_RETENTION || {}) + ';\n'
      + 'window.OC_COURSES = ' + JSON.stringify(list, null, 2) + ';\n';
    fs.writeFileSync(idxFile, head, 'utf8');
  } catch (e) {
    console.error('✗ courses.js 解析失败：' + e.message);
    process.exit(1);
  }
}

/* ---------- 下架课生成一个不含数据的提示页 ---------- */
function writeStubPage(file, title, reason) {
  const safe = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>课程已下架 · OpenCourse</title>
<link rel="stylesheet" href="../assets/app.css">
</head><body class="home">
<div class="topbar"><div class="topin"><a class="logo" href="../index.html">Open<span>Course</span></a></div></div>
<main style="max-width:640px;margin:80px auto;padding:0 20px;text-align:center">
  <h1 style="font-size:20px;margin:0 0 12px">此课程已下架</h1>
  <p style="color:#6b7280;line-height:1.9">${safe(title)}${reason ? '<br>原因：' + safe(reason) : ''}</p>
  <p style="color:#6b7280;font-size:13px;line-height:1.9">
    相关题目数据已从本站移除。如需恢复，请联系维护者。
  </p>
  <p style="margin-top:26px"><a class="hchip" href="../index.html">← 返回全部课程</a></p>
</main></body></html>
`, 'utf8');
}

if (dropped.length) console.log('  已下架并移出产物：' + dropped.join('、'));
if (trimmed.length) console.log('  已剔除下架题目：' + trimmed.join('、'));
console.log(`✓ 发布裁剪完成（课程 ${files.length} 个，下架 ${dropped.length} 个` +
  (trimmed.length ? '，剔除题目 ' + trimmed.length + ' 门' : '') + '）');
