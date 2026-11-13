/**
 * 学生档案 / 权限 / 授权 / 审计 服务
 */
import { insert, update, find, findOne, remove, logEvent } from '../db.js';
import { uid, nowISO, forbidden, notFound, bad, ageBandOf } from '../util.js';

export const AGE_BANDS = {
  '12-15': { label: '初中阶段（12-15 岁）', grade: '初中' },
  '16-18': { label: '高中阶段（16-18 岁）', grade: '高中' },
  '19-22': { label: '高等教育 / 间隔年（19-22 岁）', grade: '大学' }
};

export function createStudent(user, payload) {
  const name = String(payload.name || '').trim();
  if (!name) throw bad('请填写学生称呼');
  const ageBand = AGE_BANDS[payload.ageBand] ? payload.ageBand : '16-18';
  const student = insert('students', {
    id: uid('st_'),
    name: name.slice(0, 20),
    nickname: String(payload.nickname || name).slice(0, 20),
    userId: payload.userId || null, // 学生本人账号
    guardianId: payload.guardianId || null,
    ageBand,
    age: Number(payload.age) || (ageBand === '12-15' ? 14 : ageBand === '19-22' ? 20 : 17),
    grade: String(payload.grade || AGE_BANDS[ageBand].grade).slice(0, 20),
    region: String(payload.region || '').slice(0, 40),
    schoolType: String(payload.schoolType || '').slice(0, 40),
    plan: 'free', // free | pro
    status: 'active',
    lowBandwidth: Boolean(payload.lowBandwidth),
    inviteCode: payload.inviteCode || null,
    selfIntro: String(payload.selfIntro || '').slice(0, 500),
    guardianConsent: false,
    consents: [],
    // 开篇故事引导的状态：pending 表示还没走过"启程"动画
    onboarding: { status: 'pending', acts: 0 },
    createdAt: nowISO()
  });
  logEvent('student.create', { studentId: student.id, by: user.id, role: user.role });
  return student;
}

export function getStudent(id) {
  return findOne('students', (s) => s.id === id);
}

export function canAccess(user, student, { write = false } = {}) {
  if (!user || !student) return false;
  if (user.role === 'student' && student.userId === user.id) return true;
  if (user.role === 'parent' && student.guardianId === user.id) return true;
  if (user.role === 'mentor') return true; // AI 导师端：只用于演示，展示聚合后的引擎状态
  if (user.role === 'advisor') {
    const assigned = findOne('advisorSessions', (s) => s.studentId === student.id && s.advisorId === user.id);
    if (assigned) return true;
    // 规划师工作台可看到「已购买专业版且待服务」的档案摘要，但看不到完整档案
    return !write && student.plan === 'pro';
  }
  return false;
}

export function assertAccess(user, studentId, opts) {
  const student = getStudent(studentId);
  if (!student) throw notFound('学生档案不存在');
  if (!canAccess(user, student, opts)) throw forbidden('你没有该学生档案的访问权限');
  return student;
}

