/* 共用页面：成长报告 / 公益服务 / 服务版本 / 隐私与数据 */
import { state, api, esc, toast, modal, radarChart, barList, mentorAvatar, setBusy, refresh, download, fmtDate, relTime, statusTag } from '../core.js';
import { card, pageHead, empty, modeBanner, confidenceTag, evidenceChips, planStatusTag, sourceLabel } from '../ui.js';

/* ============================== 报告 ============================== */

export async function report(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('没有可查看的档案', '请选择学生档案。') };
  const r = await api(`/api/students/${s.id}/report`);
  const a = r.analysis;
  const p = r.plan;
  window.__FP_EVIDENCE = Object.fromEntries((a?.evidenceIndex || []).map((e) => [e.ref, e]));
  const dims = a?.profileSnapshot?.dimensions || [];
  const abilities = (a?.profileSnapshot?.abilities || []).filter((x) => x.count > 0);
  const plan = p?.sections || {};

  const sec = (n, title, body) => `<section style="margin-top:26px">
    <h2 style="font-size:15px;color:var(--brand);border-left:3px solid var(--brand);padding-left:8px;margin-bottom:10px">${n}. ${esc(title)}</h2>
    ${body}</section>`;

  const progressBlock = `<p class="small" style="color:var(--ink-2)">${esc(plan.summary?.stage || `${r.student.grade || ''} · 已积累 ${r.progress.signals} 条证据 · 覆盖 ${r.progress.dimensionCoverage}/6 个兴趣维度`)}</p>
    <div class="grid grid-4" style="gap:10px;margin-top:10px">
      <div class="stat"><span class="n" style="font-size:18px">${r.progress.signals}</span><span class="l">证据记录</span></div>
      <div class="stat"><span class="n" style="font-size:18px">${r.progress.bySource.dialogue || 0}</span><span class="l">对话回答</span></div>
      <div class="stat"><span class="n" style="font-size:18px">${(r.progress.bySource.scenario || 0) + (r.progress.bySource.career || 0)}</span><span class="l">任务 / 体验</span></div>
      <div class="stat"><span class="n" style="font-size:18px">${r.parentObservations.length}</span><span class="l">家长观察</span></div>
    </div>`;

  const interestBlock = `<div class="grid grid-2" style="gap:16px">
      <div>${radarChart(dims, { size: 280 })}</div>
      <div>
        ${barList(dims.map((d) => ({ name: d.name, score: d.score })))}
        <p class="tiny muted" style="margin-top:8px">分数 = 证据平均强度 × 证据充分度（0-100），表示"目前的证据指向"，不是能力上限。</p>
      </div>
    </div>`;

  const abilityBlock = `${abilities.length ? barList(abilities.map((x) => ({ name: x.name, score: x.score }))) : '<p class="small muted">行为类证据不足，暂不评估具体能力。这本身也是信息：需要更多真实任务。</p>'}
    <p class="tiny muted" style="margin-top:8px">仅统计"做出来的行为"，不包含自我评价。单次表现不佳不会被判定为缺乏能力。</p>`;

  const valuesBlock = (a.profileSnapshot.values || []).length
    ? `<div class="row row-tight">${a.profileSnapshot.values.map((v) => `<span class="tag tag-good">${esc(v.name)}</span>`).join('')}</div>
       <p class="tiny muted" style="margin-top:8px">价值观可能随经历变化，不作永久定性。</p>`
    : '<p class="small muted">尚无价值观记录。</p>';

  const strengthBlock = `<div class="stack" style="gap:12px">
      ${a.strengths.map((st) => `<div>
        <div class="spread"><div class="strong small">${esc(st.title)}</div><span class="mono small" style="color:var(--brand)">${st.score}</span></div>
        <p class="small muted" style="margin:4px 0">${esc(st.text)}</p>
        <div class="row row-tight">${evidenceChips(st.evidence)}</div>
      </div>`).join('')}
    </div>`;

  const hypothesisBlock = `<div class="stack" style="gap:10px">
      ${a.hypotheses.map((h) => `<div style="border-left:2px solid #f0d9b5;padding-left:10px">
        <div class="small strong">${esc(h.text)}</div>
        <div class="tiny muted" style="margin-top:3px">为什么不确定：${esc(h.why)}</div>
        <div class="tiny" style="color:var(--brand);margin-top:3px">建议验证：${esc(h.verifyBy)}</div>
      </div>`).join('') || '<p class="small muted">暂无。</p>'}
    </div>
    ${a.caveats.length ? `<div class="callout callout-warn small" style="margin-top:12px">${a.caveats.map((c) => esc(c)).join('；')}</div>` : ''}`;

  const careerBlock = `<div class="stack" style="gap:12px">
      ${a.careerMatches.map((c, i) => `<div class="path-card ${i === 0 ? 'top' : ''}">
        <div class="spread"><div class="strong">${esc(c.name)} <span class="tiny muted">${i === 0 ? '主路径' : i === 1 ? '并行备选' : '备选'}</span></div>
          <span class="mono small" style="color:var(--brand)">${c.match}%</span></div>
        <p class="tiny muted" style="margin:6px 0">${esc(c.why)}</p>
        <div class="tiny muted">学习路径：${esc((c.path || []).join(' → '))}</div>
        <div class="tiny" style="color:var(--accent);margin-top:3px">${c.gaps?.length ? '当前短板：' + esc(c.gaps.join('、')) : '短板：尚不明确，需要真实体验'}</div>
        <div class="tiny muted" style="margin-top:3px">现实限制：${esc(c.outlook)}</div>
      </div>`).join('')}
    </div>
    <p class="tiny muted" style="margin-top:8px">匹配度只表示与现有证据的相似程度，不构成职业推荐。多个方向并列时，请用实践而非讨论来分辨。</p>`;

  const parentBlock = `${r.parentObservations.length
      ? `<div class="stack" style="gap:8px">${r.parentObservations.map((o) => `<div class="small" style="border-left:2px solid var(--line);padding-left:10px">${esc(o.excerpt)}<div class="tiny muted">${relTime(o.createdAt)}</div></div>`).join('')}</div>`
      : '<p class="small muted">尚无家长补充观察。这是当前报告的一个明显缺口。</p>'}
    ${r.parentFeedback.length ? `<div class="divider"></div>
      <div class="grid grid-2" style="gap:12px">
        <div><div class="card-sub">家长期待</div><p class="small">${esc(r.parentFeedback[r.parentFeedback.length - 1].expectation || '未填写')}</p></div>
        <div><div class="card-sub">可提供资源</div><p class="small">${esc(r.parentFeedback[r.parentFeedback.length - 1].resources || '未填写')}</p></div>
      </div>` : ''}`;

  const phaseBlock = (plan.phases || []).map((ph) => `<div class="phase">
      <div class="phase-head"><span class="phase-code">${esc(ph.code)}</span><span class="strong">${esc(ph.title)}</span>
        <span class="phase-range">${esc(ph.range)}</span></div>
      <p class="small" style="margin-top:6px">${esc(ph.goal)}</p>
      <div class="grid grid-2" style="gap:8px;margin-top:6px">
        <div><div class="label">行动</div><ul class="small">${(ph.actions || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><div class="label">成果与指标</div><ul class="small">${(ph.deliverables || []).map((x) => `<li>${esc(x)}</li>`).join('')}${(ph.metrics || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>
      <div class="tiny muted" style="margin-top:4px">资源：${esc((ph.resources || []).join('；'))} · 复盘：${esc(ph.reviewAt)} · 调整：${esc(ph.adjustIf)}</div>
    </div>`).join('');

  const actionBlock = `<ul class="list-clean small">${(plan.actions || []).slice(0, 4).map((x) => `<li>${esc(x.title)}（${esc(x.cadence)} · ${esc(x.owner)}）</li>`).join('')}</ul>
    <div class="card-sub" style="margin-top:10px">资源需求与替代方案</div>
    <ul class="list-clean tiny muted">${(plan.risks || []).map((x) => `<li>${esc(x.risk)} → ${esc(x.response)}</li>`).join('')}</ul>`;

  const versionBlock = `<div class="grid grid-2" style="gap:12px">
      <div><div class="card-sub">参与者</div><p class="small">${esc((r.participants || []).join(' / '))}${p?.professionalReviewed ? ` · ${esc(p.advisorName)}（${esc(p.advisorCredential || '资质未填写')}）` : ''}</p></div>
      <div><div class="card-sub">规划版本</div><p class="small">${r.versions.length ? r.versions.map((v) => `v${v.version}（${v.status}）`).join(' → ') : '尚未生成'}</p></div>
    </div>
    ${p?.confirmations?.length ? `<div class="divider"></div><div class="card-sub">确认记录</div>
      <ul class="list-clean tiny">${p.confirmations.map((c) => `<li>${esc(c.role === 'student' ? '学生' : c.role === 'parent' ? '家长' : '规划师')} · ${fmtDate(c.at, true)} · ${c.agreed ? '同意' : '不同意'}${c.note ? '：' + esc(c.note) : ''}</li>`).join('')}</ul>` : ''}`;

  const appendix = `<div class="divider"></div>
    <div class="card-sub" style="margin-bottom:8px">附录：证据索引（共 ${a.evidenceIndex.length} 条）</div>
    <div class="evidence-list">
      ${a.evidenceIndex.map((e) => `<div class="evidence">
        <span class="ref">${esc(e.ref)}</span>
        <div class="body">${esc(e.excerpt || '（无原文）')}
          <div class="meta">${esc(sourceLabel(e.source))} · ${fmtDate(e.createdAt, true)}</div></div>
      </div>`).join('')}
    </div>
    <p class="tiny muted" style="margin-top:20px;text-align:center">FuturePath AI · 报告随新证据更新 · 本文件不构成升学或就业承诺</p>`;

  const body = a ? [
    sec(1, '当前探索阶段', progressBlock),
    sec(2, '兴趣画像', interestBlock),
    sec(3, '能力证据', abilityBlock),
    sec(4, '价值观与学习偏好', valuesBlock),
    sec(5, '个人成长优势', strengthBlock),
    sec(6, '尚待验证的潜力与不确定性', hypothesisBlock),
    sec(7, '候选发展方向', careerBlock),
    sec(8, '家长观察与讨论结果', parentBlock),
    p ? sec(9, `${p.horizon} 年分阶段路线图`, phaseBlock) : '',
    p ? sec(10, '未来三个月行动计划', actionBlock) : '',
    sec(11, '说明与边界', `<ul class="list-clean tiny muted">${r.disclaimer.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`),
    sec(12, '参与者与版本记录', versionBlock),
    appendix
  ].join('') : `<div class="callout callout-warn" style="margin-top:16px">该档案还没有生成分析报告。请先在探索页积累至少 3 条证据并生成画像。</div>`;

  return {
    html: `<div class="no-print" style="margin-bottom:14px">
      ${pageHead('个人成长与规划报告', `生成于 ${fmtDate(r.generatedAt, true)} · ${a ? `${a.signalCount} 条证据` : '尚无分析'}`,
      `<button class="btn btn-ghost btn-sm" onclick="window.print()">打印 / 存为 PDF</button>
       ${p ? `<button class="btn btn-ghost btn-sm" data-md>下载 Markdown</button><button class="btn btn-ghost btn-sm" data-html>下载 HTML</button>` : ''}`)}
      ${modeBanner(state.ai)}
    </div>
    <article class="card" style="max-width:840px;margin:0 auto">
      <header style="border-bottom:2px solid var(--brand);padding-bottom:16px;margin-bottom:6px">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <div class="tiny muted" style="letter-spacing:.1em">FUTUREPATH AI · 成长与规划报告</div>
            <h1 style="margin:6px 0 4px">${esc(r.student.name)}</h1>
            <div class="small muted">${esc(r.student.grade || '')} · ${esc(r.student.ageBand)} 岁段 · ${esc(r.student.region || '地区未填写')} · ${esc(r.student.schoolType || '')}</div>
            <div class="row row-tight" style="margin-top:8px">
              ${statusTag(r.student.plan === 'pro' ? '专业规划版' : '公益探索版', r.student.plan === 'pro' ? 'good' : 'neutral')}
              ${a ? confidenceTag(a.confidence) : statusTag('尚无分析', 'low')}
              ${p?.professionalReviewed ? statusTag('真人规划师已审核', 'good') : ''}
            </div>
          </div>
          ${mentorAvatar(64, 'calm')}
        </div>
        <div class="tiny muted" style="margin-top:10px">报告版本：${p ? `规划 v${p.version} · ${p.horizon} 年` : '尚未生成规划'} · 参与者：${(r.participants || []).join(' / ')}</div>
      </header>
      ${body}
    </article>`,
    mount() {
      document.querySelector('[data-md]')?.addEventListener('click', async () => {
        try { await download(`/api/plans/${p.id}/export?format=md`); } catch (e) { toast(e.message, 'error'); }
      });
      document.querySelector('[data-html]')?.addEventListener('click', async () => {
        try { await download(`/api/plans/${p.id}/export?format=html`); } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
}

/* ============================== 公益服务 ============================== */

export async function welfare(ctx) {
  const [data, stats] = await Promise.all([api('/api/welfare/programs'), api('/api/welfare/stats')]);
  const s = ctx.student;
  return {
    html: `${pageHead('公益服务计划', '让缺少生涯规划资源的学生，也能用上完整的探索与规划工具。')}
    <div class="callout callout-warn small">${esc(data.disclaimer)}</div>

    <div class="grid grid-side" style="margin-top:14px">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">公益版包含什么</div>
            <div class="card-sub">不是"试用版"，是完整闭环</div></div></div>
          <div class="grid grid-2" style="gap:10px">
            ${[['完整探索', '对话 / 情景任务 / 兴趣卡片 / 职业体验'],
            ['成长画像', '带证据溯源的六维画像与假设清单'],
            ['家长讨论', '家长补充观察、与 AI 结构化讨论'],
            ['5—10 年规划', '四阶段路线图，可编辑、可导出、可复盘']]
            .map(([t, d]) => `<div><div class="small strong">${t}</div><div class="tiny muted">${d}</div></div>`).join('')}
          </div>
          <div class="divider"></div>
          <p class="small muted">公益版不限制报告查看、不限制导出、不需要绑定支付方式。专业版才有差别——真人规划师参与，而不是把结果锁起来。</p>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">可参与的项目</div>
            <div class="card-sub">均为演示数据，未与任何机构系统对接</div></div></div>
          <div class="stack" style="gap:12px">
            ${data.programs.map((p) => `<div class="path-card">
              <div class="spread"><div class="strong small">${esc(p.name)}</div><span class="tag tag-demo">演示项目</span></div>
              <div class="tiny muted" style="margin:4px 0">${esc(p.org)} · ${esc(p.region)} · 名额 ${p.slots}</div>
              <p class="tiny" style="color:var(--ink-2)">${esc(p.desc)}</p>
              <div class="row row-tight" style="margin-top:6px"><span class="tiny muted">已登记 ${p.joined} 人（本实例内）</span></div>
            </div>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">使用邀请码</div>
            <div class="card-sub">学校或公益组织发放的参与码</div></div></div>
          <form id="redeem-form" class="row" style="align-items:flex-end">
            <div class="field" style="flex:1;margin:0"><label for="code">邀请码</label>
              <input class="input" id="code" placeholder="演示码：FP-DEMO-001" value="${esc(s?.inviteCode || '')}"></div>
            <button class="btn btn-primary" type="submit" ${s ? '' : 'disabled'}>登记</button>
          </form>
          <p class="tiny muted" style="margin-top:8px">当前为演示模式：邀请码只在本实例内记录，不会向任何机构提交你的信息。</p>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">资源不足地区适配</div></div></div>
          <ul class="list-clean small">
            <li><strong>低带宽模式</strong>：关闭动画、阴影与渐变，仅保留文本与核心交互，首屏体积小于 100KB。</li>
            <li><strong>零成本任务</strong>：所有体验任务都设计为在家或学校可完成，不依赖付费课程或专门设备。</li>
            <li><strong>不误判</strong>：把"没有机会做"与"做不好"分开记录，避免把资源差异算成能力差异。</li>
            <li><strong>可离线阅读</strong>：报告与规划可导出为 HTML，在无网络时用浏览器打开。</li>
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">本实例统计</div>
            <div class="card-sub">仅统计演示环境内数据</div></div></div>
          <div class="stack" style="gap:8px">
            ${stats.byProgram.map((b) => `<div class="spread small"><span>${esc(b.name)}</span><span class="mono">${b.count}</span></div>`).join('')}
            <div class="spread small"><span>低带宽模式用户</span><span class="mono">${stats.lowBandwidthUsers}</span></div>
          </div>
          <p class="tiny muted" style="margin-top:10px">${esc(stats.note)}</p>
        </div>
        <div class="card card-flat" style="background:#fdfcf9">
          <div class="card-title" style="margin-bottom:6px">数据边界</div>
          <p class="tiny muted">公益参与者（志愿者、合作机构）默认不能访问任何学生个人数据。学生档案的访问权只属于学生本人、其监护人与（经授权的）受聘规划师。</p>
        </div>
      </div>
    </div>`,
    mount() {
      document.getElementById('redeem-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('code').value.trim();
        try {
          const out = await api('/api/welfare/redeem', { method: 'POST', body: { studentId: s.id, code } });
          toast(`已登记：${out.program.name}（演示）`, 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  };
}

/* ============================== 服务版本 ============================== */

export async function billing(ctx) {
  const [opt, orders] = await Promise.all([
    api('/api/billing/options'),
    ctx.student ? api(`/api/billing/orders?studentId=${ctx.student.id}`) : Promise.resolve([])
  ]);
  const isParent = state.user.role === 'parent';
  const student = ctx.student;

  return {
    html: `${pageHead('服务版本', '公益版已完整；专业版增加的是"人"，不是"功能解锁"。')}
    <div class="callout callout-warn small">${esc(opt.note)}</div>

    <div class="grid grid-2" style="margin-top:14px">
      ${opt.plans.map((p, i) => `<div class="card ${i === 1 ? '' : ''}" style="${i === 1 ? 'border-color:var(--brand-line);background:linear-gradient(180deg,#f6fcfb,#fff 40%)' : ''}">
        <div class="card-head"><div class="grow"><div class="card-title">${esc(p.name)}</div>
          <div class="card-sub">${i === 0 ? '永久免费 · 无需支付方式' : '含真人规划师服务'}</div></div>
          ${i === 1 ? statusTag('可选', 'info') : statusTag('当前可用', 'good')}</div>
        <div style="font-size:26px;font-weight:700;letter-spacing:-.02em">${esc(p.price)}</div>
        <ul class="list-clean small" style="margin-top:12px">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        ${i === 1 && isParent && student ? `<button class="btn btn-primary btn-block" style="margin-top:14px" data-checkout ${student.plan === 'pro' ? 'disabled' : ''}>
          ${student.plan === 'pro' ? '已开通（演示）' : '演示开通专业版'}</button>
          <p class="tiny muted" style="margin-top:6px">点击不会产生任何真实扣款，也不会调用支付渠道。</p>` : ''}
        ${i === 1 && !isParent ? `<p class="tiny muted" style="margin-top:12px">专业版需由家长账号开通。你可以把这份说明转给家长。</p>` : ''}
      </div>`).join('')}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><div class="grow"><div class="card-title">专业版服务流程（真实记录，不伪造进度）</div></div></div>
      <div class="timeline">
        ${[['家长开通并授权共享范围', '演示模式开通，授权可随时撤回'],
        ['AI 整理专业讨论材料', '含证据、假设、学生不认同的结论、材料缺口'],
        ['规划师接单并核对原始证据', '只能看到已授权的档案'],
        ['规划师提交专业意见', '必须写明修订理由，留痕'],
        ['学生与家长确认最终方案', '双方确认后状态为"已确认"']]
        .map(([t, d]) => `<div class="timeline-item"><div class="small strong">${esc(t)}</div><div class="tiny muted">${esc(d)}</div></div>`).join('')}
      </div>
    </div>

    ${orders.length ? `<div class="card" style="margin-top:16px">
      <div class="card-head"><div class="grow"><div class="card-title">订单记录</div>
        <div class="card-sub">全部为演示订单，未发生真实交易</div></div></div>
      <table class="table"><thead><tr><th>时间</th><th>版本</th><th>金额</th><th>状态</th><th>说明</th></tr></thead><tbody>
        ${orders.map((o) => `<tr><td>${fmtDate(o.createdAt, true)}</td><td>${esc(o.plan)}</td><td>¥${o.amount}</td>
          <td>${statusTag(o.demo ? '演示开通' : o.status, 'mid')}</td><td class="tiny muted">${esc(o.note)}</td></tr>`).join('')}
      </tbody></table>
    </div>` : ''}`,
    mount() {
      document.querySelector('[data-checkout]')?.addEventListener('click', async (e) => {
        const ok = await modal({
          title: '演示开通确认',
          body: `<div class="stack" style="gap:10px">
            <p class="small">本次操作为<strong>演示开通</strong>：不调用支付渠道、不产生真实扣款，仅在本实例内把档案标记为专业版，并创建一条待接单的服务单。</p>
            <label class="choice"><input type="checkbox" id="share-consent" checked style="margin-top:3px">
              <span class="small">我同意向受聘的真人规划师共享该学生的成长档案与 AI 分析（可随时在隐私页撤回）</span></label>
          </div>`,
          actions: [{ label: '取消', value: null, kind: 'btn-ghost' }, { label: '确认演示开通', value: 'ok' }]
        });
        if (ok !== 'ok') return;
        setBusy(e.currentTarget, true, '开通中…');
        try {
          await api('/api/billing/checkout', {
            method: 'POST',
            body: { studentId: student.id, shareConsent: document.getElementById('share-consent')?.checked ?? true, topic: '专业版规划审核' }
          });
          toast('已演示开通，服务单已进入规划师队列', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); setBusy(e.currentTarget, false); }
      });
    }
  };
}

/* ============================== 隐私与数据 ============================== */

export async function privacy(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('没有可管理的档案', '请使用学生或家长账号登录。') };
  const [full, audit] = await Promise.all([
    api(`/api/students/${s.id}`),
    api(`/api/students/${s.id}/audit`)
  ]);
  const c = full.consents;
  const items = [
    ['guardian', '监护人关系与未成年人授权', '关系确认与基础授权，是所有数据处理的前提。'],
    ['data_use', '数据用于内部分析', '你的记录会被用于计算画像与生成规划，不会用于广告。'],
    ['ai_analysis', 'AI 生成分析报告', '允许 AI 引擎读取证据并生成结论。'],
    ['pro_sharing', '向真人规划师共享（专业版）', '仅在你开通专业版并勾选授权后生效，可随时撤回。'],
    ['public_welfare', '公益项目参与登记', '允许在本实例内记录公益项目参与，不向第三方提交。']
  ];

  return {
    html: `${pageHead('隐私与数据', '最小必要原则：只收集完成探索所必需的信息。')}

    <div class="grid grid-side" style="margin-top:14px">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">授权管理</div>
            <div class="card-sub">每一项都可单独开启或撤回</div></div></div>
          <div class="stack" style="gap:12px">
            ${items.map(([k, t, d]) => `<div class="spread" style="align-items:flex-start;gap:14px">
              <div style="flex:1"><div class="small strong">${t}</div><div class="tiny muted">${d}</div>
                <div class="tiny" style="margin-top:3px;color:${c[k] ? 'var(--brand)' : 'var(--muted)'}">状态：${c[k] ? '已授权' : '未授权'}</div></div>
              <button class="btn btn-sm ${c[k] ? 'btn-ghost' : 'btn-soft'}" data-consent="${k}" data-granted="${c[k] ? '0' : '1'}">${c[k] ? '撤回' : '授权'}</button>
            </div>`).join('')}
          </div>
          <p class="tiny muted" style="margin-top:12px">撤回"数据用于内部分析"后，AI 将无法读取记录生成新报告；已生成的报告仍可查看与删除。</p>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">你的数据</div>
            <div class="card-sub">可随时导出或删除</div></div></div>
          <div class="row row-tight">
            <button class="btn btn-ghost btn-sm" data-export>导出全部数据（JSON）</button>
            <button class="btn btn-danger btn-sm" data-delete>删除该档案</button>
          </div>
          <div class="divider"></div>
          <dl class="kv">
            <dt>存储方式</dt><dd>本实例使用服务器端 JSON 文件存储（MVP），非生产级数据库</dd>
            <dt>保留期限</dt><dd>档案存续期间；删除后主记录立即移除，备份最多保留 7 天</dd>
            <dt>加密</dt><dd>密码使用 scrypt 加盐哈希；传输依赖 HTTPS（生产环境必须启用）</dd>
            <dt>访问控制</dt><dd>基于角色的鉴权，学生 / 监护人 / 受聘规划师，其他角色不可访问</dd>
            <dt>第三方共享</dt><dd>无。未接入广告、分析 SDK 或第三方数据平台</dd>
          </dl>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">操作审计</div>
            <div class="card-sub">谁在什么时候看了/改了什么</div></div></div>
          <table class="table"><thead><tr><th>时间</th><th>操作</th><th>角色</th></tr></thead><tbody>
            ${audit.slice(0, 12).map((a) => `<tr><td class="tiny">${fmtDate(a.at, true)}</td><td class="tiny">${esc(a.action)}</td><td class="tiny muted">${esc(a.actorRole)}</td></tr>`).join('') || '<tr><td colspan="3" class="small muted">暂无记录</td></tr>'}
          </tbody></table>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">AI 使用说明</div></div></div>
          <ul class="list-clean small">
            <li>${state.ai?.mode === 'llm' ? '当前已接入真实模型，叙述文本由模型生成。' : '当前为模拟模式：使用内置规则引擎，不调用任何大模型。'}</li>
            <li>结构化评分与证据链接始终在本地计算，模型只负责措辞。</li>
            <li>不会把你的数据发送给无关第三方。</li>
            <li>AI 不会声称自己是真人规划师。</li>
            <li>你可以否定任何一条结论，否定会降低该证据的权重。</li>
          </ul>
        </div>
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">未成年人保护</div></div></div>
          <ul class="list-clean small">
            <li>14 岁以下需监护人代为创建档案。</li>
            <li>不收集身份证号、精确住址、联系方式。</li>
            <li>档案默认不公开，不参与任何排名或比较。</li>
            <li>家长不能修改学生的原始回答，只能补充观察。</li>
            <li>删除档案需二次确认，且不可恢复。</li>
          </ul>
        </div>
        <div class="card card-flat" style="background:#fdfcf9">
          <div class="card-title" style="margin-bottom:6px">迁移到生产环境</div>
          <p class="tiny muted">当前存储层已封装在 <span class="mono">server/db.js</span>，接口与业务逻辑分离。迁移到 PostgreSQL 时，只需替换该模块，并按 README 中的表结构建立实体表。</p>
        </div>
      </div>
    </div>`,
    mount() {
      document.querySelectorAll('[data-consent]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await api(`/api/students/${s.id}/consent`, { method: 'POST', body: { type: b.dataset.consent, granted: b.dataset.granted === '1' } });
          toast('授权状态已更新', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      }));
      document.querySelector('[data-export]')?.addEventListener('click', async () => {
        try {
          const data = await api(`/api/students/${s.id}/export`);
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${s.name}-档案导出.json`;
          a.click();
          toast('已导出，请妥善保管（含未成年人数据）', 'ok');
        } catch (err) { toast(err.message, 'error'); }
      });
      document.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await modal({
          title: '⚠️ 删除档案',
          body: `<div class="callout callout-danger small"><strong>此操作不可恢复。</strong>将删除该学生的全部探索记录、分析、规划、讨论与授权记录。</div>
            <div class="field" style="margin-top:10px"><label for="del">请输入 <span class="mono">DELETE</span> 确认</label>
            <input class="input" id="del" placeholder="DELETE"></div>`,
          actions: [{ label: '取消', value: null, kind: 'btn-ghost' }, { label: '永久删除', value: 'ok', kind: 'btn-danger' }]
        });
        if (ok !== 'ok') return;
        if (document.getElementById('del')?.value !== 'DELETE') { toast('确认文字不正确', 'error'); return; }
        try {
          await api(`/api/students/${s.id}`, { method: 'DELETE', body: { confirm: 'DELETE' } });
          toast('档案已删除', 'ok');
          location.hash = '#/privacy';
          setTimeout(() => location.reload(), 400);
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  };
}
