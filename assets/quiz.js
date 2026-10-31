/* 刷题页逻辑（依赖 window.OC 课程数据） */
const COURSE = window.OC.course;
const STATUS = window.OC_STATUS || { questions: {}, courses: {} };

/* 下架的题目不进入练习，但数据仍在，可随时恢复 */
const BANK = window.OC.questions.filter(function (q) {
  const s = STATUS.questions && STATUS.questions[q.id];
  return !(s && s.status === 'hidden');
});

/* 头部信息 */
(function(){
  document.title = COURSE.title + ' · 刷题';
  const n = document.getElementById('cname');
  if(n) n.textContent = COURSE.title;
  const t = document.getElementById('cterm');
  if(t){
    const id = (COURSE.terms || [])[0];
    t.textContent = id ? (COURSE.termLabels && COURSE.termLabels[id] || id) : '';
  }
  /* 课程状态提示（归档 / 下架） */
  const ov = (STATUS.courses && STATUS.courses[COURSE.id]) || null;
  const meta = (window.OC_COURSES || []).filter(function (c) { return c.id === COURSE.id; })[0];
  const st = (ov && ov.status) || (meta && meta.status) || 'active';
  const list = document.getElementById('list');
  if(st === 'archived' && list){
    const b = document.createElement('div');
    b.className = 'banner';
    b.textContent = '这是一门往期课程（' + ((COURSE.terms || [])[0] || '') + '），内容已归档，可能与本学期考试范围不一致。';
    list.parentNode.insertBefore(b, list);
  }
  if(st === 'hidden' && list){
    window.__OC_BLOCKED = true;
    list.innerHTML = '<div class="empty">本课程已下架' + (ov && ov.reason ? '（' + esc(ov.reason) + '）' : '') +
      '<br><a href="index.html">返回全部课程</a></div>';
  }
})();


/* ============================ 状态 ============================ */
const LS = 'oc_' + COURSE.id;   // 每门课独立存储，互不干扰
const state = { mode:'all', shuffled:false, seed:1, list:[], rec:{}, wrongSet:{}, open:{} };
const byId = {};
BANK.forEach(q => byId[q.id] = q);

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* 题库内容一律当纯文本处理：先转义，再只放行这几个无属性标签。
 * 这样 <img onerror=…> 会原样显示成文本，而 <b> 加粗、<p> 分段仍然保留。 */
const ALLOWED_TAG = /&lt;(\/?)(p|br|b|i|sub|sup)(\/?)&gt;/gi;
const rich = s => esc(s).replace(ALLOWED_TAG, (m, close, tag, slash) => '<' + close + tag.toLowerCase() + slash + '>');
const TYPE_NAME = {choice:'单项选择', fill:'填空题', term:'名词解释', calc:'计算题', note:'待确认'};
const TYPE_KEY  = {choice:'t-choice', fill:'t-fill', term:'t-term', calc:'t-calc', note:'t-note'};

