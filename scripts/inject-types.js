#!/usr/bin/env node
/* 把提示词里的 {{TYPE_LIST}} 换成由 assets/qtypes.js 生成的题型清单
 *
 * 为什么要这么做：提示词里原来手写「只用【选择】【填空】【判断】【名词】【计算】」，
 * 和注册表是两份独立文本。注册表加了新题型、提示词忘了改，AI 就永远不输出新题型；
 * 反过来改了提示词忘了注册表，AI 输出的新题型又会被拒。
 * 现在清单只有一个来源，构建时注入，两边不会再漂移。
 *
 * 用法：
 *   node scripts/inject-types.js .build      # 注入构建产物
 *   node scripts/inject-types.js --check     # 只检查源文件是否保留了占位符
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const QTypes = require(path.join(ROOT, 'assets', 'qtypes.js'));

const HAS_PLACE = /\{\{\s*TYPE_LIST\s*\}\}/;
const PLACE_G = /\{\{\s*TYPE_LIST\s*\}\}/g;

const list = QTypes.typeListText();

function check() {
  const dirT = path.join(ROOT, 'templates');
  const files = fs.readdirSync(dirT).filter(f => f.endsWith('.txt'));
  let bad = 0;
  files.forEach(f => {
    const s = fs.readFileSync(path.join(dirT, f), 'utf8');
    if (!HAS_PLACE.test(s)) {
      console.error('✗ templates/' + f + ' 没有 {{TYPE_LIST}} 占位符（题型清单应统一由注册表生成）');
      bad++;
    }
  });
  if (bad) process.exit(1);
  console.log('✓ 题型清单占位符齐全（' + files.length + ' 份提示词，' + QTypes.ORDER.length + ' 种题型）');
}

function inject(dir) {
  const dirT = path.join(dir, 'templates');
  if (!fs.existsSync(dirT)) {
    console.error('✗ 找不到目录：' + dirT);
    process.exit(1);
  }
  if (!list || list.length < 20) {
    console.error('✗ 生成的题型清单为空，检查 assets/qtypes.js');
    process.exit(1);
  }

  const files = fs.readdirSync(dirT).filter(f => f.endsWith('.txt'));
  let changed = 0;
  files.forEach(f => {
    const p = path.join(dirT, f);
    const s = fs.readFileSync(p, 'utf8');
    if (!HAS_PLACE.test(s)) return;          /* 没有占位符的文件不动 */
    const out = s.replace(PLACE_G, list);
    if (/\{\{/.test(out)) {
      console.error('✗ ' + f + ' 替换后仍有未处理的占位符');
      process.exit(1);
    }
    fs.writeFileSync(p, out, 'utf8');
    changed++;
    console.log('  注入题型清单：templates/' + f);
  });

  if (!changed) {
    console.error('✗ templates/ 里没有找到 {{TYPE_LIST}}，提示词可能被改坏了');
    process.exit(1);
  }
  console.log('✓ 题型清单已注入（' + changed + ' 份，' + QTypes.ORDER.length + ' 种题型）');
}

const arg = process.argv[2];
if (!arg) {
  console.error('用法：node scripts/inject-types.js <构建目录> | --check');
  process.exit(1);
}
if (arg === '--check') check();
else inject(arg);
