/* 家长端：孩子概览 / 与 AI 讨论 / 规划共读 */
import { state, api, esc, toast, modal, radarChart, barList, ring, mentorAvatar, setBusy, refresh, fmtDate, relTime, statusTag } from '../core.js';
import { card, pageHead, empty, modeBanner, confidenceTag, evidenceChips, planStatusTag, sourceLabel } from '../ui.js';
import { planBody } from './student.js';
import { discussHtml, mountDiscuss, finalizeHtml, mountFinalize } from './plan-discuss.js';

/* ============================== 概览 ============================== */

export async function overview(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有孩子的档案', '请退出后以家长身份重新注册，或使用演示账号 parent_b。') };

  const [full, analysis, disc] = await Promise.all([
    api(`/api/students/${s.id}`),
    api(`/api/students/${s.id}/analysis`),
    api(`/api/students/${s.id}/discussion`)
  ]);
  const p = full.progress;
  const consents = full.consents;
  const a = analysis.latest;

  // 家长观察与学生自评的对照
  const parentSignals = disc.observations || [];
  const top = a?.profileSnapshot?.dimensions?.slice().sort((x, y) => y.score - x.score)[0];

  return {
    html: `${pageHead(`${s.name} 的成长概览`, `${s.grade || ''} · ${s.ageBand} 岁段 · ${s.region || '未填写地区'}`,
      `<a class="btn btn-ghost btn-sm" href="#/parent/discuss">补充观察</a>
       <a class="btn btn-primary btn-sm" href="#/report">完整报告</a>`)}
    ${modeBanner(state.ai)}

    <div class="grid grid-side" style="margin-top:14px">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">探索进度</div>
            <div class="card-sub">共 ${p.signals} 条证据，覆盖 ${p.dimensionCoverage}/6 个兴趣维度</div></div>${ring(p.percent)}</div>
          <div class="grid grid-4" style="gap:10px">
            ${Object.entries(p.bySource).filter(([, v]) => v > 0).map(([k, v]) => `<div class="stat"><span class="n" style="font-size:19px">${v}</span><span class="l">${esc(sourceLabel(k))}</span></div>`).join('')}
          </div>
          <div class="divider"></div>
          <div class="card-sub" style="margin-bottom:8px">AI 目前看到的样子</div>
          ${a ? `<p class="small" style="color:var(--ink-2)">${esc(a.summary)}</p>
            <div class="row row-tight" style="margin-top:10px">${confidenceTag(a.confidence)}
              <a class="btn btn-ghost btn-sm" href="#/report">查看证据链</a></div>`
            : `<p class="small muted">孩子还没有积累足够证据（当前 ${analysis.signalCount} 条，至少需要 3 条）。在此之前，任何"适合什么"的说法都不可靠。</p>`}
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">你的观察 与 孩子的自评</div>
            <div class="card-sub">不一致不是问题，是值得讨论的线索</div></div></div>
          <div class="grid grid-2" style="gap:14px">
            <div>
              <div class="card-sub" style="margin-bottom:6px">孩子证据最集中的方向</div>
              ${a ? `<div class="row row-tight">${a.profileSnapshot.dimensions.slice().sort((x, y) => y.score - x.score).slice(0, 3).map((d) => `<span class="tag tag-good">${esc(d.name)} ${d.score}</span>`).join('')}</div>` : '<p class="small muted">暂无</p>'}
            </div>
            <div>
              <div class="card-sub" style="margin-bottom:6px">你提交的观察</div>
              ${parentSignals.length ? `<div class="stack" style="gap:6px">${parentSignals.slice(-3).map((o) => `<div class="tiny" style="color:var(--ink-2)">· ${esc(o.excerpt.slice(0, 60))}…</div>`).join('')}</div>` : '<p class="small muted">还没有。你的一条具体观察，可能比十道题更有信息量。</p>'}
            </div>
          </div>
          ${a?.hypotheses?.length ? `<div class="divider"></div>
            <div class="card-sub" style="margin-bottom:6px">AI 认为仍需澄清的问题</div>
            <ul class="list-clean small">${a.hypotheses.slice(0, 3).map((h) => `<li>${esc(h.text)}</li>`).join('')}</ul>` : ''}
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">补充家庭观察</div>
            <div class="card-sub">请写具体行为，避免评价性描述</div></div></div>
          <form id="obs-form">
            <div class="field"><label for="obs-text">最近一个月，你观察到的一件具体的事</label>
              <textarea class="textarea" id="obs-text" placeholder="例如：上周三他自己把路由器拆了又装回去，弄到晚上十点，谁劝都不停。"></textarea>
              <span class="hint">"动手能力强"很难验证；"拆了路由器又装回去"可以。</span></div>
            <button class="btn btn-primary btn-sm" type="submit">提交观察</button>
          </form>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">家庭期待与资源</div>
            <div class="card-sub">这些信息会进入规划讨论，但不会自动变成孩子的目标</div></div></div>
          <form id="expect-form">
            <div class="field"><label for="exp-expect">你对孩子未来的期待</label>
              <textarea class="textarea" id="exp-expect" style="min-height:64px" placeholder="例如：希望他读个稳妥的专业，工作稳定。">${esc(disc.expectations?.[0]?.expectation || '')}</textarea></div>
            <div class="field"><label for="exp-res">家里能提供的支持（时间 / 体验机会 / 预算）</label>
              <input class="input" id="exp-res" value="${esc(disc.expectations?.[0]?.resources || '')}" placeholder="例如：每学期一次外部体验，预算 1000 元"></div>
            <div class="field"><label for="exp-worry">你最担心的事</label>
              <input class="input" id="exp-worry" value="${esc(disc.expectations?.[0]?.worries || '')}" placeholder="例如：怕他只顾兴趣耽误成绩"></div>
            <button class="btn btn-primary btn-sm" type="submit">保存</button>
          </form>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">授权状态</div>
            <div class="card-sub">未授权的数据你看不到</div></div></div>
          <div class="stack" style="gap:7px">
            ${[['guardian', '监护人关系'], ['data_use', '数据用于分析'], ['ai_analysis', 'AI 生成画像'], ['pro_sharing', '向规划师共享（专业版）'], ['public_welfare', '公益项目参与']]
            .map(([k, l]) => `<div class="spread small"><span>${l}</span>${statusTag(consents[k] ? '已授权' : '未授权', consents[k] ? 'good' : 'neutral')}</div>`).join('')}
          </div>
          <div class="row row-tight" style="margin-top:10px">
            <a class="btn btn-ghost btn-sm" href="#/privacy">管理授权 / 导出数据</a>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">AI 建议的讨论问题</div></div></div>
          <div class="stack" style="gap:9px">
            ${(disc.guidingQuestions || []).map((q, i) => `<div class="small" style="display:flex;gap:8px">
              <span class="mono muted">${i + 1}</span><span>${esc(q)}</span></div>`).join('')}
          </div>
          <a class="btn btn-soft btn-sm btn-block" style="margin-top:12px" href="#/parent/discuss">开始讨论</a>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">当前服务</div></div></div>
          <div class="row row-tight" style="margin-bottom:8px">
            ${statusTag(full.plan === 'pro' ? '专业规划版' : '公益探索版', full.plan === 'pro' ? 'good' : 'neutral')}
            ${full.latestPlan ? planStatusTag(full.latestPlan) : ''}
          </div>
          <p class="tiny muted">${full.plan === 'pro'
            ? '已开通专业规划版：AI 生成的结论将由真人规划师审核，审核意见与修改理由会一并记录在方案中。'
            : '公益探索版已包含完整探索、AI 画像、家长讨论与 5—10 年规划，所有报告均可查看和导出，不设付费墙。'}</p>
          <a class="btn btn-ghost btn-sm btn-block" style="margin-top:8px" href="#/billing">${full.plan === 'pro' ? '查看服务详情' : '了解专业规划版'}</a>
        </div>
      </div>
    </div>`,
    mount() {
      document.getElementById('obs-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('obs-text').value.trim();
        if (text.length < 6) { toast('请写具体一点（至少 6 个字）', 'error'); return; }
        setBusy(e.submitter, true, '提交中…');
        try {
          await api(`/api/students/${s.id}/signals`, { method: 'POST', body: { kind: 'parent', text } });
          toast('观察已记录，并计入证据库', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); setBusy(e.submitter, false); }
      });
      document.getElementById('expect-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api(`/api/students/${s.id}/parent-feedback`, {
            method: 'POST',
            body: {
              expectation: document.getElementById('exp-expect').value,
              resources: document.getElementById('exp-res').value,
              worries: document.getElementById('exp-worry').value
            }
          });
          toast('已保存', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  };
}

