#!/usr/bin/env node
/* 管理员工具：管理课程/题目的下架与归档
 *
 * 用法：
 *   node scripts/admin.js list                              查看全部课程与状态
 *   node scripts/admin.js hide <题目id> --reason "答案有误"   下架一道题
 *   node scripts/admin.js show <题目id>                      恢复一道题
 *   node scripts/admin.js hide-course <课程id> --reason "…"   下架整门课
 *   node scripts/admin.js show-course <课程id>               恢复整门课
 *   node scripts/admin.js archive <课程id>                   手动归档（移出首页在架列表）
 *   node scripts/admin.js unarchive <课程id>                 取消归档
 *   node scripts/admin.js retire [--year 2026] [--keep 2]    按窗口批量归档过期课程
 *   node scripts/admin.js log                                查看下架/归档记录
 *
 * 设计说明：
 * - 只改 data/_status.js，不动题库内容；一条记录一行 diff，便于 review 与回溯。
 * - "下架"是软删除：页面不再展示，数据仍在，随时可 show 恢复。
 * - 真正的权限边界是仓库写权限（GitHub 分支保护 + CODEOWNERS），不是这个脚本。
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data');
const statusFile = path.join(dir, '_status.js');
const args = process.argv.slice(2);
const cmd = args[0];

const flag = name => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);
const by = () => flag('by') || 'admin';

/* ---------- 读取 ---------- */
function readStatus() {
  const win = {};
  new Function('window', fs.readFileSync(statusFile, 'utf8'))(win);
  const s = win.OC_STATUS || {};
  return { version: 1, updatedAt: today(), questions: {}, courses: {}, ...s };
}

function readCourses() {
  const out = [];
  fs.readdirSync(dir)
    .filter(f => f.endsWith('.js') && f !== 'courses.js' && f !== '_status.js')
    .forEach(f => {
      const win = {};
      try {
        new Function('window', fs.readFileSync(path.join(dir, f), 'utf8'))(win);
      } catch (e) { return; }
      if (win.OC && win.OC.course) out.push({ file: f, course: win.OC.course, questions: win.OC.questions || [] });
    });
  return out;
}

/* ---------- 写入 ---------- */
function writeStatus(s) {
  s.updatedAt = today();
  const head = `/* 状态覆盖表：与题库内容分离，管理员只改这一个文件
 * 由 scripts/admin.js 维护，也可手工编辑。
 *
 * questions: { '<题目id>': { status:'hidden', at:'2026-10-28', by:'admin', reason:'答案有误' } }
 * courses:   { '<课程id>': { status:'archived'|'hidden', at:'2026-10-28', by:'admin', reason:'' } }
 *
 * status 说明：
 *   active    正常显示
 *   archived  归档（超出近两年窗口，从首页默认列表移出，可展开查看，链接仍可访问）
 *   hidden    下架（页面完全不显示，但数据保留，可随时恢复）
 */
window.OC_STATUS = `;
  fs.writeFileSync(statusFile, head + JSON.stringify(s, null, 2) + ';\n', 'utf8');
}

/* ---------- 命令 ---------- */
const s = readStatus();
const courses = readCourses();
const findQ = id => {
  for (const c of courses) {
    const q = c.questions.find(x => x.id === id);
    if (q) return { course: c.course, q };
  }
  return null;
};
const findC = id => courses.find(c => c.course.id === id);

switch (cmd) {
  case 'list': {
    console.log('课程：');
    courses.forEach(c => {
      const ov = s.courses[c.course.id] || {};
      const st = ov.status || 'active';
      const hidden = c.questions.filter(q => (s.questions[q.id] || {}).status === 'hidden').length;
      console.log(`  ${c.course.id.padEnd(14)} ${c.course.title}  [${st}]  ${c.questions.length} 题` +
        (hidden ? `（已下架 ${hidden}）` : '') + `  ${(c.course.terms || []).join(',')}`);
    });
    const hq = Object.keys(s.questions).filter(k => s.questions[k].status === 'hidden');
    console.log(`\n已下架题目：${hq.length} 道`);
    if (hq.length) console.log('  ' + hq.join(', '));
    break;
  }

  case 'hide': {
    const id = args[1];
    if (!id) { console.error('缺少题目 id'); process.exit(1); }
    const hit = findQ(id);
    if (!hit) { console.error('找不到题目：' + id); process.exit(1); }
    s.questions[id] = { status: 'hidden', at: today(), by: by(), reason: flag('reason') || '' };
    writeStatus(s);
    console.log(`已下架 ${id}（${hit.course.title}）${flag('reason') ? '：' + flag('reason') : ''}`);
    console.log('记得重新跑 build-index.js 并提交。');
    break;
  }

  case 'show': {
    const id = args[1];
    if (!s.questions[id]) { console.error('该题没有被下架：' + id); process.exit(1); }
    delete s.questions[id];
    writeStatus(s);
    console.log(`已恢复 ${id}`);
    break;
  }

  case 'hide-course':
  case 'archive': {
    const id = args[1];
    if (!findC(id)) { console.error('找不到课程：' + id); process.exit(1); }
    const status = cmd === 'archive' ? 'archived' : 'hidden';
    s.courses[id] = { status, at: today(), by: by(), reason: flag('reason') || '' };
    writeStatus(s);
    console.log(`课程 ${id} 已设为 ${status}`);
    break;
  }

  case 'show-course':
  case 'unarchive': {
    const id = args[1];
    if (!s.courses[id]) { console.error('该课程没有状态覆盖：' + id); process.exit(1); }
    delete s.courses[id];
    writeStatus(s);
    console.log(`课程 ${id} 已恢复为 active`);
    break;
  }

  case 'retire': {
    const year = Number(flag('year') || new Date().getFullYear());
    const keep = Number(flag('keep') || 2);
    const cutoff = year - (keep - 1);
    const targets = courses.filter(c => {
      const years = (c.course.terms || []).map(t => Number(String(t).slice(0, 4))).filter(n => !isNaN(n));
      return years.length && Math.max(...years) < cutoff;
    });
    if (!targets.length) { console.log(`没有需要归档的课程（保留窗口 ${cutoff}–${year}）`); break; }
    console.log(`将归档 ${targets.length} 门课程（保留窗口 ${cutoff}–${year}）：`);
    targets.forEach(c => console.log('  · ' + c.course.title + '（' + (c.course.terms || []).join(',') + '）'));
    if (!args.includes('--yes')) {
      console.log('\n这是预演。确认后加 --yes 执行。');
      break;
    }
    targets.forEach(c => {
      s.courses[c.course.id] = { status: 'archived', at: today(), by: by(), reason: `超出${keep}年保留窗口` };
    });
    writeStatus(s);
    console.log('\n已归档。记得重新跑 build-index.js。');
    break;
  }

  case 'log': {
    const rows = [];
    Object.entries(s.questions).forEach(([id, v]) => rows.push({ id, kind: '题目', ...v }));
    Object.entries(s.courses).forEach(([id, v]) => rows.push({ id, kind: '课程', ...v }));
    rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (!rows.length) { console.log('暂无下架或归档记录'); break; }
    console.log('时间        类型  对象              状态      原因');
    rows.forEach(r => console.log(
      `${(r.at || '').padEnd(11)} ${r.kind}  ${String(r.id).padEnd(16)} ${String(r.status).padEnd(9)} ${r.reason || ''}`
    ));
    break;
  }

  default:
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
}
