/* FuturePath AI — 前端路由与应用外壳 */
import { state, api, setSession, clearSession, currentStudent, setLite, syncTokenCookie, toast, esc, mentorAvatar, modal } from './core.js';
import * as landing from './views/landing.js';
import * as student from './views/student.js';
import * as assess from './views/assess.js';
import * as journey from './views/journey.js';
import * as parent from './views/parent.js';
import * as mentor from './views/mentor.js';
import * as advisor from './views/advisor.js';
import * as common from './views/common.js';
import { cloudSignOut, exchangeCloudSession, handleCloudCallback } from './cloud.js';
import { feedbackHref } from './feedback.js';

const ROUTES = [
  { path: '/', view: landing.landing, public: true, bare: true, title: 'FuturePath AI' },
  { path: '/login', view: landing.auth, public: true, bare: true, title: '登录 · FuturePath AI' },
  { path: '/start', view: journey.journey, roles: ['student', 'parent'], title: '从这里开始' },
  { path: '/student', view: student.home, roles: ['student'], title: '我的探索首页' },
  { path: '/student/explore', view: student.explore, roles: ['student'], title: '探索' },
  { path: '/assess', view: assess.assess, roles: ['student'], title: '标准化测评' },
  { path: '/student/analysis', view: student.analysis, roles: ['student'], title: '我的成长画像' },
  { path: '/student/plan', view: student.planView, roles: ['student'], title: '我的发展规划' },
  { path: '/parent', view: parent.overview, roles: ['parent'], title: '孩子概览' },
  { path: '/parent/discuss', view: parent.discuss, roles: ['parent'], title: '与 AI 导师讨论' },
  { path: '/parent/plan', view: parent.planView, roles: ['parent'], title: '发展规划（家长视角）' },
  { path: '/mentor', view: mentor.view, roles: ['student', 'parent'], title: 'AI 导师工作台' },
  { path: '/advisor', view: advisor.queue, roles: ['advisor'], title: '规划师工作台' },
  { path: '/advisor/session/:id', view: advisor.sessionView, roles: ['advisor'], title: '服务单详情' },
  { path: '/report', view: common.report, roles: ['student', 'parent'], title: '成长报告' },
  { path: '/welfare', view: common.welfare, roles: ['student', 'parent'], title: '公益服务' },
  { path: '/billing', view: common.billing, roles: ['student', 'parent'], title: '服务版本' },
  { path: '/privacy', view: common.privacy, roles: ['student', 'parent', 'advisor'], title: '隐私与数据' }
];

const NAV = {
  student: [
    { href: '/start', label: '流程', ico: '◔' },
    { href: '/student', label: '我的首页', ico: '◉' },
    { href: '/student/explore', label: '探索', ico: '✦' },
    { href: '/assess', label: '标准化测评', ico: '◈' },
    { href: '/student/analysis', label: '成长画像', ico: '◎' },
    { href: '/student/plan', label: '发展规划', ico: '⇢' },
    { href: '/report', label: '成长报告', ico: '▤' },
    { href: '/mentor', label: 'AI 导师', ico: '✦' }
  ],
  parent: [
    { href: '/start', label: '流程', ico: '◔' },
    { href: '/parent', label: '孩子概览', ico: '◉' },
    { href: '/parent/discuss', label: '与 AI 讨论', ico: '✉' },
    { href: '/parent/plan', label: '发展规划', ico: '⇢' },
    { href: '/report', label: '成长报告', ico: '▤' },
    { href: '/mentor', label: 'AI 导师', ico: '✦' }
  ],
  advisor: [
    { href: '/advisor', label: '工作台', ico: '◉' },
    { href: '/report', label: '报告样例', ico: '▤' },
    { href: '/privacy', label: '隐私与数据', ico: '⚿' }
  ]
};

