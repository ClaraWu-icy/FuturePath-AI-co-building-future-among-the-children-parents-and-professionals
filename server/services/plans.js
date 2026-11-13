/**
 * 发展规划的读写与状态语义。
 *
 * 一条方案的生命周期：
 *   draft（初步方案） → discussing（讨论中） → pending_confirm（待确认） → confirmed（已确认）
 *   定稿后写 finalizedAt，界面上才叫「最终方案」。
 *   每次修改生成新版本，旧版本标 superseded，而不是覆盖。
 */
import { find, findOne, insert, update } from '../db.js';
import { uid, nowISO } from '../util.js';
import { generatePlan } from '../ai/engine.js';

export function latestPlan(studentId) {
  return find('plans', (p) => p.studentId === studentId).sort((a, b) => b.version - a.version)[0] || null;
}

export function planById(id) {
  return findOne('plans', (p) => p.id === id) || null;
}

/** 状态 → 人话。confirmed + finalizedAt 才是「最终方案」 */
export function planStage(plan) {
  if (!plan) return { key: 'none', label: '未生成', hint: '还没有方案' };
  if (plan.status === 'confirmed') {
    return plan.finalizedAt
      ? { key: 'final', label: '最终方案', hint: '学生与家长已确认' }
      : { key: 'confirmed', label: '已确认', hint: '双方已确认，可定稿' };
  }
  const map = {
    draft: { key: 'draft', label: '初步方案', hint: 'AI 依据画像生成的初稿，还没讨论' },
    discussing: { key: 'discussing', label: '讨论中', hint: '已经有人提了意见' },
    pending_confirm: { key: 'pending_confirm', label: '待确认', hint: '等学生与家长确认' },
    superseded: { key: 'superseded', label: '已被替代', hint: '有更新的版本' }
  };
  return map[plan.status] || { key: plan.status, label: plan.status, hint: '' };
}

export function createPlan(student, analysis, horizon = '5', { status = 'draft', source = 'manual' } = {}) {
  const generated = generatePlan(student, analysis, horizon);
  const prev = latestPlan(student.id);
  const version = prev ? prev.version + 1 : 1;
  if (prev) update('plans', prev.id, { status: 'superseded' });

  return insert('plans', {
    id: uid('pl_'),
    studentId: student.id,
    version,
    horizon: generated.horizon,
    sections: generated.sections,
    analysisId: analysis.id,
    analysisSignalCount: analysis.signalCount,
    status,
    source,
    confirmations: [],
    advisorName: null,
    professionalReviewed: false,
    participants: ['学生', '家长', 'AI 导师'],
    createdAt: nowISO()
  });
}

/* ------------------------------ 讨论 ------------------------------ */

export function listPlanComments(planId) {
  return find('planComments', (c) => c.planId === planId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function commentStats(planId) {
  const list = listPlanComments(planId);
  const byRole = { student: 0, parent: 0, advisor: 0, ai: 0 };
  for (const c of list) if (byRole[c.role] !== undefined) byRole[c.role] += 1;
  return { total: list.length, ...byRole };
}

export function addPlanComment({ plan, user, role, name, text, kind = 'comment', meta = {} }) {
  return insert('planComments', {
    id: uid('pc_'),
    planId: plan.id,
    studentId: plan.studentId,
    version: plan.version,
    role,
    byUserId: user?.id || null,
    byName: name || (role === 'ai' ? 'AI 导师' : ''),
    kind,
    text: String(text || '').slice(0, 2000),
    meta,
    createdAt: nowISO()
  });
}

/**
 * 定稿条件：
 *  - 学生本人同意 + 家长同意（缺一不可）
 *  - 如果这个档案已经派了真人规划师（专业版 + 有服务单），规划师必须先提交审核意见
 */
export function finalizeReadiness(plan, student) {
  const agreed = (role) => (plan.confirmations || []).some((c) => c.role === role && c.agreed);
  const hasStudent = agreed('student');
  const hasParent = agreed('parent');
  const sessions = find('advisorSessions', (s) => s.studentId === student.id);
  const advisorInvolved = sessions.length > 0;
  const advisorReady = !advisorInvolved || Boolean(plan.professionalReviewed);

  const missing = [];
  if (!hasStudent) missing.push('学生确认');
  if (!hasParent) missing.push('家长确认');
  if (!advisorReady) missing.push('真人规划师审核意见');

  return {
    ready: hasStudent && hasParent && advisorReady,
    hasStudent,
    hasParent,
    advisorInvolved,
    advisorReady,
    missing
  };
}

export function markFinal(plan, user) {
  return update('plans', plan.id, {
    status: 'confirmed',
    finalVersion: plan.version,
    finalizedAt: nowISO(),
    finalizedBy: { id: user.id, role: user.role, name: user.name }
  });
}