const norm = s => String(s == null ? '' : s)
  .replace(/\s+/g,'').replace(/[（）]/g, m => m === '（' ? '(' : ')')
  .replace(/[，、；：,;:]/g, ',').replace(/[。．.]/g,'.')
  .replace(/[－—–−]/g,'-').replace(/×/g,'*').replace(/÷/g,'/')
  .replace(/[“”"'‘’]/g,'').toLowerCase();

function save(){
  try{ localStorage.setItem(LS, JSON.stringify({
    rec:state.rec, mode:state.mode, shuffled:state.shuffled, seed:state.seed, y:Math.round(window.scrollY)
  })); }catch(e){}
}
function load(){
  let d = {};
  try{ d = JSON.parse(localStorage.getItem(LS) || '{}'); }catch(e){}
  if(d.rec) state.rec = d.rec;
  if(d.mode && d.mode !== 'wrong') state.mode = d.mode;
  if(typeof d.shuffled === 'boolean') state.shuffled = d.shuffled;
  if(typeof d.seed === 'number' && d.seed > 1) state.seed = d.seed;
  Object.keys(state.rec).forEach(k => { if(!state.rec[k].ok) state.wrongSet[k] = 1; });
  state._y = d.y || 0;
}

/* ============================ 判分 ============================ */
function judgeChoice(q, i){ return i === q.ans; }
function judgeFill(q, vals){
  return q.blanks.map((acc, i) => acc.some(a => norm(a) === norm(vals[i])));
}
function judgeTerm(q, text){
  const t = norm(text);
  const hit = q.kw.map(g => g.some(k => t.indexOf(norm(k)) >= 0));
  const need = Math.max(2, Math.ceil(q.kw.length * 0.55));
  return {ok: hit.filter(Boolean).length >= need, hit};
}
function judgeCalc(q, raw){
  const s = String(raw).trim()
    .replace(/[×xX\*]\s*10\s*\^?\s*\(?([+\-]?\d+)\)?/g, 'e$1')
    .replace(/[，,]/g,'')
    .replace(/[^0-9eE+\-.]/g,'');
  if(!s) return false;
  const v = parseFloat(s);
  if(isNaN(v)) return false;
  const tol = q.tol || .03;
  return Math.abs(v - q.value) <= Math.abs(q.value) * tol + Math.abs(q.value) * .005 + 1e-12;
}

function toast(ok, msg){
  const t = $('#toast');
  $('#ti').textContent = ok ? '✓' : '✕';
  $('#tt').textContent = msg;
  t.classList.toggle('good', !!ok);
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 1900);
}

/* ============================ 列表构建 ============================ */
function hashStr(s){ let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,16777619); } return h >>> 0; }
function buildList(){
  let arr = BANK.slice();
  if(state.mode === 'wrong') arr = arr.filter(q => state.wrongSet[q.id]);
  else if(state.mode === 'ppt') arr = arr.filter(q => q.src === 'ppt');
  else if(state.mode === 'key') arr = arr.filter(q => q.src === 'key');
  else if(state.mode !== 'all') arr = arr.filter(q => q.type === state.mode);
  if(state.mode === 'key'){
    const ord = {fill:0, term:1, note:2};
    arr.sort((a,b) => (ord[a.type] == null ? 9 : ord[a.type]) - (ord[b.type] == null ? 9 : ord[b.type]));
  }
  if(state.shuffled) arr.sort((a,b) => hashStr(a.id + '#' + state.seed) - hashStr(b.id + '#' + state.seed));
  state.list = arr;
}

function stats(){
  let ans = 0, ok = 0, total = 0;
  state.list.forEach(q => {
    if(q.type === 'note') return;            // 待确认条目不计入进度与正确率
    total++;
    const r = state.rec[q.id]; if(r){ ans++; if(r.ok) ok++; }
  });
  return {ans, ok, bad:ans-ok, total};
}
function refreshStats(){
  const s = stats();
  const rate = s.ans ? Math.round(s.ok/s.ans*100) + '%' : '—';
  $('#stat').innerHTML = window.innerWidth < 600
    ? '已答 <b>' + s.ans + '</b>/' + s.total + ' · 正确 <b class="ok">' + s.ok + '</b> · <b>' + rate + '</b>'
    : '已答 <b>' + s.ans + '</b>/' + s.total +
      ' · 正确 <b class="ok">' + s.ok + '</b> · 错误 <b class="bad">' + s.bad + '</b>' +
      ' · 正确率 <b>' + rate + '</b>';
  $('#bar').style.width = (s.total ? s.ans/s.total*100 : 0) + '%';
  $('#wrongN').textContent = Object.keys(state.wrongSet).length;

  /* 必须放在 innerHTML 之后：否则刚插进去的按钮会被整段覆盖掉 */
  syncRetryAll();
}

