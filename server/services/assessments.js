/**
 * 量表作答的落库逻辑：计分 → 替换旧证据 → 存档案。
 *
 * 路由（真实作答）与演示数据种子（seed.js）共用这一份实现，
 * 避免出现"手工造的数据和用户答出来的数据不是同一套算法"。
 */
import { insert, update, find, findOne, remove } from '../db.js';
import { clamp } from '../util.js';
import { SCALE_VERSION, getInstrument, scoreInstrument } from '../ai/scales.js';
import { buildProfile, careerMatches } from '../ai/engine.js';
import { createSignal, scoringSignals } from './signals.js';

export function assessmentRows(studentId, scale) {
  return find('assessments', (a) => a.studentId === studentId && (!scale || a.scale === scale))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function assessmentSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    scale: row.scale,
    scaleName: row.scaleName,
    createdAt: row.createdAt,
    code: row.result?.code || null,
    summary: row.result?.summary || '',
    answered: row.answered,
    itemCount: row.itemCount,
    top: (row.result?.scores || []).slice(0, 3).map((s) => ({ key: s.key, name: s.name, percent: s.percent }))
  };
}

export function signalFromAssessment(studentId, { scale, assessmentId, ...payload }) {
  return createSignal(studentId, {
    ...payload,
    source: 'assessment',
    meta: {
      assessmentScale: scale,
      assessmentId,
      scaleVersion: SCALE_VERSION,
      ...(payload.meta || {})
    }
  });
}

/** 最低完成题量（低于此不判分，避免三四道题就给三字代码） */
export function minAnsweredFor(ins) {
  return Math.ceil(ins.items.length * 0.6);
}

/**
 * 写入一份量表作答。
 * @returns {{ row, result, signals, careers, attempts }}
 */
export function applyAssessment(student, { scale, answers, takenBy = null, role = 'student', createdAt } = {}) {
  const ins = getInstrument(scale);
  if (!ins) throw new Error('量表不存在');
  const result = scoreInstrument(ins.key, answers);

  // 重测替换上一次的量表证据，避免同一份量表被重复计入
  for (const old of find('signals', (s) => s.studentId === student.id && s.meta?.assessmentScale === ins.key)) {
    remove('signals', old.id);
  }

  const row = insert('assessments', {
    studentId: student.id,
    scale: ins.key,
    scaleName: ins.name,
    scaleVersion: SCALE_VERSION,
    itemCount: ins.items.length,
    answered: result.answered,
    completeness: result.completeness,
    answers,
    result,
    takenBy,
    role,
    ...(createdAt ? { createdAt } : {})
  });

  const signals = [];
  for (const score of result.scores) {
    if (!score.answered) continue;
    const strength = Math.round(clamp(score.percent / 100, 0.05, 1) * 1000) / 1000;
    if (ins.key === 'riasec') {
      signals.push(signalFromAssessment(student.id, {
        dimension: score.key,
        strength,
        weight: 1.5,
        excerpt: `霍兰德量表 · ${score.name} ${score.percent} 分（${score.raw}/${score.max}，${score.answered} 题）`,
        itemId: `riasec_${score.key}`,
        assessmentId: row.id,
        scale: ins.key,
        meta: { score: score.percent, raw: score.raw, code: result.code, rank: score.rank, items: score.count },
        ...(createdAt ? { createdAt } : {})
      }));
    } else {
      signals.push(signalFromAssessment(student.id, {
        dimension: 'MI',
        strength,
        weight: 1.2,
        excerpt: `多元智能自评 · ${score.name} ${score.percent} 分（${score.raw}/${score.max}）`,
        itemId: `mi_${score.key}`,
        assessmentId: row.id,
        scale: ins.key,
        meta: { miKey: score.key, score: score.percent, rank: score.rank, items: score.count },
        ...(createdAt ? { createdAt } : {})
      }));
    }
  }

  // 职业方向用全部记录算，但结果页会标明是结合现有证据
  const profile = buildProfile(scoringSignals(student.id));
  const careers = ins.key === 'riasec'
    ? careerMatches(profile, 4).map((c) => ({
      careerId: c.careerId, name: c.name, match: c.match, why: c.why,
      firstStep: c.firstStep, path: c.path.slice(0, 2), tags: c.tags
    }))
    : [];

  const stored = update('assessments', row.id, {
    result: { ...result, careers, signals: signals.length }
  });

  // 以库里的最新记录为准，避免调用方手里的 student 是旧快照
  const current = findOne('students', (s) => s.id === student.id) || student;
  update('students', student.id, {
    assessments: {
      ...(current.assessments || {}),
      [ins.key]: { id: row.id, at: stored.createdAt, code: result.code || null, top: result.top }
    }
  });

  return { row: stored, result: stored.result, signals, careers, attempts: assessmentRows(student.id, ins.key).length };
}