/* ============================== 讨论 ============================== */

export async function discuss(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有孩子的档案', '请使用家长账号登录。') };
  const [disc, full] = await Promise.all([
    api(`/api/students/${s.id}/discussion`),
    api(`/api/students/${s.id}`)
  ]);

  return {
    html: `${pageHead('与 AI 导师讨论', 'AI 会把你说的和孩子的证据对照，不一致时会明确指出来，而不是附和。')}
    ${modeBanner(state.ai)}
    <div class="grid grid-side" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="grow"><div class="card-title">讨论区</div>
          <div class="card-sub">${s.name} · ${disc.messages.length} 条消息</div></div>${mentorAvatar(44, 'calm')}</div>
        <div class="chat" id="disc-log">
          ${disc.messages.length ? disc.messages.map((m) => `
            <div class="msg ${m.role === 'parent' ? 'me' : ''}">
              <div class="avatar">${m.role === 'parent' ? '家' : m.role === 'ai' ? 'AI' : '生'}</div>
              <div><div class="bubble ${m.role === 'parent' ? 'bubble-me' : 'bubble-ai'}">${esc(m.text).replace(/\n/g, '<br>')}</div>
                <div class="meta">${m.role === 'ai' ? 'AI 导师' : m.role === 'parent' ? '你' : '学生'} · ${relTime(m.createdAt)}${m.mode === 'simulated' ? ' · 模拟模式' : ''}</div></div>
            </div>`).join('') : `<p class="muted small">还没有讨论。可以从 AI 给出的问题开始，也可以直接说你最担心的事。</p>`}
        </div>
        <form id="disc-form" class="composer">
          <label class="sr-only" for="disc-text">你的发言</label>
          <textarea class="textarea" id="disc-text" placeholder="例如：他确实爱拆东西，但作业总拖到最后一晚，我更担心这个。"></textarea>
          <button class="btn btn-primary" type="submit">发送</button>
        </form>
        <div class="row row-tight" style="margin-top:8px">
          <span class="tiny muted">你的每条观察都会成为一条新证据（来源标记为"家长观察"）。</span>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">AI 的讨论提纲</div>
            <div class="card-sub">你可以挑任意一个开始</div></div></div>
          <div class="stack" style="gap:8px">
            ${(disc.guidingQuestions || []).map((q) => `<button class="choice" data-ask="${esc(q)}"><span class="mark"></span><span class="small">${esc(q)}</span></button>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">已记录的家庭观察</div>
            <div class="card-sub">${disc.observations.length} 条</div></div></div>
          <div class="stack" style="gap:8px">
            ${disc.observations.slice(-5).reverse().map((o) => `<div class="tiny" style="color:var(--ink-2);border-left:2px solid var(--line);padding-left:8px">
              ${esc(o.excerpt)}<div class="muted">${relTime(o.createdAt)}${o.studentFeedback?.status === 'confirmed' ? ' · 孩子已确认' : o.studentFeedback?.status === 'disputed' ? ' · 孩子有异议' : ''}</div></div>`).join('') || '<p class="small muted">暂无</p>'}
          </div>
        </div>
        ${full.plan === 'free' ? `<div class="card card-flat" style="background:#fdfcf9">
          <div class="card-title" style="margin-bottom:6px">需要真人介入？</div>
          <p class="tiny muted">公益版已包含完整的分析、讨论与规划。如果你希望有一位真人规划师复核 AI 的结论，可以了解专业规划版——是否开通完全由你决定，基础功能不会因此受限。</p>
          <a class="btn btn-ghost btn-sm" style="margin-top:8px" href="#/billing">了解差异</a>
        </div>` : ''}
      </div>
    </div>`,
    mount() {
      const form = document.getElementById('disc-form');
      const send = async (text, btn) => {
        if (!text.trim()) return;
        setBusy(btn, true, 'AI 正在思考…');
        try {
          const out = await api(`/api/students/${s.id}/discussion`, { method: 'POST', body: { text: text.trim() } });
          const log = document.getElementById('disc-log');
          if (log && out.messages?.length) {
            log.innerHTML = out.messages.map((m) => `
              <div class="msg ${m.role === 'parent' ? 'me' : ''}">
                <div class="avatar">${m.role === 'parent' ? '家' : m.role === 'ai' ? 'AI' : '生'}</div>
                <div><div class="bubble ${m.role === 'parent' ? 'bubble-me' : 'bubble-ai'}">${esc(m.text).replace(/\n/g, '<br>')}</div>
                  <div class="meta">${m.role === 'ai' ? 'AI 导师' : m.role === 'parent' ? '你' : '学生'} · ${relTime(m.createdAt)}${m.mode === 'simulated' ? ' · 模拟模式' : ''}</div></div>
              </div>`).join('');
            log.lastElementChild?.scrollIntoView({ block: 'nearest' });
          }
          document.getElementById('disc-text').value = '';
          setBusy(btn, false);
        } catch (err) {
          toast(err.message, 'error');
          setBusy(btn, false);
        }
      };
      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        send(document.getElementById('disc-text').value, form.querySelector('button'));
      });
      document.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => {
        document.getElementById('disc-text').value = b.dataset.ask;
        document.getElementById('disc-text').focus();
      }));
    }
  };
}

/* ============================== 规划（家长视角） ============================== */

export async function planView(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有孩子的档案', '请使用家长账号登录。') };
  const data = await api(`/api/students/${s.id}/plan`);
  const plan = data.latest;
  if (!plan) {
    return {
      html: `${pageHead('发展规划（家长视角）', '规划由孩子与 AI 生成，你的角色是参与确认与提供现实约束。')}
        <div class="card">${empty('孩子还没有生成规划', '需要孩子先完成探索并生成画像。你可以先补充家庭观察，帮助 AI 更准确地理解情况。',
        `<a class="btn btn-primary" href="#/parent/discuss">去补充观察</a>`)}</div>`
    };
  }
  const thread = await api(`/api/plans/${plan.id}/comments`).catch(() => ({ comments: [], stats: {}, readiness: data.readiness, canComment: false }));
  return {
    html: `${pageHead('发展规划（家长视角）', `v${plan.version} · ${plan.horizon} 年 · ${plan.participants.join(' / ')}`,
      `<button class="btn btn-ghost btn-sm" data-export>下载 Markdown</button>
       <button class="btn btn-ghost btn-sm" onclick="window.print()">打印 / 存为 PDF</button>`)}
    ${modeBanner(state.ai)}
    <div class="callout callout-info small" style="margin-top:12px">你可以确认方案，但不能修改孩子的原始回答或直接改写规划内容。如需调整，请在讨论区提出，AI 会把你的意见整理成修订建议。</div>
    <div style="margin-top:14px">${planBody(plan, s)}</div>
    ${discussHtml(plan, thread)}
    ${finalizeHtml(plan, thread.readiness || data.readiness)}
    <div class="card no-print" style="margin-top:16px">
      <div class="card-head"><div class="grow"><div class="card-title">参与确认</div>
        <div class="card-sub">学生与家长都确认后，方案状态才会变为"双方已确认"</div></div>
        ${planStatusTag(plan)}</div>
      <button class="btn btn-primary btn-sm" data-confirm>我确认 / 有补充</button>
    </div>`,
    mount() {
      document.querySelector('[data-export]')?.addEventListener('click', async () => {
        try {
          const { download } = await import('../core.js');
          await download(`/api/plans/${plan.id}/export?format=md`);
        } catch (err) { toast(err.message, 'error'); }
      });
      mountDiscuss(plan);
      mountFinalize(plan, thread.readiness || data.readiness);
      document.querySelector('[data-confirm]')?.addEventListener('click', async () => {
        const note = await modal({
          title: '确认方案',
          body: `<p class="small">确认代表你了解方案内容并支持孩子先按此尝试。如果你有不同意见，也请如实写下——分歧被记录，比被掩盖更有价值。</p>
            <div class="field" style="margin-top:10px"><label for="pn">你的补充 / 保留意见</label>
            <textarea class="textarea" id="pn" placeholder="例如：同意先试，但希望先把成绩稳住，预算也有上限。"></textarea></div>`,
          actions: [{ label: '取消', value: null, kind: 'btn-ghost' }, { label: '提交确认', value: 'ok' }]
        });
        if (note !== 'ok') return;
        try {
          await api(`/api/plans/${plan.id}/confirm`, { method: 'POST', body: { agreed: true, note: document.getElementById('pn')?.value || '' } });
          toast('已记录你的确认', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  };
}
