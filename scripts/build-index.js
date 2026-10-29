#!/usr/bin/env node
/* 扫描 data/*.js，生成首页用的课程索引 data/courses.js
 * - 合并 data/_status.js 的状态覆盖（hidden / archived）
 * - 计算"近两年窗口"，超出窗口的课程自动标记 archived
 *
 * 用法：node scripts/build-index.js [--year 2026] [--keep-years 2]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const nowYear = Number(getArg('year', new Date().getFullYear()));
const keepYears = Number(getArg('keep-years', 2));
const cutoff = nowYear - (keepYears - 1);   // 2026 年起，保留 2025、2026

const dir = path.join(__dirname, '..', 'data');

/* 读取状态覆盖表 */
let STATUS = { questions: {}, courses: {} };
const statusFile = path.join(dir, '_status.js');
if (fs.existsSync(statusFile)) {
  const win = {};
  try {
    new Function('window', fs.readFileSync(statusFile, 'utf8'))(win);
    STATUS = win.OC_STATUS || STATUS;
  } catch (e) {
    console.error('_status.js 解析失败:', e.message);
  }
}

const qStatus = id => (STATUS.questions && STATUS.questions[id]) || null;
const cStatus = id => (STATUS.courses && STATUS.courses[id]) || null;

const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'courses.js' && f !== '_status.js');

const list = [];
for (const f of files) {
  const code = fs.readFileSync(path.join(dir, f), 'utf8');
  const win = {};
  try {
    new Function('window', code)(win);
  } catch (e) {
    console.error('解析失败:', f, e.message);
    continue;
  }
  const OC = win.OC;
  if (!OC || !OC.course || !Array.isArray(OC.questions)) {
    console.error('跳过（缺少 OC.course / OC.questions）:', f);
    continue;
  }
  const c = OC.course;
  const qs = OC.questions;

  /* 过滤被下架的题目 */
  const hiddenIds = qs.filter(q => {
    const s = qStatus(q.id);
    return s && s.status === 'hidden';
  }).map(q => q.id);
  const visibleQs = qs.filter(q => hiddenIds.indexOf(q.id) < 0);

  const chs = [...new Set(visibleQs.map(q => Number(q.ch)))].sort((a, b) => a - b);
  const tags = {};
  visibleQs.forEach(q => {
    if (q.src) tags[q.src] = (tags[q.src] || 0) + 1;
    tags[q.type] = (tags[q.type] || 0) + 1;
  });

  const terms = c.terms || [];
  const years = terms.map(t => Number(String(t).slice(0, 4))).filter(n => !isNaN(n));
  const newest = years.length ? Math.max(...years) : 0;
  const outOfWindow = years.length > 0 && newest < cutoff;

  const ov = cStatus(c.id) || {};
  let status = ov.status || 'active';
  if (status === 'active' && outOfWindow) status = 'archived';

  list.push({
    id: c.id,
    file: f,
    title: c.title,
    subtitle: c.subtitle || '',
    college: c.college || '未分类',
    terms: terms,
    termLabels: c.termLabels || {},
    updatedAt: c.updatedAt || '',
    license: c.license || '',
    chapters: chs,
    chapterNames: c.chapterNames || {},
    count: visibleQs.length,
    hidden: hiddenIds.length,
    tags: tags,
    keywords: c.keywords || [],
    status: status,
    statusReason: ov.reason || '',
    statusAt: ov.at || '',
    outOfWindow: outOfWindow,
    newestYear: newest
  });
}

/* 隐藏课程排最后，其余按题量 */
const rank = { active: 0, archived: 1, hidden: 2 };
list.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.count - a.count));

const out = '/* 自动生成，请勿手改：node scripts/build-index.js */\n'
  + 'window.OC_RETENTION = ' + JSON.stringify({
      keepYears, cutoff, generatedYear: nowYear,
      generatedAt: new Date().toISOString()
    }) + ';\n'
  + 'window.OC_COURSES = ' + JSON.stringify(list, null, 2) + ';\n';
fs.writeFileSync(path.join(dir, 'courses.js'), out, 'utf8');

const act = list.filter(c => c.status === 'active');
const arc = list.filter(c => c.status === 'archived');
const hid = list.filter(c => c.status === 'hidden');
console.log(`已生成 data/courses.js：${list.length} 门课程，${list.reduce((s, c) => s + c.count, 0)} 题` +
  `（在架 ${act.length} · 归档 ${arc.length} · 下架 ${hid.length}；保留窗口 ${cutoff}–${nowYear}）`);
if (arc.length) console.log('  归档：' + arc.map(c => c.title + '(' + c.newestYear + ')').join('、'));
if (hid.length) console.log('  下架：' + hid.map(c => c.title).join('、'));

/* ==================== 课程短地址：/sensor/ ====================
 * 每门课生成一个目录，里面是固定了课程 id 的刷题页。
 * 这样链接是 /course-bank/sensor/，比 quiz.html?course=sensor 好记。
 * 老链接（quiz.html?course=sensor）仍然可用。
 */
const ROOT = path.join(__dirname, '..');
const QUIZ = path.join(ROOT, 'quiz.html');
const MARK = '<!--oc-course-route-->';

function buildRoute(c) {
  if (!fs.existsSync(QUIZ)) return false;
  let html = fs.readFileSync(QUIZ, 'utf8');

  /* 1) base：让页面里的 assets/、data/ 相对路径指回站点根目录 */
  if (html.indexOf('<base ') < 0) {
    html = html.replace('<meta charset="UTF-8">',
      '<meta charset="UTF-8">\n' + MARK + '\n<base href="../">');
  }
  /* 2) 固定课程 id，不再依赖 ?course= */
  const anchor = '<script src="data/_status.js"></script>';
  if (html.indexOf(anchor) >= 0) {
    html = html.replace(anchor,
      '<script>window.OC_COURSE_ID = ' + JSON.stringify(c.id) + ';</script>\n' + anchor);
  }
  /* 3) 静态标题（JS 也会再改一次，主要是给分享卡片用） */
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + c.title + ' · 刷题</title>');

  const d = path.join(ROOT, c.id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html, 'utf8');
  return true;
}

/* 清掉已经不存在的课程目录（只删带标记的，绝不碰别的目录） */
function cleanupRoutes(keep) {
  fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name[0] !== '.' && keep.indexOf(e.name) < 0)
    .forEach(e => {
      const f = path.join(ROOT, e.name, 'index.html');
      if (!fs.existsSync(f)) return;
      const head = fs.readFileSync(f, 'utf8').slice(0, 2000);
      if (head.indexOf(MARK) < 0) return;
      fs.rmSync(path.join(ROOT, e.name), { recursive: true, force: true });
      console.log('  已移除过期课程目录：' + e.name + '/');
    });
}

const kept = [];
list.forEach(c => { if (buildRoute(c)) kept.push(c.id); });
cleanupRoutes(kept);
console.log('已生成 ' + kept.length + ' 个课程短地址：' + kept.map(k => '/' + k + '/').join(' '));

