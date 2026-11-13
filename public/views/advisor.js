/* 规划师端（付费专业版）：接单 / 审阅档案 / 提交专业意见 */
import { state, api, esc, toast, modal, refresh, fmtDate, relTime, statusTag } from '../core.js';
import { pageHead, empty, confidenceTag, evidenceChips, planStatusTag, sourceLabel } from '../ui.js';

export async function queue() {
  const data = await api('/api/advisor/queue');
  const role = state.user;

  return {
    html: `${pageHead('规划师工作台', '你只能看到已购买专业版、且家长明确授权共享的档案。', '')}
    ${!data.verified ? `<div class="callout callout-warn">你的规划师资质尚未通过审核。审核通过前无法接单，也不能标记"已审核"。演示账号 <span class="mono">counselor</span> 已通过审核。</div>` : ''}
    <div class="callout callout-info small" style="margin-top:12px">身份信息：${esc(role.displayName || role.name)} · ${esc(role.credential || '未填写资质')} · ${data.verified ? '资质已核验（演示数据）' : '待核验'}</div>

    <div class="stack" style="margin-top:16px">
      ${data.sessions.length ? data.sessions.map((s) => `<div class="card">
        <div class="card-head">
          <div class="grow">
            <div class="card-title">${esc(s.student?.name || '未知学生')} <span class="tiny muted">${esc(s.student?.grade || '')} · ${esc(s.student?.ageBand || '')}</span></div>
            <div class="card-sub">${esc(s.topic)} · 创建于 ${fmtDate(s.createdAt, true)}</div>
          </div>
          ${statusTag({ queued: '待接单', claimed: '进行中', reviewed: '已提交意见', completed: '已完成' }[s.status], s.status === 'queued' ? 'mid' : s.status === 'completed' ? 'good' : 'info')}
          ${s.consent ? statusTag('已授权共享', 'good') : statusTag('未授权', 'low')}
        </div>
        <div class="row row-tight">
          ${!s.advisorId ? `<button class="btn btn-primary btn-sm" data-claim="${s.id}">接单</button>` : ''}
          <a class="btn ${s.advisorId ? 'btn-primary' : 'btn-ghost'} btn-sm" href="#/advisor/session/${s.id}">打开服务单</a>
          <span class="tiny muted">${s.advisorId ? '负责规划师：' + esc(role.displayName || role.name) : '尚未分配'}</span>
        </div>
      </div>`).join('') : empty('暂无待处理服务单', '当家长开通专业版并授权共享后，服务单会出现在这里。你可以用演示账号查看苏念的已完成案例。')}
    </div>`,
    mount() {
      document.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await api(`/api/advisor/sessions/${b.dataset.claim}/claim`, { method: 'POST', body: {} });
          toast('已接单', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      }));
    }
  };
}

