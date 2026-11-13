/* 复用型 UI 片段 */
import { esc, statusTag } from './core.js';

export function card({ title = '', sub = '', body = '', actions = '', className = '', head = '' }) {
  return `<section class="card ${className}">
    ${title || head ? `<div class="card-head">
      <div class="grow">${title ? `<div class="card-title">${esc(title)}</div>` : ''}${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}</div>
      ${actions ? `<div class="row row-tight no-print">${actions}</div>` : ''}
    </div>` : ''}
    ${head}
    ${body}
  </section>`;
}

export function pageHead(title, sub = '', actions = '') {
  return `<div class="spread" style="margin-bottom:18px;align-items:flex-start">
    <div><h1 class="ph-title">${esc(title)}</h1>${sub ? `<p class="muted small" style="margin-top:4px;max-width:70ch">${esc(sub)}</p>` : ''}</div>
    ${actions ? `<div class="row row-tight no-print">${actions}</div>` : ''}
  </div>`;
}

export function empty(title, text, action = '') {
  return `<div class="empty"><div class="empty-mark" aria-hidden="true">◇</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export function modeBanner(ai) {
  if (!ai) return '';
  const live = ai.mode === 'llm';
  return `<div class="mode-banner ${live ? 'live' : ''}">
    <span class="dot" aria-hidden="true"></span>
    <div><strong>${live ? '真实模型模式' : '模拟模式（可演示）'}</strong> · ${esc(ai.note)}</div>
  </div>`;
}

export function confidenceTag(level) {
  const map = { high: ['证据较充分', 'good'], medium: ['证据中等', 'mid'], low: ['证据不足', 'low'] };
  const [label, kind] = map[level] || ['未知', 'neutral'];
  return statusTag(label, kind);
}

export function sourceLabel(source) {
  return {
    dialogue: 'AI 对话', scenario: '情景任务', card: '兴趣卡片', career: '职业体验',
    growth: '成长经历', self: '学生自述', parent: '家长观察', advisor: '规划师意见', value: '价值观选择',
    assessment: '标准化量表'
  }[source] || source;
}

export function evidenceChips(refs = []) {
  if (!refs.length) return '';
  return `<span class="row row-tight" style="display:inline-flex;gap:4px">${refs
    .map((r) => `<button class="chip chip-ref" data-ev="${esc(r)}" aria-label="查看证据 ${esc(r)}">${esc(r)}</button>`)
    .join('')}</span>`;
}

export function stepsBlock(steps) {
  return `<div class="steps">${steps.map((s) => `
    <div class="step ${s.done ? 'done' : ''}"><span class="dot" aria-hidden="true">${s.done ? '✓' : ''}</span>
    <span>${esc(s.label)}${s.done ? '' : ' <span class="tiny muted">· 待完成</span>'}</span></div>`).join('')}</div>`;
}

export function planStatusTag(plan) {
  if (!plan) return statusTag('尚无规划', 'neutral');
  const [label, kind] = plan.finalizedAt
    ? ['最终方案', 'good']
    : plan.status === 'confirmed' ? ['已确认', 'good']
      : plan.status === 'pending_confirm' ? ['待确认', 'mid']
        : plan.status === 'discussing' ? ['讨论中', 'mid']
          : plan.status === 'draft' ? ['初步方案', 'neutral']
            : plan.status === 'superseded' ? ['已被替代', 'neutral']
              : ['未知', 'neutral'];
  return statusTag(label, kind) + (plan.professionalReviewed ? ' ' + statusTag('已由真人规划师审核', 'good') : '');
}

export function skeleton(lines = 3) {
  return `<div class="stack">${Array.from({ length: lines }).map(() => `<div style="height:12px;border-radius:6px;background:#f0ece4"></div>`).join('')}</div>`;
}

export function disclaimerBox(text) {
  return `<div class="callout callout-warn small">${esc(text)}</div>`;
}
