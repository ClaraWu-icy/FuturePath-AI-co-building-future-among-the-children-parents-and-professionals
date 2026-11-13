/**
 * 新人旅程：注册 → 两份量表 → 画像 → 初步方案 → 多方讨论 → 最终方案。
 *
 * 这里只做「状态计算」，不写数据：每一步是否完成都能由已有记录推出来，
 * 不需要单独维护一份流程表——省掉了状态与事实不一致的可能。
 */
import { find, findOne } from '../db.js';
import { assessmentRows } from './assessments.js';
import { latestPlan, planStage, commentStats, finalizeReadiness } from './plans.js';

export const JOURNEY_STEPS = [
  {
    key: 'assess',
    n: 1,
    title: '做两份量表',
    sub: '霍兰德 36 题 + 多元智能 40 题，约 11 分钟',
    action: '开始测评',
    href: '/assess'
  },
  {
    key: 'portrait',
    n: 2,
    title: '生成个人画像',
    sub: '从量表读出兴趣结构、潜力方向与学习方式',
    action: '查看画像',
    href: '/student/analysis'
  },
  {
    key: 'draft',
    n: 3,
    title: 'AI 初步方案',
    sub: '方向候选 + 分阶段路线，可改可推翻',
    action: '打开初步方案',
    href: '/student/plan'
  },
  {
    key: 'discuss',
    n: 4,
    title: '多方讨论',
    sub: '学生、家长、真人规划师（如有）各提意见',
    action: '进入讨论',
    href: '/student/plan#discuss'
  },
  {
    key: 'final',
    n: 5,
    title: '形成最终方案',
    sub: '学生与家长确认后定稿，版本留痕',
    action: '去定稿',
    href: '/student/plan#final'
  }
];

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

/** 量表 result.scores 已按名次排序，取前三项（含中文名与分数） */
function topScores(row) {
  return (row.result?.scores || []).slice(0, 3).map((s) => ({ key: s.key, name: s.name, percent: s.percent }));
}

export function journeyState(student) {
  const cur = findOne('students', (s) => s.id === student.id) || student;

  const riasec = assessmentRows(cur.id, 'riasec')[0] || null;
  const mi = assessmentRows(cur.id, 'mi')[0] || null;
  const scalesDone = Boolean(riasec && mi);
  const scales = [riasec, mi].filter(Boolean);
  const newestScaleAt = scales.reduce((max, r) => Math.max(max, new Date(r.createdAt).getTime()), 0);

  const analysis = find('analyses', (a) => a.studentId === cur.id).sort(byNewest)[0] || null;
  const portraitReady = Boolean(analysis) && (newestScaleAt === 0 || new Date(analysis.createdAt).getTime() >= newestScaleAt);

  const plan = latestPlan(cur.id);
  const stats = plan ? commentStats(plan.id) : { total: 0, student: 0, parent: 0, advisor: 0, ai: 0 };
  const agreed = new Set((plan?.confirmations || []).filter((c) => c.agreed).map((c) => c.role));
  const sessions = find('advisorSessions', (s) => s.studentId === cur.id);
  const advisorInvolved = sessions.length > 0;

  const studentJoined = stats.student > 0 || agreed.has('student');
  const parentJoined = stats.parent > 0 || agreed.has('parent');
  const advisorJoined = stats.advisor > 0 || Boolean(plan?.professionalReviewed);
  const discussed = Boolean(plan) && studentJoined && parentJoined && (!advisorInvolved || advisorJoined);
  const isFinal = Boolean(plan?.finalizedAt);

  const done = {
    assess: scalesDone,
    portrait: portraitReady,
    draft: Boolean(plan),
    discuss: discussed,
    final: isFinal
  };

  let currentFound = false;
  const steps = JOURNEY_STEPS.map((step) => {
    const finished = done[step.key];
    const state = finished ? 'done' : currentFound ? 'locked' : 'current';
    if (!finished && !currentFound) currentFound = true;
    return { ...step, state, done: finished };
  });
  if (!currentFound) currentFound = true;

  const next = steps.find((s) => s.state === 'current') || steps[steps.length - 1];
  const stage = planStage(plan);
  const readiness = plan ? finalizeReadiness(plan, cur) : null;

  return {
    studentId: cur.id,
    steps,
    progress: Math.round((steps.filter((s) => s.done).length / steps.length) * 100),
    next: next ? { key: next.key, title: next.title, action: next.action, href: next.href } : null,
    scales: {
      riasec: riasec
        ? { done: true, at: riasec.createdAt, code: riasec.result?.code || null, top: topScores(riasec) }
        : { done: false },
      mi: mi ? { done: true, at: mi.createdAt, top: topScores(mi) } : { done: false },
      missing: [!riasec && 'riasec', !mi && 'mi'].filter(Boolean)
    },
    analysis: analysis ? { id: analysis.id, createdAt: analysis.createdAt, signalCount: analysis.signalCount, confidence: analysis.confidence, stale: !portraitReady } : null,
    plan: plan ? {
      id: plan.id,
      version: plan.version,
      horizon: plan.horizon,
      status: plan.status,
      source: plan.source || null,
      stage: stage.label,
      stageHint: stage.hint,
      stale: Boolean(analysis) && new Date(analysis.createdAt) > new Date(plan.createdAt),
      comments: stats,
      confirmations: plan.confirmations || [],
      finalizedAt: plan.finalizedAt || null,
      readiness
    } : null,
    advisorInvolved
  };
}
