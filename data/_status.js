/* 状态覆盖表：与题库内容分离，管理员只改这一个文件
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
window.OC_STATUS = {
  "version": 1,
  "updatedAt": "2026-10-28",
  "questions": {},
  "courses": {test1: { status: 'hidden', at: '2026-10-29', by: 'admin', reason: '重复的测试课程' }
              test2: { status: 'hidden', at: '2026-10-29', by: 'admin', reason: '删除测试' }
             }
};
