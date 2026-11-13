/* 落地页 + 登录/注册 */
import { state, api, setSession, toast, esc, mentorAvatar, setBusy } from '../core.js';
import { cloudSupport, exchangeCloudSession, signInWithProvider } from '../cloud.js';
import { feedbackLink } from '../feedback.js';

const DEMOS = [
  { name: 'xiaoyu', label: '林知远 · 科学探究型', role: '学生', desc: '免费版，19 条证据' },
  { name: 'sunian', label: '苏念 · 创意表达型', role: '学生', desc: '专业版，已审核' },
  { name: 'chenhao', label: '陈昊 · 助人实践型', role: '学生', desc: '公益版，低带宽' },
  { name: 'parent_b', label: '苏念家长', role: '家长', desc: '含讨论记录' },
  { name: 'counselor', label: '周老师', role: '规划师', desc: '已认证（演示）' }
];

function goDefault(role) {
  location.hash = role === 'advisor' ? '#/advisor' : role === 'parent' ? '#/parent' : '#/student';
}

/** 云账号入口：真登录；本地调试时明确说明为什么不可用，而不是给个点不动的按钮 */
function cloudBlock() {
  const support = cloudSupport();
  return `<div class="cloud-entry">
    <div class="cloud-entry-head">
      <span class="cloud-mark" aria-hidden="true">☁</span>
      <div>
        <div class="strong">用云账号登录</div>
        <div class="tiny muted">档案保存在云端，换设备、换浏览器都能接着看</div>
      </div>
    </div>
    <div class="row row-tight">
      <button class="btn btn-primary btn-sm" type="button" data-cloud="workbuddy" ${support.ok ? '' : 'disabled'}>使用 WorkBuddy 登录</button>
      <button class="btn btn-ghost btn-sm" type="button" data-cloud="wechat" ${support.ok ? '' : 'disabled'}>微信扫码登录</button>
    </div>
    <div class="tiny ${support.ok ? 'muted' : ''}" id="cloud-msg" style="margin-top:8px">
      ${support.ok ? '登录后会自动把两份量表、画像与方案存到你自己的云档案下。' : esc(support.reason)}
    </div>
  </div>`;
}

/**
 * 云账号首次进来：角色只能问人，不能从云端资料推断。
 * 同一个人可能是家长，也可能是学生本人；选错会让整份档案落到错误的关系上。
 */
function drawCloudProfile(form) {
  let role = 'student';

  const draw = () => {
    form.innerHTML = `
      <div class="callout small" style="margin-bottom:14px">云端账号已授权。只差一步：这份档案给谁用？</div>
      <div class="field"><label>我是</label>
        <div class="row row-tight">
          <button type="button" class="btn btn-sm ${role === 'student' ? 'btn-soft' : 'btn-ghost'}" data-crole="student">学生本人</button>
          <button type="button" class="btn btn-sm ${role === 'parent' ? 'btn-soft' : 'btn-ghost'}" data-crole="parent">家长</button>
        </div>
      </div>
      <div class="field"><label for="cname">${role === 'student' ? '你的称呼' : '孩子的称呼'}</label>
        <input class="input" id="cname" name="cname" required placeholder="${role === 'student' ? '如 小远' : '如 小林'}"></div>
      <div class="field"><label for="cband">年龄阶段</label>
        <select class="select" id="cband" name="cband">
          <option value="12-15">初中 12-15</option><option value="16-18" selected>高中 16-18</option><option value="19-22">大学 19-22</option>
        </select></div>
      ${role === 'student'
        ? `<label class="choice" style="margin-bottom:12px"><input type="checkbox" id="cconsent" style="margin-top:4px">
             <span class="small">我已年满 14 周岁并取得监护人同意，了解探索记录会保存在我的云档案中。<span class="muted">（可随时导出或删除）</span></span></label>`
        : `<div class="callout small" style="margin-bottom:12px">你将以监护人身份创建档案，拥有查看与补充观察的权限；学生的原始回答只能由学生本人修改。</div>`}
      <button class="btn btn-primary btn-block" type="submit">创建云档案</button>
      <p class="tiny muted" style="margin-top:10px">档案存进你自己的云空间，只有你这个账号能读写。</p>`;
    form.querySelectorAll('[data-crole]').forEach((b) => b.addEventListener('click', () => { role = b.dataset.crole; draw(); }));
  };
  draw();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const name = form.querySelector('#cname').value.trim();
    const ageBand = form.querySelector('#cband').value;
    if (!name) { toast('请填写称呼', 'error'); return; }
    if (role === 'student' && !form.querySelector('#cconsent')?.checked) {
      toast('请先勾选监护人同意', 'error');
      return;
    }
    try {
      setBusy(btn, true, '创建中…');
      const out = await exchangeCloudSession({
        role,
        displayName: role === 'student' ? name : '',
        childName: role === 'parent' ? name : '',
        ageBand,
        guardianConsent: role === 'student' ? true : undefined
      });
      if (out.needsProfile) { setBusy(btn, false); toast('创建失败，请重试', 'error'); return; }
      toast('云档案已创建，数据会保存在你的云账号下', 'ok');
      location.hash = '#/start';
    } catch (err) {
      setBusy(btn, false);
      toast(err.message, 'error');
    }
  });
}

