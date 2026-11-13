/* 学生端：首页 / 探索 / 画像 / 规划 */
import {
  state, api, esc, toast, modal, radarChart, barList, ring, mentorAvatar, setBusy,
  refresh, download, fmtDate, relTime, DIM_COLORS, statusTag
} from '../core.js';
import { card, pageHead, empty, modeBanner, confidenceTag, evidenceChips, stepsBlock, planStatusTag, sourceLabel } from '../ui.js';
import { startIntro } from './onboarding.js';
import { discussHtml, mountDiscuss, finalizeHtml, mountFinalize } from './plan-discuss.js';
import { feedbackCard } from '../feedback.js';

/* ================================ 首页 ================================ */

export async function home(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有学生档案', '请先在左侧进入家长端创建，或使用演示账号。') };
  const [full, analysis, signals, assess, journey] = await Promise.all([
    api(`/api/students/${s.id}`),
    api(`/api/students/${s.id}/analysis`),
    api(`/api/students/${s.id}/signals`),
    api(`/api/assess?studentId=${s.id}`).catch(() => ({ instruments: [] })),
    api(`/api/students/${s.id}/journey`).catch(() => null)
  ]);
  const assessDone = (assess.instruments || []).filter((i) => i.latest);
  const p = full.progress;
  const nextStep = p.steps.find((x) => !x.done);
  const greeting = p.percent === 0
    ? '我们从一次很轻的对话开始。没有标准答案，也不用想好未来。'
    : analysis.latest
      ? '你的画像已经有一版了。接下来最重要的不是再看一遍报告，而是去验证一个假设。'
      : '记录还不多，但已经能看出一些线索。再补几个问题，我就能给你一版有依据的画像。';

  const cta = journey && journey.progress < 100
    ? `<a class="btn btn-primary" href="#/start">${esc(journey.next?.action || '继续流程')} · 第 ${journey.steps.find((x) => x.state === 'current')?.n || 1} 步</a>`
    : !analysis.latest
      ? (analysis.canAnalyze
        ? `<a class="btn btn-primary" href="#/student/analysis">生成我的成长画像</a>`
        : `<a class="btn btn-primary" href="#/student/explore">继续探索</a>`)
      : `<a class="btn btn-primary" href="#/student/plan">查看我的规划</a>`;

  const journeyStrip = journey && journey.progress < 100
    ? `<div class="journey-strip">
        <div class="grow"><div class="small strong">当前流程：${esc(journey.next?.title || '')}</div>
          <div class="tiny muted">五步走完：量表 → 画像 → 初步方案 → 讨论 → 最终方案（已完成 ${journey.steps.filter((x) => x.done).length}/5）</div></div>
        <div class="journey-dots" aria-hidden="true">${journey.steps.map((x) => `<span class="${x.done ? 'on' : x.state === 'current' ? 'cur' : ''}"></span>`).join('')}</div>
        <a class="btn btn-primary btn-sm" href="#/start">继续</a>
      </div>`
    : '';

  return {
    html: `
    ${modeBanner(state.ai)}
    ${full.guest ? `<div class="guest-strip">
      <span class="tag tag-info">公开体验</span>
      <span>这是免注册的临时档案：你的回答与画像会在 24 小时后自动清理。想留下来，点左下角「创建正式档案」。</span>
    </div>` : ''}
    ${journeyStrip}
    <div class="stack" style="margin-top:14px">
      <section class="hero">
        <div class="hero-grid">
          <div>
            <div class="row row-tight" style="margin-bottom:10px">
              ${statusTag(full.plan === 'pro' ? '专业规划版' : '公益探索版', full.plan === 'pro' ? 'good' : 'neutral')}
              ${full.lowBandwidth ? statusTag('低带宽模式', 'info') : ''}
              <span class="tiny muted">最近更新 ${relTime(full.updatedAt || full.createdAt)}</span>
            </div>
            <h1>${esc(s.name)}，欢迎回到你的探索</h1>
            <p style="margin-top:8px">${esc(greeting)}</p>
            <div class="row" style="margin-top:16px">
              ${cta}
              <a class="btn btn-ghost" href="#/student/explore">继续上次的探索</a>
              <button class="btn btn-ghost btn-sm" data-replay-intro title="重新播放开篇的启程动画">重看启程</button>
            </div>
          </div>
          <div class="center">
            ${mentorAvatar(96, analysis.latest ? 'happy' : 'calm')}
            <div class="tiny muted" style="margin-top:4px">AI 导师 · 虚拟形象</div>
          </div>
        </div>
      </section>

      <div class="grid grid-side">
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="grow"><div class="card-title">你的探索进度</div>
              <div class="card-sub">7 个步骤，完成 ${p.steps.filter((x) => x.done).length} 个 · 共 ${p.signals} 条证据</div></div>
              ${ring(p.percent)}
            </div>
            ${stepsBlock(p.steps)}
            <div class="divider"></div>
            <div class="row" style="gap:24px">
              <div class="stat"><span class="n">${p.signals}</span><span class="l">证据记录</span></div>
              <div class="stat"><span class="n">${p.dimensionCoverage}/6</span><span class="l">已覆盖维度</span></div>
              <div class="stat"><span class="n">${p.analyses}</span><span class="l">分析版本</span></div>
              <div class="stat"><span class="n">${p.plans}</span><span class="l">规划版本</span></div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div class="grow"><div class="card-title">AI 导师建议的下一步</div>
              <div class="card-sub">基于你当前的证据覆盖情况</div></div></div>
            ${nextStep
              ? `<div class="callout" style="margin-bottom:12px">还差一步：<strong>${esc(nextStep.label)}</strong>。${nextStep.key === 'analysis' ? '至少 3 条证据后我才能给出有依据的判断。' : nextStep.key === 'parent' ? '请家长补充一条具体观察，家庭视角能发现你看不见的一面。' : '这一步会显著提高分析的可靠性。'}</div>`
              : `<div class="callout" style="margin-bottom:12px">基础流程已走完。建议每 8 周回来复盘一次，或用新证据重新分析。</div>`}
            <div class="row">
              <a class="btn btn-primary btn-sm" href="#/student/explore">去探索</a>
              <a class="btn btn-ghost btn-sm" href="#/student/analysis">看画像</a>
              <a class="btn btn-ghost btn-sm" href="#/student/plan">看规划</a>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div class="grow"><div class="card-title">最近的成长记录</div>
              <div class="card-sub">原始记录不会被改写，只会被引用</div></div>
              <a class="btn btn-ghost btn-sm" href="#/student/explore">新增</a></div>
            <div class="evidence-list">
              ${signals.signals.slice(0, 5).map((sig) => `
                <div class="evidence">
                  <span class="ref">${esc(sourceLabel(sig.source))}</span>
                  <div class="body">${esc(sig.excerpt || '（无文本）')}
                    <div class="meta">${relTime(sig.createdAt)}${sig.selfEval !== null && sig.selfEval !== undefined ? ` · 自评 ${sig.selfEval}` : ''}
                    ${sig.studentFeedback?.status === 'disputed' ? ' · 你已表示不同意（权重已下调）' : ''}</div></div>
                </div>`).join('') || '<p class="muted small">还没有记录。第一条可以从"最近半年你亲手做过什么"开始。</p>'}
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="grow"><div class="card-title">标准化测评</div>
              <div class="card-sub">霍兰德兴趣量表 · 多元智能自评</div></div>
              ${assessDone.length ? `<span class="tag tag-good">${assessDone.length}/2</span>` : ''}
            </div>
            ${assessDone.length
              ? `<div class="stack" style="gap:8px">
                  ${assessDone.map((i) => `<div class="spread">
                    <div>
                      <div class="tiny muted">${esc(i.short)}</div>
                      <div class="small">${i.latest.code ? `<span class="mono strong">${esc(i.latest.code)}</span>` : ''}
                        ${i.latest.top.map((t) => `<span class="tag">${esc(t.name)} ${t.percent}</span>`).join('')}</div>
                    </div>
                    <a class="btn btn-ghost btn-sm" href="#/assess?scale=${i.key}&view=result">看结果</a>
                  </div>`).join('')}
                 </div>
                 <a class="btn btn-ghost btn-sm btn-block" style="margin-top:12px" href="#/assess">${assessDone.length < 2 ? '补做另一份量表' : '查看全部测评'}</a>`
              : `<p class="small muted">36 + 40 道题，约 11 分钟。结果会写进证据库，参与画像计算。</p>
                 <a class="btn btn-primary btn-sm btn-block" style="margin-top:12px" href="#/assess">开始测评</a>`}
          </div>
          <div class="card">
            <div class="card-head"><div class="grow"><div class="card-title">成长画像摘要</div></div></div>
            ${analysis.latest
              ? `<p class="small" style="color:var(--ink-2)">${esc(analysis.latest.summary.slice(0, 150))}…</p>
                 <div class="row row-tight" style="margin-top:10px">${confidenceTag(analysis.latest.confidence)}<span class="tag">${analysis.latest.signalCount} 条证据</span></div>
                 <a class="btn btn-ghost btn-sm btn-block" style="margin-top:12px" href="#/student/analysis">查看完整画像</a>`
              : `<p class="small muted">还没有生成画像。${analysis.signalCount} 条证据${analysis.canAnalyze ? '，已经可以生成了。' : '，至少需要 3 条。'}</p>`}
          </div>
          <div class="card">
            <div class="card-head"><div class="grow"><div class="card-title">发展规划</div></div></div>
            ${full.latestPlan
              ? `<div class="row row-tight" style="margin-bottom:8px">${planStatusTag(full.latestPlan)}<span class="tag">v${full.latestPlan.version}</span><span class="tag">${full.latestPlan.horizon} 年</span></div>
                 <p class="small" style="color:var(--ink-2)">${esc(full.latestPlan.sections.vision.slice(0, 96))}…</p>
                 <a class="btn btn-ghost btn-sm btn-block" style="margin-top:12px" href="#/student/plan">打开规划</a>`
              : `<p class="small muted">完成分析后，可以生成 5 年或 10 年的分阶段路线图。</p>`}
          </div>
          <div class="card card-flat" style="background:#fdfcf9">
            <div class="card-title" style="margin-bottom:6px">关于这个版本</div>
            <p class="tiny muted">你正在使用${full.plan === 'pro' ? '专业规划版（含真人规划师）' : '公益探索版（功能完整，不含真人规划师）'}。${full.plan === 'pro' ? '' : '如需真人审核，可由家长在「服务版本」中了解。'}</p>
            <a class="btn btn-ghost btn-sm" style="margin-top:10px" href="#/billing">查看版本说明</a>
          </div>
        </div>
      </div>
    </div>`,
    mount() {
      // 七问开篇不再是必经入口：量表是新流程的第一步，这里只在 ?intro=1 时重播
      const force = ctx?.query?.intro === '1';
      const onDone = () => {
        const path = location.hash.replace('#', '').split('?')[0];
        if (path === '/student') window.dispatchEvent(new Event('hashchange'));
      };
      if (force) startIntro({ student: { id: s.id, name: full.name }, replay: false, onDone });
      document.querySelector('[data-replay-intro]')?.addEventListener('click', () => {
        startIntro({ student: { id: s.id, name: full.name }, replay: true });
      });
    }
  };
}

