/* 新人流程：两份量表 → 个人画像 → 初步方案 → 多方讨论 → 最终方案 */
import { state, api, esc, fmtDate, relTime, statusTag } from '../core.js';
import { pageHead, empty, modeBanner } from '../ui.js';

const STEP_ICON = { assess: '◈', portrait: '◎', draft: '⇢', discuss: '✉', final: '✓' };
const ROLE_HREF = {
  assess: () => '/assess',
  portrait: () => '/student/analysis',
  draft: () => '/student/plan',
  discuss: () => '/student/plan#discuss',
  final: () => '/student/plan#final'
};
const PARENT_HREF = { portrait: '/report', draft: '/parent/plan', discuss: '/parent/plan#discuss', final: '/parent/plan#final' };

function hrefFor(key, role) {
  if (role === 'parent') return PARENT_HREF[key] || '/parent';
  return ROLE_HREF[key] ? ROLE_HREF[key]() : '/student';
}

function stepDetail(step, j) {
  const { scales, analysis, plan } = j;
  if (step.key === 'assess') {
    if (step.done) {
      const code = scales.riasec.code ? `霍兰德 <span class="mono strong">${esc(scales.riasec.code)}</span>` : '霍兰德已完成';
      const mi = scales.mi.top?.length ? `多元智能：${scales.mi.top.map((t) => esc(t.name)).join(' · ')}` : '多元智能已完成';
      return `<div class="tiny muted">${code} · ${mi}</div>`;
    }
    const missing = (scales.missing || []).map((k) => (k === 'riasec' ? '霍兰德 36 题' : '多元智能 40 题')).join('、');
    return `<div class="tiny muted">还差：${esc(missing)}</div>`;
  }
  if (step.key === 'portrait') {
    if (step.done) return `<div class="tiny muted">${analysis.signalCount} 条证据 · ${analysis.stale ? '量表已更新，画像待重算' : '生成于 ' + relTime(analysis.createdAt)}</div>`;
    return '<div class="tiny muted">两份量表答完会自动生成，不用再点一次</div>';
  }
  if (step.key === 'draft') {
    if (step.done) return `<div class="tiny muted">v${plan.version} · ${esc(plan.stage)} · ${plan.horizon} 年${plan.stale ? ' · 画像已更新，可重新生成' : ''}</div>`;
    return '<div class="tiny muted">画像生成后自动出一版初稿</div>';
  }
  if (step.key === 'discuss') {
    if (step.done) {
      const c = plan.comments || {};
      return `<div class="tiny muted">学生 ${c.student || 0} 条 · 家长 ${c.parent || 0} 条${j.advisorInvolved ? ` · 规划师 ${c.advisor || 0} 条` : ''}</div>`;
    }
    if (plan) {
      const c = plan.comments || {};
      return `<div class="tiny muted">已有 学生 ${c.student || 0} / 家长 ${c.parent || 0} 条${j.advisorInvolved ? ` / 规划师 ${c.advisor || 0}` : ''}${j.advisorInvolved ? '（含规划师，需审核意见）' : ''}</div>`;
    }
    return '<div class="tiny muted">先有初步方案，才有可讨论的对象</div>';
  }
  if (step.key === 'final') {
    if (step.done) {
      const at = plan.finalizedAt || plan.confirmations?.[0]?.at;
      return `<div class="tiny muted">${plan.finalizedAt ? '定稿于' : '双方已确认于'} ${fmtDate(at, true)}</div>`;
    }
    if (plan?.readiness) {
      const missing = plan.readiness.missing || [];
      return `<div class="tiny muted">${missing.length ? '还缺：' + esc(missing.join('、')) : '条件已齐，可以定稿'}</div>`;
    }
    return '<div class="tiny muted">学生与家长都确认后定稿</div>';
  }
  return '';
}

function stateTag(step) {
  if (step.state === 'done') return statusTag('已完成', 'good');
  if (step.state === 'current') return statusTag('进行中', 'mid');
  return statusTag('待解锁', 'neutral');
}