/* 错题本模式下的「重练全部错题」入口：只清错题记录，不影响其他进度 */
function syncRetryAll(){
  const wrongN = Object.keys(state.wrongSet || {}).length;
  const show = state.mode === 'wrong' && wrongN > 0;
  let btn = document.getElementById('retryAllBtn');

  if(!show){
    if(btn) btn.remove();
    return;
  }
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'retryAllBtn';
    btn.className = 'tg retry';
    btn.style.marginLeft = '10px';
    btn.addEventListener('click', () => {
      const n = Object.keys(state.wrongSet || {}).length;
      if(!n) return;
      if(!confirm('把这 ' + n + ' 道错题的记录清掉，重新做一遍？其他题的进度不受影响。')) return;
      Object.keys(state.wrongSet).forEach(k => { delete state.rec[k]; });
      state.wrongSet = {};
      save(); buildList(); renderAll();
      toast(true, '错题已重置，开始重练');
    });
    const bar = document.getElementById('stat');
    if(bar) bar.appendChild(btn);
  } else if(!btn.isConnected){
    /* innerHTML 重绘后节点被摘掉，重新挂回去 */
    const bar = document.getElementById('stat');
    if(bar) bar.appendChild(btn);
  }
  btn.textContent = '重练全部错题（' + wrongN + '）';
}
function renderChips(){
  const c = {all:BANK.length, choice:0, fill:0, term:0, calc:0};
  BANK.forEach(q => c[q.type]++);
  const pptN = BANK.filter(q => q.src === 'ppt').length;
  const keyN = BANK.filter(q => q.src === 'key').length;
  const items = [['all','全部',c.all],['key','重点',keyN],['choice','选择',c.choice],['fill','填空',c.fill],
    ['term','名词解释',c.term],['calc','计算',c.calc],
    ['ppt','PPT 专节',pptN],['wrong','错题本',Object.keys(state.wrongSet).length]];
  $('#chips').innerHTML = items.map(([k,l,n]) =>
    '<div class="chip' + (state.mode===k?' on':'') + '" data-m="' + k + '">' + l + '<span class="n">' + n + '</span></div>').join('');
  $('#chips').querySelectorAll('.chip').forEach(el => {
    el.onclick = () => { state.mode = el.dataset.m; if(!window.__OC_BLOCKED){ renderChips(); buildList(); renderAll(); } save(); window.scrollTo({top:0}); };
  });
}

/* ============================ 渲染单题 ============================ */
function solHTML(q){
  let h = '';
  if(q.type === 'note'){
    h += rich(q.exp || '');
  } else if(q.type === 'choice'){
    h += '<h5>正确答案</h5><div class="answ">' + 'ABCD'[q.ans] + '. ' + rich(q.opts[q.ans]) + '</div>';
    h += '<h5>解析</h5>' + rich(q.exp);
  } else if(q.type === 'fill'){
    h += '<h5>标准答案</h5><div class="answ">' +
      q.blanks.map((b,i) => '第' + (i+1) + '空：' + esc(b[0])).join('　　') + '</div>';
    h += '<h5>解析</h5>' + rich(q.exp);
  } else if(q.type === 'term'){
    h += '<h5>参考要点</h5>' + rich(q.exp);
    const rec = state.rec[q.id];
    if(rec && rec.detail){
      h += '<div class="kw">' + q.kw.map((g,i) =>
        '<span class="kwt ' + (rec.detail[i]?'hit':'miss') + '">' + (rec.detail[i]?'✓ ':'✕ ') + esc(g[0]) + '</span>').join('') + '</div>';
    } else {
      h += '<div class="kw">' + q.kw.map(g => '<span class="kwt">' + esc(g[0]) + '</span>').join('') + '</div>';
    }
  } else if(q.type === 'calc'){
    h += '<h5>正确答案</h5><div class="answ">' + rich(q.ansText) + '</div>';
    h += '<h5>解析</h5>' + rich(q.exp);
    if(q.sol) h += '<h5>解题步骤</h5>' + q.sol.map(s => '<div class="step">' + rich(s) + '</div>').join('');
  }
  if(q.ref) h += '<div class="ref">知识依据：<b>' + rich(q.ref) + '</b></div>';
  return h;
}