const FOOTER_LINKS = [
  { href: '/welfare', label: '公益服务' },
  { href: '/billing', label: '服务版本' },
  { href: '/privacy', label: '隐私与数据' }
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function matchRoute(path) {
  for (const r of ROUTES) {
    const keys = [];
    const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    const m = re.exec(path);
    if (m) {
      const params = {};
      keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

function defaultPath() {
  if (!state.user) return '/login';
  if (state.user.role === 'advisor') return '/advisor';
  if (state.user.role === 'parent') return '/parent';
  return '/student';
}

function activeNav(path) {
  return path === '/parent/plan' ? 'plan' : path;
}

function shell(content, path, title) {
  const nav = NAV[state.user.role] || [];
  const student = currentStudent();
  const isGuest = Boolean(state.user.guest);
  const navHtml = nav.map((n) => {
    const active = path === n.href || (n.href !== '/student' && n.href !== '/parent' && path.startsWith(n.href));
    return `<a href="#${n.href}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>
      <span class="ico" aria-hidden="true">${n.ico}</span><span>${esc(n.label)}</span></a>`;
  }).join('');

  const switcher = state.user.role !== 'advisor' && state.students.length > 1
    ? `<select class="select" style="width:auto;padding:5px 8px;font-size:12.5px" data-student-switch aria-label="切换学生档案">
        ${state.students.map((s) => `<option value="${s.id}" ${s.id === student?.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>` : '';

  return `<aside class="sidebar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">FP</div>
      <div><div class="brand-name">FuturePath AI</div><div class="brand-sub">Career Discovery</div></div>
    </div>
    <nav class="nav" aria-label="主导航">${navHtml}</nav>
    <div class="nav" style="margin-top:8px">
      ${FOOTER_LINKS.filter((f) => !nav.some((n) => n.href === f.href)).map((f) => `<a href="#${f.href}" class="${path === f.href ? 'active' : ''}"><span class="ico" aria-hidden="true">·</span><span>${esc(f.label)}</span></a>`).join('')}
      <a href="${feedbackHref(path.replace(/^\//, '').replace(/\//g, '-') || 'home')}" target="_blank" rel="noopener noreferrer" class="fb-nav"><span class="ico" aria-hidden="true">✎</span><span>意见反馈</span></a>
    </div>
    <div class="sidebar-foot">
      <div class="who"><strong>${esc(state.user.displayName || state.user.name)}</strong>
        ${isGuest ? '临时体验' : state.user.role === 'student' ? '学生' : state.user.role === 'parent' ? '家长' : '规划师'}
        ${state.ai ? ` · ${state.ai.mode === 'llm' ? '真实模型' : '模拟模式'}` : ''}</div>
      ${isGuest ? '<button class="btn btn-primary btn-sm" data-guest-save>创建正式档案</button>' : ''}
      <button class="btn btn-ghost btn-sm" data-lite-toggle>${state.lite ? '关闭低带宽模式' : '开启低带宽模式'}</button>
      <button class="btn btn-ghost btn-sm" data-logout>${isGuest ? '结束体验' : '退出登录'}</button>
    </div>
  </aside>
  <div class="main">
    <header class="topbar">
      <span class="page-title">${esc(title)}</span>
      ${state.ai && state.ai.mode === 'simulated' ? '<span class="tag tag-demo" title="未调用真实大模型">模拟模式</span>' : ''}
      ${isGuest ? '<span class="tag tag-info" title="临时档案，24 小时后自动清理">公开体验</span>' : ''}
      ${state.user.cloudUid ? '<span class="tag tag-info" title="档案已保存在你自己的云空间">云档案</span>' : ''}
      <span class="spacer"></span>
      ${switcher}
      <a class="btn btn-sm btn-ghost" href="#${state.user.role === 'advisor' ? '/advisor' : state.user.role === 'parent' ? '/parent' : '/student'}">返回首页</a>
    </header>
    <main class="content" id="main-content">${content}</main>
  </div>`;
}

async function render() {
  const { path, query } = parseHash();
  const found = matchRoute(path);
  const app = document.getElementById('app');

  if (!found) {
    app.className = '';
    app.innerHTML = shell(`<div class="card"><h1>页面不存在</h1><p class="muted" style="margin:10px 0 16px">路径 ${esc(path)} 没有对应的页面。</p><a class="btn btn-primary" href="#${defaultPath()}">回到首页</a></div>`, defaultPath(), '404');
    return;
  }

  const { route, params } = found;

  if (route.public) {
    app.className = route.bare ? 'landing' : '';
    const view = await route.view({ params, query });
    app.innerHTML = view.html;
    view.mount?.();
    document.title = route.title;
    return;
  }

  if (!state.user) {
    location.hash = '#/login';
    return;
  }
  if (route.roles && !route.roles.includes(state.user.role)) {
    toast('当前账号没有该页面的访问权限', 'error');
    location.hash = '#' + defaultPath();
    return;
  }

  app.className = '';
  let content = '';
  let mount = null;
  try {
    const view = await route.view({ params, query, student: currentStudent() });
    content = view.html;
    mount = view.mount;
  } catch (err) {
    content = `<div class="card"><h2>页面加载失败</h2><p class="muted" style="margin:8px 0 14px">${esc(err.message)}</p>
      <button class="btn btn-primary" onclick="location.reload()">重新加载</button></div>`;
  }
  app.innerHTML = shell(content, path, route.title);
  document.title = route.title + ' · FuturePath AI';
  mount?.();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ------------------------------ 全局事件 ------------------------------ */

document.addEventListener('click', async (e) => {
  const ev = e.target.closest('[data-ev]');
  if (ev) {
    const ref = ev.dataset.ev;
    const item = (window.__FP_EVIDENCE || {})[ref];
    if (item) {
      await modal({
        title: `证据 ${ref}`,
        body: `<div class="stack" style="gap:10px">
          <div class="row row-tight">
            <span class="tag">${esc(item.sourceLabel || item.source)}</span>
            ${item.dimension ? `<span class="tag tag-info">${esc(item.dimension)}</span>` : ''}
            <span class="small muted">${esc(item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '')}</span>
          </div>
          <div class="callout">${esc(item.excerpt || '（无原文）')}</div>
          <p class="small muted">这是原始记录，未经改写。任何结论都应能回到这样的具体片段。</p>
        </div>`
      });
    }
    return;
  }

  if (e.target.closest('[data-guest-save]')) {
    const go = await modal({
      title: '把这次体验变成自己的档案',
      body: `<p class="small">你现在用的是<strong>临时体验档案</strong>：七个问题的回答和刚生成的画像只留在这次会话里，24 小时后会被自动清理，换设备也找不回来。</p>
        <p class="small muted" style="margin-top:10px">当前版本还不支持把体验记录直接迁移到新账号。创建正式档案后，用同样七个问题再答一遍（约 3 分钟），就能拿到一份会长期留存的画像。</p>
        <div class="callout small" style="margin-top:10px">想让家长一起看，可以在创建档案时勾选监护人同意，之后用家长端账号查看同一份记录。</div>`,
      actions: [{ label: '继续体验', value: null }, { label: '去创建档案', value: 'go', kind: 'btn-primary' }]
    });
    if (go) {
      clearSession();
      location.hash = '#/login?tab=register';
    }
    return;
  }
  if (e.target.closest('[data-lite-toggle]')) {
    setLite(!state.lite);
    toast(state.lite ? '已开启低带宽模式：动画与阴影已关闭' : '已关闭低带宽模式', 'ok');
    render();
    return;
  }
  if (e.target.closest('[data-logout]')) {
    await cloudSignOut();
    clearSession();
    location.hash = '#/login';
    render();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-student-switch]')) {
    localStorage.setItem('fp_student', e.target.value);
    state.studentId = e.target.value;
    render();
  }
});

window.addEventListener('hashchange', render);

async function boot() {
  document.documentElement.classList.toggle('lite', state.lite);
  // 调试用：/?noanim=1 临时关闭动画（不写入偏好），方便截图与低带宽模式验收
  if (new URLSearchParams(location.search).has('noanim')) document.documentElement.classList.add('lite');
  syncTokenCookie();

  // 云登录的回调必须最先处理：授权 code 是一次性的，被路由判断打断就再也换不回来了。
  const cb = await handleCloudCallback();
  if (cb.error) toast(cb.error, 'error');
  if (cb.session) {
    try {
      const out = await exchangeCloudSession();
      if (out?.needsProfile) {
        location.hash = '#/login?cloud=profile';
      } else {
        toast('已用云账号登录，档案在云端', 'ok');
        location.hash = '#/start';
      }
    } catch (err) {
      toast(err.message || '云端登录失败，请重试', 'error');
      location.hash = '#/login';
    }
  }

  try {
    state.meta = await api('/api/meta');
    state.ai = state.meta.ai;
  } catch {
    document.getElementById('app').innerHTML = `<div style="padding:40px;font-family:sans-serif">
      <h1>无法连接服务</h1><p>请确认已运行 <code>npm start</code>，然后刷新页面。</p></div>`;
    return;
  }
  if (state.token) {
    try {
      const me = await api('/api/auth/me');
      state.user = me.user;
      state.students = me.students;
      state.ai = me.ai;
      if (!state.studentId || !me.students.some((s) => s.id === state.studentId)) {
        state.studentId = me.studentId || '';
        if (state.studentId) localStorage.setItem('fp_student', state.studentId);
      }
    } catch {
      clearSession();
    }
  }
  await render();
}

export { render, defaultPath };
boot();