export function accessibleStudents(user) {
  return find('students', (s) => canAccess(user, s)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function currentStudentFor(user) {
  const list = accessibleStudents(user);
  return list[0] || null;
}

export function recordConsent(studentId, user, { type, granted, scope }) {
  const student = getStudent(studentId);
  if (!student) throw notFound('学生档案不存在');
  const allowed = ['guardian', 'data_use', 'ai_analysis', 'pro_sharing', 'public_welfare'];
  if (!allowed.includes(type)) throw bad('未知的授权类型');
  if (user.role === 'student' && type === 'guardian' && !granted) throw forbidden('监护人授权只能由监护人撤回');
  const rec = {
    id: uid('cs_'),
    studentId,
    type,
    granted: Boolean(granted),
    scope: scope || '默认范围',
    byUserId: user.id,
    byRole: user.role,
    attestedBy: user.role === 'student' ? 'student（学生自述已获监护人同意，未经平台核验）' : 'guardian',
    at: nowISO(),
    version: 'v1'
  };
  insert('consents', rec);
  const patch = { [`consent_${type}`]: Boolean(granted) };
  if (type === 'guardian') patch.guardianConsent = Boolean(granted);
  update('students', studentId, patch);
  logEvent('consent.record', { studentId, type, granted: Boolean(granted), by: user.role });
  return rec;
}

export function consentState(studentId) {
  const list = find('consents', (c) => c.studentId === studentId).sort((a, b) => new Date(a.at) - new Date(b.at));
  const latest = {};
  for (const c of list) latest[c.type] = c;
  return {
    guardian: latest.guardian?.granted || false,
    data_use: latest.data_use?.granted || false,
    ai_analysis: latest.ai_analysis?.granted || false,
    pro_sharing: latest.pro_sharing?.granted || false,
    public_welfare: latest.public_welfare?.granted || false,
    history: list.slice(-20)
  };
}

export function audit(studentId, user, action, meta = {}) {
  insert('auditLog', {
    id: uid('aud_'),
    studentId,
    actorId: user?.id || 'system',
    actorRole: user?.role || 'system',
    action,
    meta,
    at: nowISO()
  });
}

export function progressOf(studentId) {
  const signals = find('signals', (s) => s.studentId === studentId);
  const by = (src) => signals.filter((s) => s.source === src).length;
  const dims = new Set(signals.filter((s) => ['R', 'I', 'A', 'S', 'E', 'C'].includes(s.dimension)).map((s) => s.dimension));
  const analyses = find('analyses', (a) => a.studentId === studentId);
  const plans = find('plans', (p) => p.studentId === studentId);
  const assessments = find('assessments', (a) => a.studentId === studentId);
  const steps = [
    { key: 'profile', label: '建立档案', done: true },
    { key: 'dialogue', label: 'AI 对话探索', done: by('dialogue') >= 3 },
    { key: 'assessment', label: '完成标准化测评', done: assessments.length > 0 },
    { key: 'scenario', label: '完成情景任务', done: by('scenario') >= 1 },
    { key: 'career', label: '职业体验', done: by('career') >= 1 },
    { key: 'analysis', label: '生成成长画像', done: analyses.length > 0 },
    { key: 'parent', label: '家长参与', done: by('parent') >= 1 },
    { key: 'plan', label: '形成发展规划', done: plans.length > 0 }
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    percent: Math.round((doneCount / steps.length) * 100),
    dimensionCoverage: dims.size,
    signals: signals.length,
    bySource: Object.fromEntries(['dialogue', 'scenario', 'card', 'career', 'growth', 'self', 'parent', 'advisor', 'assessment'].map((k) => [k, by(k)])),
    analyses: analyses.length,
    plans: plans.length,
    assessments: assessments.length
  };
}

export function exportStudentData(studentId) {
  const pick = (name) => find(name, (r) => r.studentId === studentId);
  const student = getStudent(studentId);
  return {
    exportedAt: nowISO(),
    schema: 'futurepath-export-v1',
    student,
    consents: pick('consents'),
    signals: pick('signals'),
    assessments: pick('assessments'),
    conversations: pick('conversations'),
    exploreSessions: pick('exploreSessions'),
    analyses: pick('analyses'),
    parentFeedback: pick('parentFeedback'),
    plans: pick('plans'),
    planRevisions: pick('planRevisions'),
    professionalReviews: pick('professionalReviews'),
    advisorSessions: pick('advisorSessions'),
    auditLog: pick('auditLog'),
    note: '本文件包含未成年人数据，请妥善保管。删除档案后本导出文件不会被自动删除。'
  };
}

export function deleteStudent(studentId, user) {
  const student = getStudent(studentId);
  if (!student) throw notFound('学生档案不存在');
  if (user.role === 'advisor' || user.role === 'mentor') throw forbidden('规划师 / AI 导师不能删除学生档案');
  const tables = ['signals', 'assessments', 'conversations', 'exploreSessions', 'analyses', 'parentFeedback', 'plans', 'planRevisions', 'professionalReviews', 'advisorSessions', 'consents', 'auditLog'];
  const counts = {};
  for (const t of tables) {
    const rows = find(t, (r) => r.studentId === studentId);
    counts[t] = rows.length;
    for (const r of rows) remove(t, r.id);
  }
  remove('students', studentId);
  logEvent('student.delete', { studentId, by: user.id, role: user.role, counts });
  return { deleted: true, studentId, counts };
}

export function ageBandLabel(band) {
  return AGE_BANDS[band]?.label || band;
}

export function ensureAgeBand(age) {
  return ageBandOf(age);
}