function cardHTML(q, i){
  const rec = state.rec[q.id];
  const isOpen = state.open[q.id] || (rec && !rec.ok);
  let h = '<article class="card' + (rec ? (rec.ok ? ' is-ok ansd' : ' is-bad ansd') : '') + (isOpen ? ' open' : '') + '" data-id="' + q.id + '">';
  h += '<div class="qmeta"><span class="idx">Q' + (i+1) + '</span>' +
       '<span class="tag ' + TYPE_KEY[q.type] + '">' + TYPE_NAME[q.type] + '</span>' +
       '<span class="tag ch">第' + esc(q.ch) + '章</span>' +
       (q.src === 'ppt' ? '<span class="tag t-ppt">PPT 专节</span>' : '') +
       (q.src === 'key' ? '<span class="tag t-note">重点</span>' : '') + '</div>';
  h += '<div class="qtext">' + rich(q.q).replace(/＿{3}/g, '<span class="bk"></span>') + '</div>';

  if(q.type === 'note'){
    h += '<div class="notebox"><b>为什么归不进填空/名词解释：</b>' + esc(q.why || '') + '</div>';
    h += '<div class="solbar"><button class="tg" data-act="toggle">提示与解析 <i>▼</i></button></div>';


    h += '<div class="sol' + (isOpen ? ' open' : '') + '">' + solHTML(q) + '</div>';
    h += '</article>';
    return h;
  }

  if(q.type === 'choice'){
    h += '<div class="opts">';
    q.opts.forEach((o, k) => {
      let cls = 'opt';
      if(rec){
        if(k === q.ans) cls += ' ok';
        else if(rec.user === k) cls += ' bad';
      }
      const mk = rec ? (k === q.ans ? '<span class="mk">✓</span>' : (rec.user === k ? '<span class="mk">✕</span>' : '')) : '';
      h += '<div class="' + cls + '" data-i="' + k + '"><span class="k">' + 'ABCD'[k] + '</span><span>' + rich(o) + '</span>' + mk + '</div>';
    });
    h += '</div>';
  }

  if(q.type === 'fill'){
    h += '<div class="fillrow">';
    q.blanks.forEach((acc, k) => {
      const okk = rec && rec.detail ? rec.detail[k] : null;
      const val = rec && Array.isArray(rec.user) ? (rec.user[k] || '') : '';
      h += '<div class="fillitem"><span class="fillno">第' + (k+1) + '空</span>' +
        '<input class="fillinput ' + (rec ? (okk ? 'ok' : 'bad') : '') + '" data-b="' + k + '" value="' + esc(val) + '"' +
        (rec ? ' readonly' : '') + ' placeholder="填写答案…" autocomplete="off"></div>';
    });
    h += '</div>';
  }

  if(q.type === 'term'){
    h += '<div class="hintline">写出要点即可，系统按关键词自动判分（命中 ' +
      Math.max(2, Math.ceil(q.kw.length*.55)) + '/' + q.kw.length + ' 个要点算正确）</div>' +
      '<textarea class="big" id="ta-' + q.id + '" placeholder="在这里写下你的答案…"' + (rec ? ' readonly' : '') + '>' +
      (rec ? esc(rec.user || '') : '') + '</textarea>';
  }

  if(q.type === 'calc'){
    h += '<div class="hintline">只需填写数值' + (q.unit ? '（单位 ' + esc(q.unit) + '）' : '') +
      '，允许 ' + Math.round((q.tol || .03)*100) + '% 误差</div>' +
      '<input class="numinput" id="ci-' + q.id + '" placeholder="输入计算结果…"' +
      (rec ? ' readonly value="' + esc(rec.user == null ? '' : rec.user) + '"' : '') + '>';
  }

  if(!rec && q.type !== 'choice'){
    h += '<div class="actrow"><button class="sub" data-act="submit">提交答案</button></div>';
  }

  if(rec){
    h += rec.ok
      ? '<div class="vd ok"><span class="ic">✓</span>回答正确</div>'
      : '<div class="vd bad"><span class="ic">✕</span>' + (rec.skip ? '已看答案（记为未掌握）' : '回答错误') +
        '<span class="r">看下方解析订正</span></div>';
  }

  h += '<div class="solbar">' +
       (rec ? '<button class="tg retry" data-act="retry">重新作答</button>' : '') +
       '<button class="tg" data-act="toggle">提示与解析 <i>▼</i></button></div>';
  h += '<div class="sol' + (isOpen ? ' open' : '') + '">' + solHTML(q) + '</div>';
  h += '</article>';
  return h;
}

