/* AI 导师端：引擎状态、待验证假设、跟进队列 */
import { state, api, esc, toast, modal, refresh, fmtDate, relTime, statusTag } from '../core.js';
import { pageHead, empty, modeBanner, confidenceTag } from '../ui.js';

export async function view(ctx) {
  const data = await api('/api/mentor/overview');
  const t = data.totals;
  const role = state.user.role;

  return {
    html: `${pageHead('AI 导师工作台', '这里不是"AI 聊天记录"，而是引擎当前的判断、依据，以及它自己认为不可靠的地方。')}
    ${modeBanner(data.ai)}

    <div class="grid grid-3" style="margin-top:14px">
      <div class="card"><div class="stat"><span class="n">${t.students}</span><span class="l">在跟踪的学生档案</span></div>
        <p class="tiny muted" style="margin-top:6px">仅包含你有权访问的档案</p></div>
      <div class="card"><div class="stat"><span class="n">${t.pendingHypotheses}</span><span class="l">待验证假设</span></div>
        <p class="tiny muted" style="margin-top:6px">AI 主动标记为"尚不确定"的结论</p></div>
      <div class="card"><div class="stat"><span class="n">${t.staleAnalyses}</span><span class="l">需要重新分析</span></div>
        <p class="tiny muted" style="margin-top:6px">有新证据晚于最近一次分析</p></div>
    </div>

    <div class="grid grid-side" style="margin-top:16px">
      <div class="stack">
        ${data.board.map((b) => `<div class="card">
          <div class="card-head">
            <div class="grow">
              <div class="card-title">${esc(b.student.name)} <span class="tiny muted">${esc(b.student.grade || '')} · ${esc(b.student.ageBand)}</span></div>
              <div class="card-sub">${b.progress.signals} 条证据 · 覆盖 ${b.progress.dimensionCoverage}/6 维度 · ${b.analysis ? `分析于 ${relTime(b.analysis.createdAt)}` : '尚未分析'}</div>
            </div>
            ${b.analysis ? confidenceTag(b.analysis.confidence) : statusTag('未分析', 'low')}
            ${b.student.plan === 'pro' ? statusTag('专业版', 'info') : ''}
          </div>
          <div class="callout callout-info small" style="margin-bottom:10px"><strong>下一步：</strong>${esc(b.nextAction)}</div>
          ${b.analysis?.hypotheses?.length ? `<div class="card-sub" style="margin-bottom:6px">待验证假设（${b.analysis.hypotheses.length}）</div>
            <ul class="list-clean small">${b.analysis.hypotheses.slice(0, 3).map((h) => `<li>${esc(h.text)} <span class="tiny muted">· ${esc(h.verifyBy.slice(0, 40))}…</span></li>`).join('')}</ul>` : ''}
          ${b.analysis?.disputes?.length ? `<div class="callout callout-warn small" style="margin-top:8px">
            学生对 ${b.analysis.disputes.length} 条结论提出了异议：${esc(b.analysis.disputes.map((d) => d.target).join('、'))}。这些结论的权重已下调。</div>` : ''}
          <div class="row row-tight" style="margin-top:10px">
            ${role === 'student' ? `<a class="btn btn-ghost btn-sm" href="#/student/analysis">打开画像</a><a class="btn btn-ghost btn-sm" href="#/student/explore">继续探索</a>` : `<a class="btn btn-ghost btn-sm" href="#/report">查看报告</a><a class="btn btn-ghost btn-sm" href="#/parent/discuss">去讨论</a>`}
          </div>
        </div>`).join('') || empty('暂无档案', '当前账号下没有可访问的学生档案。')}
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">引擎说明</div>
            <div class="card-sub">${esc(data.ai.model)}</div></div></div>
          <dl class="kv">
            <dt>运行模式</dt><dd>${data.ai.mode === 'llm' ? '真实模型（文本叙述）' : '规则引擎（模拟模式）'}</dd>
            <dt>打分方式</dt><dd>证据加权 + 去均值相似度</dd>
            <dt>数据来源</dt><dd>对话 / 任务 / 卡片 / 家长 / 规划师</dd>
            <dt>结论溯源</dt><dd>每条结论附证据编号 E1…En</dd>
          </dl>
          <div class="divider"></div>
          <p class="tiny muted">${esc(data.ai.note)}</p>
        </div>

        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">AI 的能力边界</div></div></div>
          <div class="stack" style="gap:10px">
            <div><div class="small strong" style="color:var(--brand)">它会做</div>
              <ul class="list-clean tiny muted"><li>根据回答挑下一个问题</li><li>把行为记录折算成可解释的分数</li><li>主动指出证据不足与互相冲突</li><li>生成可编辑、可验证的规划</li></ul></div>
            <div><div class="small strong" style="color:var(--accent)">它不会做</div>
              <ul class="list-clean tiny muted"><li>根据一次选择判定职业</li><li>用性别、地区、家庭条件限制可能性</li><li>编造具体薪资、录取线等时效数据</li><li>声称自己是真人规划师</li></ul></div>
          </div>
        </div>

        <div class="card card-flat" style="background:#fdfcf9">
          <div class="card-title" style="margin-bottom:6px">跟进队列</div>
          ${data.followUpQueue.length ? `<div class="stack" style="gap:8px">${data.followUpQueue.map((b) => `<div class="small">
            <span class="strong">${esc(b.student.name)}</span> · ${esc(b.nextAction.slice(0, 26))}</div>`).join('')}</div>`
            : '<p class="tiny muted">暂无需要立即跟进的档案。</p>'}
        </div>
      </div>
    </div>`,
    mount() {}
  };
}
