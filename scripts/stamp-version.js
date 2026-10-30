#!/usr/bin/env node
/* 给部署产物里的静态资源加版本号，穿透浏览器 / Service Worker 缓存
 *
 * 用法：node scripts/stamp-version.js .build
 *
 * 为什么要它：Service Worker 按「完整 URL」缓存。URL 不变，用户就一直吃旧文件；
 * 每次部署换一个 ?v=，URL 变了 → 缓存必然 miss → 一定拿到新的。
 * 只在 .build（部署产物）里改，仓库里的源码保持干净；本地 file:// 打开不受影响。
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) {
  console.error('用法：node scripts/stamp-version.js <构建输出目录>');
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  console.error('目录不存在：' + dir);
  process.exit(1);
}

/* 版本号：时间戳（秒级），够用且可读 */
const now = new Date();
const stamp = String(Math.floor(now.getTime() / 1000));
const human = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

/* 只给同源、且本地存在的资源加版本，外链和缺文件的跳过 */
const isLocalAsset = (ref) =>
  /^(assets|data)\/[^"'?#]+\.(js|css|json)$/.test(ref);

function stampHtml(file, root) {
  let html = fs.readFileSync(file, 'utf8');
  const base = path.dirname(file);
  /* 课程短地址页（/sensor/index.html）用 <base href="../"> 回指根目录，
   * 路径要相对「站点根」判断是否存在，不能只看文件所在目录 */
  const exists = (ref) =>
    fs.existsSync(path.join(base, ref)) || fs.existsSync(path.join(root, ref));
  let n = 0;

  html = html.replace(/(src|href)="((?:assets|data)\/[^"?]+\.(?:js|css|json))"/g, (m, attr, ref) => {
    if (!isLocalAsset(ref)) return m;
    if (!exists(ref)) return m;   /* 文件不存在就不动它 */
    n += 1;
    return `${attr}="${ref}?v=${stamp}"`;
  });

  /* 把版本号暴露给运行时（quiz.html 动态加载课程数据时要用） */
  if (n && !/window\.OC_V\s*=/.test(html)) {
    html = html.replace(/(<script[^>]*src="[^"]*\?v=)/, `<script>window.OC_V='${stamp}';</script>\n$1`);
  }

  if (n) fs.writeFileSync(file, html, 'utf8');
  return n;
}

/* 站点根 + 每个课程短地址目录里的 index.html */
const targets = [];
fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
  if (e.isDirectory()) {
    const f = path.join(dir, e.name, 'index.html');
    if (fs.existsSync(f)) targets.push(f);
  } else if (e.isFile() && e.name.endsWith('.html')) {
    targets.push(path.join(dir, e.name));
  }
});

let total = 0;
targets.forEach(f => {
  const n = stampHtml(f, dir);
  total += n;
  if (n) console.log(`  ${path.relative(dir, f)}：${n} 个资源已加版本号`);
});

/* 让首页页脚能显示「数据更新于」 */
const verFile = path.join(dir, 'data', 'build-info.json');
fs.mkdirSync(path.dirname(verFile), { recursive: true });
const sha = process.env.GITHUB_SHA || process.env.GIT_SHA || '';
fs.writeFileSync(verFile, JSON.stringify({
  stamp, at: now.toISOString(),
  commit: sha ? sha.slice(0, 7) : '',
  ref: process.env.GITHUB_REF_NAME || ''
}, null, 2) + '\n', 'utf8');

console.log(`✓ 已加版本号 v=${stamp}（${human}），共 ${total} 处，涉及 ${targets.length} 个页面`);
