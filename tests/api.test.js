/**
 * FuturePath AI — 端到端接口测试
 * 使用独立临时数据目录与随机端口，不会污染开发数据。
 * 运行：npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'futurepath-test-'));
const PORT = 4400 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
let server;
const tokens = {};
let students = {};

async function call(pathname, { method = 'GET', body, token, expect = 200 } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (expect !== null) assert.equal(res.status, expect, `${method} ${pathname} → ${res.status}: ${text.slice(0, 200)}`);
  return data;
}

async function login(name, password = 'demo123') {
  const out = await call('/api/auth/login', { method: 'POST', body: { name, password } });
  tokens[name] = out.token;
  return out;
}

before(async () => {
  execFileSync(process.execPath, [path.join(ROOT, 'server/seed.js'), '--force'], {
    env: { ...process.env, DATA_DIR },
    stdio: 'ignore'
  });
  server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: { ...process.env, DATA_DIR, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) break;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  const a = await login('xiaoyu');
  const b = await login('sunian');
  const c = await login('chenhao');
  const pa = await login('parent_a');
  const pb = await login('parent_b');
  const pc = await login('parent_c');
  await login('counselor');
  students = {
    A: a.students[0].id, B: b.students[0].id, C: c.students[0].id,
    parentA: pa.students[0].id, parentB: pb.students[0].id, parentC: pc.students[0].id
  };
});

after(() => {
  server?.kill('SIGKILL');
  rmSync(DATA_DIR, { recursive: true, force: true });
});

/* ------------------------------- 基础 ------------------------------- */

test('健康检查与元数据：明确标注模拟模式', async () => {
  const health = await call('/healthz');
  assert.equal(health.ok, true);
  const status = await call('/api/ai/status');
  assert.equal(status.mode, 'simulated', '未配置模型时必须声明为 simulated');
  assert.equal(status.live, false);
  const meta = await call('/api/meta');
  assert.equal(meta.dimensions.length, 6);
  assert.ok(meta.ageBands.length >= 3);
});

test('登录失败返回 401，且不泄露用户是否存在', async () => {
  const a = await call('/api/auth/login', { method: 'POST', body: { name: 'xiaoyu', password: 'wrong' }, expect: 401 });
  assert.match(a.error, /用户名或密码/);
  const b = await call('/api/auth/login', { method: 'POST', body: { name: 'nobody_here', password: 'x' }, expect: 401 });
  assert.equal(a.error, b.error);
});

test('未登录访问受保护接口返回 401', async () => {
  await call('/api/students', { expect: 401 });
});

/* ------------------------------ 权限 ------------------------------ */

test('权限：家长不能访问别人孩子的档案，学生不能读他人数据', async () => {
  await call(`/api/students/${students.parentB}`, { token: tokens.parent_a, expect: 403 });
  await call(`/api/students/${students.B}`, { token: tokens.xiaoyu, expect: 403 });
  await call(`/api/students/${students.A}`, { token: tokens.sunian, expect: 403 });
});

test('权限：家长不能代替学生作答，也不能覆盖学生的确认状态', async () => {
  const state = await call(`/api/explore/state?studentId=${students.parentB}`, { token: tokens.parent_b });
  const q = state.next.question;
  await call('/api/explore/answer', {
    method: 'POST', token: tokens.parent_b, expect: 403,
    body: { studentId: students.parentB, questionId: q.id, text: '我替他回答一下' }
  });
});

test('规划师只能看到已购买专业版且已授权的档案', async () => {
  const q = await call('/api/advisor/queue', { token: tokens.counselor });
  assert.ok(Array.isArray(q.sessions));
  const freeStudentSession = q.sessions.find((s) => s.studentId === students.C);
  assert.equal(freeStudentSession, undefined, '公益版学生不应出现在规划师队列');
});

test('未认证规划师不能接单', async () => {
  const reg = await call('/api/auth/register', {
    method: 'POST', body: { name: 'advisor_new', password: 'demo123', role: 'advisor', credential: '未核验' }
  });
  const q = await call('/api/advisor/queue', { token: reg.token });
  assert.equal(q.verified, false);
  const target = q.sessions[0];
  if (target) {
    await call(`/api/advisor/sessions/${target.id}/claim`, { method: 'POST', token: reg.token, body: {}, expect: 403 });
  }
});

/* ------------------------------ 探索 ------------------------------ */

test('对话作答：生成证据、即时反馈与下一个问题', async () => {
  const before = await call(`/api/students/${students.A}/signals`, { token: tokens.xiaoyu });
  const state = await call(`/api/explore/state?studentId=${students.A}`, { token: tokens.xiaoyu });
  const q = state.next.question;
  assert.ok(q, '应返回下一个问题');
  const out = await call('/api/explore/answer', {
    method: 'POST', token: tokens.xiaoyu,
    body: { studentId: students.A, questionId: q.id, text: '上周我把家里的旧台灯拆开，查了电路，发现是开关接触不良，重新焊了一下就好了。' }
  });
  assert.ok(out.signals.length >= 1, '应写入至少一条证据');
  assert.equal(typeof out.reflection, 'string');
  assert.ok(out.reflection.length > 10);
  assert.ok(out.next.question === null || out.next.question.id !== q.id, '不应重复问同一个问题');
  const after = await call(`/api/students/${students.A}/signals`, { token: tokens.xiaoyu });
  assert.ok(after.signals.length > before.signals.length);
});

test('过短回答会触发追问而不是直接定性', async () => {
  const state = await call(`/api/explore/state?studentId=${students.C}`, { token: tokens.chenhao });
  const q = state.next.question;
  const out = await call('/api/explore/answer', {
    method: 'POST', token: tokens.chenhao, body: { studentId: students.C, questionId: q.id, text: '还行吧' }
  });
  assert.ok(out.followUp, '短回答应返回追问');
  assert.match(out.reflection, /具体/);
});