function renderAll(){
  const box = $('#list');
  if(!state.list.length){
    box.innerHTML = '<div class="empty">这一类暂时没有题目～<br>换个分类试试吧</div>';
    refreshStats(); return;
  }
  if(state.mode === 'key'){
    const titles = {fill:'一、填空题', term:'二、名词解释', note:'三、待确认'};
    const subs = {fill:'按原文留空，直接默写术语', term:'按原文定义的术语，口述或写出要点', note:'无法明确归入上述两类，单列并说明原因（不计入进度与正确率）'};
    let cur = null, out = '', n = 0;
    state.list.forEach((q, i) => {
      if(q.type !== cur){
        cur = q.type; n = 0;
        out += '<div class="grp"><b>' + (titles[cur] || cur) + '</b><span>' + (subs[cur] || '') + '</span></div>';
      }
      n++;
      out += cardHTML(q, i);
    });
    box.innerHTML = out;
  } else {
    box.innerHTML = state.list.map((q,i) => cardHTML(q,i)).join('');
  }
  refreshStats();
}

/* ============================ 答题 ============================ */
function submit(ev, q, payload){
  let ok = false, detail = null;
  if(q.type === 'choice'){
    ok = judgeChoice(q, payload);
    state.rec[q.id] = {ok, user:payload};
  } else if(q.type === 'fill'){
    detail = judgeFill(q, payload);
    ok = detail.every(Boolean);
    state.rec[q.id] = {ok, user:payload, detail};
  } else if(q.type === 'term'){
    if(!payload.trim()){ toast(false,'先写点内容再提交哦'); return; }
    const r = judgeTerm(q, payload);
    ok = r.ok; detail = r.hit;
    state.rec[q.id] = {ok, user:payload, detail};
  } else {
    if(!String(payload).trim()){ toast(false,'先填写计算结果'); return; }
    ok = judgeCalc(q, payload);
    state.rec[q.id] = {ok, user:payload};
  }
  if(ok) delete state.wrongSet[q.id];
  else { state.wrongSet[q.id] = 1; state.open[q.id] = true; }
  save();
  replaceCard(q, ev);
  renderChips(); refreshStats();
  if(!ok){
    toast(false, '答错了，已展开解析');
  } else {
    toast(true, '回答正确');
  }
}

function replaceCard(q, ev){
  const i = state.list.findIndex(x => x.id === q.id);
  const old = document.querySelector('.card[data-id="' + q.id + '"]');
  if(!old) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = cardHTML(q, i);
  const nw = tmp.firstElementChild;
  old.replaceWith(nw);
  if(!state.rec[q.id].ok){
    nw.classList.add('shake');
    setTimeout(() => {
      nw.classList.remove('shake');
      const r = nw.getBoundingClientRect();
      if(r.bottom > window.innerHeight - 20) nw.scrollIntoView({block:'center', behavior:'smooth'});
    }, 430);
  }
}