export async function sessionView(ctx) {
  const id = ctx.params.id;
  let data;
  try {
    data = await api(`/api/advisor/sessions/${id}`);
  } catch (err) {
    return { html: `<div class="card">${empty('无法打开服务单', err.message, '<a class="btn btn-primary" href="#/advisor">返回工作台</a>')}</div>` };
  }
  const { session, student, analysis, plan, dossier, signals, parentObservations, reviews } = data;
  const dims = analysis?.profileSnapshot?.dimensions?.slice().sort((a, b) => b.score - a.score) || [];

  return {
    html: `${pageHead(`${student.name} · 专业审核`, `${session.topic} · ${statusTag({ queued: '待接单', claimed: '进行中', reviewed: '已提交意见', completed: '已完成' }[session.status], 'info')}`,
      `<a class="btn btn-ghost btn-sm" href="#/advisor">返回</a>
       ${session.status !== 'completed' ? `<button class="btn btn-ghost btn-sm" data-complete>完成服务单</button>` : ''}`)}

    ${!session.advisorId ? `<div class="callout callout-warn">该服务单尚未分配。请先在列表中接单，再提交专业意见。
      <button class="btn btn-sm btn-primary" style="margin-left:8px" data-claim>立即接单</button></div>` : ''}
    ${!student.consents.pro_sharing ? `<div class="callout callout-danger">家长尚未授权向规划师共享数据。请勿基于当前信息出具意见。</div>` : ''}

    <div class="grid grid-side" style="margin-top:14px">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">专业讨论材料</div>
            <div class="card-sub">由 AI 从成长数据库整理，供你判断与质疑</div></div>
            ${dossier.ready ? statusTag('材料完整', 'good') : statusTag('材料不足', 'low')}</div>
          ${dossier.ready ? `
            <dl class="kv">
              <dt>成长阶段</dt><dd>${esc(dossier.stage)}</dd>
              <dt>数据范围</dt><dd>${fmtDate(dossier.dataRange?.from)} — ${fmtDate(dossier.dataRange?.to)} · ${dossier.signalCount} 条证据</dd>
              <dt>当前方案</dt><dd>${esc(dossier.planVersion)}</dd>
            </dl>
            <div class="divider"></div>
            <div class="grid grid-2" style="gap:14px">
              <div>
                <div class="card-sub" style="margin-bottom:6px">兴趣证据（前三）</div>
                <div class="row row-tight">${dossier.topDimensions.map((d) => `<span class="tag tag-good">${esc(d.name)} ${d.score}</span>`).join('')}</div>
                <div class="card-sub" style="margin:10px 0 6px">价值观</div>
                <div class="row row-tight">${(dossier.values || []).map((v) => `<span class="tag">${esc(v.name)}</span>`).join('') || '<span class="tiny muted">无记录</span>'}</div>
              </div>
              <div>
                <div class="card-sub" style="margin-bottom:6px">学生本人不认同的结论</div>
                ${dossier.studentDisputes.length ? dossier.studentDisputes.map((d) => `<div class="tiny" style="color:var(--danger)">· ${esc(d.target)}${d.note ? '（' + esc(d.note) + '）' : ''}</div>`).join('') : '<p class="tiny muted">无</p>'}
              </div>
            </div>
            <div class="divider"></div>
            <div class="card-sub" style="margin-bottom:6px">候选路径</div>
            <div class="stack" style="gap:8px">
              ${dossier.paths.map((p) => `<div class="small"><span class="tag ${p.match >= 75 ? 'tag-good' : ''}">${p.match}%</span>
                <strong>${esc(p.name)}</strong><div class="tiny muted">${esc(p.why)}${p.gaps?.length ? ' 短板：' + esc(p.gaps.join('、')) : ''}</div>
                <div class="tiny muted">路径：${esc((p.path || []).join(' → '))}</div></div>`).join('')}
            </div>
            <div class="divider"></div>
            <div class="card-sub" style="margin-bottom:6px">需要你重点判断的问题</div>
            <ul class="list-clean small">${dossier.questionsForAdvisor.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>
            ${dossier.missingInfo?.length ? `<div class="callout callout-warn small" style="margin-top:10px">材料不足：${esc(dossier.missingInfo.join('；'))}</div>` : ''}
          ` : `<div class="callout callout-warn">${esc(dossier.blockers.join('；'))}</div>`}
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">原始证据（最近 12 条）</div>
            <div class="card-sub">请优先核对原文，而不是只看 AI 的总结</div></div></div>
          <div class="evidence-list">
            ${signals.slice(0, 12).map((s) => `<div class="evidence">
              <span class="ref">${esc(sourceLabel(s.source))}</span>
              <div class="body">${esc(s.excerpt)}
                <div class="meta">${relTime(s.createdAt)}${s.studentFeedback?.status === 'disputed' ? ' · 学生有异议（权重已下调）' : ''}${s.studentFeedback?.status === 'confirmed' ? ' · 学生已确认' : ''}</div></div>
            </div>`).join('') || '<p class="small muted">暂无</p>'}
          </div>
        </div>

        ${parentObservations.length ? `<div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">家长观察</div>
            <div class="card-sub">家庭场景中的行为证据</div></div></div>
          <div class="stack" style="gap:8px">${parentObservations.map((o) => `<div class="small" style="border-left:2px solid var(--line);padding-left:10px">
            ${esc(o.excerpt)}<div class="tiny muted">${relTime(o.createdAt)}</div></div>`).join('')}</div>
        </div>` : ''}

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">你的专业意见</div>
            <div class="card-sub">提交后进入方案，并记录修改理由</div></div></div>
          <form id="review-form">
            <div class="field"><label for="rv-assess">总体评估（哪些结论成立、哪些不成立，为什么）</label>
              <textarea class="textarea" id="rv-assess" style="min-height:110px" placeholder="请指出证据是否充分、是否存在推断过度，以及你的判断依据。"></textarea></div>
            <div class="grid grid-2" style="gap:10px">
              <div class="field"><label for="c1-target">修订项 1：被修订的结论</label><input class="input" id="c1-target" placeholder="例如：3 个月内完成作品集"></div>
              <div class="field"><label for="c1-revised">改为</label><input class="input" id="c1-revised" placeholder="例如：5 个月内完成，每月 2 个小交付"></div>
            </div>
            <div class="field"><label for="c1-reason">修订理由</label><input class="input" id="c1-reason" placeholder="例如：高二课业压力大，节点过紧会制造新的挫败"></div>
            <div class="grid grid-2" style="gap:10px">
              <div class="field"><label for="c2-target">修订项 2（可选）</label><input class="input" id="c2-target"></div>
              <div class="field"><label for="c2-revised">改为</label><input class="input" id="c2-revised"></div>
            </div>
            <div class="field"><label for="c2-reason">修订理由</label><input class="input" id="c2-reason"></div>
            <div class="field"><label for="rv-risks">风险提示（每行一条）</label>
              <textarea class="textarea" id="rv-risks" style="min-height:64px"></textarea></div>
            <div class="field"><label for="rv-next">下一步建议（每行一条）</label>
              <textarea class="textarea" id="rv-next" style="min-height:64px"></textarea></div>
            <div class="callout small" style="margin-bottom:10px">提交后会在方案中生成"真人规划师意见"，并标记"已由真人规划师审核"。请确认你确实参与了本次审核。</div>
            <button class="btn btn-primary" type="submit" ${!session.advisorId || !dossier.ready ? 'disabled' : ''}>提交审核意见</button>
          </form>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">档案摘要</div></div></div>
          <dl class="kv">
            <dt>学生</dt><dd>${esc(student.name)}（${esc(student.grade || '')}）</dd>
            <dt>地区</dt><dd>${esc(student.region || '未填写')}</dd>
            <dt>学校类型</dt><dd>${esc(student.schoolType || '未填写')}</dd>
            <dt>服务版本</dt><dd>${student.plan === 'pro' ? '专业规划版' : '公益版'}</dd>
            <dt>监护人授权</dt><dd>${student.consents.guardian ? '已授权' : '未授权'} / 共享：${student.consents.pro_sharing ? '已授权' : '未授权'}</dd>
          </dl>
          <div class="divider"></div>
          <div class="card-sub" style="margin-bottom:6px">家长填写的家庭情况</div>
          <p class="tiny muted">${esc((data.plan?.sections?.summary?.scope || '').slice(0, 120))}</p>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">当前方案</div></div></div>
          ${plan ? `<div class="row row-tight" style="margin-bottom:6px">${planStatusTag(plan)}<span class="tag">v${plan.version}</span></div>
            <p class="tiny muted">${esc(plan.sections.vision.slice(0, 110))}…</p>
            <a class="btn btn-ghost btn-sm btn-block" style="margin-top:8px" href="#/report">查看完整报告</a>`
            : '<p class="small muted">尚未生成规划</p>'}
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">审核记录</div>
            <div class="card-sub">${reviews.length} 条</div></div></div>
          ${reviews.length ? reviews.map((r) => `<div style="border-left:2px solid var(--brand-line);padding-left:10px;margin-bottom:10px">
            <div class="small strong">${esc(r.advisorName)} <span class="tiny muted">${fmtDate(r.at, true)}</span></div>
            <p class="tiny muted" style="margin:4px 0">${esc(r.assessment.slice(0, 120))}…</p>
            <div class="tiny" style="color:var(--brand)">${r.corrections?.length || 0} 项修订 · ${r.risks?.length || 0} 条风险提示</div>
          </div>`).join('') : '<p class="small muted">还没有审核记录。</p>'}
        </div>

        <div class="card card-flat" style="background:#fdfcf9">
          <div class="card-title" style="margin-bottom:6px">隐私边界</div>
          <p class="tiny muted">你看到的信息来自家长明确授权。不得导出、转发或用于本服务之外的用途。学生可随时撤回授权，撤回后本页将不可访问。</p>
        </div>
      </div>
    </div>`,
    mount() {
      document.querySelector('[data-claim]')?.addEventListener('click', async () => {
        try {
          await api(`/api/advisor/sessions/${id}/claim`, { method: 'POST', body: {} });
          toast('已接单', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
      document.querySelector('[data-complete]')?.addEventListener('click', async () => {
        try {
          await api(`/api/advisor/sessions/${id}/complete`, { method: 'POST', body: {} });
          toast('服务单已完成', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
      const form = document.getElementById('review-form');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = (id) => document.getElementById(id)?.value.trim() || '';
        const corrections = [];
        if (val('c1-target')) corrections.push({ target: val('c1-target'), revised: val('c1-revised'), reason: val('c1-reason') });
        if (val('c2-target')) corrections.push({ target: val('c2-target'), revised: val('c2-revised'), reason: val('c2-reason') });
        const ok = await modal({
          title: '确认提交',
          body: `<p class="small">提交后将标记「已由真人规划师 ${esc(state.user.displayName || state.user.name)} 审核」，并写入方案与版本记录。请确认你确实完成了本次审核。</p>`,
          actions: [{ label: '再检查一下', value: null, kind: 'btn-ghost' }, { label: '确认提交', value: 'ok' }]
        });
        if (ok !== 'ok') return;
        try {
          await api(`/api/advisor/sessions/${id}/review`, {
            method: 'POST',
            body: {
              assessment: val('rv-assess'),
              corrections,
              risks: val('rv-risks').split('\n').map((x) => x.trim()).filter(Boolean),
              nextSteps: val('rv-next').split('\n').map((x) => x.trim()).filter(Boolean)
            }
          });
          toast('审核意见已提交', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  };
}