/* ================================ 探索 ================================ */

export async function explore(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有档案', '请先创建学生档案。') };
  let data = await api(`/api/explore/state?studentId=${s.id}`);
  let tab = ctx.query?.tab || 'dialogue';
  let scenarioFocus = null;

  const tabs = [
    ['dialogue', '对话探索'], ['scenario', '情景任务'], ['cards', '兴趣卡片'], ['careers', '职业体验']
  ];

  const shellHtml = `
    ${pageHead('探索', '所有记录都会成为证据。回答不必"正确"，越具体越有用。',
      `<a class="btn btn-ghost btn-sm" href="#/student/analysis">去做分析</a>`)}
    ${modeBanner(state.ai)}
    <div class="tabs" style="margin-top:14px" role="tablist">
      ${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}" role="tab" aria-selected="${tab === k}">${l}</button>`).join('')}
    </div>
    <div id="explore-body"></div>`;

  function paintDialogue() {
    const next = data.next;
    const q = next.question;
    const transcript = data.transcripts.slice(-8);
    const progress = data.progress;
    return `<div class="grid grid-side">
      <div class="card">
        <div class="card-head">
          <div class="grow"><div class="card-title">和 AI 导师聊聊</div>
            <div class="card-sub">${q ? `AI 会根据你已回答的内容挑选下一个问题 · 剩余 ${next.remaining} 个` : '基础问题已问完'}</div></div>
          ${mentorAvatar(46, q ? 'calm' : 'happy')}
        </div>
        <div class="chat" id="chat-log">
          ${transcript.map((t) => `
            <div class="msg me"><div class="avatar">我</div><div class="bubble bubble-me">${esc(t.answer)}</div></div>
            ${t.reflection ? `<div class="msg"><div class="avatar">AI</div><div class="bubble bubble-ai">${esc(t.reflection)}</div></div>` : ''}
          `).join('')}
          ${q ? `<div class="msg"><div class="avatar">AI</div><div class="bubble bubble-ai">
              <strong>${esc(q.text)}</strong>
              ${q.options ? `<div class="stack" style="margin-top:10px;gap:7px">${q.options.map((o) => `<button class="choice" data-opt="${esc(o.key)}"><span class="mark"></span><span>${esc(o.label)}</span></button>`).join('')}</div>` : ''}
              <div class="tiny muted" style="margin-top:8px">${esc(next.reason)}</div>
            </div></div>` : ''}
        </div>
        <form id="answer-form" class="composer">
          <label class="sr-only" for="answer-text">你的回答</label>
          <textarea class="textarea" id="answer-text" placeholder="${q && q.options ? '也可以补充你自己的说法…' : '写具体一点：什么时候、做了什么、结果如何…'}" ${q ? '' : 'disabled'}></textarea>
          <button class="btn btn-primary" type="submit" ${q ? '' : 'disabled'}>${q ? '回答' : '已完成'}</button>
        </form>
        <div class="row row-tight" style="margin-top:8px">
          <span class="tiny muted">按 Ctrl/⌘ + Enter 发送</span>
          ${q ? `<button class="btn btn-ghost btn-sm" id="skip-q" style="margin-left:auto">跳过这题</button>` : ''}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">当前画像</div><div class="card-sub">回答即时更新</div></div></div>
          ${radarChart(data.profile.dimensions, { size: 268 })}
          <div class="tiny muted center" style="margin-top:4px">证据 ${data.profile.totalSignals} 条 · 覆盖 ${data.profile.coverage.dimensionsCovered}/6 维度</div>
        </div>
        <div class="card card-flat">
          <div class="card-title" style="margin-bottom:8px">探索方式说明</div>
          <ul class="list-clean tiny muted">
            <li>我没有"正确答案"，也不给你打人格标签。</li>
            <li>短回答会触发追问，因为细节才是证据。</li>
            <li>你觉得结论不对，可以在画像页提出异议。</li>
          </ul>
        </div>
      </div>
    </div>`;
  }

  function paintScenarios() {
    if (scenarioFocus) {
      const sc = data.scenarios.find((x) => x.id === scenarioFocus);
      if (!sc) { scenarioFocus = null; return paintScenarios(); }
      return `<div class="card">
        <div class="card-head"><div class="grow"><div class="card-title">${esc(sc.title)}</div>
          <div class="card-sub">情景任务 · 记录你的实际选择</div></div>
          <button class="btn btn-ghost btn-sm" id="sc-back">返回列表</button></div>
        <p class="small" style="color:var(--ink-2);margin-bottom:6px">${esc(sc.setup)}</p>
        <p class="strong" style="margin:14px 0 10px">${esc(sc.question)}</p>
        <div class="stack" style="gap:8px">
          ${sc.options.map((o) => `<button class="choice" data-sc="${sc.id}" data-opt="${o.id}"><span class="mark"></span><span>${esc(o.text)}</span></button>`).join('')}
        </div>
        <p class="tiny muted" style="margin-top:12px">这是行为证据，不是考试。选你真正会做的，而不是"看起来更好"的。</p>
      </div>`;
    }
    return `<div class="grid grid-2">
      ${data.scenarios.map((sc) => `<div class="card">
        <div class="card-head"><div class="grow"><div class="card-title">${esc(sc.title)}</div>
          <div class="card-sub">${sc.done ? '已完成 · 可重新做一次' : '约 3 分钟'}</div></div>
          ${sc.done ? statusTag('已完成', 'good') : statusTag('未开始', 'neutral')}</div>
        <p class="small muted" style="margin-bottom:12px">${esc(sc.setup.slice(0, 78))}…</p>
        <button class="btn ${sc.done ? 'btn-ghost' : 'btn-primary'} btn-sm" data-sc-open="${sc.id}">${sc.done ? '再体验一次' : '开始任务'}</button>
      </div>`).join('')}
    </div>`;
  }

  function paintCards() {
    const done = data.cards.filter((c) => c.done).length;
    return `<div class="card" style="margin-bottom:14px">
        <div class="spread"><div><div class="card-title">如果没人要求，你愿意花时间做这些吗？</div>
          <div class="card-sub">已回应 ${done}/${data.cards.length} 张 · 第一反应就好，不用想"有没有用"</div></div>
          <div style="width:180px"><div class="progress-line"><i style="width:${(done / data.cards.length) * 100}%"></i></div></div></div>
      </div>
      <div class="grid grid-3">
        ${data.cards.map((c) => `<div class="card card-flat" style="padding:15px;${c.done ? 'opacity:.72' : ''}">
          <div class="row row-tight" style="margin-bottom:8px"><span class="tag" style="color:${DIM_COLORS[c.dim]}">${esc(c.tag)}</span>${c.done ? statusTag('已回应', 'good') : ''}</div>
          <p class="small strong" style="min-height:40px">${esc(c.title)}</p>
          <div class="row row-tight" style="margin-top:10px">
            <button class="btn btn-sm ${c.done ? 'btn-ghost' : 'btn-soft'}" data-card="${c.id}" data-liked="1" ${c.done ? 'disabled' : ''}>想试试</button>
            <button class="btn btn-sm btn-ghost" data-card="${c.id}" data-liked="0" ${c.done ? 'disabled' : ''}>没兴趣</button>
          </div>
        </div>`).join('')}
      </div>`;
  }

  function paintCareers() {
    const done = data.careers.filter((c) => c.done).length;
    return `<div class="card" style="margin-bottom:14px">
        <div class="spread"><div><div class="card-title">职业体验：先看日常，再看光环</div>
          <div class="card-sub">已了解 ${done}/${data.careers.length} 个 · 每个都写了入门任务与现实限制</div></div>
          <span class="tag tag-info">非推荐，仅信息</span></div>
      </div>
      <div class="grid grid-3">
        ${data.careers.map((c) => `<div class="card card-flat" style="padding:15px">
          <div class="row row-tight" style="margin-bottom:6px">${(c.tags || []).slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${c.done ? statusTag('已体验', 'good') : ''}</div>
          <div class="strong" style="font-size:14px">${esc(c.name)}</div>
          <p class="tiny muted" style="margin:5px 0 10px;min-height:34px">${esc(c.outlook)}</p>
          <button class="btn btn-ghost btn-sm" data-career="${c.id}">了解并记录</button>
        </div>`).join('')}
      </div>`;
  }

  function paint() {
    const body = document.getElementById('explore-body');
    if (!body) return;
    body.innerHTML = tab === 'dialogue' ? paintDialogue()
      : tab === 'scenario' ? paintScenarios()
        : tab === 'cards' ? paintCards() : paintCareers();
    document.querySelectorAll('[data-tab]').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    bind();
  }

  async function reload() {
    data = await api(`/api/explore/state?studentId=${s.id}`);
    paint();
  }

  function bind() {
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; paint(); }));
    document.querySelectorAll('[data-sc-open]').forEach((b) => b.addEventListener('click', () => { scenarioFocus = b.dataset.scOpen; paint(); }));
    document.getElementById('sc-back')?.addEventListener('click', () => { scenarioFocus = null; paint(); });
    document.querySelectorAll('[data-sc]').forEach((b) => b.addEventListener('click', () => submitScenario(b.dataset.sc, b.dataset.opt, b)));
    document.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => submitCard(b.dataset.card, b.dataset.liked === '1', b)));
    document.querySelectorAll('[data-career]').forEach((b) => b.addEventListener('click', () => openCareer(b.dataset.career)));
    document.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
      if (!b.dataset.sc) {
        document.querySelectorAll('[data-opt]').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        const ta = document.getElementById('answer-text');
        if (ta && !ta.value) ta.value = '';
        ta?.focus();
      }
    }));
    const form = document.getElementById('answer-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ta = document.getElementById('answer-text');
      const sel = document.querySelector('[data-opt].selected');
      const text = ta.value.trim();
      if (!text && !sel) { toast('写点什么，或选择一个选项', 'error'); return; }
      const btn = form.querySelector('button[type=submit]');
      setBusy(btn, true, '记录中…');
      try {
        const q = data.next.question;
        await api('/api/explore/answer', {
          method: 'POST',
          body: { studentId: s.id, questionId: q.id, text, optionKey: sel?.dataset.opt }
        });
        await reload();
        document.getElementById('answer-text')?.focus();
      } catch (err) {
        toast(err.message, 'error');
        setBusy(btn, false);
      }
    });
    document.getElementById('answer-text')?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') document.getElementById('answer-form').requestSubmit();
    });
    document.getElementById('skip-q')?.addEventListener('click', () => {
      const q = data.next.question;
      toast(`已跳过「${(q?.text || '').slice(0, 14)}…」，我不会把它算作证据`, 'info');
      data.next.question = null;
      paint();
    });
  }

  async function submitScenario(scenarioId, optionId, btn) {
    setBusy(btn, true, '记录中…');
    try {
      const out = await api('/api/explore/scenario', { method: 'POST', body: { studentId: s.id, scenarioId, optionId } });
      scenarioFocus = null;
      await reload();
      await modal({
        title: '任务已记录',
        body: `<div class="stack" style="gap:12px">
          <div class="callout">${esc(out.outcome)}</div>
          <div><div class="small strong" style="margin-bottom:4px">AI 观察</div>
            <p class="small muted">${esc(out.aiObservation)}</p></div>
          <p class="tiny muted">这条记录已进入证据库，可在画像页查看它对分数的影响。</p>
        </div>`
      });
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  }

  async function submitCard(cardId, liked, btn) {
    setBusy(btn, true, '…');
    try {
      await api('/api/explore/cards', { method: 'POST', body: { studentId: s.id, cardId, liked } });
      await reload();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  }

  async function openCareer(careerId) {
    const c = data.careers.find((x) => x.id === careerId);
    if (!c) return;
    const rating = await modal({
      title: c.name,
      wide: true,
      body: `<div class="stack" style="gap:12px">
        <div class="row row-tight">${(c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}<span class="tag tag-info">${esc(c.salary || '')}</span></div>
        <div><div class="small strong">主要工作内容与现状</div><p class="small muted">${esc(c.outlook)}</p></div>
        <div><div class="small strong">学习路径</div><p class="small muted">${esc((c.path || []).join(' → '))}</p></div>
        <div><div class="small strong">相关学科</div><p class="small muted">${esc((c.subjects || []).join('、'))}</p></div>
        <div class="callout"><strong>零成本体验任务：</strong>${esc(c.firstStep)}</div>
        <div class="callout callout-warn small">任何职业信息都会随政策与市场变化，本页为方向性描述，不构成就业承诺。真实情况请以官方信息与从业者一手经验为准。</div>
        <div class="field"><label>了解之后，你愿意继续了解这个方向吗？（1 = 完全不想，5 = 很想）</label>
          <div class="row row-tight">${[1, 2, 3, 4, 5].map((n) => `<button class="btn btn-sm" data-rate="${n}">${n}</button>`).join('')}</div>
        </div>
        <div class="field"><label for="career-note">补充一句：哪一点吸引你 / 哪一点劝退你？（可选）</label>
          <textarea class="textarea" id="career-note" style="min-height:70px"></textarea></div>
      </div>`,
      actions: [{ label: '取消', value: null, kind: 'btn-ghost' }, { label: '记录体验', value: 'save' }]
    });
    if (rating !== 'save') return;
    const note = document.getElementById('career-note')?.value || '';
    const chosen = document.querySelector('[data-rate].selected')?.dataset.rate || '3';
    try {
      const out = await api('/api/explore/career-experience', {
        method: 'POST', body: { studentId: s.id, careerId, rating: Number(chosen), note }
      });
      await reload();
      await modal({ title: '已记录', body: `<div class="callout">${esc(out.advice)}</div>` });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  bindRateOnce();

  return {
    html: shellHtml,
    mount() { paint(); }
  };
}

/* ================================ 画像 ================================ */

export async function analysis(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有档案', '请先创建学生档案。') };
  const [data, full] = await Promise.all([
    api(`/api/students/${s.id}/analysis`),
    api(`/api/students/${s.id}`)
  ]);
  const a = data.latest;

  if (!a) {
    return {
      html: `${pageHead('我的成长画像', '画像由你的回答与任务记录计算，不是测评分数。')}
        ${modeBanner(state.ai)}
        <div class="card" style="margin-top:14px">
          ${empty(
            data.canAnalyze ? '还没有生成画像' : '证据还不够',
            data.canAnalyze
              ? `你已经有 ${data.signalCount} 条证据，可以生成第一版画像了。生成后，每一条结论都会标注它来自哪条记录。`
              : `目前只有 ${data.signalCount} 条证据。至少需要 3 条，我才能给出有依据的判断，而不是猜测。`,
            data.canAnalyze
              ? `<button class="btn btn-primary" id="gen-analysis">生成我的画像</button>`
              : `<a class="btn btn-primary" href="#/student/explore">继续探索</a>`
          )}
        </div>`,
      mount() {
        document.getElementById('gen-analysis')?.addEventListener('click', async (e) => {
          setBusy(e.currentTarget, true, 'AI 正在整理证据…');
          try {
            await api(`/api/students/${s.id}/analysis`, { method: 'POST', body: {} });
            toast('画像已生成', 'ok');
            refresh();
          } catch (err) {
            toast(err.message, 'error');
            setBusy(e.currentTarget, false);
          }
        });
      }
    };
  }

  window.__FP_EVIDENCE = Object.fromEntries((a.evidenceIndex || []).map((e) => [e.ref, e]));
  const byRef = window.__FP_EVIDENCE;
  const ackOf = (target) => a.acknowledgements?.find((x) => x.target === target);
  const dims = a.profileSnapshot.dimensions;
  const abilities = a.profileSnapshot.abilities.filter((x) => x.count > 0);
  const values = a.profileSnapshot.values || [];
  const mi = (a.profileSnapshot.intelligences || []).filter((x) => x.count > 0)
    .slice().sort((x, y) => y.score - x.score);
  const si = a.scaleInsight && (a.scaleInsight.interests?.length || a.scaleInsight.potentials?.length) ? a.scaleInsight : null;

  const ackButtons = (target) => {
    const done = ackOf(target);
    return `<div class="row row-tight" style="margin-top:8px">
      <button class="btn btn-sm ${done?.action === 'confirm' ? 'btn-soft' : 'btn-ghost'}" data-ack="${esc(target)}" data-action="confirm">${done?.action === 'confirm' ? '✓ 我认同' : '我认同'}</button>
      <button class="btn btn-sm ${done?.action === 'dispute' ? 'btn-danger' : 'btn-ghost'}" data-ack="${esc(target)}" data-action="dispute">${done?.action === 'dispute' ? '已提出异议' : '我不认同'}</button>
      ${done ? `<span class="tiny muted">已记录（异议会降低该证据权重）</span>` : ''}
    </div>`;
  };

  return {
    html: `${pageHead('我的成长画像', `基于 ${a.signalCount} 条记录 · ${fmtDate(a.createdAt, true)} 生成 · 当前为${a.mode === 'llm' ? '真实模型叙述' : '规则引擎'}模式`,
      `<button class="btn btn-ghost btn-sm" id="reanalyze">重新分析</button>
       <a class="btn btn-ghost btn-sm" href="#/assess">标准化测评</a>
       <a class="btn btn-ghost btn-sm" href="#/report">完整报告</a>`)}
    ${modeBanner(state.ai)}
    ${data.stale ? `<div class="callout callout-warn" style="margin-top:12px">有新的证据（当前 ${data.signalCount} 条）在本次分析之后加入。建议重新分析，让结论跟上记录。
      <button class="btn btn-sm btn-soft" style="margin-left:8px" id="reanalyze-2">立即重新分析</button></div>` : ''}

    <div class="stack" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="grow"><div class="card-title">结论摘要</div>
          <div class="card-sub">这是推断，不是定义。你可以不同意。</div></div>
          ${confidenceTag(a.confidence)}
          <span class="tag">覆盖 ${a.coverage.dimensionsCovered}/6</span>
        </div>
        <p style="font-size:14.5px;color:var(--ink-2);line-height:1.75">${esc(a.summary)}</p>
        ${a.preference ? `<div class="callout ${a.preference.aligned ? '' : 'callout-info'}" style="margin-top:12px">
          <strong>你主动提到的方向：</strong>${esc(a.preference.statedName)}
          ${a.preference.aligned ? '（与证据计算一致）' : ` · 证据计算更偏向「${esc(a.preference.topCareerName)}」，两者都保留`}
          <div class="tiny" style="margin-top:4px">${esc(a.preference.note)}</div></div>` : ''}
        <div class="divider"></div>
        <div class="grid grid-2">
          <div>
            <div class="card-sub" style="margin-bottom:6px">兴趣六维（点击分数查看计算依据）</div>
            ${radarChart(dims)}
          </div>
          <div class="stack" style="gap:14px">
            <div>
              <div class="card-sub" style="margin-bottom:8px">已表现出的能力</div>
              ${abilities.length ? barList(abilities.map((x) => ({ name: x.name, score: x.score }))) : '<p class="small muted">行为类证据还不够，暂不评估能力。</p>'}
            </div>
            <div>
              <div class="card-sub" style="margin-bottom:8px">你重视的东西</div>
              ${values.length ? `<div class="row row-tight">${values.map((v) => `<span class="tag tag-good">${esc(v.name)}</span>`).join('')}</div>` : '<p class="small muted">还没有价值观记录。</p>'}
            </div>
          </div>
        </div>
      </div>

      ${si ? `<div class="card">
        <div class="card-head"><div class="grow"><div class="card-title">量表说了什么：兴趣与潜力</div>
          <div class="card-sub">${si.code ? `霍兰德代码 ${esc(si.code)}` : '多元智能自评'} · 全部来自自评量表，可回到原题核对</div></div>
          <span class="tag">量表解读</span></div>
        <div class="grid grid-2" style="gap:18px">
          <div>
            <div class="card-sub" style="margin-bottom:8px">兴趣结构（0–100，越靠上越愿意做）</div>
            ${barList(si.interests.map((x) => ({ name: x.name, score: x.percent, color: DIM_COLORS[x.key] })))}
          </div>
          <div>
            <div class="card-sub" style="margin-bottom:8px">潜力方向：你更容易用哪种方式学</div>
            ${barList(si.potentials.slice(0, 6).map((x) => ({ name: x.name, score: x.percent })))}
          </div>
        </div>
        <div class="divider"></div>
        <div class="stack" style="gap:7px">${si.narrative.map((line) => `<p class="small" style="margin:0;color:var(--ink-2)">${esc(line)}</p>`).join('')}</div>
        ${si.learningStyle ? `<div class="callout" style="margin-top:10px"><strong>试试这样学：</strong>${esc(si.learningStyle)}</div>` : ''}
        <p class="tiny muted" style="margin-top:10px">${esc(si.caveat)}</p>
        <div class="row row-tight" style="margin-top:8px">
          <a class="btn btn-ghost btn-sm" href="#/assess?scale=riasec&view=result">看霍兰德结果</a>
          <a class="btn btn-ghost btn-sm" href="#/assess?scale=mi&view=result">看多元智能结果</a>
        </div>
      </div>` : ''}

      ${!si && mi.length ? `<div class="card">
        <div class="card-head"><div class="grow"><div class="card-title">多元智能（自评量表）</div>
          <div class="card-sub">描述"你更容易用哪种方式学"，不是能力高低，也不合成总分</div></div>
          <span class="tag">来自量表</span></div>
        <div class="grid grid-2" style="gap:18px;align-items:center">
          ${barList(mi.map((m) => ({ name: m.name, score: m.score })))}
          <p class="small muted">最突出的是「${esc(mi[0].name)}」${mi[1] ? `与「${esc(mi[1].name)}」` : ''}。这部分只来自自评题，权重低于真实做过的事——把它当作选择学习方法的参考，而不是结论。</p>
        </div>
      </div>` : ''}

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">已经获得证据支持的优势</div>
            <div class="card-sub">每条都附原始记录编号</div></div></div>
          <div class="stack" style="gap:14px">
            ${a.strengths.map((st, i) => `<div>
              <div class="spread" style="align-items:flex-start">
                <div class="strong" style="font-size:14px">${esc(st.title)}</div>
                <span class="mono tag" style="color:${DIM_COLORS[st.dimension] || 'var(--brand)'}">${st.score}</span>
              </div>
              <p class="small muted" style="margin:6px 0">${esc(st.text)}</p>
              <div class="row row-tight">${evidenceChips(st.evidence)}<span class="tiny muted">${st.evidence.length} 条依据</span></div>
              ${ackButtons(`strength:${i}`)}
            </div>`).join('') || '<p class="small muted">证据不足，暂不列优势。</p>'}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">待验证的假设</div>
            <div class="card-sub">这些比"结论"更值得你花时间</div></div>
            <span class="tag tag-mid">${a.hypotheses.length} 条</span></div>
          <div class="stack" style="gap:14px">
            ${a.hypotheses.map((h, i) => `<div style="border-left:2px solid var(--line);padding-left:12px">
              <div class="row row-tight" style="margin-bottom:4px">${confidenceTag(h.confidence)}</div>
              <div class="small strong">${esc(h.text)}</div>
              <p class="tiny muted" style="margin:4px 0">为什么：${esc(h.why)}</p>
              <p class="tiny" style="color:var(--brand);margin:0">怎么验证：${esc(h.verifyBy)}</p>
              ${h.evidence?.length ? `<div class="row row-tight" style="margin-top:6px">${evidenceChips(h.evidence)}</div>` : ''}
              ${ackButtons(`hypothesis:${h.id}`)}
            </div>`).join('') || '<p class="small muted">暂无待验证假设。</p>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="grow"><div class="card-title">候选发展方向</div>
          <div class="card-sub">按现有证据的相似度排序，不代表"你应该做这个"</div></div>
          <span class="tag tag-info">多路径，不锁死</span></div>
        <div class="grid" style="gap:12px">
          ${a.careerMatches.map((c, i) => `<div class="path-card ${i === 0 ? 'top' : ''}">
            <div class="spread" style="align-items:flex-start">
              <div><div class="strong" style="font-size:15px">${esc(c.name)}</div>
                <div class="tiny muted" style="margin-top:2px">${esc(c.why)}</div></div>
              <div class="center"><div class="match-num">${c.match}</div><div class="tiny muted">匹配度</div></div>
            </div>
            <div class="progress-line" style="margin:10px 0"><i style="width:${c.match}%"></i></div>
            <div class="row row-tight" style="margin-bottom:6px">
              ${(c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
              ${c.confidence === 'medium' ? statusTag('与其他方向接近', 'mid') : ''}
            </div>
            ${c.gaps?.length ? `<p class="tiny" style="color:var(--accent)">当前短板：${esc(c.gaps.join('、'))}</p>` : ''}
            <details style="margin-top:6px"><summary class="tiny" style="cursor:pointer;color:var(--brand)">学习路径与第一步</summary>
              <div class="tiny muted" style="margin-top:6px">${esc((c.path || []).join(' → '))}<br>第一步：${esc(c.firstStep)}</div></details>
          </div>`).join('')}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">成长建议</div><div class="card-sub">都能在一周内开始</div></div></div>
          <div class="stack" style="gap:12px">
            ${a.suggestions.map((sg) => `<div style="border-left:3px solid var(--brand-soft);padding-left:10px">
              <div class="row row-tight"><span class="tag tag-good">${esc(sg.horizon)}</span><span class="small strong">${esc(sg.title)}</span></div>
              <p class="small muted" style="margin:4px 0 0">${esc(sg.action)}</p>
            </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">这份分析的局限</div><div class="card-sub">请连这些一起读</div></div></div>
          <ul class="list-clean small muted">
            ${(a.caveats.length ? a.caveats : ['暂无特别提示，但仍需注意证据量有限。']).map((c) => `<li>${esc(c)}</li>`).join('')}
          </ul>
          <div class="divider"></div>
          <div class="card-sub" style="margin-bottom:6px">分析版本历史</div>
          <div class="stack" style="gap:6px">
            ${data.history.map((h) => `<div class="spread small">
              <span>${fmtDate(h.createdAt, true)}</span>
              <span class="muted">${h.signalCount} 条证据 · ${h.confidence}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`,
    mount() {
      const run = async (btn) => {
        setBusy(btn, true, 'AI 正在整理证据…');
        try {
          await api(`/api/students/${s.id}/analysis`, { method: 'POST', body: { force: true } });
          toast('已生成新版本', 'ok');
          refresh();
        } catch (err) {
          toast(err.message, 'error');
          setBusy(btn, false);
        }
      };
      document.getElementById('reanalyze')?.addEventListener('click', (e) => run(e.currentTarget));
      document.getElementById('reanalyze-2')?.addEventListener('click', (e) => run(e.currentTarget));

      document.querySelectorAll('[data-ack]').forEach((b) => b.addEventListener('click', async () => {
        const [target] = [b.dataset.ack];
        const action = b.dataset.action;
        let note = '';
        if (action === 'dispute') {
          note = await modal({
            title: '为什么不认同？',
            body: `<div class="field"><label for="dispute-note">说一下你的理由（会记录在案，并下调这条证据的权重）</label>
              <textarea class="textarea" id="dispute-note" placeholder="例如：我只是那天心情不好，不是真的喜欢做这件事。"></textarea></div>`,
            actions: [{ label: '取消', value: null, kind: 'btn-ghost' }, { label: '提交异议', value: 'ok' }]
          }) === 'ok' ? (document.getElementById('dispute-note')?.value || '') : null;
          if (note === null) return;
        }
        try {
          await api(`/api/analyses/${a.id}/feedback`, { method: 'PATCH', body: { target, action, note } });
          toast(action === 'dispute' ? '已记录异议，权重已下调' : '已记录你的认同', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      }));
    }
  };
}

/* ================================ 规划 ================================ */

function planBody(plan, student, { canEdit = true } = {}) {
  const s = plan.sections;
  const pct = { confirmed: 100, pending_confirm: 60, discussing: 45, draft: 30, superseded: 0 }[plan.status] || 0;
  return `<div class="stack">
    <div class="card">
      <div class="card-head">
        <div class="grow"><div class="card-title">方向愿景</div>
          <div class="card-sub">${plan.horizon} 年 · v${plan.version} · 基于 ${plan.analysisSignalCount || 0} 条证据</div></div>
        ${planStatusTag(plan)}
      </div>
      <p style="font-size:15px;color:var(--ink-2);line-height:1.78">${esc(s.vision)}</p>
      <div class="divider"></div>
      <div class="grid grid-3">
        <div><div class="card-sub">当前阶段</div><div class="small">${esc(s.summary?.stage || '—')}</div></div>
        <div><div class="card-sub">兴趣证据</div><div class="small">${esc((s.summary?.interests || []).join('、'))}</div></div>
        <div><div class="card-sub">重视的价值</div><div class="small">${esc((s.summary?.values || []).join('、') || '待补充')}</div></div>
      </div>
      ${s.summary?.scope ? `<p class="tiny muted" style="margin-top:10px">${esc(s.summary.scope)}</p>` : ''}
      <div class="progress-line" style="margin-top:12px"><i style="width:${pct}%"></i></div>
    </div>

    <div class="card">
      <div class="card-head"><div class="grow"><div class="card-title">多路径分析</div>
        <div class="card-sub">保留备选，是为了不把 15 岁的判断变成 25 岁的枷锁</div></div></div>
      <div class="grid" style="gap:12px">
        ${(s.paths || []).map((p, i) => `<div class="path-card ${i === 0 ? 'top' : ''}">
          <div class="spread"><div><span class="tag ${i === 0 ? 'tag-good' : ''}">${esc(p.role)}</span>
            <span class="strong" style="margin-left:6px">${esc(p.name)}</span></div>
            <span class="mono muted small">${p.match}%</span></div>
          <p class="tiny muted" style="margin:8px 0 6px">${esc(p.evidence)}</p>
          <div class="tiny"><span class="muted">待验证：</span>${esc(p.toVerify)}</div>
          <details style="margin-top:6px"><summary class="tiny" style="cursor:pointer;color:var(--brand)">体验任务 / 能力 / 替代方案</summary>
            <ul class="list-clean tiny muted" style="margin-top:6px">
              ${(p.tasks || []).map((t) => `<li>${esc(t)}</li>`).join('')}
              <li>需培养：${esc((p.skills || []).join('、') || '待定')}</li>
              <li>困难：${esc(p.difficulties)}</li>
              <li>替代：${esc(p.alternatives)}</li>
              <li>家长支持：${esc(p.familySupport)}</li>
            </ul></details>
        </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="grow"><div class="card-title">分阶段路线图</div>
        <div class="card-sub">每个阶段都有目标、成果、资源与调整条件</div></div></div>
      ${(s.phases || []).map((ph) => `<div class="phase">
        <div class="phase-head"><span class="phase-code">${esc(ph.code)}</span>
          <span class="strong">${esc(ph.title)}</span><span class="phase-range">${esc(ph.range)}</span></div>
        <p class="small" style="margin-top:8px;color:var(--ink-2)">${esc(ph.goal)}</p>
        <div class="grid grid-2" style="gap:10px;margin-top:8px">
          <div>
            <div class="label">具体行动</div>
            <ul>${(ph.actions || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
            <div class="label">预期成果</div>
            <ul>${(ph.deliverables || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          </div>
          <div>
            <div class="label">所需资源</div>
            <ul>${(ph.resources || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
            <div class="label">评估与复盘</div>
            <ul>${(ph.metrics || []).map((x) => `<li>${esc(x)}</li>`).join('')}
              <li>复盘：${esc(ph.reviewAt)}</li><li>调整：${esc(ph.adjustIf)}</li></ul>
          </div>
        </div>
        ${ph.alternatives ? `<p class="tiny muted" style="margin-top:6px">替代路径：${esc(ph.alternatives)}</p>` : ''}
      </div>`).join('')}
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><div class="grow"><div class="card-title">日常行动</div><div class="card-sub">能坚持的才叫计划</div></div></div>
        <div class="stack" style="gap:8px">
          ${(s.actions || []).map((a, i) => `<label class="choice" style="padding:9px 12px">
            <input type="checkbox" data-done="${i}" style="margin-top:3px">
            <span class="small">${esc(a.title)}<span class="tiny muted"> · ${esc(a.cadence)} · ${esc(a.owner)}</span></span>
          </label>`).join('')}
        </div>
        <p class="tiny muted" style="margin-top:8px">勾选只在本机记录，用于你的日常打卡，不上传为证据。</p>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">风险与应对</div></div></div>
          <div class="stack" style="gap:8px">
            ${(s.risks || []).map((r) => `<div><div class="small strong">${esc(r.risk)}</div>
              <div class="tiny muted">→ ${esc(r.response)}</div></div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">支持系统</div></div></div>
          <div class="stack" style="gap:6px">
            ${(s.support || []).map((x) => `<div class="small"><span class="tag">${esc(x.who)}</span> ${esc(x.what)}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>

    ${s.advisorNote ? `<div class="card" style="border-color:var(--brand-line);background:#f7fcfb">
      <div class="card-head"><div class="grow"><div class="card-title">真人规划师意见</div>
        <div class="card-sub">${esc(plan.advisorName || '')}${plan.advisorCredential ? ' · ' + esc(plan.advisorCredential) : ''}</div></div>
        ${statusTag('已审核', 'good')}</div>
      <p class="small pre-wrap" style="color:var(--ink-2)">${esc(s.advisorNote)}</p>
    </div>` : `<div class="callout callout-info small">本方案尚未经真人规划师审核。如需专业复核，可由家长在「服务版本」中了解专业规划版。</div>`}

    <div class="card">
      <div class="card-head"><div class="grow"><div class="card-title">确认与版本</div>
        <div class="card-sub">方案需要学生与家长共同确认</div></div></div>
      <div class="row row-tight" style="margin-bottom:10px">
        ${(plan.confirmations || []).length
          ? plan.confirmations.map((c) => statusTag(`${c.role === 'student' ? '学生' : c.role === 'parent' ? '家长' : '规划师'}${c.agreed ? '已确认' : '未同意'}`, c.agreed ? 'good' : 'low')).join('')
          : '<span class="tiny muted">还没有确认记录</span>'}
      </div>
      ${(plan.confirmations || []).filter((c) => c.note).map((c) => `<p class="tiny muted">「${esc(c.note)}」— ${esc(c.role === 'student' ? '学生' : '家长')}</p>`).join('')}
      <div class="row row-tight" style="margin-top:10px">
        ${canEdit ? `<button class="btn btn-primary btn-sm" data-confirm="${plan.id}">我确认这个方案</button>` : ''}
        <a class="btn btn-ghost btn-sm" href="#/report">查看完整报告</a>
      </div>
    </div>
  </div>`;
}

export async function planView(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有档案', '请先创建学生档案。') };
  const data = await api(`/api/students/${s.id}/plan`);
  if (!data.latest) {
    return {
      html: `${pageHead('我的发展规划', '规划不是预测，是可以被修改和验证的路线图。')}
        <div class="card">${empty('还没有规划', '先完成探索并生成成长画像，然后我可以据此生成一份 5 年或 10 年的分阶段路线图。',
        `<div class="row" style="justify-content:center">
            <button class="btn btn-primary" data-gen="5">生成 5 年规划</button>
            <button class="btn btn-ghost" data-gen="10">生成 10 年规划</button>
          </div>`)}</div>`,
      mount() {
        document.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', async () => {
          setBusy(b, true, '正在生成…');
          try {
            await api(`/api/students/${s.id}/plan`, { method: 'POST', body: { horizon: b.dataset.gen } });
            toast('规划已生成', 'ok');
            refresh();
          } catch (err) { toast(err.message, 'error'); setBusy(b, false); }
        }));
      }
    };
  }

  const plan = data.latest;
  const thread = await api(`/api/plans/${plan.id}/comments`).catch(() => ({ comments: [], stats: {}, readiness: data.readiness, canComment: false }));
  return {
    html: `${pageHead('我的发展规划', `${plan.horizon} 年 · 版本 v${plan.version} · ${plan.participants.join(' / ')}`,
      `<button class="btn btn-ghost btn-sm" data-export-md>导出 Markdown</button>
       <button class="btn btn-ghost btn-sm" data-export-html>导出 HTML</button>
       <button class="btn btn-ghost btn-sm" onclick="window.print()">打印 / 存为 PDF</button>
       <button class="btn btn-primary btn-sm" data-edit>编辑方案</button>`)}
    ${modeBanner(state.ai)}
    <div style="margin-top:14px">${planBody(plan, s)}</div>
    ${discussHtml(plan, thread)}
    ${finalizeHtml(plan, thread.readiness || data.readiness)}
    <div class="card no-print" style="margin-top:16px">
      <div class="card-head"><div class="grow"><div class="card-title">版本历史</div>
        <div class="card-sub">每次修改都会生成新版本，旧版本不会被覆盖</div></div>
        <button class="btn btn-ghost btn-sm" data-regen>重新生成</button></div>
      <table class="table"><thead><tr><th>版本</th><th>周期</th><th>状态</th><th>时间</th><th>说明</th></tr></thead><tbody>
        ${data.versions.map((v) => `<tr><td>v${v.version}</td><td>${v.horizon} 年</td><td>${planStatusTag({ status: v.status, finalizedAt: v.finalizedAt, professionalReviewed: false })}</td><td>${fmtDate(v.createdAt, true)}</td><td class="tiny muted">${v.id === plan.id ? '当前版本' : ''}</td></tr>`).join('')}
      </tbody></table>
      ${data.revisions.length ? `<div class="divider"></div><div class="stack" style="gap:6px">
        ${data.revisions.map((r) => `<div class="small muted">v${r.version} · ${r.byName || r.by} · ${fmtDate(r.at, true)} · 修改了 ${r.changedFields.join('、')}${r.note ? ' · ' + esc(r.note) : ''}</div>`).join('')}
      </div>` : ''}
    </div>
    ${feedbackCard('plan-view', {
      title: '这份方案能落地吗？',
      sub: '哪一步你觉得做不完、哪里说得太满，都可以直说。意见只用于改进产品，不会改动这份方案。'
    })}`,
    mount() {
      document.querySelector(`[data-export-md]`)?.addEventListener('click', async () => {
        try { await download(`/api/plans/${plan.id}/export?format=md`); toast('Markdown 已下载', 'ok'); }
        catch (err) { toast(err.message, 'error'); }
      });
      document.querySelector(`[data-export-html]`)?.addEventListener('click', async () => {
        try { await download(`/api/plans/${plan.id}/export?format=html`); toast('HTML 已下载（可用浏览器打印为 PDF）', 'ok'); }
        catch (err) { toast(err.message, 'error'); }
      });
      document.querySelector('[data-confirm]')?.addEventListener('click', async (e) => {
        const agree = await modal({
          title: '确认方案',
          body: `<p class="small">确认后，这份规划会标记为"学生已确认"。家长也需要确认，方案才会进入"双方已确认"状态。</p>
            <div class="field" style="margin-top:10px"><label for="confirm-note">有什么想补充的？（可选）</label>
            <textarea class="textarea" id="confirm-note" placeholder="例如：同意方向，但想先把成绩稳住。"></textarea></div>`,
          actions: [{ label: '取消', value: null, kind: 'btn-ghost' }, { label: '确认', value: 'ok' }]
        });
        if (agree !== 'ok') return;
        try {
          await api(`/api/plans/${plan.id}/confirm`, { method: 'POST', body: { agreed: true, note: document.getElementById('confirm-note')?.value || '' } });
          toast('已记录你的确认', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
      document.querySelector('[data-regen]')?.addEventListener('click', async (e) => {
        setBusy(e.currentTarget, true, '重新生成…');
        try {
          await api(`/api/students/${s.id}/plan`, { method: 'POST', body: { horizon: plan.horizon } });
          toast('已生成新版本', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); setBusy(e.currentTarget, false); }
      });
      document.querySelector('[data-edit]')?.addEventListener('click', () => openEditor(plan, s));
      mountDiscuss(plan);
      mountFinalize(plan, thread.readiness || data.readiness);
    }
  };
}

async function openEditor(plan, student) {
  const s = plan.sections;
  const body = `<div class="stack" style="gap:12px">
    <div class="field"><label for="e-vision">方向愿景</label>
      <textarea class="textarea" id="e-vision">${esc(s.vision)}</textarea></div>
    ${(s.phases || []).map((ph, i) => `<div><div class="small strong" style="margin-bottom:4px">阶段 ${esc(ph.code)}｜${esc(ph.title)}</div>
      <div class="field"><label for="e-ph-${i}">具体行动（每行一条）</label>
        <textarea class="textarea" id="e-ph-${i}" style="min-height:78px">${esc((ph.actions || []).join('\n'))}</textarea></div>
    </div>`).join('')}
    <div class="field"><label for="e-actions">日常行动（格式：标题 | 频率 | 负责人）</label>
      <textarea class="textarea" id="e-actions">${esc((s.actions || []).map((a) => `${a.title} | ${a.cadence} | ${a.owner}`).join('\n'))}</textarea></div>
    <div class="field"><label for="e-risks">风险与应对（格式：风险 | 应对）</label>
      <textarea class="textarea" id="e-risks">${esc((s.risks || []).map((r) => `${r.risk} | ${r.response}`).join('\n'))}</textarea></div>
    <div class="field"><label for="e-note">这次修改的原因（会记入版本历史）</label>
      <input class="input" id="e-note" placeholder="例如：和家长讨论后，把第一阶段的投入时间下调"></div>
    <p class="tiny muted">保存后会生成新版本，旧版本仍可在历史中查看。</p>
  </div>`;
  const ok = await modal({
    title: '编辑发展规划', wide: true, body,
    actions: [{ label: '取消', value: null, kind: 'btn-ghost' }, { label: '保存为新版本', value: 'save' }]
  });
  if (ok !== 'save') return;
  const lines = (id) => document.getElementById(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
  const sections = {
    vision: document.getElementById('e-vision').value.trim(),
    phases: (s.phases || []).map((ph, i) => ({ ...ph, actions: lines(`e-ph-${i}`) })),
    actions: lines('e-actions').map((l) => {
      const [title, cadence, owner] = l.split('|').map((x) => (x || '').trim());
      return { title, cadence: cadence || '每周', owner: owner || '学生' };
    }),
    risks: lines('e-risks').map((l) => {
      const [risk, response] = l.split('|').map((x) => (x || '').trim());
      return { risk, response };
    })
  };
  try {
    await api(`/api/plans/${plan.id}`, { method: 'PUT', body: { sections, note: document.getElementById('e-note').value } });
    toast('已保存为新版本', 'ok');
    refresh();
  } catch (err) { toast(err.message, 'error'); }
}

export { planBody };


let rateBound = false;
function bindRateOnce() {
  if (rateBound) return;
  rateBound = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rate]');
    if (!b) return;
    b.parentElement.querySelectorAll('[data-rate]').forEach((x) => { x.classList.remove('btn-primary'); x.classList.add('btn-ghost'); });
    b.classList.add('btn-primary');
    b.classList.remove('btn-ghost');
  });
}