export async function landing(ctx) {
  return {
    html: `<div class="landing-wrap">
      <div class="landing-side">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">FP</div>
          <div><div class="brand-name">FuturePath AI</div><div class="brand-sub">Career Discovery for Teens</div></div>
        </div>
        <div>
          <h1>不急着告诉你<br>应该成为谁</h1>
          <p class="lead" style="margin-top:14px">先陪你看清：你喜欢什么、擅长什么、还有哪些可能没被尝试过。FuturePath AI 用持续的对话、情景任务与真实证据，帮你和家长一起，把"未来"从一句口号变成一份可执行的规划。</p>
        </div>
        <div class="landing-points">
          <div class="landing-point"><span class="k">01</span><div><strong>每个结论都能追溯</strong><br><span class="muted small">报告里的每条判断，都标注它来自哪一次回答、哪一个任务。</span></div></div>
          <div class="landing-point"><span class="k">02</span><div><strong>不给学生贴标签</strong><br><span class="muted small">区分"已发生的事实"与"待验证的假设"，并提供多个候选方向。</span></div></div>
          <div class="landing-point"><span class="k">03</span><div><strong>公益版就是完整闭环</strong><br><span class="muted small">探索、画像、家长讨论、5—10 年规划全部免费，不设结果墙。</span></div></div>
          <div class="landing-point"><span class="k">04</span><div><strong>需要时，真人介入</strong><br><span class="muted small">专业版由真人规划师审核 AI 结论，修改必须留痕、说明理由。</span></div></div>
        </div>
        <div class="row" style="gap:18px;margin-top:auto">
          <div class="stat"><span class="n">22</span><span class="l">职业方向</span></div>
          <div class="stat"><span class="n">6</span><span class="l">兴趣维度</span></div>
          <div class="stat"><span class="n">4</span><span class="l">阶段路线图</span></div>
          <div class="stat"><span class="n">0</span><span class="l">元起</span></div>
        </div>
        <p class="tiny muted">当前为演示实例：AI 使用内置规则引擎（模拟模式），公益机构与规划师均为虚构演示数据，未接入任何真实支付或外部平台。</p>
      </div>
      <div class="landing-form">
        <div class="inner">
          <div class="mentor-card" style="margin-bottom:18px">
            ${mentorAvatar(58, 'happy')}
            <div>
              <div class="strong">你好，我是你的 AI 导师</div>
              <div class="small muted">我不评价你，只帮你看清证据。</div>
            </div>
          </div>
          <div id="auth-body">
            ${cloudBlock()}
            <div class="divider"></div>
            <button class="guest-entry" id="guest-start" type="button">
              <span class="guest-entry-k">公开体验</span>
              <span class="guest-entry-main">先不注册，直接做两份量表</span>
              <span class="guest-entry-sub">霍兰德 + 多元智能 · 约 11 分钟 · 答完自动生成画像与初步方案</span>
              <span class="guest-entry-note">临时档案，24 小时后自动清理，不收集姓名与联系方式</span>
            </button>
            <div class="tabs" role="tablist">
              <button class="active" data-tab="login" role="tab" aria-selected="true">登录</button>
              <button data-tab="register" role="tab" aria-selected="false">创建档案</button>
            </div>
            <form id="auth-form" novalidate></form>
          </div>
          <div class="divider"></div>
          <div class="small muted" style="margin-bottom:8px">演示账号（密码均为 <span class="mono">demo123</span>）· 已探索完的老档案</div>
          <div class="demo-accounts">
            ${DEMOS.map((d) => `<button class="demo-account" data-demo="${d.name}">
              <span class="who">${esc(d.label)}</span><span class="role">${d.role} · ${d.desc}</span></button>`).join('')}
          </div>
          <p class="tiny muted" style="margin-top:16px">用得不顺手、或者看不懂哪一步？${feedbackLink('landing', '花 1 分钟告诉我们')}。反馈只用于改进产品，不收集学生档案内容。</p>
        </div>
      </div>
    </div>`,
    mount() {
      if (state.user) { goDefault(state.user.role); return; }
      const as = ctx?.query?.as;
      if (as) {
        api('/api/auth/login', { method: 'POST', body: { name: as, password: 'demo123' } })
          .then((out) => {
            setSession({ token: out.token, user: out.user, students: out.students, studentId: out.studentId });
            toast(`演示账号：${out.user.displayName || out.user.name}`, 'ok');
            if (ctx?.query?.to) location.hash = '#' + ctx.query.to;
            else goDefault(out.user.role);
          })
          .catch((err) => toast(err.message, 'error'));
        return;
      }

      /* 云登录回调已拿到会话，但账号还没绑定过应用档案：先选角色 */
      const form = document.getElementById('auth-form');
      if (ctx?.query?.cloud === 'profile') {
        drawCloudProfile(form);
        return;
      }

      let mode = ctx?.query?.tab === 'register' ? 'register' : 'login';
      let role = 'student';

      const draw = () => {
        form.innerHTML = mode === 'login'
          ? `<div class="field"><label for="name">用户名</label><input class="input" id="name" name="name" autocomplete="username" required></div>
             <div class="field"><label for="password">密码</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div>
             <button class="btn btn-primary btn-block" type="submit">登录</button>
             <p class="tiny muted" style="margin-top:10px">忘记密码？MVP 未接入邮件服务，请联系管理员重置。</p>`
          : `<div class="field"><label>我是</label>
               <div class="row row-tight">
                 ${[['student', '学生本人'], ['parent', '家长'], ['advisor', '职业规划师']].map(([v, l]) => `<button type="button" class="btn btn-sm ${role === v ? 'btn-soft' : 'btn-ghost'}" data-role="${v}">${l}</button>`).join('')}
               </div>
             </div>
             <div class="field"><label for="name">用户名（用于登录）</label><input class="input" id="name" name="name" autocomplete="username" required placeholder="如 xiaoyu2026"></div>
             <div class="field"><label for="password">密码（至少 6 位）</label><input class="input" id="password" name="password" type="password" autocomplete="new-password" required></div>
             ${role === 'parent'
              ? `<div class="form-row">
                   <div class="field"><label for="childName">孩子称呼</label><input class="input" id="childName" name="childName" required placeholder="如 小林"></div>
                   <div class="field"><label for="ageBand">年龄阶段</label><select class="select" id="ageBand" name="ageBand">
                     <option value="12-15">初中 12-15</option><option value="16-18">高中 16-18</option><option value="19-22">大学 19-22</option></select></div>
                 </div>
                 <div class="callout small">你将以监护人身份创建档案，并默认获得该档案的查看与补充观察权限。学生的原始回答只能由学生本人修改。</div>`
              : role === 'student'
                ? `<div class="form-row">
                     <div class="field"><label for="displayName">你的称呼</label><input class="input" id="displayName" name="displayName" placeholder="如 小远"></div>
                     <div class="field"><label for="ageBand">年龄阶段</label><select class="select" id="ageBand" name="ageBand">
                       <option value="12-15">初中 12-15</option><option value="16-18">高中 16-18</option><option value="19-22">大学 19-22</option></select></div>
                   </div>
                   <label class="choice" style="margin-bottom:12px"><input type="checkbox" id="guardianConsent" style="margin-top:4px">
                     <span class="small">我已年满 14 周岁，并已取得监护人同意，了解本平台会存储我的探索记录用于生成分析。<span class="muted">（可随时导出或删除）</span></span></label>`
                : `<div class="field"><label for="credential">资质说明（将公示给家长）</label><input class="input" id="credential" name="credential" placeholder="如 GCDF / 生涯规划师认证编号"></div>
                   <div class="callout callout-warn small">新注册规划师需管理员审核资质后才能接单。演示实例中不会自动通过审核。</div>`}
             <button class="btn btn-primary btn-block" type="submit">创建并进入</button>
             <p class="tiny muted" style="margin-top:10px">我们只收集完成探索所必需的信息：称呼、年龄段、探索记录。不收集身份证号、精确住址与联系方式。</p>`;

        form.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => { role = b.dataset.role; draw(); }));
      };
      draw();

      document.querySelectorAll('[data-cloud]').forEach((b) => b.addEventListener('click', async () => {
        const msg = document.getElementById('cloud-msg');
        try {
          setBusy(b, true, '前往授权…');
          if (msg) msg.textContent = '正在打开授权页面，完成后会自动回到这里…';
          await signInWithProvider(b.dataset.cloud);
        } catch (err) {
          setBusy(b, false);
          if (msg) msg.textContent = err.message;
          toast(err.message, 'error');
        }
      }));

      document.querySelectorAll('[data-tab]').forEach((x) => {
        const on = x.dataset.tab === mode;
        x.classList.toggle('active', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
      });

      // 免注册体验：拿一个临时档案，直接进启程七问
      document.getElementById('guest-start')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const sub = btn.querySelector('.guest-entry-sub');
        const original = sub.textContent;
        btn.disabled = true;
        sub.textContent = '正在准备你的临时档案…';
        try {
          const out = await api('/api/auth/guest', { method: 'POST' });
          setSession({ token: out.token, user: out.user, students: out.students, studentId: out.studentId });
          toast('已进入体验模式：两份量表答完就会生成画像', 'ok');
          location.hash = '#/start';
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          sub.textContent = original;
        }
      });

      document.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => {
        mode = t.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach((x) => {
          x.classList.toggle('active', x === t);
          x.setAttribute('aria-selected', x === t ? 'true' : 'false');
        });
        draw();
      }));

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        if (mode === 'register') {
          payload.role = role;
          if (payload.displayName) payload.name = payload.name;
          if (role === 'student' && !fd.get('guardianConsent')) { toast('请先勾选监护人同意', 'error'); return; }
          if (role === 'student') payload.guardianConsent = true;
          if (role === 'parent') payload.childName = payload.childName;
        }
        try {
          setBusy(btn, true, mode === 'login' ? '登录中…' : '创建中…');
          const out = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: payload });
          setSession({ token: out.token, user: out.user, students: out.students || (out.student ? [out.student] : []), studentId: out.student?.id });
          toast(mode === 'login' ? '登录成功' : '档案已创建', 'ok');
          if (mode === 'register' && out.user.role === 'student') location.hash = '#/start';
          else goDefault(out.user.role);
        } catch (err) {
          toast(err.message, 'error');
          setBusy(btn, false);
        }
      });

      document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', async () => {
        try {
          setBusy(b, true, '进入中…');
          const out = await api('/api/auth/login', { method: 'POST', body: { name: b.dataset.demo, password: 'demo123' } });
          setSession({ token: out.token, user: out.user, students: out.students, studentId: out.studentId });
          toast(`已进入演示账号：${out.user.displayName || out.user.name}`, 'ok');
          goDefault(out.user.role);
        } catch (err) {
          toast(err.message, 'error');
          setBusy(b, false);
        }
      }));
    }
  };
}

export const auth = landing;