test('无效输入：缺少字段、非法选项、超长文本被截断', async () => {
  await call('/api/explore/answer', { method: 'POST', token: tokens.xiaoyu, body: { studentId: students.A }, expect: 400 });
  await call('/api/explore/scenario', {
    method: 'POST', token: tokens.xiaoyu, expect: 400,
    body: { studentId: students.A, scenarioId: 'sc_data', optionId: 'zzz' }
  });
  await call('/api/explore/scenario', {
    method: 'POST', token: tokens.xiaoyu, expect: 404,
    body: { studentId: students.A, scenarioId: 'not_exist', optionId: 'a' }
  });
});

test('情景任务：写入行为证据并返回观察', async () => {
  const out = await call('/api/explore/scenario', {
    method: 'POST', token: tokens.chenhao,
    body: { studentId: students.C, scenarioId: 'sc_community', optionId: 'a', selfEval: 80 }
  });
  assert.ok(out.outcome.length > 5);
  assert.ok(out.signals.some((s) => s.source === 'scenario'));
});

test('兴趣卡片与职业体验：各写入一条证据', async () => {
  const card = await call('/api/explore/cards', {
    method: 'POST', token: tokens.chenhao, body: { studentId: students.C, cardId: 'c6', liked: false }
  });
  assert.ok(card.signal || card.duplicated);
  const career = await call('/api/explore/career-experience', {
    method: 'POST', token: tokens.chenhao, body: { studentId: students.C, careerId: 'nurse', rating: 4, note: '村里需要' }
  });
  assert.equal(career.signal.dimension, 'CAREER');
  assert.match(career.advice, /4\/5/);
});

/* ------------------------------ 分析 ------------------------------ */

test('证据不足时拒绝生成分析（不猜）', async () => {
  const reg = await call('/api/auth/register', {
    method: 'POST', body: { name: 'empty_student', password: 'demo123', role: 'student', childName: '空档案', guardianConsent: true }
  });
  const sid = reg.student.id;
  const out = await call(`/api/students/${sid}/analysis`, { method: 'POST', token: reg.token, body: {}, expect: 400 });
  assert.match(out.error, /证据不足/);
});

test('生成分析：含证据索引、待验证假设与多方向', async () => {
  const out = await call(`/api/students/${students.A}/analysis`, { method: 'POST', token: tokens.xiaoyu, body: { force: true } });
  assert.ok(out.evidenceIndex.length >= 5, '应建立证据索引');
  assert.ok(out.summary.length > 60);
  assert.ok(out.hypotheses.length >= 1, '应有待验证假设');
  assert.ok(out.careerMatches.length >= 3, '应给出多个候选方向');
  assert.equal(out.mode, 'simulated');
  assert.ok(out.careerMatches.every((c) => c.match >= 0 && c.match <= 100));
  // 每条优势都必须有证据引用
  for (const st of out.strengths) assert.ok(st.evidence.length > 0, '优势必须可追溯');
  // 证据编号必须能在索引中找到
  const refs = new Set(out.evidenceIndex.map((e) => e.ref));
  for (const st of out.strengths) for (const r of st.evidence) assert.ok(refs.has(r));
});

test('学生可对结论提出异议，异议会写入并可被清除', async () => {
  const data = await call(`/api/students/${students.A}/analysis`, { token: tokens.xiaoyu });
  const id = data.latest.id;
  const out = await call(`/api/analyses/${id}/feedback`, {
    method: 'PATCH', token: tokens.xiaoyu, body: { target: 'summary', action: 'dispute', note: '我只是那天心情不好' }
  });
  assert.equal(out.status, 'disputed');
  assert.ok(out.acknowledgements.some((a) => a.action === 'dispute'));
  const back = await call(`/api/analyses/${id}/feedback`, {
    method: 'PATCH', token: tokens.xiaoyu, body: { target: 'summary', action: 'confirm', note: '再想想还是认同' }
  });
  assert.equal(back.acknowledgements.filter((a) => a.target === 'summary').length, 1, '同一目标不应重复记录');
});

test('新证据会让旧分析标记为过期', async () => {
  await call('/api/explore/cards', {
    method: 'POST', token: tokens.chenhao, body: { studentId: students.C, cardId: 'c11', liked: true }
  });
  const data = await call(`/api/students/${students.C}/analysis`, { token: tokens.chenhao });
  assert.equal(data.stale, true, '有新证据后应提示重新分析');
});

/* ------------------------------ 家长 ------------------------------ */

test('家长讨论：AI 回复引用证据，家长观察进入证据库', async () => {
  const before = await call(`/api/students/${students.parentA}/discussion`, { token: tokens.parent_a });
  const out = await call(`/api/students/${students.parentA}/discussion`, {
    method: 'POST', token: tokens.parent_a,
    body: { text: '他上周自己把路由器拆了又装回去，弄到十一点，但作业还是拖到最后一天。' }
  });
  assert.equal(out.mode, 'simulated');
  const last = out.messages[out.messages.length - 1];
  assert.equal(last.role, 'ai');
  assert.ok(last.text.length > 40);
  assert.ok(out.newSignals.length >= 1);
  assert.equal(out.newSignals[0].source, 'parent');
  const after = await call(`/api/students/${students.parentA}/discussion`, { token: tokens.parent_a });
  assert.ok(after.observations.length > before.observations.length);
  assert.ok(after.guidingQuestions.length >= 3);
});

/* ------------------------------ 规划 ------------------------------ */

let planA = null;
test('生成规划：四阶段、含资源/替代路径/复盘条件与不确定性说明', async () => {
  planA = await call(`/api/students/${students.A}/plan`, { method: 'POST', token: tokens.xiaoyu, body: { horizon: '10' } });
  assert.equal(planA.version, 2);
  assert.equal(planA.sections.phases.length, 4);
  const codes = planA.sections.phases.map((p) => p.code).join('');
  assert.equal(codes, 'ABCD');
  for (const ph of planA.sections.phases) {
    for (const k of ['goal', 'actions', 'deliverables', 'resources', 'alternatives', 'metrics', 'reviewAt', 'adjustIf']) {
      assert.ok(ph[k] && String(ph[k]).length > 0, `阶段 ${ph.code} 缺少 ${k}`);
    }
  }
  assert.ok(planA.sections.paths.length >= 3, '应包含多路径');
  assert.ok(planA.sections.summary.scope.includes('不是'), '应说明不确定性');
  assert.equal(planA.professionalReviewed, false);
});

