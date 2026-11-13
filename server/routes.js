/**
 * HTTP 路由层。所有业务规则都在这里收口，前端只调用 API。
 */
import crypto from 'node:crypto';
import { insert, update, find, findOne, remove, table, logEvent, dbFilePath } from './db.js';
import { config, aiStatus } from './config.js';
import {
  uid, nowISO, bad, forbidden, notFound, unauthorized, requireFields, signToken, verifyToken,
  hashPassword, verifyPassword, clamp, round
} from './util.js';
import { RIASEC, DIMENSIONS, ABILITIES, VALUES, CAREERS, QUESTIONS, SCENARIOS, CARDS, INTRO_STORY, INTRO_CLUE_LABEL } from './ai/content.js';
import {
  analyze, nextQuestion, planToMarkdown, discussReply, buildProfile, careerMatches, planDiscussReply
} from './ai/engine.js';
import { LIKERT, SCALE_VERSION, getInstrument, listInstruments, publicItems, scoreInstrument } from './ai/scales.js';
import { polishAnalysis, polishDiscussion } from './ai/llm.js';
import { addTextSignals, createSignal, listSignals, scoringSignals, setSignalFeedback, SOURCE_LABEL } from './services/signals.js';
import { applyAssessment, assessmentRows, assessmentSummary } from './services/assessments.js';
import { journeyState } from './services/journey.js';
import {
  latestPlan, planById, planStage, createPlan, listPlanComments, commentStats,
  addPlanComment, finalizeReadiness, markFinal
} from './services/plans.js';
import {
  assertAccess, accessibleStudents, audit, canAccess, consentState, createStudent, currentStudentFor,
  deleteStudent, exportStudentData, getStudent, progressOf, recordConsent, AGE_BANDS
} from './services/students.js';
import { exportSnapshot, importSnapshot, linkCloudAccount } from './services/cloudlink.js';

const routes = [];
function route(method, path, handler, opts = {}) {
  const keys = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, pattern, keys, handler, auth: opts.auth !== false, roles: opts.roles || null });
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, salt, ...rest } = u;
  return rest;
}

function findUserByName(name) {
  return findOne('users', (u) => u.name.toLowerCase() === String(name).trim().toLowerCase());
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return part.slice(idx + 1).trim(); }
    }
  }
  return null;
}

/**
 * 依次尝试 Authorization、X-Auth-Token、Cookie、查询参数。
 * 反向代理/WAF 有时会剥掉 Authorization 头，此时 Cookie 仍能通过，
 * 这样同一套接口在本地和公网都可用。
 */
function authUser(req) {
  const header = req.headers.authorization || '';
  const candidates = [
    header.startsWith('Bearer ') ? header.slice(7) : null,
    req.headers['x-auth-token'] || null,
    readCookie(req, 'fp_token'),
    (() => {
      if (!req.url) return null;
      try { return new URL(req.url, 'http://localhost').searchParams.get('token'); } catch { return null; }
    })()
  ];
  // 反向代理可能用自己的 token 覆盖 Authorization，必须逐个试，不能第一个失败就放弃
  for (const token of candidates) {
    if (!token || typeof token !== 'string') continue;
    const payload = verifyToken(token);
    if (!payload) continue;
    const user = findOne('users', (u) => u.id === payload.sub);
    if (user) return user;
  }
  return null;
}

/* ------------------------------- 身份与档案 ------------------------------- */

route('GET', '/api/ai/status', () => aiStatus(), { auth: false });


route('GET', '/api/meta', () => ({
  dimensions: RIASEC.map((k) => DIMENSIONS[k]),
  abilities: Object.values(ABILITIES),
  values: VALUES,
  ageBands: Object.entries(AGE_BANDS).map(([key, v]) => ({ key, ...v })),
  sources: SOURCE_LABEL,
  ai: aiStatus()
}), { auth: false });

route('POST', '/api/auth/register', (ctx) => {
  requireFields(ctx.body, ['name', 'password', 'role']);
  const { name, password, role } = ctx.body;
  if (!['student', 'parent', 'advisor'].includes(role)) throw bad('角色只能是 student / parent / advisor');
  if (String(password).length < 6) throw bad('密码至少 6 位');
  if (findUserByName(name)) throw bad('该用户名已被使用');

  const { salt, hash } = hashPassword(password);
  const user = insert('users', {
    id: uid('u_'),
    name: String(name).trim().slice(0, 24),
    role,
    passwordHash: hash,
    salt,
    verified: role !== 'advisor',
    status: role === 'advisor' ? 'pending' : 'active',
    createdAt: nowISO()
  });

  let student = null;
  if (role === 'student') {
    student = createStudent(user, { ...ctx.body, userId: user.id });
    recordConsent(student.id, user, { type: 'guardian', granted: Boolean(ctx.body.guardianConsent), scope: '监护人对未成年人数据使用的授权' });
    recordConsent(student.id, user, { type: 'data_use', granted: true, scope: '平台内部分析与规划生成' });
  }
  if (role === 'parent') {
    requireFields(ctx.body, ['childName']);
    student = createStudent(user, { name: ctx.body.childName, ageBand: ctx.body.ageBand, guardianId: user.id });
    recordConsent(student.id, user, { type: 'guardian', granted: true, scope: '监护人注册时确认监护关系' });
    recordConsent(student.id, user, { type: 'data_use', granted: true, scope: '平台内部分析与规划生成' });
  }

  logEvent('auth.register', { role, userId: user.id });
  return { token: signToken({ sub: user.id, role }), user: publicUser(user), student };
}, { auth: false });

/* ---------------------- 公开版：免注册体验（临时档案） ---------------------- */
/*
 * 公开链接的访客不必先注册，点一下就能进学堂走完"启程七问"并看到画像。
 * 代价必须说清楚：这是临时档案，数据 24 小时后自动清理、不跨设备同步。
 * 实现上不搞"共享演示账号"——多人同时用一个账号会互相踩数据，
 * 每个访客单独发一个 guest 档案，既有真实隔离，又能随时被回收。
 */
const GUEST_TTL_HOURS = 24;
const GUEST_MAX = 40; // 同时保留的临时档案上限，超出按创建时间丢掉最老的

function pruneGuests() {
  const guests = find('students', (s) => s.guest).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const expireBefore = Date.now() - GUEST_TTL_HOURS * 3600 * 1000;
  // 先留出这一个新访客的名额，保证总数稳定在 GUEST_MAX
  const drop = guests.filter((s, i) => i >= GUEST_MAX - 1 || new Date(s.createdAt).getTime() < expireBefore);
  for (const student of drop) {
    const owner = findOne('users', (u) => u.id === student.userId);
    try {
      deleteStudent(student.id, { id: 'system:guest-reaper', role: 'system' });
    } catch { /* 已被清理过就跳过 */ }
    if (owner) remove('users', owner.id);
  }
  return drop.length;
}

route('POST', '/api/auth/guest', () => {
  const pruned = pruneGuests();
  const suffix = crypto.randomBytes(4).toString('hex');
  const { salt, hash } = hashPassword(crypto.randomBytes(18).toString('hex'));
  const user = insert('users', {
    id: uid('u_'),
    name: `guest_${suffix}`,
    role: 'student',
    guest: true,
    passwordHash: hash,
    salt,
    verified: true,
    status: 'active',
    createdAt: nowISO()
  });
  const student = createStudent(user, {
    name: '体验同学',
    nickname: '体验同学',
    ageBand: '12-15',
    grade: '初二',
    userId: user.id,
    selfIntro: '免注册体验档案，24 小时后自动清理。'
  });
  const expiresAt = new Date(Date.now() + GUEST_TTL_HOURS * 3600 * 1000).toISOString();
  update('students', student.id, { guest: true, guestExpiresAt: expiresAt });
  recordConsent(student.id, user, { type: 'data_use', granted: true, scope: `免注册体验：临时档案，${GUEST_TTL_HOURS} 小时内自动清理` });
  logEvent('auth.guest', { userId: user.id, pruned });
  return {
    guest: true,
    expiresAt,
    token: signToken({ sub: user.id, role: 'student' }),
    user: publicUser(user),
    students: accessibleStudents(user),
    studentId: student.id
  };
}, { auth: false });

route('POST', '/api/auth/login', (ctx) => {
  requireFields(ctx.body, ['name', 'password']);
  const user = findUserByName(ctx.body.name);
  if (!user || !verifyPassword(ctx.body.password, user.salt, user.passwordHash)) throw unauthorized('用户名或密码不正确');
  const students = accessibleStudents(user);
  const studentId = ctx.body.studentId || students[0]?.id || null;
  return { token: signToken({ sub: user.id, role: user.role }), user: publicUser(user), students, studentId };
}, { auth: false });

route('GET', '/api/auth/me', (ctx) => ({
  user: publicUser(ctx.user),
  students: accessibleStudents(ctx.user),
  studentId: ctx.query.studentId || currentStudentFor(ctx.user)?.id || null,
  cloud: { linked: Boolean(ctx.user.cloudUid), uid: ctx.user.cloudUid || null },
  ai: aiStatus()
}));

/* --------------------------- 云服务：身份与档案 --------------------------- */
/*
 * 云登录在浏览器里完成（SDK 持有会话），这里只负责把它换成应用自己的会话。
 * 首次登录必须先选角色（学生 / 家长），角色不能从云端资料推断——
 * 同一个人可能是家长，也可能是学生本人。
 */
