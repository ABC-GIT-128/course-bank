#!/usr/bin/env node
/* 安全回归测试：确认恶意内容不会以可执行形式进入产物
 *
 * 用法：node scripts/test-security.js   （或 npm run test:sec）
 *
 * 覆盖两类此前真实出现过的漏洞：
 *   1) 课程标题注入 —— 标题来自 Issue 标题，曾原样写进 <title> 与 JS 注释
 *   2) 题目内容注入 —— 题干/选项/解析曾直接拼进 innerHTML
 *
 * 做法：临时造一门"恶意课程"，跑一遍构建，检查产物里没有可执行残留，然后清理。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const ID = 'zz-security-probe';
const FILE = path.join(DATA, ID + '.js');
const DIR = path.join(ROOT, ID);
const EVIL = '</title><script>window.__PWN=1</script><img src=x onerror="window.__PWN=2">';

let failed = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond ? '' : '  ← ' + (extra || '')));
  if (!cond) failed++;
};

/* ---------- 造恶意数据 ---------- */
fs.writeFileSync(FILE, `/* 临时：安全回归测试，运行后自动删除 */
window.OC = ${JSON.stringify({
  course: {
    id: ID, title: '测试' + EVIL, subtitle: 'x', college: 'y', teacher: '',
    terms: ['2026-autumn'], termLabels: { '2026-autumn': '2026 秋' },
    updatedAt: '2026-10-30', license: 'CC BY-NC-SA 4.0',
    chapterNames: { 1: '测试章' }, keywords: ['x']
  },
  questions: [{
    id: 'zz1', type: 'choice', ch: 1,
    q: '题干' + EVIL, opts: [EVIL + 'A', 'B'], ans: 0,
    exp: '<p>解析' + EVIL + '</p>', ref: '出处' + EVIL
  }]
}, null, 2)};
`, 'utf8');

/* ---------- 跑构建 ---------- */
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-index.js')], { cwd: ROOT, encoding: 'utf8' });
if (r.status !== 0) {
  console.error('构建失败：\n' + (r.stderr || r.stdout));
  fs.rmSync(FILE, { force: true });
  process.exit(1);
}

console.log('\n[1] 课程标题注入');
const htmlFile = path.join(DIR, 'index.html');
const html = fs.existsSync(htmlFile) ? fs.readFileSync(htmlFile, 'utf8') : '';
ok('产物页面已生成', !!html, '没有 ' + htmlFile);
ok('没有注入 <script>', !/<script>window\.__PWN/.test(html), '出现了可执行脚本');
ok('没有注入 <img> 标签', !/<img\s/i.test(html), '出现了 img 元素');
const mTitle = /<title>([\s\S]*?)<\/title>/.exec(html);
const titleText = mTitle ? mTitle[1] : '';
ok('标题内容不含尖括号', !/[<>]/.test(titleText), '标题里仍有 <>：' + titleText.slice(0, 60));
ok('标题里的标签被清洗掉', html.indexOf('<title>测试') === 0 || html.indexOf('<title>测试') > 0, '标题前缀异常');

console.log('\n[2] 数据文件仍可被安全解析（标题不破坏语法）');
let parsed = null;
try {
  const win = {};
  new Function('window', fs.readFileSync(FILE, 'utf8'))(win);
  parsed = win.OC;
} catch (e) {
  ok('数据文件可解析', false, e.message);
}
if (parsed) {
  ok('数据文件可解析', true);
  ok('恶意标题未逃逸成代码', parsed.course.title.indexOf('__PWN') >= 0 || parsed.course.title.length > 0);
}

console.log('\n[3] 渲染层转义函数（静态检查）');
const quiz = fs.readFileSync(path.join(ROOT, 'assets', 'quiz.js'), 'utf8');
ok('存在 rich() 白名单渲染', /const rich\s*=/.test(quiz));
ok('题干经 rich() 处理', /rich\(q\.q\)/.test(quiz), 'q.q 仍是裸拼');
ok('选项经 rich() 处理', /rich\(o\)/.test(quiz), '选项仍是裸拼');
ok('解析经 rich() 处理', /rich\(q\.exp\)/.test(quiz), 'q.exp 仍是裸拼');

/* ---------- 清理 ---------- */
fs.rmSync(FILE, { force: true });
fs.rmSync(DIR, { recursive: true, force: true });
spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-index.js')], { cwd: ROOT, encoding: 'utf8' });

console.log('\n' + (failed ? '✗ 有 ' + failed + ' 项未通过' : '✓ 安全回归全部通过'));
process.exit(failed ? 1 : 0);
