#!/usr/bin/env node
/* 检查最近一次提交的作者/提交者邮箱是不是 GitHub 匿名邮箱
 *
 * 为什么需要：GitHub 的 Git Data API 在创建 commit 时不传 author，
 * 会用账号资料里的真实邮箱填充，于是真实邮箱（甚至手机号）进入公开历史。
 * 这个脚本只做「事后发现」：默认只警告，加 --strict 才阻断。
 *
 * 用法：
 *   node scripts/check-author.js           # 警告，退出码 0
 *   node scripts/check-author.js --strict  # 发现问题直接失败
 */
const fs = require('fs');
const { execSync } = require('child_process');

const strict = process.argv.includes('--strict');
const ANON = 'users.noreply.github.com';

function git(fmt) {
  try {
    return execSync('git log -1 --format=' + fmt, { encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
}

const authorEmail = git('%ae');
const committerEmail = git('%ce');
const authorName = git('%an');

const bad = [];
if (authorEmail && authorEmail.indexOf(ANON) < 0) bad.push('author  ' + authorEmail);
if (committerEmail && committerEmail.indexOf(ANON) < 0) bad.push('committer ' + committerEmail);

if (!bad.length) {
  console.log('✓ 提交身份安全：' + authorName + ' <' + authorEmail + '>');
  process.exit(0);
}

const lines = [
  '⚠ 这次提交用的是真实邮箱，会永久留在公开仓库历史里：',
  ...bad.map(b => '   - ' + b),
  '',
  '修法：',
  '  1. 本仓库执行：',
  '     git config user.email "<数字ID>+<用户名>@users.noreply.github.com"',
  '     git config user.name  "<你的 GitHub 用户名>"',
  '  2. 用 API/脚本推送时，确认脚本显式传了 author/committer（见 api_push.py）',
  '  3. 已经推上去的提交需要重写历史才能清除，改配置不会影响旧提交'
];

console.error(lines.join('\n'));

/* 在 Actions 的 job summary 里也留一份，方便在网页上看到 */
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '\n### 提交身份警告\n\n```\n' + lines.join('\n') + '\n```\n');
}

process.exit(strict ? 1 : 0);