route('POST', '/api/auth/cloud', (ctx) => {
  requireFields(ctx.body, ['cloudUid']);
  const out = linkCloudAccount({
    cloudUid: ctx.body.cloudUid,
    cloudName: ctx.body.cloudName,
    role: ctx.body.role,
    displayName: ctx.body.displayName,
    childName: ctx.body.childName,
    ageBand: ctx.body.ageBand,
    guardianConsent: ctx.body.guardianConsent
  });
  if (out.needsProfile) return { needsProfile: true };

  const students = accessibleStudents(out.user);
  const studentId = ctx.body.studentId && students.some((s) => s.id === ctx.body.studentId)
    ? ctx.body.studentId
    : students[0]?.id || null;
  logEvent('auth.cloud', { userId: out.user.id, created: out.created });
  return {
    token: signToken({ sub: out.user.id, role: out.user.role }),
    user: publicUser(out.user),
    students,
    studentId,
    created: out.created
  };
}, { auth: false });

/** 云端 → 服务端镜像（换设备 / 部署后镜像为空时恢复） */
route('POST', '/api/cloud/import', (ctx) => {
  const out = importSnapshot(ctx.user, ctx.body || {});
  return {
    ...out,
    students: accessibleStudents(ctx.user),
    studentId: currentStudentFor(ctx.user)?.id || null
  };
});

/** 服务端镜像 → 云端（前端拿到后写入 fp_* 表） */
route('GET', '/api/cloud/snapshot', (ctx) => exportSnapshot(ctx.user));


route('GET', '/api/students', (ctx) => accessibleStudents(ctx.user).map((s) => ({
  ...s,
  progress: progressOf(s.id),
  consents: consentState(s.id)
})));

route('POST', '/api/students', (ctx) => {
  if (!['parent', 'student'].includes(ctx.user.role)) throw forbidden('只有学生本人或家长可以创建档案');
  const student = createStudent(ctx.user, {
    ...ctx.body,
    userId: ctx.user.role === 'student' ? ctx.user.id : null,
    guardianId: ctx.user.role === 'parent' ? ctx.user.id : ctx.body.guardianId
  });
  if (ctx.user.role === 'parent') {
    recordConsent(student.id, ctx.user, { type: 'guardian', granted: true, scope: '家长创建档案时确认监护关系' });
  }
  audit(student.id, ctx.user, 'student.create');
  return student;
});

route('GET', '/api/students/:id', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  const signals = listSignals(student.id);
  return {
    ...student,
    progress: progressOf(student.id),
    consents: consentState(student.id),
    profile: buildProfile(scoringSignals(student.id)),
    counts: { signals: signals.length },
    latestAnalysis: find('analyses', (a) => a.studentId === student.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null,
    latestPlan: latestPlan(student.id)
  };
});

route('PATCH', '/api/students/:id', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id, { write: true });
  const patch = {};
  for (const k of ['nickname', 'grade', 'region', 'schoolType', 'selfIntro', 'lowBandwidth']) {
    if (k in ctx.body) patch[k] = ctx.body[k];
  }
  if (ctx.body.ageBand && AGE_BANDS[ctx.body.ageBand]) {
    patch.ageBand = ctx.body.ageBand;
    patch.age = ctx.body.ageBand === '12-15' ? 14 : ctx.body.ageBand === '19-22' ? 20 : 17;
  }
  audit(student.id, ctx.user, 'student.update', { fields: Object.keys(patch) });
  return update('students', student.id, patch);
});

route('GET', '/api/students/:id/export', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  audit(student.id, ctx.user, 'data.export');
  return exportStudentData(student.id);
});

route('DELETE', '/api/students/:id', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  if (ctx.body?.confirm !== 'DELETE') throw bad('请提交 confirm: "DELETE" 以确认删除');
  assetGuard(ctx.user, student);
  return deleteStudent(student.id, ctx.user);
});

function assetGuard(user, student) {
  if (user.role === 'student' && student.userId !== user.id) throw forbidden('只能删除本人的档案');
  if (user.role === 'parent' && student.guardianId !== user.id) throw forbidden('只能删除本人监护的档案');
}

route('GET', '/api/students/:id/audit', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  return find('auditLog', (a) => a.studentId === student.id).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 60);
});

route('POST', '/api/students/:id/consent', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id, { write: true });
  const rec = recordConsent(student.id, ctx.user, ctx.body);
  audit(student.id, ctx.user, 'consent.update', { type: ctx.body.type, granted: ctx.body.granted });
  return { record: rec, consents: consentState(student.id) };
});

/* --------------------------------- 探索 --------------------------------- */

route('GET', '/api/explore/state', (ctx) => {
  const student = assertAccess(ctx.user, ctx.query.studentId);
  const signals = scoringSignals(student.id);
  const next = nextQuestion(signals, student.ageBand);
  const doneScenarios = new Set(signals.filter((s) => s.source === 'scenario').map((s) => s.itemId));
  const doneCards = new Set(signals.filter((s) => s.source === 'card').map((s) => s.itemId));
  const doneCareers = new Set(signals.filter((s) => s.source === 'career').map((s) => s.meta?.careerId).filter(Boolean));
  const askedIds = signals.filter((s) => s.source === 'dialogue').map((s) => s.meta?.questionId).filter(Boolean);

  return {
    next,
    progress: progressOf(student.id),
    profile: buildProfile(signals),
    transcripts: find('conversations', (c) => c.studentId === student.id && c.kind === 'explore')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-40),
    askedQuestionIds: askedIds,
    scenarios: SCENARIOS.filter((s) => s.band.includes(student.ageBand)).map((s) => ({
      id: s.id, title: s.title, setup: s.setup, question: s.question,
      options: s.options.map((o) => ({ id: o.id, text: o.text })),
      done: doneScenarios.has(s.id)
    })),
    cards: CARDS.map((c) => ({ ...c, done: doneCards.has(c.id) })),
    careers: CAREERS.map((c) => ({
      id: c.id, name: c.name, tags: c.tags, path: c.path, subjects: c.subjects, outlook: c.outlook,
      salary: c.salary, firstStep: c.firstStep, done: doneCareers.has(c.id)
    })),
    values: VALUES,
    lowBandwidth: student.lowBandwidth
  };
});

route('POST', '/api/explore/answer', (ctx) => {
  const { studentId, questionId, text, optionKey, retryOf } = ctx.body;
  const student = assertAccess(ctx.user, studentId, { write: true });
  if (ctx.user.role === 'parent') throw forbidden('家长不能代替学生作答原始问题');
  requireFields(ctx.body, ['questionId']);
  const q = QUESTIONS.find((x) => x.id === questionId);
  if (!q) throw notFound('问题不存在');

  const answer = String(text || '').slice(0, 1000);
  if (!answer && !optionKey) throw bad('请先写点什么，或选择一个选项');

  let created = [];
  if (q.dim === 'V') {
    const opt = (q.options || []).find((o) => o.key === optionKey);
    if (optionKey && !opt) throw bad('选项无效');
    created.push(createSignal(student.id, {
      source: 'value',
      dimension: 'V',
      strength: 0.8,
      weight: 1.3,
      excerpt: opt ? `${q.text} → ${opt.label}` : answer,
      itemId: q.id,
      meta: { questionId: q.id, valueKey: opt?.key || guessValueKey(answer) }
    }));
  } else if (q.dim === 'CAREER') {
    created = addTextSignals(student.id, answer, {
      source: 'self', dimension: 'CAREER', weight: 1.1, itemId: q.id, meta: { questionId: q.id }
    });
  } else {
    created = addTextSignals(student.id, answer, {
      source: 'dialogue', dimension: q.dim, weight: 1, itemId: q.id, meta: { questionId: q.id, retryOf: retryOf || null }
    });
  }

  const signals = scoringSignals(student.id);
  const next = nextQuestion(signals, student.ageBand);
  const weak = answer.length < 12;
  const reflection = buildReflection(q, answer, created, weak);

  insert('conversations', {
    studentId: student.id,
    kind: 'explore',
    questionId: q.id,
    question: q.text,
    answer,
    reflection,
    optionKey: optionKey || null,
    signalIds: created.map((s) => s.id),
    createdAt: nowISO()
  });

  audit(student.id, ctx.user, 'explore.answer', { questionId: q.id });
  return {
    signals: created,
    reflection,
    followUp: weak && q.followUps?.length ? q.followUps[0] : null,
    next,
    progress: progressOf(student.id),
    profile: buildProfile(signals)
  };
});

/* --------------------------- 开篇故事引导（启程） --------------------------- */

