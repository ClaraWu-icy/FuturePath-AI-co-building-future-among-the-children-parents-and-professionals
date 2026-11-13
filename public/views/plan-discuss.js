/* 方案讨论区与定稿区：学生端与家长端共用同一套片段 */
import { api, esc, relTime, toast, setBusy, refresh, statusTag } from '../core.js';

const ROLE_LABEL = { student: '学生', parent: '家长', advisor: '规划师', ai: 'AI 导师' };

function bubble(c) {
  const cls = c.role === 'ai' ? 'ai' : c.role;
  const who = c.role === 'ai' ? 'AI 导师' : `${ROLE_LABEL[c.role] || c.role}${c.byName && c.role !== 'ai' ? ' · ' + c.byName : ''}`;
  return `<div class="pc-row ${cls}">
    <div class="pc-meta"><span class="pc-who">${esc(who)}</span><span class="tiny muted">${relTime(c.createdAt)}</span></div>
    <div class="pc-bubble">${esc(c.text).replace(/\n/g, '<br>')}</div>
  </div>`;
}

export function discussHtml(plan, thread) {
  const stats = thread.stats || { total: 0, student: 0, parent: 0, advisor: 0, ai: 0 };
  const cold = !thread.comments.length;
  return `<div class="card no-print" id="discuss" style="margin-top:16px">
    <div class="card-head">
      <div class="grow"><div class="card-title">讨论与修改</div>
        <div class="card-sub">${plan.status === 'superseded'
    ? '这份方案已被新版本替代，只在最新版本上讨论'
    : '提意见不会自动改方案：AI 会把意见整理成具体修改建议，改动要写进新版本再重新确认'}</div></div>
      <div class="row row-tight">
        ${statusTag(`学生 ${stats.student || 0}`, 'neutral')}
        ${statusTag(`家长 ${stats.parent || 0}`, 'neutral')}
        ${stats.advisor ? statusTag(`规划师 ${stats.advisor}`, 'info') : ''}
      </div>
    </div>
    <div class="pc-thread" id="pc-thread">
      ${cold ? '<p class="small muted" style="margin:4px 0 12px">还没有人提意见。可以从"哪条行动做不到"开始——讨论具体行动，比讨论"适不适合"更有用。</p>'
    : thread.comments.map(bubble).join('')}
    </div>
    ${thread.canComment === false ? '<p class="tiny muted">当前版本不可讨论。</p>' : `<form class="composer" id="pc-form">
      <label class="sr-only" for="pc-text">你的意见</label>
      <textarea class="textarea" id="pc-text" placeholder="具体一点：哪个阶段、哪条行动让你不放心？希望改成什么样？"></textarea>
      <button class="btn btn-primary" type="submit">提出意见</button>
    </form>
    <div class="tiny muted" style="margin-top:6px">AI 只整理意见、给修改建议，不会自己改方案。修改请用上方「编辑方案」，会生成新版本。</div>`}
  </div>`;
}

export function mountDiscuss(plan) {
  const form = document.getElementById('pc-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = document.getElementById('pc-text');
    const text = (box?.value || '').trim();
    if (text.length < 4) { toast('说具体一点：哪个阶段、哪条行动、希望改成什么', 'error'); return; }
    const btn = form.querySelector('button[type=submit]');
    setBusy(btn, true, '发送中…');
    try {
      await api(`/api/plans/${plan.id}/comments`, { method: 'POST', body: { text } });
      toast('已记录，AI 导师也给了一条回应', 'ok');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

function checkRow(label, ok, note = '') {
  return `<div class="row" style="gap:8px;align-items:flex-start">
    <span class="pc-check ${ok ? 'ok' : ''}" aria-hidden="true">${ok ? '✓' : '○'}</span>
    <div><div class="small ${ok ? 'strong' : ''}">${esc(label)}</div>${note ? `<div class="tiny muted">${esc(note)}</div>` : ''}</div>
  </div>`;
}

export function finalizeHtml(plan, readiness) {
  const final = Boolean(plan.finalizedAt);
  const advisorLine = readiness.advisorInvolved
    ? checkRow('真人规划师审核意见', readiness.advisorReady, readiness.advisorReady ? '已提交，意见已并入方案' : '已派单，等待规划师提交审核意见')
    : checkRow('真人规划师（可选）', true, '本档案未派单，这一步不适用');
  return `<div class="card no-print" id="final" style="margin-top:16px">
    <div class="card-head">
      <div class="grow"><div class="card-title">形成最终方案</div>
        <div class="card-sub">${final ? '已定稿：之后若修改，会生成新版本并重新确认' : '三个条件齐了才能定稿，缺一不可'}</div></div>
      ${final ? statusTag('最终方案', 'good') : statusTag('未定稿', 'mid')}
    </div>
    <div class="stack" style="gap:9px">
      ${checkRow('学生本人确认', readiness.hasStudent, readiness.hasStudent ? '已确认' : '还没有确认')}
      ${checkRow('家长确认', readiness.hasParent, readiness.hasParent ? '已确认' : '还没有确认')}
      ${advisorLine}
    </div>
    <div class="row row-tight" style="margin-top:12px">
      ${final
    ? `<span class="small">定稿于 ${new Date(plan.finalizedAt).toLocaleString('zh-CN')} · 定稿版本 v${plan.finalVersion || plan.version}</span>`
    : `<button class="btn btn-primary" data-finalize ${readiness.ready ? '' : 'disabled'}>形成最终方案</button>
         <span class="tiny muted">${readiness.ready ? '定稿后仍可修改，但会生成新版本' : '还缺：' + esc((readiness.missing || []).join('、'))}</span>`}
    </div>
  </div>`;
}

export function mountFinalize(plan, readiness) {
  const btn = document.querySelector('[data-finalize]');
  if (!btn || !readiness.ready) return;
  btn.addEventListener('click', async () => {
    setBusy(btn, true, '定稿中…');
    try {
      await api(`/api/plans/${plan.id}/finalize`, { method: 'POST', body: {} });
      toast('已形成最终方案', 'ok');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}