export async function journey(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有档案', '请先创建学生档案。') };
  const role = state.user?.role || 'student';
  const [j, assess] = await Promise.all([
    api(`/api/students/${s.id}/journey`),
    api(`/api/assess?studentId=${s.id}`).catch(() => ({ instruments: [] }))
  ]);

  const stepRows = j.steps.map((step) => {
    const canAct = step.state !== 'locked';
    const action = canAct
      ? `<a class="btn ${step.state === 'current' ? 'btn-primary' : 'btn-ghost'} btn-sm" href="#${hrefFor(step.key, role)}">${esc(step.done ? '查看' : step.action)}</a>`
      : '<span class="tiny muted">先完成上一步</span>';
    return `<div class="flow-step ${step.state}">
      <div class="flow-num" aria-hidden="true">${step.done ? '✓' : STEP_ICON[step.key]}</div>
      <div class="grow">
        <div class="spread" style="align-items:baseline">
          <div><span class="strong">${step.n}. ${esc(step.title)}</span>
            <span class="tiny muted" style="margin-left:6px">${esc(step.sub)}</span></div>
          ${stateTag(step)}
        </div>
        <div style="margin-top:4px">${stepDetail(step, j)}</div>
      </div>
      <div class="no-print">${action}</div>
    </div>`;
  }).join('');

  const assessCards = (assess.instruments || []).map((i) => `
    <div class="spread" style="padding:7px 0;border-bottom:1px dashed var(--line)">
      <div><div class="small strong">${esc(i.short)}</div>
        <div class="tiny muted">${i.latest ? `${i.itemCount} 题 · ${i.latest.code ? '代码 ' + esc(i.latest.code) : '八项排序'} · ${relTime(i.latest.createdAt)}` : `还没作答 · ${i.itemCount} 题`}</div></div>
      ${i.latest ? `<a class="btn btn-ghost btn-sm" href="#/assess?scale=${i.key}&view=result">看结果</a>` : `<a class="btn btn-ghost btn-sm" href="#/assess?scale=${i.key}">去作答</a>`}
    </div>`).join('');

  return {
    html: `${pageHead('从量表开始', '注册后的路径是固定的五步：两份量表 → 个人画像 → AI 初步方案 → 多方讨论 → 最终方案。每一步的产出都能追溯到依据。')}
    ${modeBanner(state.ai)}
    <div class="grid grid-side" style="margin-top:14px">
      <div class="card">
        <div class="card-head">
          <div class="grow"><div class="card-title">当前进度</div>
            <div class="card-sub">${j.progress}% · 已完成 ${j.steps.filter((x) => x.done).length}/5 步</div></div>
          <div class="flow-pct">${j.progress}<span>%</span></div>
        </div>
        <div class="progress-line" style="margin-bottom:14px"><i style="width:${j.progress}%"></i></div>
        <div class="flow">${stepRows}</div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><div class="grow"><div class="card-title">两份量表</div>
            <div class="card-sub">所有后续结论都从这两份开始</div></div></div>
          ${assessCards || '<p class="small muted">量表暂不可用。</p>'}
          ${role === 'parent' ? '<p class="tiny muted" style="margin-top:10px">量表必须由学生本人作答：家长可以看结果，但不能代答。</p>' : ''}
        </div>

        <div class="card card-flat">
          <div class="card-title" style="margin-bottom:6px">这一步为什么这样排</div>
          <p class="tiny muted">先做量表，是因为两套自评能在 11 分钟里给出结构清楚的兴趣与学习方式，让画像有起点；
            先出初稿再讨论，是因为"对着空白页谈规划"很难谈出具体意见，而"对着一条可以改的行动"就容易得多。
            讨论不改结论的所有权：改不改、定不定稿，始终由学生和家长决定。</p>
        </div>

        ${role === 'student' ? `<div class="card card-flat" style="background:#fdfcf9">
          <div class="card-title" style="margin-bottom:6px">重新看开篇</div>
          <p class="tiny muted">七问启程动画仍在，它不再是必经步骤，但可以作为补充材料——回答会作为额外证据进入画像。</p>
          <a class="btn btn-ghost btn-sm" style="margin-top:8px" href="#/student?intro=1">重看启程</a>
        </div>` : ''}
      </div>
    </div>`,
    mount() {}
  };
}