function introSignals(studentId) {
  return find('signals', (s) => s.studentId === studentId && s.meta?.intro)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function introCollected(studentId) {
  // 同一幕可能落 1-2 条信号（主维度 + 次维度），对前端只呈现一条线索，
  // 否则学生看到"留下 5 条线索"，其实只做了 3 次选择。
  const byAct = new Map();
  for (const sig of introSignals(studentId)) {
    const actId = sig.meta.actId;
    const prev = byAct.get(actId);
    if (!prev || (sig.meta.primary === true && prev.meta.primary !== true)) byAct.set(actId, sig);
  }
  const order = INTRO_STORY.acts.map((a) => a.id);
  return [...byAct.values()]
    .sort((a, b) => order.indexOf(a.meta.actId) - order.indexOf(b.meta.actId))
    .map((sig, i) => ({
      ref: `L${i + 1}`,
      actId: sig.meta.actId,
      label: INTRO_CLUE_LABEL[sig.meta.actId] || sig.meta.actId,
      answer: sig.meta.choiceLabel || '',
      excerpt: sig.excerpt,
      dimension: sig.dimension,
      valueKey: sig.meta.valueKey || null,
      at: sig.createdAt
    }));
}

function introStateOf(student) {
  const collected = introCollected(student.id);
  const status = student.onboarding?.status || 'pending';
  return {
    status,
    skipped: Boolean(student.onboarding?.skipped),
    doneAt: student.onboarding?.doneAt || null,
    actsDone: new Set(collected.map((c) => c.actId)).size,
    collected
  };
}

// 故事脚本：只下发文案与选项，不下发 dims / 打分，避免学生"按分值作答"
route('GET', '/api/explore/intro', (ctx) => {
  const student = assertAccess(ctx.user, ctx.query.studentId);
  return {
    mentor: INTRO_STORY.mentor,
    finale: INTRO_STORY.finale,
    acts: INTRO_STORY.acts.map((a) => ({
      id: a.id, chapter: a.chapter, title: a.title, scene: a.scene,
      narration: a.narration, line: a.line, prompt: a.prompt,
      textPrompt: a.textPrompt, textPlaceholder: a.textPlaceholder,
      choices: a.choices.map((c) => ({ id: c.id, label: c.label, sub: c.sub }))
    })),
    state: introStateOf(student),
    signalCount: find('signals', (s) => s.studentId === student.id).length
  };
});

route('POST', '/api/explore/intro', (ctx) => {
  const { studentId, actId, choiceId, text } = ctx.body || {};
  const student = assertAccess(ctx.user, studentId, { write: true });
  if (ctx.user.role === 'parent') throw forbidden('家长不能代替学生完成开篇探索');
  const act = INTRO_STORY.acts.find((a) => a.id === actId);
  if (!act) throw notFound('这一幕不存在');
  const choice = act.choices.find((c) => c.id === choiceId);
  if (!choice) throw bad('请选择一个选项');

  const note = String(text || '').trim().slice(0, 200);
  const picked = `${choice.label}${note ? `｜「${note}」` : ''}`;
  const excerpt = `${act.chapter}《${act.title}》· ${picked}`;

  // 同一幕重复进入（含"重看一遍"）不重复计分，只回放 AI 的回应
  const existing = findOne('signals', (s) => s.studentId === student.id && s.meta?.intro && s.meta.actId === act.id);
  if (existing) {
    return {
      reply: choice.reply,
      alreadyRecorded: true,
      collected: introCollected(student.id),
      state: introStateOf(student)
    };
  }

  const created = [];
  if (choice.value) {
    created.push(createSignal(student.id, {
      source: 'value', dimension: 'V', strength: 0.78, weight: 1.25,
      excerpt, itemId: `intro_${act.id}`,
      meta: { intro: true, actId: act.id, choiceId, choiceLabel: choice.label, valueKey: choice.value, questionId: `intro_${act.id}` }
    }));
  } else {
    const dims = Object.entries(choice.dims || {}).slice(0, 2);
    dims.forEach(([dim, strength], i) => {
      created.push(createSignal(student.id, {
        source: 'dialogue', dimension: dim,
        strength: clamp(strength, 0.2, 1),
        weight: i === 0 ? 1.15 : 0.85,
        excerpt, itemId: `intro_${act.id}`,
        ability: i === 0 ? (choice.ability || {}) : {},
        meta: {
          intro: true, actId: act.id, choiceId, choiceLabel: choice.label,
          questionId: `intro_${act.id}`, primary: i === 0
        }
      }));
    });
  }

  insert('conversations', {
    studentId: student.id, kind: 'intro', questionId: `intro_${act.id}`,
    question: act.prompt, answer: picked, reflection: choice.reply,
    optionKey: choiceId, signalIds: created.map((s) => s.id), createdAt: nowISO()
  });

  const actsDone = new Set(find('signals', (s) => s.studentId === student.id && s.meta?.intro).map((s) => s.meta.actId)).size;
  update('students', student.id, {
    onboarding: {
      status: 'in_progress',
      startedAt: student.onboarding?.startedAt || nowISO(),
      lastAct: act.id,
      acts: actsDone,
      updatedAt: nowISO()
    }
  });
  audit(student.id, ctx.user, 'explore.intro', { actId: act.id, choiceId });

  return {
    reply: choice.reply,
    created: created.map((s) => ({ id: s.id, dimension: s.dimension })),
    collected: introCollected(student.id),
    state: introStateOf({ ...student, onboarding: { ...(student.onboarding || {}), status: 'in_progress' } }),
    totalSignals: find('signals', (s) => s.studentId === student.id).length
  };
});

route('POST', '/api/explore/intro/finish', async (ctx) => {
  const { studentId, skipped, portrait } = ctx.body || {};
  const student = assertAccess(ctx.user, studentId, { write: true });
  const done = introSignals(student.id).length;
  const status = skipped || done === 0 ? 'skipped' : 'done';
  update('students', student.id, {
    onboarding: {
      status,
      skipped: Boolean(skipped),
      acts: done,
      startedAt: student.onboarding?.startedAt || nowISO(),
      doneAt: nowISO()
    }
  });
  audit(student.id, ctx.user, 'explore.intro.finish', { skipped: Boolean(skipped), acts: done });

  // 问完七个问题就出第一版画像：直接复用正式的分析链路（同样的打分、证据索引、局限说明），
  // 不另起一套"简化版结论"，否则学生进到画像页会看到两份不一样的结果。
  let analysis = null;
  let portraitError = null;
  if (portrait !== false && status === 'done' && ctx.user.role !== 'parent') {
    try {
      analysis = await runAnalysis(ctx.user, student.id, { force: Boolean(ctx.body?.force) });
    } catch (err) {
      portraitError = err.message || '画像生成失败';
    }
  }

  return {
    ok: true,
    state: introStateOf(findOne('students', (s) => s.id === student.id)),
    analysis,
    portraitError
  };
});

/* --------------------------- 标准化量表（RIASEC / 多元智能） --------------------------- */

/** 量表接口：不传 studentId 时默认当前学生，避免前端每次都要拼参数 */
function assessStudent(user, id, opts) {
  if (id) return assertAccess(user, id, opts);
  const cur = currentStudentFor(user);
  if (!cur) throw notFound('学生档案不存在');
  if (!canAccess(user, cur, opts)) throw forbidden('你没有该学生档案的访问权限');
  return cur;
}




route('GET', '/api/assess', (ctx) => {
  const student = assessStudent(ctx.user, ctx.query.studentId);
  const rows = assessmentRows(student.id);
  return {
    studentId: student.id,
    instruments: listInstruments().map((ins) => ({
      ...ins,
      attempts: rows.filter((r) => r.scale === ins.key).length,
      latest: assessmentSummary(rows.find((r) => r.scale === ins.key))
    })),
    canTake: ctx.user.role !== 'parent' && ctx.user.role !== 'advisor',
    versions: { scale: SCALE_VERSION }
  };
});

route('GET', '/api/assess/:scale', (ctx) => {
  const student = assessStudent(ctx.user, ctx.query.studentId);
  const ins = getInstrument(ctx.params.scale);
  if (!ins) throw notFound('量表不存在');
  const latest = assessmentRows(student.id, ins.key)[0] || null;
  return {
    scale: ins.key,
    name: ins.name,
    short: ins.short,
    theory: ins.theory,
    intro: ins.intro,
    minutes: ins.minutes,
    itemCount: ins.items.length,
    options: LIKERT,
    dims: ins.dims.map((d) => ({ key: d.key, name: d.name, desc: d.desc, color: d.color })),
    items: publicItems(ins.key),
    attempts: assessmentRows(student.id, ins.key).length,
    latest: assessmentSummary(latest),
    canTake: ctx.user.role !== 'parent' && ctx.user.role !== 'advisor'
  };
});

route('POST', '/api/assess/:scale', async (ctx) => {
  const { studentId, answers } = ctx.body || {};
  const student = assessStudent(ctx.user, studentId, { write: true });
  if (ctx.user.role === 'parent' || ctx.user.role === 'advisor') throw forbidden('家长 / 规划师可以查看结果，但不能代替学生作答');
  const ins = getInstrument(ctx.params.scale);
  if (!ins) throw notFound('量表不存在');
  if (!answers || typeof answers !== 'object') throw bad('缺少作答内容');

  let result;
  try {
    result = scoreInstrument(ins.key, answers);
  } catch (err) {
    throw bad(err.message || '计分失败');
  }
  const minAnswered = Math.ceil(ins.items.length * 0.6);
  if (result.answered < minAnswered) {
    throw bad(`至少需要完成 ${minAnswered} 题（当前 ${result.answered} 题）才能计分`);
  }

  const applied = applyAssessment(student, {
    scale: ins.key,
    answers,
    takenBy: ctx.user.id,
    role: ctx.user.role
  });

  audit(student.id, ctx.user, 'assessment.submit', { scale: ins.key, id: applied.row.id, answered: result.answered });
  logEvent('assessment.submit', { studentId: student.id, scale: ins.key, answered: result.answered });

  // 两份量表齐了就地推进：画像 → 初步方案。只补缺的，不覆盖已有的。
  const journey = await advanceJourney(ctx.user, student);

  return {
    id: applied.row.id,
    result: applied.result,
    signals: applied.signals.map((s) => ({ id: s.id, dimension: s.dimension, strength: s.strength })),
    attempts: applied.attempts,
    journey
  };
});

route('GET', '/api/assess/:scale/result', (ctx) => {
  const student = assessStudent(ctx.user, ctx.query.studentId);
  const ins = getInstrument(ctx.params.scale);
  if (!ins) throw notFound('量表不存在');
  const rows = assessmentRows(student.id, ins.key);
  return {
    scale: ins.key,
    latest: rows[0] ? { id: rows[0].id, createdAt: rows[0].createdAt, result: rows[0].result } : null,
    history: rows.map(assessmentSummary)
  };
});

function guessValueKey(text) {
  const t = String(text);
  const map = { 稳定: 'stability', 帮助: 'helping', 创造: 'creation', 自由: 'freedom', 收入: 'income', 钱: 'income', 成就: 'achievement', 团队: 'belonging' };
  for (const [kw, key] of Object.entries(map)) if (t.includes(kw)) return key;
  return 'achievement';
}

function buildReflection(q, answer, signals, weak) {
  const main = signals.find((s) => s.dimension !== 'CAREER');
  const dimName = main ? DIMENSIONS[main.dimension]?.name : '综合';
  const quote = answer.length > 34 ? answer.slice(0, 34) + '…' : answer || '（选择了一个选项）';
  if (weak) {
    return `「${quote}」——有点短，我不太敢就此下结论。你能再说具体一点吗？比如当时是什么场景、你具体做了什么。我更关心细节，而不是评价。`;
  }
  const tail = main
    ? `我从这段话里读到的不是"你适合什么职业"，而是你在意「${dimName}」这一类事。这只是个假设，等会儿可以用情景任务验证。`
    : `我先把它记下来了，暂时不急着归类——一条记录说明不了什么。`;
  return `你说「${quote}」。谢谢你写这么具体。${tail}`;
}

route('POST', '/api/explore/scenario', (ctx) => {
  const { studentId, scenarioId, optionId, selfEval } = ctx.body;
  const student = assertAccess(ctx.user, studentId, { write: true });
  if (ctx.user.role === 'parent') throw forbidden('家长不能代替学生完成情景任务');
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  if (!sc) throw notFound('情景任务不存在');
  const opt = sc.options.find((o) => o.id === optionId);
  if (!opt) throw bad('请选择一个做法');

  const created = Object.entries(opt.effects).map(([dim, strength]) => createSignal(student.id, {
    source: 'scenario',
    dimension: dim,
    strength: clamp(strength, 0.2, 1),
    weight: 1.15,
    excerpt: `${sc.title}：${opt.text}。${opt.outcome}`,
    itemId: sc.id,
    ability: opt.ability || {},
    selfEval: selfEval === undefined ? null : clamp(Number(selfEval), 0, 100),
    meta: { scenarioId: sc.id, optionId: opt.id, outcome: opt.outcome }
  }));

  insert('exploreSessions', {
    studentId: student.id, kind: 'scenario', itemId: sc.id, choice: opt.id,
    selfEval: selfEval ?? null, signalIds: created.map((s) => s.id), createdAt: nowISO()
  });
  audit(student.id, ctx.user, 'explore.scenario', { scenarioId: sc.id, optionId });

  return {
    outcome: opt.outcome,
    aiObservation: `你在「${sc.title}」里选择了"${opt.text}"。这是一次行为证据，比自我描述更硬——但也只说明在这个具体情境下的选择，不代表你只会这样做。`,
    signals: created,
    progress: progressOf(student.id),
    profile: buildProfile(scoringSignals(student.id))
  };
});

route('POST', '/api/explore/cards', (ctx) => {
  const { studentId, cardId, liked } = ctx.body;
  const student = assertAccess(ctx.user, studentId, { write: true });
  if (ctx.user.role === 'parent') throw forbidden('家长不能代替学生作答');
  const card = CARDS.find((c) => c.id === cardId);
  if (!card) throw notFound('卡片不存在');
  const already = findOne('signals', (s) => s.studentId === student.id && s.itemId === cardId && s.source === 'card');
  if (already) return { duplicated: true, profile: buildProfile(scoringSignals(student.id)) };
  const signal = createSignal(student.id, {
    source: 'card',
    dimension: card.dim,
    strength: liked ? 0.78 : 0.25,
    weight: liked ? 0.85 : 0.55,
    excerpt: `${liked ? '愿意尝试' : '不太想尝试'}：${card.title}`,
    itemId: card.id,
    meta: { liked: Boolean(liked), tag: card.tag }
  });
  audit(student.id, ctx.user, 'explore.card', { cardId, liked: Boolean(liked) });
  return { signal, profile: buildProfile(scoringSignals(student.id)) };
});

route('POST', '/api/explore/career-experience', (ctx) => {
  const { studentId, careerId, rating, note, wantMore } = ctx.body;
  const student = assertAccess(ctx.user, studentId, { write: true });
  if (ctx.user.role === 'parent') throw forbidden('职业体验需由学生本人记录');
  const career = CAREERS.find((c) => c.id === careerId);
  if (!career) throw notFound('职业不存在');
  const r = clamp(Number(rating) || 3, 1, 5);

  const signal = createSignal(student.id, {
    source: 'career',
    dimension: 'CAREER',
    strength: clamp(0.35 + r * 0.13, 0.3, 0.95),
    weight: 1.2,
    excerpt: `了解「${career.name}」后自评 ${r}/5${note ? '：' + note : ''}`,
    itemId: careerId,
    meta: { careerId, rating: r, wantMore: Boolean(wantMore), note: note || '' }
  });
  insert('exploreSessions', {
    studentId: student.id, kind: 'career', itemId: careerId, choice: String(r),
    selfEval: r * 20, signalIds: [signal.id], createdAt: nowISO()
  });
  audit(student.id, ctx.user, 'explore.career', { careerId, rating: r });

  const advice = r >= 4
    ? `你给了 ${r}/5。先别急着把它定成目标——下一步是找一位真实从业者聊 20 分钟，问"最枯燥的部分是什么"。`
    : r <= 2
      ? `你给了 ${r}/5。这很有价值：排除掉一个方向，和发现一个方向同样重要。能说说具体是哪一点让你不适吗？`
      : `你给了 ${r}/5，说明信息还不够。建议先做一次它的入门体验任务：${career.firstStep}`;

  return { signal, advice, progress: progressOf(student.id), profile: buildProfile(scoringSignals(student.id)) };
});

/* --------------------------------- 证据 --------------------------------- */

route('GET', '/api/students/:id/signals', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  const signals = listSignals(student.id, { source: ctx.query.source, dimension: ctx.query.dimension });
  return {
    signals: signals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    summary: progressOf(student.id).bySource
  };
});

