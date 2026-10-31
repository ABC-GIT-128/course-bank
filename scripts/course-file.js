#!/usr/bin/env node
/* 课程数据文件的统一出口
 *
 * 目的：把「写 data/<id>.js」这件事收敛到一处，避免每个脚本各拼一遍字符串。
 * 历史上出现过的问题都源于手拼：
 *   · 标题写进块注释 → 标题含注释结束符就能越出注释变成代码
 *   · title: '${title}'    → 标题含单引号直接把文件写坏
 *   · id 直接进 path.join  → 可写出 data/ 之外
 *
 * 约定：
 *   · 所有内容一律 JSON.stringify，绝不手拼字符串字面量
 *   · 注释头是固定文案，不含任何用户输入
 *   · 课程 id 必须过白名单，且解析后的路径必须在 data/ 内
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const HEADER = '/* 课程数据（由脚本生成，可继续手工编辑）\n' +
  ' * 字段说明见 README.md「数据格式」；标题等内容见 window.OC.course.title。\n' +
  ' */\n';

/* 课程 id 白名单：小写字母/数字/短横线/下划线，1~64 位 */
function assertCourseId(id) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(id || ''))) {
    console.error('✗ 非法课程 ID：' + id + '（只允许小写字母、数字、- 和 _）');
    process.exit(1);
  }
}

/* 解析课程文件路径，并确保不越出 data/ */
function coursePath(id) {
  assertCourseId(id);
  const file = path.join(DATA_DIR, id + '.js');
  if (path.dirname(path.resolve(file)) !== path.resolve(DATA_DIR)) {
    console.error('✗ 课程 ID 越界：' + id);
    process.exit(1);
  }
  return file;
}

/* 标题来自用户：去标签、去会破坏注释/路径的字符、限长 */
function cleanTitle(x) {
  return String(x == null ? '' : x)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u002a\u002f\u005c\u007c]/g, ' ')   /* * / \ | */
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '未命名课程';
}

/* 把 { course, questions } 写成 data/<id>.js */
function writeCourse(id, OC) {
  const file = coursePath(id);
  const payload = {
    course: Object.assign({}, OC.course, { id }),
    questions: Array.isArray(OC.questions) ? OC.questions : []
  };
  fs.writeFileSync(file, HEADER + 'window.OC = ' + JSON.stringify(payload, null, 2) + ';\n', 'utf8');
  return file;
}

/* 读回课程文件（不存在返回 null） */
function readCourse(id) {
  const file = coursePath(id);
  if (!fs.existsSync(file)) return null;
  const win = {};
  try {
    new Function('window', fs.readFileSync(file, 'utf8'))(win);
  } catch (e) {
    console.error('✗ data/' + id + '.js 解析失败：' + e.message);
    process.exit(1);
  }
  return win.OC || null;
}

module.exports = { DATA_DIR, HEADER, assertCourseId, coursePath, cleanTitle, writeCourse, readCourse };