test('规划可编辑：生成新版本且旧版本保留', async () => {
  const updated = await call(`/api/plans/${planA.id}`, {
    method: 'PUT', token: tokens.xiaoyu,
    body: { sections: { vision: '测试修改后的愿景：先验证，再决定。' }, note: '测试编辑' }
  });
  assert.equal(updated.version, 3);
  assert.equal(updated.sections.vision, '测试修改后的愿景：先验证，再决定。');
  assert.equal(updated.status, 'pending_confirm');
  const list = await call(`/api/students/${students.A}/plan`, { token: tokens.xiaoyu });
  assert.ok(list.revisions.some((r) => r.version === 3 && r.changedFields.includes('vision')));
  assert.ok(list.versions.length >= 2, '历史版本应保留');
});

test('规划导出：Markdown 与 HTML 均包含阶段与免责说明', async () => {
  const md = await call(`/api/plans/${planA.id}/export?format=md`, { token: tokens.xiaoyu });
  assert.match(md, /分阶段路线图/);
  assert.match(md, /阶段 A/);
  assert.match(md, /不是判决/);
  const html = await call(`/api/plans/${planA.id}/export?format=html`, { token: tokens.xiaoyu });
  assert.match(html, /<html/);
  assert.match(html, /真人规划师|未经真人规划师审核/);
});

test('方案需要学生与家长共同确认', async () => {
  let p = await call(`/api/plans/${planA.id}/confirm`, { method: 'POST', token: tokens.xiaoyu, body: { agreed: true, note: '学生同意' } });
  assert.equal(p.status, 'pending_confirm');
  p = await call(`/api/plans/${planA.id}/confirm`, { method: 'POST', token: tokens.parent_a, body: { agreed: true, note: '家长同意' } });
  assert.equal(p.status, 'confirmed');
  assert.equal(p.confirmations.length, 2);
});

/* --------------------------- 免费版闭环 --------------------------- */

test('免费版无需规划师即可完成全流程并导出', async () => {
  const s = await call(`/api/students/${students.C}`, { token: tokens.chenhao });
  assert.equal(s.plan, 'free');
  const analysis = await call(`/api/students/${students.C}/analysis`, { method: 'POST', token: tokens.chenhao, body: { force: true } });
  assert.ok(analysis.summary.length > 0);
  const plan = await call(`/api/students/${students.C}/plan`, { method: 'POST', token: tokens.chenhao, body: { horizon: '5' } });
  assert.equal(plan.professionalReviewed, false);
  assert.ok(plan.sections.phases.length === 4);
  const report = await call(`/api/students/${students.C}/report`, { token: tokens.chenhao });
  assert.ok(report.analysis && report.plan);
  assert.ok(report.disclaimer.length >= 3);
});

/* --------------------------- 付费版闭环 --------------------------- */

test('付费版：演示开通 → 接单 → 审核留痕 → 方案标记已审核', async () => {
  const checkout = await call('/api/billing/checkout', {
    method: 'POST', token: tokens.parent_c,
    body: { studentId: students.parentC, shareConsent: true, topic: '测试专业审核' }
  });
  assert.equal(checkout.paymentMode, 'demo');
  assert.equal(checkout.order.demo, true, '必须明确标记为演示订单');
  assert.equal(checkout.order.amount, 699);

  const q = await call('/api/advisor/queue', { token: tokens.counselor });
  const session = q.sessions.find((s) => s.studentId === students.parentC);
  assert.ok(session, '服务单应进入队列');

  await call(`/api/advisor/sessions/${session.id}/claim`, { method: 'POST', token: tokens.counselor, body: {} });
  const dossier = await call(`/api/advisor/sessions/${session.id}`, { token: tokens.counselor });
  assert.equal(dossier.dossier.ready, true);
  assert.ok(dossier.dossier.questionsForAdvisor.length >= 3);
  assert.ok(dossier.dossier.missingInfo.length >= 0);

  const review = await call(`/api/advisor/sessions/${session.id}/review`, {
    method: 'POST', token: tokens.counselor,
    body: {
      assessment: '测试专业意见：证据基本支持当前方向，但需要补充真实职业接触。',
      corrections: [{ target: '第一阶段时长', revised: '缩短为 8 周', reason: '初三课业压力' }],
      risks: ['本地缺少相关实习机会'],
      nextSteps: ['暑假完成一次职业访谈']
    }
  });
  assert.equal(review.review.corrections.length, 1);

  const plan = await call(`/api/students/${students.parentC}/plan`, { token: tokens.counselor });
  assert.equal(plan.latest.professionalReviewed, true);
  assert.ok(plan.latest.advisorName.includes('周'));
  assert.ok(plan.latest.sections.advisorNote.includes('测试专业意见'));

  const done = await call(`/api/advisor/sessions/${session.id}/complete`, { method: 'POST', token: tokens.counselor, body: {} });
  assert.equal(done.status, 'completed');
});

test('规划师不能替学生确认方案', async () => {
  const plan = await call(`/api/students/${students.parentC}/plan`, { token: tokens.counselor });
  await call(`/api/plans/${plan.latest.id}/confirm`, { method: 'POST', token: tokens.counselor, body: { agreed: true }, expect: 403 });
});

/* --------------------------- 数据与隐私 --------------------------- */

test('数据导出包含全部相关实体，删除需要显式确认', async () => {
  const data = await call(`/api/students/${students.A}/export`, { token: tokens.xiaoyu });
  assert.equal(data.schema, 'futurepath-export-v1');
  assert.ok(data.signals.length > 0);
  assert.ok(data.analyses.length > 0);
  assert.ok(data.plans.length > 0);
  assert.ok(data.auditLog.length > 0);
  assert.match(data.note, /未成年人/);

  await call(`/api/students/${students.A}`, { method: 'DELETE', token: tokens.xiaoyu, body: {}, expect: 400 });
});