route('POST', '/api/students/:id/signals', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id, { write: true });
  const { kind, text, dimension, selfEval } = ctx.body;
  requireFields(ctx.body, ['text']);
  if (ctx.user.role === 'parent' && kind !== 'parent') throw forbidden('家长只能提交"家庭观察"，不能修改学生原始记录');
  const source = ctx.user.role === 'parent' ? 'parent' : kind === 'growth' ? 'growth' : 'self';
  const created = addTextSignals(student.id, text, {
    source,
    dimension: dimension || 'I',
    weight: source === 'parent' ? 1.25 : 1,
    selfEval: selfEval ?? null,
    meta: { kind: kind || source, byRole: ctx.user.role }
  });
  audit(student.id, ctx.user, 'signal.create', { source, ids: created.map((s) => s.id) });
  return { signals: created, progress: progressOf(student.id) };
});

route('PATCH', '/api/signals/:id/feedback', (ctx) => {
  const signal = findOne('signals', (s) => s.id === ctx.params.id);
  if (!signal) throw notFound('证据不存在');
  assertAccess(ctx.user, signal.studentId, { write: true });
  if (ctx.user.role === 'parent') throw forbidden('家长不能覆盖学生对证据的确认状态');
  const result = setSignalFeedback(signal.id, ctx.user, ctx.body);
  audit(signal.studentId, ctx.user, 'signal.feedback', { signalId: signal.id, status: ctx.body.status });
  return result;
});

/* --------------------------------- 分析 --------------------------------- */

