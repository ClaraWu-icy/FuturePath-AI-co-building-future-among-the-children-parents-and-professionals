/**
 * 证据 / 信号服务
 * 统一把「学生作答、情景任务选择、卡片反馈、职业体验、家长观察、学生自述、规划师意见」
 * 写入同一张 signals 表 —— 这是全系统唯一的事实来源（single source of truth）。
 */
import { insert, find, findOne, update, logEvent } from '../db.js';
import { RIASEC } from '../ai/content.js';
import { signalsFromText } from '../ai/engine.js';
import { uid, nowISO, bad, notFound } from '../util.js';

export const SOURCE_LABEL = {
  dialogue: 'AI 对话',
  scenario: '情景任务',
  card: '兴趣卡片',
  career: '职业体验',
  growth: '成长经历',
  self: '学生自述',
  parent: '家长观察',
  advisor: '规划师意见',
  value: '价值观选择',
  assessment: '标准化量表'
};

const VALID_SOURCES = Object.keys(SOURCE_LABEL);
const VALID_DIMS = new Set([...RIASEC, 'V', 'CAREER', 'MI']);

export function createSignal(studentId, payload) {
  const source = payload.source;
  if (!VALID_SOURCES.includes(source)) throw bad(`无效的证据来源：${source}`);
  const dimension = payload.dimension;
  if (!VALID_DIMS.has(dimension)) throw bad(`无效的维度：${dimension}`);

  const signal = insert('signals', {
    id: uid('sg_'),
    studentId,
    source,
    sourceLabel: SOURCE_LABEL[source],
    dimension,
    strength: clamp01(payload.strength ?? 0.6),
    weight: clamp(payload.weight ?? 1, 0.2, 2),
    excerpt: String(payload.excerpt || '').slice(0, 600),
    itemId: payload.itemId || null,
    ability: payload.ability || {},
    selfEval: payload.selfEval ?? null,
    studentFeedback: { status: 'unreviewed', note: '', at: null },
    meta: payload.meta || {},
    createdAt: payload.createdAt || nowISO()
  });
  return signal;
}

/** 自由文本 → 1~N 条信号（主维度 + 次维度 + 职业提及） */
export function addTextSignals(studentId, text, base) {
  if (!text || String(text).trim().length < 2) throw bad('内容太短，至少写 2 个字');
  const drafts = signalsFromText(text, base);
  return drafts.map((d) => createSignal(studentId, d));
}

export function listSignals(studentId, { source, dimension } = {}) {
  return find('signals', (s) => s.studentId === studentId)
    .filter((s) => (source ? s.source === source : true))
    .filter((s) => (dimension ? s.dimension === dimension : true))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function setSignalFeedback(signalId, user, { status, note }) {
  const signal = findOne('signals', (s) => s.id === signalId);
  if (!signal) throw notFound('证据记录不存在');
  if (!['confirmed', 'disputed', 'unreviewed'].includes(status)) throw bad('状态只能是 confirmed / disputed / unreviewed');
  const next = update('signals', signalId, {
    studentFeedback: { status, note: String(note || '').slice(0, 300), at: nowISO(), by: user.id }
  });
  logEvent('signal.feedback', { signalId, status, by: user.role });
  return next;
}

/** 学生确认/异议会改变该条证据的权重：异议权重下调，避免"被代表" */
export function effectiveWeight(signal) {
  const st = signal.studentFeedback?.status;
  if (st === 'disputed') return signal.weight * 0.35;
  if (st === 'confirmed') return signal.weight * 1.1;
  return signal.weight;
}

export function scoringSignals(studentId) {
  return listSignals(studentId).map((s) => ({ ...s, weight: effectiveWeight(s) }));
}

export function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
}

export function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}