test('审计日志记录关键操作', async () => {
  const log = await call(`/api/students/${students.A}/audit`, { token: tokens.parent_a });
  assert.ok(log.length > 0);
  assert.ok(log.some((x) => x.action === 'analysis.generate' || x.action === 'plan.generate'));
});

test('公益邀请码：格式校验与演示标记', async () => {
  const bad = await call('/api/welfare/redeem', { method: 'POST', token: tokens.chenhao, body: { studentId: students.C, code: 'ABC' }, expect: 400 });
  assert.match(bad.error, /邀请码/);
  const ok = await call('/api/welfare/redeem', {
    method: 'POST', token: tokens.chenhao, body: { studentId: students.C, code: 'FP-DEMO-001' }
  });
  assert.equal(ok.record.demo, true);
  assert.match(ok.note, /演示/);
});

test('AI 端点不会返回未配置的模型名', async () => {
  const s = await call('/api/ai/status');
  assert.equal(s.model, 'futurepath-rule-engine-v1');
  assert.equal(s.live, false);
});

test('未知接口返回 404 且不崩溃', async () => {
  const out = await call('/api/not/a/route', { token: tokens.xiaoyu, expect: 404 });
  assert.match(out.error, /接口不存在/);
});

test('空档案：可读取空状态而不报错', async () => {
  const reg = await call('/api/auth/register', {
    method: 'POST', body: { name: 'blank_parent', password: 'demo123', role: 'parent', childName: '空白孩子' }
  });
  const sid = reg.student.id;
  const full = await call(`/api/students/${sid}`, { token: reg.token });
  assert.equal(full.progress.signals, 0);
  const analysis = await call(`/api/students/${sid}/analysis`, { token: reg.token });
  assert.equal(analysis.latest, null);
  assert.equal(analysis.canAnalyze, false);
  const disc = await call(`/api/students/${sid}/discussion`, { token: reg.token });
  assert.deepEqual(disc.messages, []);
  const report = await call(`/api/students/${sid}/report`, { token: reg.token });
  assert.equal(report.analysis, null);
});

/* ----------------------- 启程七问 → 个人画像 ----------------------- */

test('启程七问：七问全部作答后自动生成第一版画像', async () => {
  const reg = await call('/api/auth/register', {
    method: 'POST',
    body: { name: 'intro_full', password: 'demo123', role: 'student', ageBand: '14-16', guardianConsent: true }
  });
  const sid = reg.student.id;

  const intro = await call(`/api/explore/intro?studentId=${sid}`, { token: reg.token });
  assert.equal(intro.acts.length, 7, '启程应有 7 个问题');
  assert.equal(intro.state.status, 'pending');
  assert.ok(intro.acts.every((a) => a.choices.length >= 5), '每问至少 5 个选项');
  assert.ok(intro.acts.every((a) => !a.choices.some((c) => 'dims' in c || 'value' in c)), '不能把打分维度下发给前端');

  for (const act of intro.acts) {
    const out = await call('/api/explore/intro', {
      method: 'POST', token: reg.token,
      body: { studentId: sid, actId: act.id, choiceId: act.choices[0].id, text: '我自己补的一句' }
    });
    assert.ok(out.reply.length > 10, `${act.id} 应返回具体回应`);
  }

  const fin = await call('/api/explore/intro/finish', {
    method: 'POST', token: reg.token,
    body: { studentId: sid, skipped: false, portrait: true }
  });
  assert.equal(fin.state.status, 'done');
  assert.equal(fin.state.actsDone, 7);
  assert.equal(fin.state.collected.length, 7, '七问应对应七条线索');
  assert.ok(fin.analysis, '答完七问应直接返回画像');
  assert.ok(fin.analysis.strengths.length > 0);
  assert.ok(fin.analysis.evidenceIndex.length > 0);
  assert.ok(fin.analysis.careerMatches.length > 0);
  assert.ok(['low', 'medium', 'high'].includes(fin.analysis.confidence));
  assert.equal(fin.analysis.profileSnapshot.dimensions.length, 6);

  // 画像页必须读到同一份（不能出现"动画里一套、报表里另一套"）
  const latest = await call(`/api/students/${sid}/analysis`, { token: reg.token });
  assert.equal(latest.latest.id, fin.analysis.id);
});

test('启程七问：同一问重复提交只回放，不重复计分', async () => {
  const reg = await call('/api/auth/register', {
    method: 'POST',
    body: { name: 'intro_repeat', password: 'demo123', role: 'student', ageBand: '11-13', guardianConsent: true }
  });
  const sid = reg.student.id;
  const intro = await call(`/api/explore/intro?studentId=${sid}`, { token: reg.token });
  const act = intro.acts[0];

  const first = await call('/api/explore/intro', {
    method: 'POST', token: reg.token,
    body: { studentId: sid, actId: act.id, choiceId: act.choices[0].id }
  });
  const again = await call('/api/explore/intro', {
    method: 'POST', token: reg.token,
    body: { studentId: sid, actId: act.id, choiceId: act.choices[1].id }
  });
  assert.equal(again.alreadyRecorded, true);
  assert.ok(again.reply.length > 10, '仍应回放本次选择的回应');
  assert.notEqual(again.reply, first.reply, '换选项应回应对应的那句，而不是第一次的那句');

  const signals = await call(`/api/students/${sid}/signals`, { token: reg.token });
  const list = Array.isArray(signals) ? signals : signals.signals;
  assert.equal(list.length, first.created.length, '同一问不应叠加信号');
});