async function runAnalysis(user, studentId, { force = false } = {}) {
  const student = assertAccess(user, studentId);
  const consent = consentState(student.id);
  if (!consent.data_use) throw forbidden('缺少数据使用授权，无法生成分析');
  if (!consent.ai_analysis) {
    // MVP 默认允许，但记录一次显式授权，避免"默认同意"的合规问题
    recordConsent(student.id, user, { type: 'ai_analysis', granted: true, scope: '生成 AI 分析报告' });
  }
  const signals = scoringSignals(student.id);
  if (signals.length < 3) throw bad('证据不足：至少需要 3 条探索记录才能生成有依据的分析（当前 ' + signals.length + ' 条）');

  const latest = find('analyses', (a) => a.studentId === student.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (latest && !force) {
    const newestSignal = signals.reduce((max, s) => (new Date(s.createdAt) > new Date(max) ? s.createdAt : max), signals[0].createdAt);
    if (new Date(latest.createdAt) > new Date(newestSignal)) return latest;
  }

  const result = analyze(student, signals);
  let summary = result.summary;
  let mode = 'simulated';
  let model = 'futurepath-rule-engine-v1';
  let narrativeNote = '';
  const polished = await polishAnalysis({ ...result, ageBand: student.ageBand });
  if (polished) {
    summary = polished.summary;
    mode = 'llm';
    model = config.ai.model;
    narrativeNote = '叙述文本由已配置的大模型生成，评分与证据链接来自本地引擎计算。';
    if (Array.isArray(polished.suggestions) && polished.suggestions.length) {
      result.suggestions = result.suggestions.map((s, i) => (polished.suggestions[i] ? { ...s, action: polished.suggestions[i] } : s));
    }
  }

  const row = insert('analyses', {
    id: uid('an_'),
    studentId: student.id,
    createdAt: nowISO(),
    mode,
    model,
    narrativeNote,
    signalCount: signals.length,
    dataRange: { from: signals[0].createdAt, to: signals[signals.length - 1].createdAt },
    confidence: result.confidence,
    summary,
    strengths: result.strengths,
    hypotheses: result.hypotheses,
    suggestions: result.suggestions,
    careerMatches: result.careerMatches,
    scaleInsight: result.scaleInsight,
    profileSnapshot: result.profileSnapshot,
    evidenceIndex: result.evidenceIndex,
    coverage: result.coverage,
    caveats: result.caveats,
    status: 'draft',
    acknowledgements: []
  });
  audit(student.id, user, 'analysis.generate', { analysisId: row.id, signalCount: signals.length });
  return row;
}

route('POST', '/api/students/:id/analysis', async (ctx) => {
  if (ctx.user.role === 'parent') throw forbidden('AI 分析由学生端或 AI 导师发起');
  return runAnalysis(ctx.user, ctx.params.id, { force: Boolean(ctx.body?.force) });
});

/**
 * 新人旅程的自动推进：两份量表齐了以后，画像和初步方案不需要用户再点一次生成。
 * 只补缺的部分；画像比最新量表旧时重算，已有方案不动（只标 stale 由前端提示）。
 */
async function advanceJourney(user, student) {
  const state = journeyState(student);
  if (!state.steps[0].done) return state;

  if (!state.steps[1].done) {
    await runAnalysis(user, student.id, { force: true });
  }

  const afterAnalysis = journeyState(student);
  if (!afterAnalysis.steps[2].done) {
    const analysis = find('analyses', (a) => a.studentId === student.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (analysis) {
      const plan = createPlan(student, analysis, '5', { status: 'draft', source: 'journey' });
      audit(student.id, user, 'plan.auto', { planId: plan.id, reason: 'scales-complete' });
      logEvent('plan.auto', { studentId: student.id, planId: plan.id });
    }
  }
  return journeyState(student);
}

route('GET', '/api/students/:id/journey', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  return journeyState(student);
});

route('GET', '/api/students/:id/analysis', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  const rows = find('analyses', (a) => a.studentId === student.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const latest = rows[0] || null;
  const signals = scoringSignals(student.id);
  const newest = signals.reduce((m, s) => (new Date(s.createdAt) > new Date(m) ? s.createdAt : m), signals[0]?.createdAt || 0);
  return {
    latest,
    history: rows.map((r) => ({ id: r.id, createdAt: r.createdAt, signalCount: r.signalCount, confidence: r.confidence, status: r.status })),
    stale: latest ? new Date(newest) > new Date(latest.createdAt) : false,
    signalCount: signals.length,
    canAnalyze: signals.length >= 3
  };
});

route('PATCH', '/api/analyses/:id/feedback', (ctx) => {
  const analysis = findOne('analyses', (a) => a.id === ctx.params.id);
  if (!analysis) throw notFound('分析不存在');
  assertAccess(ctx.user, analysis.studentId, { write: true });
  if (ctx.user.role === 'parent') throw forbidden('家长不能替学生确认或否定分析结论');
  const { target, action, note } = ctx.body;
  if (!['confirm', 'dispute'].includes(action)) throw bad('action 只能是 confirm / dispute');
  if (!target) throw bad('请指定 target');

  const acks = analysis.acknowledgements.filter((a) => a.target !== target);
  acks.push({ target, action, note: String(note || '').slice(0, 300), by: ctx.user.id, at: nowISO() });
  const disputedCount = acks.filter((a) => a.action === 'dispute').length;
  const updated = update('analyses', analysis.id, {
    acknowledgements: acks,
    status: disputedCount ? 'disputed' : 'acknowledged'
  });
  audit(analysis.studentId, ctx.user, 'analysis.feedback', { analysisId: analysis.id, target, action });
  return updated;
});

/* --------------------------------- 家长 --------------------------------- */

route('POST', '/api/students/:id/discussion', async (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id, { write: true });
  requireFields(ctx.body, ['text']);
  const text = String(ctx.body.text).slice(0, 1200);
  const role = ctx.user.role === 'parent' ? 'parent' : ctx.user.role === 'advisor' ? 'advisor' : 'student';

  insert('conversations', {
    studentId: student.id, kind: 'discussion', role, text, createdAt: nowISO()
  });

  let newSignals = [];
  if (role === 'parent') {
    newSignals = addTextSignals(student.id, text, {
      source: 'parent', dimension: 'I', weight: 1.25, meta: { kind: 'observation', byRole: 'parent' }
    });
  }

  const analysis = find('analyses', (a) => a.studentId === student.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const messages = find('conversations', (c) => c.studentId === student.id && c.kind === 'discussion');
  const base = discussReply({ student, analysis, messages, parentText: text });
  let replyText = base.text;
  let mode = 'simulated';
  const polished = await polishDiscussion({
    studentName: student.name,
    ageBand: student.ageBand,
    parentText: text,
    topDimensions: analysis?.profileSnapshot?.dimensions?.slice().sort((a, b) => b.score - a.score).slice(0, 3),
    hypotheses: analysis?.hypotheses?.map((h) => h.text) || [],
    ruleReply: base.text
  });
  if (polished) {
    replyText = polished.text;
    mode = 'llm';
  }

  const reply = insert('conversations', {
    studentId: student.id,
    kind: 'discussion',
    role: 'ai',
    text: replyText,
    refs: base.refs,
    mode,
    createdAt: nowISO()
  });
  audit(student.id, ctx.user, 'discussion.message', { role, signalIds: newSignals.map((s) => s.id) });
  return { messages: [...messages, reply], newSignals, mode };
});

route('GET', '/api/students/:id/discussion', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  const messages = find('conversations', (c) => c.studentId === student.id && c.kind === 'discussion')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const analysis = find('analyses', (a) => a.studentId === student.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const observations = find('signals', (s) => s.studentId === student.id && s.source === 'parent');
  return {
    messages,
    observations,
    guidingQuestions: analysis ? buildGuidingQuestions(student, analysis) : [],
    expectations: find('parentFeedback', (p) => p.studentId === student.id)
  };
});

function buildGuidingQuestions(student, analysis) {
  const top = analysis.profileSnapshot.dimensions.slice().sort((a, b) => b.score - a.score)[0];
  return [
    `${student.name} 在「${top?.name || '探索'}」上的表现，你在家里见过类似的具体事例吗？`,
    '如果孩子想尝试一个你觉得"没什么用"的方向，你最担心的是什么？',
    '家里能提供的支持里，哪一项是你愿意先拿出来的（时间 / 一次体验机会 / 一笔小预算）？',
    '有没有一个机会，是因为信息或资源不足，孩子一直没试过？'
  ];
}

route('POST', '/api/students/:id/parent-feedback', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id, { write: true });
  if (ctx.user.role !== 'parent') throw forbidden('该接口仅家长可提交');
  const row = insert('parentFeedback', {
    studentId: student.id,
    guardianId: ctx.user.id,
    expectation: String(ctx.body.expectation || '').slice(0, 1000),
    resources: String(ctx.body.resources || '').slice(0, 1000),
    worries: String(ctx.body.worries || '').slice(0, 1000),
    createdAt: nowISO()
  });
  audit(student.id, ctx.user, 'parent.feedback');
  return row;
});

/* --------------------------------- 规划 --------------------------------- */

route('POST', '/api/students/:id/plan', async (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id, { write: true });
  if (ctx.user.role === 'parent') throw forbidden('规划由学生端或 AI 导师生成，家长参与确认');
  const analysis = await runAnalysis(ctx.user, student.id);
  const horizon = ctx.body?.horizon === '10' ? '10' : '5';
  const plan = createPlan(student, analysis, horizon, { status: 'draft', source: 'manual' });
  audit(student.id, ctx.user, 'plan.generate', { planId: plan.id, version: plan.version, horizon });
  return plan;
});

route('GET', '/api/students/:id/plan', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  const plans = find('plans', (p) => p.studentId === student.id).sort((a, b) => b.version - a.version);
  const revisions = find('planRevisions', (p) => p.studentId === student.id).sort((a, b) => new Date(b.at) - new Date(a.at));
  const latest = plans[0] || null;
  return {
    latest,
    stage: planStage(latest),
    comments: latest ? commentStats(latest.id) : null,
    readiness: latest ? finalizeReadiness(latest, student) : null,
    versions: plans.map((p) => ({ id: p.id, version: p.version, status: p.status, createdAt: p.createdAt, horizon: p.horizon, finalizedAt: p.finalizedAt || null })),
    revisions
  };
});

route('GET', '/api/plans/:id', (ctx) => {
  const plan = findOne('plans', (p) => p.id === ctx.params.id);
  if (!plan) throw notFound('规划不存在');
  const student = assertAccess(ctx.user, plan.studentId);
  return {
    plan,
    student,
    stage: planStage(plan),
    comments: commentStats(plan.id),
    readiness: finalizeReadiness(plan, student),
    revisions: find('planRevisions', (r) => r.planId === plan.id)
  };
});

route('PUT', '/api/plans/:id', (ctx) => {
  const plan = findOne('plans', (p) => p.id === ctx.params.id);
  if (!plan) throw notFound('规划不存在');
  const student = assertAccess(ctx.user, plan.studentId, { write: true });
  if (ctx.user.role === 'advisor') requireProAccess(student, ctx.user);
  const incoming = ctx.body?.sections || {};
  const sections = deepMerge(plan.sections, incoming);
  const prev = latestPlan(student.id);
  const version = (prev?.version || plan.version) + 1;

  insert('planRevisions', {
    id: uid('pr_'),
    studentId: student.id,
    planId: plan.id,
    version,
    at: nowISO(),
    by: ctx.user.role,
    byName: ctx.user.name,
    note: String(ctx.body?.note || '').slice(0, 300),
    changedFields: diffFields(plan.sections, sections)
  });
  const updated = update('plans', plan.id, {
    sections,
    version,
    status: 'pending_confirm',
    confirmations: [],
    updatedBy: ctx.user.role
  });
  audit(student.id, ctx.user, 'plan.edit', { planId: plan.id, version });
  return updated;
});

