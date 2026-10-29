# OpenCourse · 开源课程题库

把老师的期末复习资料，整理成**能刷、能订正、能查漏**的网页题库。
纯静态、无需登录、不收集个人信息，可部署在 GitHub Pages / Cloudflare Pages 上。

- 首页：搜索课程 / 章节 / 考点，按学期区分版本
- 刷题页：选择、填空、名词解释、计算四种题型，答错立即给解析与出处
- 数据与页面分离：新增一门课只需加一个 `data/*.js` 文件

## 本地预览

页面用 `<script>` 加载数据，直接双击 `index.html` 也能跑。若要用本地服务器：

```bash
python -m http.server 8000      # 或 npx serve .
# 打开 http://localhost:8000
```

## 目录结构

```
index.html          首页（搜索 + 课程卡片）
quiz.html           刷题页（?course=<id>）
about.html          关于、来源、许可、下架通道
assets/             app.css · home.js · quiz.js
data/
  _status.js        下架 / 归档状态表（管理员维护）
  courses.js        课程索引（自动生成，勿手改）
  sensor.js         课程数据：传感器与检测技术
scripts/
  build-index.js    扫描 data/*.js 生成 courses.js（含两年窗口计算）
  check-data.js     数据校验 + 隐私扫描（提交前必跑）
  new-course.js     生成新课程骨架
  import-form.js    从 CSV（问卷导出）导入题目
  admin.js          下架 / 恢复 / 归档 / 记录
templates/          题目导入 CSV 模板
package.json        快捷命令（npm run build / check / serve / import）
.github/ISSUE_TEMPLATE/   投稿与报错模板
```

## 添加内容：三种方式，按上手难度排

### 方式一（推荐给同学）：填表 → 一键导入

不需要碰代码，也不需要 GitHub 账号。

1. 把 `templates/题目导入模板.csv` 上传成腾讯文档 / 飞书表格，或做成问卷收集
2. 让大家按列填写（题型、章节、题干、选项、答案、解析、出处）
3. 导出 CSV，本地执行：

```bash
node scripts/import-form.js --file 导出.csv --course circuit --title "电路分析基础"
node scripts/build-index.js && node scripts/check-data.js
```

课程文件不存在时会自动创建；表头顺序随意，缺列按空处理。
导入器会跳过写错的行并告诉你是第几行，也会自动清掉骨架里的示例题。

### 方式二（推荐给维护者）：命令行生成骨架再编辑

```bash
node scripts/new-course.js --id circuit --title 电路分析基础 \
     --college 专业基础课 --term 2026-autumn --chapters "1:电路定律,2:电阻电路"
```

会生成带注释的 `data/circuit.js`，改 `questions` 即可。

### 方式三：复制现有课程

复制 `data/sensor.js` 为 `data/<课程id>.js`，改 `course` 字段和 `questions`。

---

无论哪种方式，最后都跑一次：

```bash
npm run verify      # = build-index.js + check-data.js
```

首页就会自动出现这张课程卡。

## 数据格式

```js
window.OC = {
  course: {
    id: 'sensor',                 // 唯一，用于 quiz.html?course=sensor
    title: '传感器与检测技术',
    subtitle: '期末刷题 · 选择 / 填空 / 名词解释 / 计算',
    college: '专业基础课',         // 首页分组/筛选用
    teacher: '',                  // 仅在获得署名同意后填写
    terms: ['2026-autumn'],       // 学期 id
    termLabels: { '2026-autumn': '2026 秋' },
    updatedAt: '2026-10-28',
    license: 'CC BY-NC-SA 4.0',
    chapterNames: { 1: '概述', 2: '基本特性' },
    keywords: ['传感器', '应变片'] // 首页搜索用
  },
  questions: [
    {
      id: 'c01',            // 课程内唯一
      type: 'choice',       // choice | fill | term | calc | note
      ch: 1,                // 章节号
      src: 'ppt',           // 可选：ppt | key，用于打标签
      q: '题干（填空用 ＿＿＿ 表示空位）',
      opts: ['A', 'B', 'C', 'D'],
      ans: 1,               // 正确答案下标
      exp: '<p>解析</p>',
      ref: '第1章 传感器的定义',
      // fill:  blanks: [['答案1', '同义词'], ['答案2']]
      // term:  kw: [['关键词'], ['关键词2']]
      // calc:  value: 2.5, tol: 0.04, unit: '%', ansText: '2.5%', sol: ['① …', '② …']
      // note:  why: '无法归类的原因'
    }
  ]
};
```