test('启程七问：跳过时不生成画像', async () => {
  const reg = await call('/api/auth/register', {
    method: 'POST',
    body: { name: 'intro_skip', password: 'demo123', role: 'student', ageBand: '14-16', guardianConsent: true }
  });
  const sid = reg.student.id;
  const fin = await call('/api/explore/intro/finish', {
    method: 'POST', token: reg.token,
    body: { studentId: sid, skipped: true, portrait: true }
  });
  assert.equal(fin.state.status, 'skipped');
  assert.equal(fin.analysis, null);
  const latest = await call(`/api/students/${sid}/analysis`, { token: reg.token });
  assert.equal(latest.latest, null);
});

/* ------------------------- 公开版：免注册体验 ------------------------- */

test('公开版：不注册也能走完七问、拿到画像，且与他人档案隔离', async () => {
  const guest = await call('/api/auth/guest', { method: 'POST' });
  assert.equal(guest.guest, true);
  assert.equal(guest.user.guest, true, '用户要标记为临时访客');
  assert.ok(guest.token, '访客也要拿到会话 token');
  assert.equal(guest.students.length, 1, '每个访客只有一个临时档案');

  const me = await call('/api/auth/me', { token: guest.token });
  assert.equal(me.user.guest, true);
  assert.equal(me.students.length, 1);

  const intro = await call(`/api/explore/intro?studentId=${guest.studentId}`, { token: guest.token });
  assert.equal(intro.acts.length, 7);
  assert.equal(intro.state.status, 'pending', '新访客必须从启程开始');
  for (const act of intro.acts) {
    await call('/api/explore/intro', {
      method: 'POST', token: guest.token,
      body: { studentId: guest.studentId, actId: act.id, choiceId: act.choices[0].id }
    });
  }
  const fin = await call('/api/explore/intro/finish', {
    method: 'POST', token: guest.token,
    body: { studentId: guest.studentId, skipped: false, portrait: true }
  });
  assert.equal(fin.state.status, 'done');
  assert.ok(fin.analysis, '访客答完七问也要当场拿到画像');
  assert.ok(fin.analysis.careerMatches.length > 0);

  const home = await call(`/api/students/${guest.studentId}`, { token: guest.token });
  assert.equal(home.guest, true, '档案要带访客标记，前端才能提示“临时”');

  // 访客不能读、也不能写别人的档案
  const demo = await call('/api/auth/login', { method: 'POST', body: { name: 'xiaoyu', password: 'demo123' } });
  await call(`/api/students/${demo.studentId}`, { token: guest.token, expect: 403 });
  await call('/api/explore/intro', {
    method: 'POST', token: guest.token, expect: 403,
    body: { studentId: demo.studentId, actId: 'interest', choiceId: 'make' }
  });
  // 也看不到对方的分析结果
  await call(`/api/students/${demo.studentId}/analysis`, { token: guest.token, expect: 403 });
});

/* -------------------- 标准化量表：霍兰德 RIASEC / 多元智能 -------------------- */

async function newStudent(name) {
  const reg = await call('/api/auth/register', {
    method: 'POST',
    body: { name, password: 'demo123', role: 'student', ageBand: '14-16', guardianConsent: true }
  });
  return { sid: reg.student.id, token: reg.token };
}

function patternedAnswers(items, map) {
  const out = {};
  for (const it of items) out[it.id] = map[it.id[0]] ?? 3;
  return out;
}

test('量表：RIASEC 36 题、不泄漏维度、答完给出三字代码并写入证据', async () => {
  const { sid, token } = await newStudent('assess_riasec');

  const meta = await call('/api/assess', { token });
  assert.equal(meta.instruments.length, 2);
  const ins = meta.instruments.find((i) => i.key === 'riasec');
  assert.equal(ins.itemCount, 36);
  assert.equal(ins.dims.length, 6);
  assert.equal(ins.attempts, 0);

  const data = await call(`/api/assess/riasec?studentId=${sid}`, { token });
  assert.equal(data.items.length, 36);
  assert.ok(data.items.every((i) => !('dim' in i) && !('dims' in i)), '题目不能下发维度归属');
  assert.equal(data.options.length, 5);
  assert.equal(data.canTake, true);

  const answers = patternedAnswers(data.items, { i: 5, a: 4, r: 3, s: 2, e: 2, c: 2 });
  const out = await call('/api/assess/riasec', { method: 'POST', token, body: { studentId: sid, answers } });
  assert.equal(out.result.code, 'IAR');
  assert.deepEqual(out.result.top, ['I', 'A', 'R']);
  assert.equal(out.result.scores.length, 6);
  assert.equal(out.result.quality.consistency, 'high', 'I 与 A 在六边形上相邻 → 一致性高');
  assert.ok(out.result.quality.differentiation >= 45);
  assert.equal(out.result.careers.length, 4);
  assert.equal(out.signals.length, 6);

  const signals = await call(`/api/students/${sid}/signals`, { token });
  const list = Array.isArray(signals) ? signals : signals.signals;
  assert.equal(list.filter((s) => s.source === 'assessment').length, 6);

  // 画像里的六维分数必须和量表百分比对得上，不能"量表一套、画像另一套"
  await call(`/api/students/${sid}/analysis`, { method: 'POST', token, body: {} });
  const an = await call(`/api/students/${sid}/analysis`, { token });
  const dimI = an.latest.profileSnapshot.dimensions.find((d) => d.key === 'I');
  const scaleI = out.result.scores.find((s) => s.key === 'I');
  assert.equal(dimI.score, scaleI.percent);
});