function diffFields(a, b) {
  return Object.keys(b).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch;
  if (patch && typeof patch === 'object') {
    const out = { ...(base || {}) };
    for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(base?.[k], v);
    return out;
  }
  return patch;
}

route('POST', '/api/plans/:id/confirm', (ctx) => {
  const plan = findOne('plans', (p) => p.id === ctx.params.id);
  if (!plan) throw notFound('规划不存在');
  const student = assertAccess(ctx.user, plan.studentId, { write: true });
  const role = ctx.user.role;
  if (!['student', 'parent'].includes(role)) throw forbidden('只有学生本人与家长可以确认方案；规划师与 AI 导师不能代替确认');
  const confirmations = plan.confirmations.filter((c) => c.role !== role);
  confirmations.push({ role, byUserId: ctx.user.id, at: nowISO(), version: plan.version, agreed: ctx.body?.agreed !== false, note: String(ctx.body?.note || '').slice(0, 300) });
  const hasStudent = confirmations.some((c) => c.role === 'student' && c.agreed);
  const hasParent = confirmations.some((c) => c.role === 'parent' && c.agreed);
  const status = hasStudent && hasParent ? 'confirmed' : 'pending_confirm';
  const updated = update('plans', plan.id, { confirmations, status });
  audit(student.id, ctx.user, 'plan.confirm', { planId: plan.id, role, status });
  return { ...updated, stage: planStage(updated), readiness: finalizeReadiness(updated, student) };
});

/* --------------------------- 方案讨论与定稿 --------------------------- */

route('GET', '/api/plans/:id/comments', (ctx) => {
  const plan = planById(ctx.params.id);
  if (!plan) throw notFound('规划不存在');
  const student = assertAccess(ctx.user, plan.studentId);
  return {
    planId: plan.id,
    version: plan.version,
    stage: planStage(plan),
    comments: listPlanComments(plan.id),
    stats: commentStats(plan.id),
    readiness: finalizeReadiness(plan, student),
    canComment: plan.status !== 'superseded'
  };
});

route('POST', '/api/plans/:id/comments', (ctx) => {
  const plan = planById(ctx.params.id);
  if (!plan) throw notFound('规划不存在');
  const student = assertAccess(ctx.user, plan.studentId, { write: true });
  if (plan.status === 'superseded') throw bad('这份方案已被新版本替代，请在最新版本上讨论');
  const text = String(ctx.body?.text || '').trim();
  if (text.length < 4) throw bad('说具体一点：哪个阶段、哪条行动让你不放心，或你希望改成什么样');

  const comment = addPlanComment({
    plan, user: ctx.user, role: ctx.user.role,
    name: ctx.user.displayName || ctx.user.name, text
  });
  const reply = planDiscussReply({ student, plan, text, role: ctx.user.role });
  const aiComment = addPlanComment({
    plan, user: null, role: 'ai', name: 'AI 导师',
    text: reply.text, kind: 'ai-reply', meta: { topics: reply.topics }
  });

  // 第一条人类意见把"初步方案"推进到"讨论中"；已定稿的方案不因讨论而改动
  const updated = plan.status === 'draft' ? update('plans', plan.id, { status: 'discussing' }) : plan;

  audit(student.id, ctx.user, 'plan.comment', { planId: plan.id, topics: reply.topics });
  return {
    comment,
    reply: aiComment,
    plan: updated,
    stage: planStage(updated),
    stats: commentStats(plan.id),
    readiness: finalizeReadiness(updated, student)
  };
});

route('POST', '/api/plans/:id/finalize', (ctx) => {
  const plan = planById(ctx.params.id);
  if (!plan) throw notFound('规划不存在');
  const student = assertAccess(ctx.user, plan.studentId, { write: true });
  if (!['student', 'parent'].includes(ctx.user.role)) {
    throw forbidden('只有学生与家长可以定稿；规划师提交的是审核意见，不代替确认');
  }
  if (plan.finalizedAt) return { plan, stage: planStage(plan), readiness: finalizeReadiness(plan, student) };

  const readiness = finalizeReadiness(plan, student);
  if (!readiness.ready) throw bad(`还不能定稿，仍缺：${readiness.missing.join('、')}`);

  const updated = markFinal(plan, ctx.user);
  addPlanComment({
    plan: updated, user: null, role: 'ai', name: 'AI 导师', kind: 'system',
    text: `方案已定稿为 v${updated.version}。之后若再修改，会生成新版本并重新走一次确认。`
  });
  audit(student.id, ctx.user, 'plan.finalize', { planId: plan.id, version: updated.version });
  logEvent('plan.finalize', { studentId: student.id, planId: plan.id });
  return { plan: updated, stage: planStage(updated), readiness: finalizeReadiness(updated, student) };
});