## 命令速查

```bash
npm run serve        # 本地预览 http://127.0.0.1:8765
npm run build        # 重建课程索引
npm run check        # 校验数据 + 扫描隐私信息
npm run verify       # 上面两条一起跑
npm run import -- --file 导出.csv --course circuit
npm run admin -- list
```

`check-data.js` 会拦截：重复 id、答案越界、填空数量与题干不符、缺少解析或出处，
以及正文里出现的手机号、身份证号、学号等个人信息。

## 生命周期：只保留近两年

学期 id 统一写成 `2026-autumn` 这种格式。构建时以当前年份为基准，**只保留最近 2 个学年**
（2026 年 → 保留 2025、2026），超出窗口的课程自动标记为 `archived`：

- 首页从「在架课程」移出，折叠进「往期课程（N 门）」，点开仍可查看；
- 课程页顶部显示「这是一门往期课程，可能与本学期考纲不一致」；
- 搜索仍然能搜到，卡片带「归档」角标。

```bash
node scripts/admin.js retire            # 预演：列出会被归档的课程
node scripts/admin.js retire --yes      # 执行，把判定固化进状态表
node scripts/build-index.js             # 重新生成索引
```

窗口可改：`node scripts/build-index.js --keep-years 3 --year 2026`。

> 归档不等于删除。原始数据仍在仓库里，需要时可以恢复；真要物理删除，删掉对应 `data/*.js` 即可，
> 但注意 **Git 历史仍会保留**，见下方「关于删除」的说明。

## 下架：管理员如何移除内容

静态站没有后端，所以「谁能删」由 **仓库写权限** 决定（配合分支保护 + CODEOWNERS），
而不是某个网页上的按钮。日常操作走命令行，一条记录一行 diff，便于审计：

```bash
node scripts/admin.js list                          # 看全部课程与下架题数
node scripts/admin.js hide c01 --reason "答案有误"    # 下架一道题
node scripts/admin.js show c01                      # 恢复
node scripts/admin.js hide-course sensor --reason "版权方要求"
node scripts/admin.js show-course sensor
node scripts/admin.js archive sensor                # 手动归档
node scripts/admin.js log                           # 查看全部下架/归档记录
```

状态全部写在 `data/_status.js`（与题库内容分离），站点加载时过滤，**刷新即生效**。
提交并部署后，被下架的题目/课程不再出现在任何页面，但数据保留，可随时恢复。

### 关于「删除」的边界

- 这是**软删除**：页面看不到，仓库里还在，历史提交里也在。
- 如果涉及个人信息或必须彻底清除，仅靠删除文件不够——需要重写 Git 历史（`git filter-repo`）并强制推送，
  且**已经被他人 fork 的副本无法收回**。所以真正重要的是「一开始就别提交」。
- 侵权下架建议保留记录（谁、何时、为什么），既是审计，也是善意证明。

## 收录与不收录

**收录**：自编题、改写题、已获授权的材料。
**不收录**：完整试卷原卷与标准答案、含学生姓名学号的材料、学校明令保密的文件、第三方课件原文。

## 许可

- 代码：MIT（`LICENSE`）
- 题目与解析：CC BY-NC-SA 4.0（`LICENSE-content`）
- 上述许可**不覆盖**任何第三方课件、教材内容，其版权归原作者。

本站为学习者自发整理，非任何学校官方发布。侵权请联系下架，见 `about.html#takedown`。