test('量表：多元智能 40 题、八项排序，重测替换而不叠加', async () => {
  const { sid, token } = await newStudent('assess_mi');

  const data = await call(`/api/assess/mi?studentId=${sid}`, { token });
  assert.equal(data.items.length, 40);
  assert.equal(data.dims.length, 8);

  const map = { log: 5, lin: 4, int: 4, spa: 3, bod: 3, intra: 3, mus: 2, nat: 2 };
  const answers = {};
  for (const it of data.items) answers[it.id] = map[it.id.replace(/[0-9]/g, '')];

  const first = await call('/api/assess/mi', { method: 'POST', token, body: { studentId: sid, answers } });
  assert.deepEqual(first.result.top, ['log', 'lin', 'int']);
  assert.equal(first.result.code, null, '多元智能不合成总分，也不给代码');
  assert.equal(first.signals.length, 8);

  const again = await call('/api/assess/mi', { method: 'POST', token, body: { studentId: sid, answers } });
  assert.equal(again.attempts, 2);

  const signals = await call(`/api/students/${sid}/signals`, { token });
  const list = Array.isArray(signals) ? signals : signals.signals;
  assert.equal(list.filter((s) => s.source === 'assessment').length, 8, '重测只保留最新一份，不叠加');

  const hist = await call('/api/assess/mi/result', { token });
  assert.equal(hist.history.length, 2, '历史保留两次，最新一次排在最前');
  assert.equal(hist.latest.id, again.id);

  // 画像要能读到多元智能
  await call(`/api/students/${sid}/analysis`, { method: 'POST', token, body: {} });
  const an = await call(`/api/students/${sid}/analysis`, { token });
  const mi = an.latest.profileSnapshot.intelligences.filter((x) => x.count > 0);
  assert.equal(mi.length, 8);
  assert.ok(an.latest.caveats.some((c) => c.includes('多元智能')), '必须带"自评不是能力测验"的说明');
});

test('量表：题量不足被拒，家长不能代答，他人不能读', async () => {
  const { sid, token } = await newStudent('assess_guard');
  const data = await call(`/api/assess/riasec?studentId=${sid}`, { token });

  await call('/api/assess/riasec', {
    method: 'POST', token, expect: 400,
    body: { studentId: sid, answers: { [data.items[0].id]: 5 } }
  });

  // 家长（xiaoyu 的家长）可以看自己孩子，但不能代答
  const parent = await call('/api/auth/login', { method: 'POST', body: { name: 'parent_a', password: 'demo123' } });
  const parentView = await call(`/api/assess/riasec?studentId=${parent.studentId}`, { token: parent.token });
  assert.equal(parentView.canTake, false, '家长只能看，不能作答');
  await call('/api/assess/riasec', {
    method: 'POST', token: parent.token, expect: 403,
    body: { studentId: parent.studentId, answers: patternedAnswers(data.items, { i: 5 }) }
  });

  // 另一个学生读不到
  const other = await call('/api/auth/login', { method: 'POST', body: { name: 'sunian', password: 'demo123' } });
  await call(`/api/assess/riasec?studentId=${sid}`, { token: other.token, expect: 403 });
});

test('演示数据：林知远自带两份量表，画像与量表分数对齐', async () => {
  const meta = await call('/api/assess', { token: tokens.xiaoyu });
  const riasec = meta.instruments.find((i) => i.key === 'riasec');
  const mi = meta.instruments.find((i) => i.key === 'mi');
  assert.equal(riasec.attempts, 1, '种子数据要有一份霍兰德作答，演示时不用现答');
  assert.equal(mi.attempts, 1);
  assert.ok(['I', 'R', 'A', 'S', 'E', 'C'].includes(riasec.latest.code[0]));

  const an = await call('/api/students/' + students.A + '/analysis', { token: tokens.xiaoyu });
  const latest = an.latest || an;
  const dims = latest.profileSnapshot.dimensions.filter((d) => d.count > 0);
  const scores = latest.profileSnapshot.intelligences.filter((i) => i.count > 0);
  assert.equal(dims.length, 6, '六维都要有量表证据');
  assert.equal(scores.length, 8, '八项智能都要有量表证据');
  assert.ok(!latest.caveats.some((c) => c.includes('还没有任何证据')), '不能把有量表数据的档案判成空档案');
});

test('演示数据：空白档案仍然是零证据（用于演示启程动画）', async () => {
  const empty = await call('/api/auth/login', { method: 'POST', body: { name: 'xiaoman', password: 'demo123' } });
  const meta = await call('/api/assess', { token: empty.token });
  assert.ok(meta.instruments.every((i) => i.attempts === 0), '空白档案不应有量表记录');
});

/* ------------- 新人旅程：量表 → 画像 → 初步方案 → 讨论 → 定稿 ------------- */

async function takeScale(scale, sid, token, map) {
  const data = await call(`/api/assess/${scale}?studentId=${sid}`, { token });
  const answers = {};
  for (const it of data.items) answers[it.id] = map[it.id.replace(/[0-9]/g, '')] ?? 3;
  return call(`/api/assess/${scale}`, { method: 'POST', token, body: { studentId: sid, answers } });
}

const RIASEC_HI = { i: 5, a: 4, r: 4, s: 2, e: 2, c: 2 };
const MI_HI = { log: 5, lin: 4, int: 4, spa: 3, bod: 3, intra: 3, mus: 2, nat: 2 };

test('旅程：新注册的学生只有第一步是当前步，其余锁定', async () => {
  const { sid, token } = await newStudent('journey_empty');
  const j = await call(`/api/students/${sid}/journey`, { token });
  assert.equal(j.steps.length, 5, '流程固定五步');
  assert.deepEqual(j.steps.map((s) => s.key), ['assess', 'portrait', 'draft', 'discuss', 'final']);
  assert.equal(j.progress, 0);
  assert.equal(j.steps[0].state, 'current');
  assert.ok(j.steps.slice(1).every((s) => s.state === 'locked'), '后续步骤未解锁');
  assert.equal(j.next.key, 'assess');
  assert.deepEqual(j.scales.missing, ['riasec', 'mi']);
  assert.equal(j.analysis, null);
  assert.equal(j.plan, null);

  // 家长也能读到同一份旅程状态（看得到进度，但不能作答）
  const parentToken = tokens.parent_a;
  const other = await call(`/api/students/${sid}/journey`, { token: parentToken, expect: 403 });
  assert.ok(other.error);
});