route('GET', '/api/plans/:id/export', (ctx) => {
  const plan = findOne('plans', (p) => p.id === ctx.params.id);
  if (!plan) throw notFound('规划不存在');
  const student = assertAccess(ctx.user, plan.studentId);
  audit(student.id, ctx.user, 'plan.export', { format: ctx.query.format || 'md' });
  if (ctx.query.format === 'html') {
    return { __raw: { type: 'text/html; charset=utf-8', body: planToHtml(student, plan), filename: `${student.name}-生涯规划-v${plan.version}.html` } };
  }
  return { __raw: { type: 'text/markdown; charset=utf-8', body: planToMarkdown(student, plan), filename: `${student.name}-生涯规划-v${plan.version}.md` } };
});

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function planToHtml(student, plan) {
  const s = plan.sections;
  const sum = s.summary || {};
  const list = (arr) => `<ul>${(arr || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(student.name)} 生涯规划 v${plan.version}</title>
<style>
@page{size:A4;margin:16mm}
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75;color:#1f2937;max-width:780px;margin:0 auto;padding:24px}
h1{font-size:24px;border-bottom:2px solid #0f766e;padding-bottom:12px}
h2{font-size:16px;margin-top:30px;color:#0f766e;border-left:3px solid #0f766e;padding-left:8px}
h3{font-size:14px;margin-top:18px}
.meta{color:#6b7280;font-size:12.5px;background:#f9fafb;padding:10px 14px;border-radius:8px}
ul{padding-left:20px} li{margin:5px 0}
.tag{display:inline-block;background:#f0fdfa;color:#0f766e;border-radius:6px;padding:1px 8px;font-size:12px;margin-right:6px}
.note{margin-top:32px;padding:14px;background:#fffbeb;border-left:3px solid #f59e0b;font-size:12px;color:#78350f}
</style></head><body>
<h1>${esc(student.name)} 的个人成长与职业发展规划</h1>
<p class="meta">周期：${esc(plan.horizon)} 年 · 版本 v${plan.version} · 状态：${esc(plan.status)} · 生成：${new Date(plan.createdAt).toLocaleString('zh-CN')}<br>
依据：${plan.analysisSignalCount || 0} 条成长记录 · 参与者：${esc((plan.participants || []).join(' / '))}${plan.professionalReviewed ? ' · 已由真人规划师（' + esc(plan.advisorName) + '）审核' : ' · 未经真人规划师审核'}</p>
<h2>一、方向愿景</h2><p>${esc(s.vision)}</p>
<h2>二、个人发展摘要</h2>
<ul>
${sum.stage ? `<li><strong>当前阶段</strong>：${esc(sum.stage)}</li>` : ''}
${sum.interests?.length ? `<li><strong>兴趣证据</strong>：${esc(sum.interests.join('、'))}</li>` : ''}
${sum.abilities?.length ? `<li><strong>已表现能力</strong>：${esc(sum.abilities.join('、'))}</li>` : ''}
${sum.values?.length ? `<li><strong>重视的价值</strong>：${esc(sum.values.join('、'))}</li>` : ''}
${sum.scope ? `<li><strong>适用范围与限制</strong>：${esc(sum.scope)}</li>` : ''}
</ul>
${sum.openQuestions?.length ? `<p><strong>仍待澄清</strong></p><ul>${sum.openQuestions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
<h2>三、多路径分析</h2>
${(s.paths || []).map((p2) => `<h3>${esc(p2.name)} <span class="tag">匹配度 ${p2.match}</span><span class="tag">${esc(p2.role)}</span></h3>
<ul><li><strong>证据关联</strong>：${esc(p2.evidence)}</li><li><strong>待验证假设</strong>：${esc(p2.toVerify)}</li><li><strong>体验任务</strong>：${esc((p2.tasks || []).join('；'))}</li>
<li><strong>需培养能力</strong>：${esc((p2.skills || []).join('、'))}</li><li><strong>可能困难</strong>：${esc(p2.difficulties)}</li><li><strong>低成本替代</strong>：${esc(p2.alternatives)}</li>
<li><strong>家长支持</strong>：${esc(p2.familySupport)}</li></ul>`).join('')}
<h2>四、分阶段路线图</h2>
${(s.phases || []).map((ph) => `<h3>阶段 ${esc(ph.code)}｜${esc(ph.title)}（${esc(ph.range)}）</h3>
<ul><li><strong>目标</strong>：${esc(ph.goal)}</li><li><strong>行动</strong>：${esc((ph.actions || []).join('；'))}</li><li><strong>预期成果</strong>：${esc((ph.deliverables || []).join('；'))}</li>
<li><strong>所需资源</strong>：${esc((ph.resources || []).join('；'))}</li><li><strong>替代路径</strong>：${esc(ph.alternatives)}</li><li><strong>评估指标</strong>：${esc((ph.metrics || []).join('；'))}</li>
<li><strong>复盘</strong>：${esc(ph.reviewAt)}</li><li><strong>调整条件</strong>：${esc(ph.adjustIf)}</li></ul>`).join('')}
<h2>五、日常行动</h2><ul>${(s.actions || []).map((a) => `<li>☐ ${esc(a.title)}（${esc(a.cadence)} · ${esc(a.owner)}）</li>`).join('')}</ul>
<h2>六、风险与应对</h2><ul>${(s.risks || []).map((r) => `<li><strong>${esc(r.risk)}</strong> → ${esc(r.response)}</li>`).join('')}</ul>
<h2>七、支持系统</h2><ul>${(s.support || []).map((p3) => `<li><strong>${esc(p3.who)}</strong>：${esc(p3.what)}</li>`).join('')}</ul>
${s.advisorNote ? `<h2>八、真人规划师意见</h2><p>${esc(s.advisorNote).replace(/\n/g, '<br>')}</p>` : ''}
<div class="note">本规划由 FuturePath AI 依据学生成长记录生成，随新证据更新；它是可修改的工作假设，不是判决，也不预测十年后的职业与收入。职业与升学信息请以官方最新发布为准。</div>
</body></html>`;
}

route('GET', '/api/plans/:id/revisions', (ctx) => {
  const plan = findOne('plans', (p) => p.id === ctx.params.id);
  if (!plan) throw notFound('规划不存在');
  assertAccess(ctx.user, plan.studentId);
  return find('planRevisions', (r) => r.studentId === plan.studentId).sort((a, b) => b.version - a.version);
});

/* ------------------------------ 付费 / 规划师 ------------------------------ */

function requireProAccess(student, user) {
  if (student.plan !== 'pro') throw forbidden('该档案未开通专业规划版');
  const consent = consentState(student.id);
  if (!consent.pro_sharing) throw forbidden('家长尚未授权向规划师共享数据');
  return true;
}

route('GET', '/api/billing/options', () => ({
  plans: [
    { id: 'free', name: '公益探索版', price: '¥0', features: ['完整探索（对话 / 情景任务 / 职业体验）', 'AI 成长画像与证据追溯', '家长讨论与基础规划', '规划导出（Markdown / 打印 / HTML）', '阶段复盘与版本历史'] },
    { id: 'pro', name: '专业规划版', price: '¥699 / 周期', features: ['公益版全部功能', '真人规划师审核 AI 结论', '多方（学生 / 家长 / AI / 规划师）协同讨论', '专业修订意见与修改理由留痕', '季度复盘', '规划师资质与审核状态可查'] }
  ],
  paymentMode: 'demo',
  note: '当前未接入任何支付渠道。所有开通均为演示模式，不会产生真实扣款，也不代表已完成真实购买。'
}), { auth: false });

route('POST', '/api/billing/checkout', (ctx) => {
  const student = assertAccess(ctx.user, ctx.body?.studentId, { write: true });
  if (ctx.user.role !== 'parent') throw forbidden('专业版需由家长开通');
  if (student.plan === 'pro') throw bad('该档案已是专业规划版');
  const order = insert('orders', {
    id: uid('or_'),
    studentId: student.id,
    guardianId: ctx.user.id,
    plan: 'pro',
    amount: 699,
    currency: 'CNY',
    status: 'demo_activated', // 明确：演示模式，非真实支付
    demo: true,
    note: '演示模式：未调用支付网关，未产生真实交易。',
    createdAt: nowISO()
  });
  update('students', student.id, { plan: 'pro' });
  recordConsent(student.id, ctx.user, { type: 'pro_sharing', granted: Boolean(ctx.body?.shareConsent), scope: '向受聘规划师共享档案（可随时撤回）' });
  const session = insert('advisorSessions', {
    id: uid('as_'),
    studentId: student.id,
    advisorId: null,
    status: 'queued',
    topic: String(ctx.body?.topic || '专业版规划审核').slice(0, 120),
    createdAt: nowISO(),
    reviewIds: []
  });
  audit(student.id, ctx.user, 'billing.demo_checkout', { orderId: order.id });
  return { order, session, paymentMode: 'demo', note: order.note };
});

route('GET', '/api/billing/orders', (ctx) => {
  const student = assertAccess(ctx.user, ctx.query.studentId);
  return find('orders', (o) => o.studentId === student.id);
});

route('POST', '/api/advisor/sessions/:id/claim', (ctx) => {
  const session = findOne('advisorSessions', (s) => s.id === ctx.params.id);
  if (!session) throw notFound('服务单不存在');
  if (ctx.user.role !== 'advisor') throw forbidden('仅规划师可接单');
  if (!ctx.user.verified) throw forbidden('规划师资质尚未审核，暂不能接单');
  if (session.advisorId && session.advisorId !== ctx.user.id) throw bad('该服务单已被其他规划师接单');
  const student = getStudent(session.studentId);
  requireProAccess(student, ctx.user);
  const updated = update('advisorSessions', session.id, { advisorId: ctx.user.id, status: 'claimed', claimedAt: nowISO() });
  audit(student.id, ctx.user, 'advisor.claim', { sessionId: session.id });
  return updated;
});

route('GET', '/api/advisor/queue', (ctx) => {
  if (ctx.user.role !== 'advisor') throw forbidden('仅规划师可访问');
  const sessions = find('advisorSessions', (s) => s.status !== 'completed')
    .filter((s) => !s.advisorId || s.advisorId === ctx.user.id)
    .map((s) => {
      const student = getStudent(s.studentId);
      return {
        ...s,
        student: student ? { id: student.id, name: student.name, ageBand: student.ageBand, grade: student.grade, plan: student.plan } : null,
        consent: student ? consentState(student.id).pro_sharing : false
      };
    });
  return { sessions, verified: ctx.user.verified, profile: publicUser(ctx.user) };
});

route('GET', '/api/advisor/sessions/:id', (ctx) => {
  const session = findOne('advisorSessions', (s) => s.id === ctx.params.id);
  if (!session) throw notFound('服务单不存在');
  if (ctx.user.role !== 'advisor') throw forbidden('仅规划师可访问');
  if (session.advisorId && session.advisorId !== ctx.user.id) throw forbidden('该服务单由其他规划师负责');
  const student = getStudent(session.studentId);
  requireProAccess(student, ctx.user);
  const analysis = find('analyses', (a) => a.studentId === student.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const plan = latestPlan(student.id);
  audit(student.id, ctx.user, 'advisor.view_dossier', { sessionId: session.id });
  return {
    session,
    student: { ...student, consents: consentState(student.id) },
    analysis,
    plan,
    signals: listSignals(student.id).slice(-40).reverse(),
    parentObservations: find('signals', (s) => s.studentId === student.id && s.source === 'parent'),
    discussion: find('conversations', (c) => c.studentId === student.id && c.kind === 'discussion'),
    dossier: buildDossier(student, analysis, plan),
    reviews: find('professionalReviews', (r) => r.studentId === student.id).sort((a, b) => new Date(b.at) - new Date(a.at))
  };
});

function buildDossier(student, analysis, plan) {
  if (!analysis) {
    return { ready: false, blockers: ['尚无 AI 分析报告：请先让学生完成探索并生成画像。'] };
  }
  const disputes = (analysis.acknowledgements || []).filter((a) => a.action === 'dispute');
  return {
    ready: true,
    stage: `${student.grade} · ${student.ageBand} 岁段`,
    dataRange: analysis.dataRange,
    signalCount: analysis.signalCount,
    topDimensions: analysis.profileSnapshot.dimensions.slice().sort((a, b) => b.score - a.score).slice(0, 3),
    abilities: analysis.profileSnapshot.abilities.filter((a) => a.count > 0),
    values: analysis.profileSnapshot.values,
    studentDisputes: disputes,
    hypotheses: analysis.hypotheses,
    paths: (analysis.careerMatches || []).slice(0, 3).map((c) => ({ name: c.name, match: c.match, why: c.why, gaps: c.gaps, path: c.path })),
    missingInfo: analysis.caveats,
    questionsForAdvisor: [
      '现有证据是否足以支撑排名前两位的发展方向？',
      '哪些结论属于推断而非事实，需要向家长明确说明？',
      '以该生所在地区的升学与就业条件，哪条路径最现实？',
      '是否存在被忽略的低成本替代路径？'
    ],
    planVersion: plan ? `v${plan.version}（${plan.status}）` : '尚未生成规划'
  };
}

route('POST', '/api/advisor/sessions/:id/review', (ctx) => {
  const session = findOne('advisorSessions', (s) => s.id === ctx.params.id);
  if (!session) throw notFound('服务单不存在');
  if (ctx.user.role !== 'advisor' || !ctx.user.verified) throw forbidden('仅已认证规划师可提交审核意见');
  if (session.advisorId !== ctx.user.id) throw forbidden('请先接单');
  const student = getStudent(session.studentId);
  requireProAccess(student, ctx.user);
  requireFields(ctx.body, ['assessment']);

  const review = insert('professionalReviews', {
    id: uid('rv_'),
    studentId: student.id,
    sessionId: session.id,
    advisorId: ctx.user.id,
    advisorName: ctx.user.displayName || ctx.user.name,
    credential: ctx.user.credential || '未填写资质',
    at: nowISO(),
    assessment: String(ctx.body.assessment).slice(0, 3000),
    agreements: ctx.body.agreements || [],
    corrections: (ctx.body.corrections || []).slice(0, 10).map((c) => ({ target: String(c.target || '').slice(0, 120), reason: String(c.reason || '').slice(0, 500), revised: String(c.revised || '').slice(0, 500) })),
    risks: (ctx.body.risks || []).slice(0, 8).map(String),
    nextSteps: (ctx.body.nextSteps || []).slice(0, 8).map(String)
  });

  const plan = latestPlan(student.id);
  if (plan) {
    const note = `【真人规划师 ${ctx.user.displayName || ctx.user.name} · ${new Date(review.at).toLocaleDateString('zh-CN')}】${review.assessment}${review.corrections.length ? '\n修订：' + review.corrections.map((c) => `${c.target} → ${c.revised}`).join('；') : ''}`;
    insert('planRevisions', {
      id: uid('pr_'), studentId: student.id, planId: plan.id, version: plan.version + 1,
      at: nowISO(), by: 'advisor', byName: ctx.user.name, note: '真人规划师审核意见并入方案',
      changedFields: ['advisorNote']
    });
    update('plans', plan.id, {
      version: plan.version + 1,
      professionalReviewed: true,
      advisorName: ctx.user.displayName || ctx.user.name,
      advisorCredential: ctx.user.credential || '未填写资质',
      sections: { ...plan.sections, advisorNote: note },
      status: 'pending_confirm',
      confirmations: []
    });
  }
  update('advisorSessions', session.id, { status: 'reviewed', reviewIds: [...(session.reviewIds || []), review.id], reviewedAt: nowISO() });
  audit(student.id, ctx.user, 'advisor.review', { reviewId: review.id });
  return { review, session: findOne('advisorSessions', (s) => s.id === session.id) };
});

route('POST', '/api/advisor/sessions/:id/complete', (ctx) => {
  const session = findOne('advisorSessions', (s) => s.id === ctx.params.id);
  if (!session) throw notFound('服务单不存在');
  if (ctx.user.role !== 'advisor' || session.advisorId !== ctx.user.id) throw forbidden('无权完成该服务单');
  if (session.status !== 'reviewed') throw bad('请先提交审核意见');
  const updated = update('advisorSessions', session.id, { status: 'completed', completedAt: nowISO() });
  audit(session.studentId, ctx.user, 'advisor.complete', { sessionId: session.id });
  return updated;
});

/* -------------------------------- AI 导师端 -------------------------------- */

route('GET', '/api/mentor/overview', (ctx) => {
  const students = accessibleStudents(ctx.user);
  const board = students.map((s) => {
    const analysis = find('analyses', (a) => a.studentId === s.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const plan = latestPlan(s.id);
    const signals = listSignals(s.id);
    const newest = signals[signals.length - 1]?.createdAt || 0;
    return {
      student: { id: s.id, name: s.name, ageBand: s.ageBand, grade: s.grade, plan: s.plan },
      progress: progressOf(s.id),
      analysis: analysis ? {
        id: analysis.id, createdAt: analysis.createdAt, confidence: analysis.confidence,
        hypotheses: analysis.hypotheses, disputes: (analysis.acknowledgements || []).filter((a) => a.action === 'dispute'),
        stale: new Date(newest) > new Date(analysis.createdAt)
      } : null,
      pendingVerifications: analysis ? analysis.hypotheses.filter((h) => h.confidence !== 'high').length : 0,
      plan: plan ? { id: plan.id, version: plan.version, status: plan.status } : null,
      nextAction: nextBestAction(s, analysis, signals)
    };
  });
  return {
    ai: aiStatus(),
    board,
    totals: {
      students: students.length,
      signals: board.reduce((a, b) => a + b.progress.signals, 0),
      pendingHypotheses: board.reduce((a, b) => a + b.pendingVerifications, 0),
      staleAnalyses: board.filter((b) => b.analysis?.stale).length
    },
    followUpQueue: board.filter((b) => b.analysis?.stale || !b.analysis).slice(0, 6)
  };
});

function nextBestAction(student, analysis, signals) {
  if (signals.length < 3) return '先完成 3 个对话问题（证据太少，任何结论都不可靠）';
  if (!analysis) return '生成第一份成长画像';
  if (new Date(signals[signals.length - 1]?.createdAt || 0) > new Date(analysis.createdAt)) return '有新证据，建议重新分析';
  if (analysis.hypotheses.some((h) => h.confidence === 'low')) return '补一条能证伪弱假设的证据';
  if (student.plan === 'free' && analysis.signalCount >= 8) return '可提示家长：已具备进入规划讨论的条件';
  return '进入家长讨论，确认分歧点';
}

/* --------------------------------- 公益 --------------------------------- */

const DEMO_PROGRAMS = [
  { id: 'wpf-001', name: '县域学校生涯探索计划', org: '示例公益机构 A（演示数据）', region: '西南县域中学', status: 'demo', slots: 200, joined: 0, desc: '为县域中学提供 8 课时生涯探索课程与 AI 工具账号。' },
  { id: 'wpf-002', name: '高原地区低带宽学习支持', org: '示例公益机构 B（演示数据）', region: '西藏自治区', status: 'demo', slots: 120, joined: 0, desc: '面向低带宽地区提供轻量模式与离线材料包。' },
  { id: 'wpf-003', name: '志愿者生涯陪伴计划', org: '示例志愿服务队（演示数据）', region: '全国', status: 'demo', slots: 80, joined: 0, desc: '志愿者 1 对 1 陪伴学生完成首次探索与复盘。' }
];

route('GET', '/api/welfare/programs', () => ({
  programs: DEMO_PROGRAMS.map((p) => ({ ...p, joined: find('welfareRecords', (r) => r.programId === p.id).length })),
  disclaimer: '以上合作机构与项目均为演示数据，不代表已建立真实合作关系，也未执行任何真实公益服务。接入真实合作方前不得对外宣称。'
}), { auth: false });

route('GET', '/api/welfare/stats', () => {
  const records = table('welfareRecords');
  return {
    demo: true,
    totalApplications: records.length,
    byProgram: DEMO_PROGRAMS.map((p) => ({ id: p.id, name: p.name, count: records.filter((r) => r.programId === p.id).length })),
    lowBandwidthUsers: find('students', (s) => s.lowBandwidth && !s.guest).length,
    note: '统计仅覆盖本演示实例内的数据，不代表真实公益项目执行情况。'
  };
}, { auth: false });

route('POST', '/api/welfare/redeem', (ctx) => {
  const student = assertAccess(ctx.user, ctx.body?.studentId, { write: true });
  const code = String(ctx.body?.code || '').trim().toUpperCase();
  if (!/^FP-(DEMO|PUB)-\d{3,6}$/.test(code)) throw bad('邀请码格式不正确（演示码示例：FP-DEMO-001）');
  const program = DEMO_PROGRAMS.find((p) => code.includes(p.id.slice(-3))) || DEMO_PROGRAMS[0];
  const rec = insert('welfareRecords', {
    studentId: student.id, programId: program.id, code, status: 'demo_redeemed',
    demo: true, at: nowISO(), note: '演示模式：未与任何公益机构系统对接。'
  });
  update('students', student.id, { inviteCode: code });
  audit(student.id, ctx.user, 'welfare.redeem', { code, programId: program.id });
  return { record: rec, program, note: '演示模式，仅在本实例内记录。' };
});

/* ------------------------------- 报告组装 ------------------------------- */

route('GET', '/api/students/:id/report', (ctx) => {
  const student = assertAccess(ctx.user, ctx.params.id);
  const analysis = find('analyses', (a) => a.studentId === student.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const plan = latestPlan(student.id);
  const observations = find('signals', (s) => s.studentId === student.id && s.source === 'parent');
  const feedback = find('parentFeedback', (p) => p.studentId === student.id);
  const reviews = find('professionalReviews', (r) => r.studentId === student.id);
  const signals = listSignals(student.id);
  return {
    generatedAt: nowISO(),
    student: { ...student, consents: consentState(student.id) },
    progress: progressOf(student.id),
    analysis: analysis || null,
    plan: plan || null,
    evidence: signals.slice(-60).reverse(),
    parentObservations: observations,
    parentFeedback: feedback,
    professionalReviews: reviews,
    participants: plan?.participants || ['学生', '家长', 'AI 导师'],
    versions: find('plans', (p) => p.studentId === student.id).map((p) => ({ version: p.version, status: p.status, createdAt: p.createdAt, horizon: p.horizon })),
    disclaimer: [
      '本报告基于学生自述、行为选择与家长观察计算，不构成心理诊断或职业能力测评结论。',
      '所有职业与升学信息随政策与市场变化，请以官方最新发布为准。',
      aiStatus().live ? '叙述文本由配置的大模型生成，评分与证据由本地引擎计算。' : '当前为模拟模式：由内置规则引擎生成，未调用真实大模型。',
      '未成年人数据仅在监护人授权范围内使用，可随时导出或删除。'
    ]
  };
});

/* ------------------------------- 路由分发 ------------------------------- */

export async function handleApi(req, res, url, body) {
  const pathname = url.pathname.replace(/\/$/, '') || '/api';
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const ctx = { req, res, params, query: Object.fromEntries(url.searchParams), body: body || {}, user: null };
    try {
      if (r.auth) {
        ctx.user = authUser(req);
        if (!ctx.user) throw unauthorized();
        if (r.roles && !r.roles.includes(ctx.user.role)) throw forbidden();
      }
      const out = await r.handler(ctx);
      return out;
    } catch (err) {
      err.status = err.status || 500;
      if (err.status >= 500) console.error('[api]', req.method, pathname, err);
      throw err;
    }
  }
  throw notFound(`接口不存在：${req.method} ${pathname}`);
}