/* 事件委托 */
$('#list').addEventListener('click', e => {
  const card = e.target.closest('.card');
  if(!card) return;
  const q = byId[card.dataset.id];

  if(e.target.closest('[data-act="toggle"]')){
    state.open[q.id] = !state.open[q.id];
    card.classList.toggle('open', !!state.open[q.id]);
    card.querySelector('.sol').classList.toggle('open', !!state.open[q.id]);
    return;
  }
  /* 单题重练：只清这一题的记录，其他题不受影响 */
  if(e.target.closest('[data-act="retry"]')){
    delete state.rec[q.id];
    delete state.open[q.id];
    save();
    const idx = state.list.findIndex(x => x.id === q.id);
    const tmp = document.createElement('div');
    tmp.innerHTML = cardHTML(q, idx);
    card.replaceWith(tmp.firstElementChild);
    renderChips(); refreshStats();
    toast(true, '已重置这一题，可以重新作答');
    return;
  }

  if(state.rec[q.id]) return;

  const opt = e.target.closest('.opt');
  if(opt && q.type === 'choice'){ submit(e, q, +opt.dataset.i); return; }

  if(e.target.closest('[data-act="submit"]')){
    if(q.type === 'fill'){
      const vals = [...card.querySelectorAll('.fillinput')].map(el => el.value);
      if(vals.every(v => !v.trim())){ toast(false,'先填一下答案吧'); return; }
      submit(e, q, vals);
    } else if(q.type === 'term'){
      submit(e, q, card.querySelector('textarea').value);
    } else if(q.type === 'calc'){
      submit(e, q, card.querySelector('.numinput').value);
    }
  }
});

$('#list').addEventListener('keydown', e => {
  if(e.key !== 'Enter') return;
  const card = e.target.closest('.card');
  if(!card) return;
  const q = byId[card.dataset.id];
  if(state.rec[q.id]) return;
  if(q.type === 'fill' || q.type === 'term' || q.type === 'calc'){
    e.preventDefault();
    const b = card.querySelector('[data-act="submit"]');
    if(b) b.click();
  }
});

/* ============================ 顶部操作 ============================ */
$('#btnShuffle').onclick = () => {
  state.shuffled = !state.shuffled;
  state.seed = state.shuffled ? (Date.now() % 100000) : 1;
  $('#btnShuffle').classList.toggle('on', state.shuffled);
  buildList(); renderAll(); save();
  window.scrollTo({top:0});
  toast(true, state.shuffled ? '已打乱题目顺序' : '已恢复原顺序');
};
$('#btnWrong').onclick = () => {
  if(!Object.keys(state.wrongSet).length){ toast(true, '目前没有错题'); return; }
  state.mode = 'wrong'; if(!window.__OC_BLOCKED){ renderChips(); buildList(); renderAll(); } save();
  window.scrollTo({top:0});
};
$('#btnReset').onclick = () => {
  if(!confirm('确定清空所有答题记录，重新开始吗？')) return;
  state.rec = {}; state.wrongSet = {}; state.open = {}; state.mode = 'all';
  if(!window.__OC_BLOCKED){ renderChips(); buildList(); renderAll(); } save();
  window.scrollTo({top:0});
  toast(true, '已重置');
};
$('#fab').onclick = () => {
  const cards = [...document.querySelectorAll('.card')];
  const y = window.scrollY;
  const next = cards.find(c => !state.rec[c.dataset.id] && c.getBoundingClientRect().top > 90);
  if(next){ next.scrollIntoView({block:'start', behavior:'smooth'}); return; }
  const un = cards.find(c => !state.rec[c.dataset.id]);
  if(un){ un.scrollIntoView({block:'start', behavior:'smooth'}); }
  else { toast(true, '全部答完啦'); }
};

/* ============================ 启动 ============================ */
load();
$('#btnShuffle').classList.toggle('on', state.shuffled);
if(!window.__OC_BLOCKED){ renderChips(); buildList(); renderAll(); }
if(state._y) requestAnimationFrame(() => window.scrollTo({top:state._y}));
let st = null;
window.addEventListener('scroll', () => {
  clearTimeout(st);
  st = setTimeout(save, 400);
  const cards = document.querySelectorAll('.card');
  $('#fab').classList.toggle('hide', !cards.length);
}, {passive:true});
window.addEventListener('beforeunload', save);
window.addEventListener('resize', () => refreshStats());