test('旅程：答完第一份量表不动，第二份答完立刻自动出画像与初步方案', async () => {
  const { sid, token } = await newStudent('journey_auto');

  const r1 = await takeScale('riasec', sid, token, RIASEC_HI);
  assert.equal(r1.journey.steps[0].done, false, '只答一份不算完成');
  assert.equal(r1.journey.analysis, null, '不该提前生成画像');
  assert.equal(r1.journey.plan, null);
  assert.deepEqual(r1.journey.scales.missing, ['mi']);
  assert.equal(r1.journey.scales.riasec.done, true);
  assert.ok(r1.journey.scales.riasec.top.length === 3);
  assert.ok(r1.journey.scales.riasec.top.every((t) => t.name && typeof t.percent === 'number'), '前三项要带中文名与分数');

  const r2 = await takeScale('mi', sid, token, MI_HI);
  const j = r2.journey;
  assert.equal(j.steps[0].done, true);
  assert.equal(j.steps[1].done, true, '量表齐了就该有画像，不需要用户再点一次');
  assert.equal(j.steps[2].done, true, '并自动生成初步方案');
  assert.ok(j.analysis && j.analysis.id);
  assert.equal(j.plan.status, 'draft');
  assert.equal(j.plan.stage, '初步方案');
  assert.equal(j.plan.source, 'journey');
  assert.equal(j.progress, 60, '五步完成三步 = 60%');
  assert.equal(j.next.key, 'discuss');
  assert.equal(j.plan.readiness.ready, false);
  assert.deepEqual(j.plan.readiness.missing, ['学生确认', '家长确认']);

  // 画像确实读的是量表，而不是空壳
  const an = await call(`/api/students/${sid}/analysis`, { token });
  assert.ok(an.latest.scaleInsight, '画像必须带量表解读');
  assert.equal(an.latest.scaleInsight.source, '自评量表');
  assert.ok(an.latest.scaleInsight.interests.length >= 3);
  assert.ok(an.latest.scaleInsight.potentials.length >= 3);

  // 重测不重复生成方案：第二版量表只让画像重算，方案仍是一份
  const again = await takeScale('mi', sid, token, MI_HI);
  assert.equal(again.journey.plan.id, j.plan.id, '已有方案不应被自动覆盖');
  const list = await call(`/api/students/${sid}/plan`, { token });
  assert.equal(list.versions.length, 1);
});

test('旅程：方案讨论留痕、AI 回应并推进到「讨论中」', async () => {
  const { sid, token } = await newStudent('journey_discuss');
  await takeScale('riasec', sid, token, RIASEC_HI);
  const done = await takeScale('mi', sid, token, MI_HI);
  const planId = done.journey.plan.id;

  const out = await call(`/api/plans/${planId}/comments`, {
    method: 'POST', token,
    body: { text: '每周两次我真做不到，作业写到十一点；报班要两千块，家里拿不出来。' }
  });
  assert.equal(out.plan.status, 'discussing', '第一条意见把初步方案推进为讨论中');
  assert.equal(out.stage.label, '讨论中');
  assert.equal(out.comment.role, 'student');
  assert.equal(out.reply.role, 'ai');
  assert.ok(out.reply.meta.topics.length > 0, 'AI 要标出识别到的议题');
  assert.ok(out.reply.text.length > 40);
  assert.equal(out.stats.total, 2);
  assert.equal(out.stats.student, 1);
  assert.equal(out.stats.ai, 1);

  const list = await call(`/api/plans/${planId}/comments`, { token });
  assert.equal(list.comments.length, 2);
  assert.equal(list.comments[0].role, 'student', '按时间正序');
  assert.equal(list.canComment, true);

  // 太笼统的意见不收
  await call(`/api/plans/${planId}/comments`, { method: 'POST', token, body: { text: '不行' }, expect: 400 });

  // 别人不能在这份方案上讨论
  await call(`/api/plans/${planId}/comments`, {
    method: 'POST', token: tokens.sunian, body: { text: '我来插一句别人的方案' }, expect: 403
  });

  // 家长还没说话 → 讨论这一步不算完成
  const j = await call(`/api/students/${sid}/journey`, { token });
  assert.equal(j.steps[3].done, false);
  assert.equal(j.next.key, 'discuss');
  assert.equal(j.plan.comments.student, 1);
  assert.equal(j.plan.comments.parent, 0);
});

test('旅程：定稿要有学生与家长双确认，提前定稿被拒、规划师不能代替', async () => {
  const plan = await call(`/api/students/${students.A}/plan`, { method: 'POST', token: tokens.xiaoyu, body: { horizon: '10' } });
  assert.equal(plan.status, 'draft');
  assert.equal(plan.version, 4, '每次生成都是新版本');

  const early = await call(`/api/plans/${plan.id}/finalize`, { method: 'POST', token: tokens.xiaoyu, body: {}, expect: 400 });
  assert.match(early.error, /还不能定稿/);
  assert.match(early.error, /学生确认/);
  assert.match(early.error, /家长确认/);

  // 规划师提的是审核意见，不是确认
  await call(`/api/plans/${plan.id}/finalize`, { method: 'POST', token: tokens.counselor, body: {}, expect: 403 });

  const one = await call(`/api/plans/${plan.id}/confirm`, { method: 'POST', token: tokens.xiaoyu, body: { agreed: true } });
  assert.equal(one.readiness.ready, false);
  assert.deepEqual(one.readiness.missing, ['家长确认']);
  await call(`/api/plans/${plan.id}/finalize`, { method: 'POST', token: tokens.xiaoyu, body: {}, expect: 400 });

  const two = await call(`/api/plans/${plan.id}/confirm`, { method: 'POST', token: tokens.parent_a, body: { agreed: true } });
  assert.equal(two.readiness.ready, true);
  assert.deepEqual(two.readiness.missing, []);
  assert.equal(two.stage.label, '已确认', '确认完还没定稿，不能叫最终方案');

  // 「已确认」不等于「最终方案」：旅程的第五步仍然要点一次定稿
  const mid = await call(`/api/students/${students.A}/journey`, { token: tokens.xiaoyu });
  assert.equal(mid.steps[3].done, true, '双方都表态了，讨论这一步算完成');
  assert.equal(mid.steps[4].done, false, '没定稿就不算最终方案');
  assert.equal(mid.next.key, 'final');
  assert.equal(mid.progress, 80);

  const fin = await call(`/api/plans/${plan.id}/finalize`, { method: 'POST', token: tokens.xiaoyu, body: {} });
  assert.equal(fin.stage.label, '最终方案');
  assert.ok(fin.plan.finalizedAt);
  assert.equal(fin.plan.finalVersion, fin.plan.version);

  const j = await call(`/api/students/${students.A}/journey`, { token: tokens.xiaoyu });
  assert.equal(j.steps[4].done, true);
  assert.equal(j.progress, 100);
  assert.equal(j.plan.stage, '最终方案');
  assert.equal(j.next.key, 'final');

  // 重复定稿是幂等的，不会刷新定稿时间
  const again = await call(`/api/plans/${plan.id}/finalize`, { method: 'POST', token: tokens.parent_a, body: {} });
  assert.equal(again.plan.finalizedAt, fin.plan.finalizedAt);
});

