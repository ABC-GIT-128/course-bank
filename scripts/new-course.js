#!/usr/bin/env node
/* 生成一门新课程的骨架，避免手写 20 行对象
 *
 * 用法：
 *   node scripts/new-course.js --id circuit --title 电路分析基础 \
 *        --college 专业基础课 --term 2026-autumn [--chapters "1:电路模型,2:电阻电路"]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : undefined;
};

const id = flag('id');
const title = flag('title');
if (!id || !title) {
  console.log(`用法：node scripts/new-course.js --id <课程id> --title <课程名> [--college 专业基础课] [--term 2026-autumn] [--chapters "1:概述,2:基本特性"]

示例：
  node scripts/new-course.js --id circuit --title 电路分析基础 --college 专业基础课 --term 2026-autumn`);
  process.exit(1);
}

const college = flag('college') || '专业基础课';
const term = flag('term') || (new Date().getFullYear() + '-autumn');
const label = term.replace('autumn', ' 秋').replace('spring', ' 春');
const file = path.join(__dirname, '..', 'data', id + '.js');

if (fs.existsSync(file)) {
  console.error('文件已存在：data/' + id + '.js');
  process.exit(1);
}

/* 章节：1:电路模型,2:电阻电路 */
const chNames = {};
(flag('chapters') || '').split(',').forEach(s => {
  const m = s.split(':');
  if (m[0]) chNames[m[0].trim()] = (m[1] || '').trim();
});
if (!Object.keys(chNames).length) { chNames[1] = '第一章'; }

const today = new Date().toISOString().slice(0, 10);

const content = `/* 课程数据：${title}
 * 由 scripts/new-course.js 生成，可以直接编辑。
 * 题目字段说明见 README.md「数据格式」。
 * 加完题目后运行：node scripts/build-index.js && node scripts/check-data.js
 */
window.OC = {
  course: {
    id: '${id}',
    title: '${title}',
    subtitle: '期末刷题',
    college: '${college}',
    teacher: '',
    terms: ['${term}'],
    termLabels: { '${term}': '${label}' },
    updatedAt: '${today}',
    license: 'CC BY-NC-SA 4.0',
    chapterNames: ${JSON.stringify(chNames)},
    keywords: ['${title}', ${Object.values(chNames).map(v => `'${v}'`).join(', ')}]
  },
  questions: [
    /* 示例题目：改成你的内容，或整条删掉 */
    {
      id: '${id}-001',
      type: 'choice',
      ch: ${Object.keys(chNames)[0]},
      q: '在这里写题干（  ）。',
      opts: ['选项 A', '选项 B', '选项 C', '选项 D'],
      ans: 0,
      exp: '<p>在这里写解析：为什么选这个，其它选项错在哪。</p>',
      ref: '第${Object.keys(chNames)[0]}章 出处'
    }
  ]
};
`;

fs.writeFileSync(file, content, 'utf8');
console.log('已创建 data/' + id + '.js');
console.log('\n下一步：');
console.log('  1. 编辑这个文件，把示例题换成你的题目（或跑 import-form.js 从表格导入）');
console.log('  2. node scripts/build-index.js    # 首页出现新课程');
console.log('  3. node scripts/check-data.js     # 校验');