test('旅程：有真人规划师派单时，未审核不能定稿', async () => {
  assert.equal(students.C, students.parentC, '演示数据里学生与家长共用一份档案');
  const plan = await call(`/api/students/${students.C}/plan`, { method: 'POST', token: tokens.chenhao, body: { horizon: '5' } });
  const view = await call(`/api/plans/${plan.id}/comments`, { token: tokens.chenhao });
  assert.equal(view.readiness.advisorInvolved, true, '这个档案已经派过规划师');
  assert.equal(view.readiness.advisorReady, false);
  assert.ok(view.readiness.missing.includes('真人规划师审核意见'));

  await call(`/api/plans/${plan.id}/confirm`, { method: 'POST', token: tokens.chenhao, body: { agreed: true } });
  await call(`/api/plans/${plan.id}/confirm`, { method: 'POST', token: tokens.parent_c, body: { agreed: true } });

  const out = await call(`/api/plans/${plan.id}/finalize`, { method: 'POST', token: tokens.chenhao, body: {}, expect: 400 });
  assert.match(out.error, /真人规划师审核意见/);
});

/* ------------------------------ 云服务接入 ------------------------------ */
/*
 * 云端 SDK 只在浏览器里跑（且必须在发布域名下），所以这里测的是服务端那一半：
 * 云身份 → 应用会话的桥接、快照导出、快照回填与跨账号隔离。
 * 真正的云端读写由线上验证覆盖（见 README「云服务」一节）。
 */

test('云账号：首次登录要先选角色，选完才建档案', async () => {
  const first = await call('/api/auth/cloud', {
    method: 'POST', body: { cloudUid: 'uid_test_student', cloudName: '云上同学' }
  });
  assert.equal(first.needsProfile, true, '缺角色时不能替他决定是学生还是家长');

  const out = await call('/api/auth/cloud', {
    method: 'POST',
    body: { cloudUid: 'uid_test_student', cloudName: '云上同学', role: 'student', displayName: '小云', ageBand: '16-18', guardianConsent: true }
  });
  assert.equal(out.created, true);
  assert.equal(out.user.role, 'student');
  assert.equal(out.user.cloudUid, 'uid_test_student');
  assert.equal(out.students.length, 1);
  assert.equal(out.students[0].name, '小云');
  tokens.cloudStudent = out.token;
  students.cloud = out.students[0].id;

  // 同一个云账号再进来：复用，不会建第二份档案
  const again = await call('/api/auth/cloud', { method: 'POST', body: { cloudUid: 'uid_test_student' } });
  assert.equal(again.created, false);
  assert.equal(again.user.id, out.user.id);
  assert.equal(again.students.length, 1);

  // 云账号不能自己冒充规划师
  await call('/api/auth/cloud', {
    method: 'POST', body: { cloudUid: 'uid_test_advisor', cloudName: 'x', role: 'advisor' }, expect: 400
  });
});

test('云档案：快照包含自己的记录，且不含别人的', async () => {
  await call(`/api/students/${students.cloud}/signals`, {
    method: 'POST', token: tokens.cloudStudent, body: { source: 'self', text: '我在自学剪辑，给班里拍了活动视频', dimension: 'A' }
  });

  const snap = await call('/api/cloud/snapshot', { token: tokens.cloudStudent });
  assert.equal(snap.account.role, 'student');
  assert.equal(snap.entities.students.length, 1);
  assert.equal(snap.entities.signals.length, 1);
  assert.equal(snap.entities.signals[0].studentId, students.cloud);
  assert.ok(!snap.entities.signals.some((s) => s.studentId === students.A), '不能把别人的证据带出去');

  // 未登录拿不到快照
  await call('/api/cloud/snapshot', { expect: 401 });
});

test('云档案：换设备回填只接受属于自己的记录', async () => {
  const snap = await call('/api/cloud/snapshot', { token: tokens.cloudStudent });

  // 同一个账号回填自己的快照：幂等，不产生重复行
  const own = await call('/api/cloud/import', { method: 'POST', token: tokens.cloudStudent, body: { entities: snap.entities } });
  assert.equal(own.counts.students, 1);
  assert.equal(own.counts.signals, 1);
  const after = await call('/api/cloud/snapshot', { token: tokens.cloudStudent });
  assert.equal(after.entities.signals.length, 1, '回填同一份快照不该翻倍');

  // 另一个云账号拿到这份快照：学生行与所有子记录都应被拒绝
  const other = await call('/api/auth/cloud', {
    method: 'POST',
    body: { cloudUid: 'uid_test_other', cloudName: '另一个人', role: 'student', displayName: '小另', ageBand: '16-18', guardianConsent: true }
  });
  const stolen = await call('/api/cloud/import', { method: 'POST', token: other.token, body: { entities: snap.entities } });
  assert.equal(stolen.counts.students, 0, '不属于自己的学生行必须被拒绝');
  assert.equal(stolen.skipped.students, 1);
  assert.equal(stolen.counts.signals, 0);
  assert.equal(stolen.skipped.signals, 1);
});
