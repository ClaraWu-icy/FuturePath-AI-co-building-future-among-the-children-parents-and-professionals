/**
 * 演示数据种子（虚构人物，不含任何真实未成年人信息）
 * 运行：npm run seed
 */
import { resetAll, insert, find, findOne, table, update, flush } from './db.js';
import { hashPassword, uid, nowISO } from './util.js';
import { pathToFileURL } from 'node:url';
import { analyze, generatePlan } from './ai/engine.js';
import { getInstrument } from './ai/scales.js';
import { createStudent } from './services/students.js';
import { createSignal, scoringSignals, listSignals } from './services/signals.js';
import { applyAssessment } from './services/assessments.js';
import { addPlanComment } from './services/plans.js';

const PASSWORD = 'demo123';
const DAY = 86400000;
const T0 = Date.now() - 27 * DAY;
const at = (days) => new Date(T0 + days * DAY).toISOString();

function makeUser(name, role, extra = {}) {
  const { salt, hash } = hashPassword(PASSWORD);
  return insert('users', {
    id: uid('u_'),
    name,
    role,
    passwordHash: hash,
    salt,
    verified: true,
    status: 'active',
    createdAt: at(0),
    ...extra
  });
}

const DIM_NAME = { R: '实践动手', I: '探究思考', A: '创意表达', S: '助人沟通', E: '组织影响', C: '条理执行' };

function reflectionFor(text, dim) {
  const quote = text.length > 28 ? text.slice(0, 28) + '…' : text;
  return `你说「${quote}」。谢谢写得这么具体。我从这段话里读到的不是"你适合什么职业"，而是你在意「${DIM_NAME[dim] || '这件事'}」——先把它当成一个假设，等会儿用情景任务验证。`;
}

function sig(studentId, days, payload) {
  return createSignal(studentId, { createdAt: at(days), ...payload });
}

/**
 * 演示用量表作答：按维度给基准分，题目之间留一点起伏，
 * 否则同一维度全填同一档会被质量规则判成"快速勾选"。
 */
function addDemoAssessment(student, scale, pattern, days, takenBy) {
  const ins = getInstrument(scale);
  const jitter = [0, 1, -1, 0, 0, 1];
  const answers = {};
  const seen = {};
  for (const item of ins.items) {
    const base = pattern[item.dim] ?? 3;
    const n = (seen[item.dim] = (seen[item.dim] || 0) + 1);
    answers[item.id] = Math.min(5, Math.max(1, base + jitter[(n - 1) % jitter.length]));
  }
  return applyAssessment(student, { scale, answers, takenBy, role: 'student', createdAt: at(days) });
}

function saveAnalysis(student, { mode = 'simulated' } = {}) {
  const signals = scoringSignals(student.id);
  const result = analyze(student, signals);
  return insert('analyses', {
    id: uid('an_'),
    studentId: student.id,
    createdAt: at(26),
    mode,
    model: 'futurepath-rule-engine-v1',
    narrativeNote: '',
    signalCount: signals.length,
    dataRange: { from: signals[0].createdAt, to: signals[signals.length - 1].createdAt },
    confidence: result.confidence,
    summary: result.summary,
    strengths: result.strengths,
    hypotheses: result.hypotheses,
    suggestions: result.suggestions,
    careerMatches: result.careerMatches,
    scaleInsight: result.scaleInsight,
    profileSnapshot: result.profileSnapshot,
    evidenceIndex: result.evidenceIndex,
    coverage: result.coverage,
    caveats: result.caveats,
    status: 'acknowledged',
    acknowledgements: [{ target: 'summary', action: 'confirm', note: '基本同意', by: student.userId, at: at(26) }]
  });
}

function savePlan(student, analysis, horizon, days) {
  const generated = generatePlan(student, analysis, horizon);
  return insert('plans', {
    id: uid('pl_'),
    studentId: student.id,
    version: 1,
    horizon: generated.horizon,
    sections: generated.sections,
    analysisId: analysis.id,
    analysisSignalCount: analysis.signalCount,
    status: 'pending_confirm',
    confirmations: [],
    advisorName: null,
    professionalReviewed: false,
    participants: ['学生', '家长', 'AI 导师'],
    createdAt: at(days)
  });
}

export async function seedDemoData() {
  const force = process.argv.includes('--force');
  if (table('users').length && !force) {
    console.log('数据已存在。如需重建请运行：npm run seed（会自动清空）');
    return;
  }
  await resetAll();

  /* ---------------------------- 账号 ---------------------------- */
  const uXiaoyu = makeUser('xiaoyu', 'student', { displayName: '林知远' });
  const uA = makeUser('parent_a', 'parent', { displayName: '林知远家长' });
  const uSunian = makeUser('sunian', 'student', { displayName: '苏念' });
  const uB = makeUser('parent_b', 'parent', { displayName: '苏念家长' });
  const uChenhao = makeUser('chenhao', 'student', { displayName: '陈昊' });
  const uC = makeUser('parent_c', 'parent', { displayName: '陈昊家长' });
  const uAdvisor = makeUser('counselor', 'advisor', {
    displayName: '周老师（示例规划师）',
    credential: '生涯规划师（GCDF 示例认证，演示数据）',
    verified: true,
    bio: '8 年青少年生涯咨询经验，服务县域中学（演示身份）'
  });

  /* ------------------------- 案例 A：探究型 ------------------------- */
  const A = createStudent(uXiaoyu, {
    name: '林知远', nickname: '小远', ageBand: '16-18', age: 16, grade: '高一',
    region: '云南·曲靖', schoolType: '县一中', userId: uXiaoyu.id, guardianId: uA.id,
    selfIntro: '喜欢拆东西，也喜欢搞清楚为什么。数学还行，语文一般。'
  });
  insert('consents', { id: uid('cs_'), studentId: A.id, type: 'guardian', granted: true, scope: '监护人授权', byUserId: uA.id, byRole: 'parent', at: at(0) });
  insert('consents', { id: uid('cs_'), studentId: A.id, type: 'data_use', granted: true, scope: '平台内部分析', byUserId: uA.id, byRole: 'parent', at: at(0) });
  insert('consents', { id: uid('cs_'), studentId: A.id, type: 'ai_analysis', granted: true, scope: '生成 AI 分析', byUserId: uXiaoyu.id, byRole: 'student', at: at(1) });

  const aDialogue = [
    [2, 'q_i1', '我一直想弄明白为什么有的电池充得快有的慢。查过资料说跟内阻有关，我用万用表测过两节旧电池，电压差不多但一用就掉。', 'I'],
    [2, 'q_r1', '家里风扇不转了，我拆开看是电容鼓了，换了一个，还用烙铁把线焊回去，装回去之后能转，就是有点响。', 'R'],
    [3, 'q_i2', '我更想搞懂为什么。数学公式我会自己推一遍才安心，老师直接给结论我会记不住。', 'I'],
    [4, 'q_c1', '我用一个本子记作业，按科目分。但经常到周末就乱了，计划表写了三天就忘。', 'C'],
    [5, 'q_s1', '同学问我物理题我会讲，但我讲得比较快，有时候他没听懂我也不太知道怎么换种说法。', 'S'],
    [6, 'q_a1', '做过一个自动浇花的小装置，用定时器控制小水泵。不算好看，但能用。', 'R']
  ];
  for (const [d, qid, text, dim] of aDialogue) {
    sig(A.id, d, {
      source: 'dialogue', dimension: dim, strength: dim === 'C' ? 0.4 : 0.8, weight: dim === 'C' ? 0.8 : 1.1,
      excerpt: text, itemId: qid, ability: dim === 'I' ? { logic: 0.85, self: 0.5 } : dim === 'R' ? { spatial: 0.8, logic: 0.4 } : {},
      meta: { questionId: qid }
    });
    insert('conversations', { studentId: A.id, kind: 'explore', questionId: qid, question: '（演示数据）', answer: text, reflection: reflectionFor(text, dim === 'CAREER' ? 'I' : dim), createdAt: at(d) });
  }
  sig(A.id, 7, { source: 'scenario', dimension: 'R', strength: 0.95, weight: 1.15, excerpt: '校园科技节：先把装置做出来，边做边改。用实物推进讨论，常常比开会更快暴露真问题。', itemId: 'sc_tech_fest', ability: { spatial: 0.9, self: 0.5 }, meta: { scenarioId: 'sc_tech_fest', optionId: 'c' } });
  sig(A.id, 7, { source: 'scenario', dimension: 'I', strength: 0.45, weight: 1.15, excerpt: '校园科技节：先把装置做出来，边做边改。', itemId: 'sc_tech_fest', meta: { scenarioId: 'sc_tech_fest', optionId: 'c' } });
  sig(A.id, 12, { source: 'scenario', dimension: 'I', strength: 0.9, weight: 1.15, excerpt: '成绩单分析：把每次考试按科目列成表，看趋势和拐点。用数据而不是感觉判断自己。', itemId: 'sc_data', ability: { logic: 0.9, self: 0.5 }, meta: { scenarioId: 'sc_data', optionId: 'a' } });
  sig(A.id, 12, { source: 'scenario', dimension: 'C', strength: 0.8, weight: 1.15, excerpt: '成绩单分析：按科目列表格，看趋势。', itemId: 'sc_data', ability: { logic: 0.7, self: 0.6 }, meta: { scenarioId: 'sc_data', optionId: 'a' } });
  for (const [d, cid, dim, liked, title] of [
    [3, 'c2', 'I', true, '用数据验证一个流传很广的说法'],
    [3, 'c13', 'R', true, '组装机器人并让它跑起来'],
    [4, 'c8', 'I', true, '读一篇论文并搞懂它的方法'],
    [8, 'c9', 'A', false, '写一个让人想看完的故事']
  ]) {
    sig(A.id, d, { source: 'card', dimension: dim, strength: liked ? 0.8 : 0.22, weight: liked ? 0.85 : 0.55, excerpt: `${liked ? '愿意尝试' : '不太想尝试'}：${title}`, itemId: cid, meta: { liked } });
  }
  sig(A.id, 15, { source: 'career', dimension: 'CAREER', strength: 0.85, weight: 1.2, excerpt: '了解「人工智能工程师」后自评 4/5：算法部分很有意思，但数学要求高有点怕。', itemId: 'ai_engineer', meta: { careerId: 'ai_engineer', rating: 4 } });
  sig(A.id, 15, { source: 'career', dimension: 'CAREER', strength: 0.8, weight: 1.1, excerpt: '了解「数据分析师」后自评 4/5：用数据解释事情很吸引我。', itemId: 'data_analyst', meta: { careerId: 'data_analyst', rating: 4 } });
  sig(A.id, 5, { source: 'value', dimension: 'V', strength: 0.85, weight: 1.4, excerpt: '收入差不多时，我最看重把问题搞明白。', itemId: 'q_v1', meta: { valueKey: 'truth', questionId: 'q_v1' } });
  sig(A.id, 18, { source: 'growth', dimension: 'R', strength: 0.85, weight: 1.1, excerpt: '初中做过自动浇花装置，用定时器控制水泵，参加了校科技节，拿了个三等奖。', itemId: 'growth-1', ability: { spatial: 0.85, self: 0.6 }, meta: { kind: 'pride' } });
  sig(A.id, 16, { source: 'parent', dimension: 'R', strength: 0.75, weight: 1.25, excerpt: '上个月他自己把路由器拆了又装回去，家里网反而更稳了；但他不太愿意跟人解释自己怎么弄的。', itemId: 'parent-obs-1', meta: { kind: 'observation', byRole: 'parent' } });

  addDemoAssessment(A, 'riasec', { R: 4, I: 5, A: 3, S: 2, E: 2, C: 3 }, 9, uXiaoyu.id);
  addDemoAssessment(A, 'mi', { lin: 3, log: 5, spa: 4, bod: 3, mus: 2, int: 2, intra: 3, nat: 4 }, 9, uXiaoyu.id);

  const anA = saveAnalysis(A);
  const planA = savePlan(A, anA, '5', 26);
  update('plans', planA.id, {
    status: 'confirmed',
    finalizedAt: at(28),
    finalVersion: 1,
    finalizedBy: { id: uXiaoyu.id, role: 'student', name: '林知远' },
    confirmations: [
      { role: 'student', byUserId: uXiaoyu.id, at: at(27), version: 1, agreed: true, note: '同意，但我想先去试试再说' },
      { role: 'parent', byUserId: uA.id, at: at(27), version: 1, agreed: true, note: '支持，但担心影响成绩' }
    ]
  });

  // 方案讨论：学生提了具体修改，AI 给了降档建议，家长补了预算与成绩约束
  addPlanComment({ plan: planA, user: uXiaoyu, role: 'student', name: '林知远', text: '方向我同意。但 A 阶段每周两次我可能做不到，想改成每周一次，别耽误课。' });
  addPlanComment({
    plan: planA, user: null, role: 'ai', name: 'AI 导师', kind: 'ai-reply',
    text: '我记下了你说的「每周两次做不到，想改成每周一次」。\n\n这属于"投入和学业抢时间"。方案里对应的是阶段 A 的行动里"每周固定投入"那一项。真要落地，建议把频率改成每周一次、每次 45 分钟，评估指标从"做出作品"改成"完成 3 次记录"——先保住可持续性。\n\n我不会自己动手改方案：修改要由你点「编辑方案」写入，生成 v2 后重新确认。'
  });
  addPlanComment({ plan: planA, user: uA, role: 'parent', name: '林知远家长', text: '我支持先试，但要先把成绩稳住；科技营预算最好控制在 2000 以内，别一上来就买设备。' });
  addPlanComment({
    plan: planA, user: null, role: 'ai', name: 'AI 导师', kind: 'ai-reply',
    text: '「先稳住成绩、预算 2000 以内、不先买设备」这三条我会当作约束条件记下来。方案里的体验任务本来就是零成本形式（公开课、开源项目、校内活动），与这个预算不冲突；如果需要买设备，建议先用学校或社区的器材验证一次，再决定是否投入。'
  });

  insert('parentFeedback', { studentId: A.id, guardianId: uA.id, expectation: '希望他考上好大学，学计算机或者电子，工作稳定。', resources: '可以支持一次暑期科技营，预算 2000 元左右。', worries: '怕他只顾拆东西耽误成绩，也怕他太内向以后吃亏。', createdAt: at(20) });
  const aDisc = [
    ['parent', '他从小就爱拆东西，家里电器坏了他都想上手。但我总觉得这不算什么正经本事，还是成绩最重要。'],
    ['ai', '我记下了这条观察。把它和现有证据放在一起看：林知远目前最稳定的方向是「探究思考」（证据最集中），同时「实践动手」也有 5 条记录——你描述的"想上手"和他在情景任务里"先做出来再说"的选择是一致的，不是你的错觉。\n\n不过我想确认一个细节：他拆完东西之后，会自己复盘怎么弄的吗？还是拆完就放那儿了？这决定这条证据是"好奇心"还是"持续解决问题的能力"。'],
    ['parent', '他会自己再装回去，装不好就一直弄，有次弄到十一点。学习上没这么上心。'],
    ['ai', '这条很关键：能为了"装回去"投入三小时，说明存在持续投入的意愿，只是目前投在了动手任务上，不在作业上。\n\n建议不要把这个特点当成"不务正业"，而是试着把它接到学习上：比如让他用物理课的电学知识，把那次修风扇的过程写成一份小报告。这既是证据，也是成绩的一部分。\n\n需要提醒的是：这只说明他在"有兴趣的具体任务"上能坚持，不能推断他在所有学习任务上都能坚持——这一点还需要再验证。']
  ];
  for (const [i, [role, text]] of aDisc.entries()) {
    insert('conversations', { studentId: A.id, kind: 'discussion', role, text, createdAt: at(20 + i * 0.2) });
  }
  insert('auditLog', { id: uid('aud_'), studentId: A.id, actorId: uA.id, actorRole: 'parent', action: 'analysis.view', meta: {}, at: at(21) });

  /* ------------------------- 案例 B：创意型 + 付费版 ------------------------- */
  const B = createStudent(uSunian, {
    name: '苏念', nickname: '念念', ageBand: '16-18', age: 17, grade: '高二',
    region: '四川·成都', schoolType: '普通高中', userId: uSunian.id, guardianId: uB.id,
    selfIntro: '喜欢画画和做视频，想学设计，但不确定能不能靠这个吃饭。'
  });
  insert('consents', { id: uid('cs_'), studentId: B.id, type: 'guardian', granted: true, scope: '监护人授权', byUserId: uB.id, byRole: 'parent', at: at(0) });
  insert('consents', { id: uid('cs_'), studentId: B.id, type: 'data_use', granted: true, scope: '平台内部分析', byUserId: uB.id, byRole: 'parent', at: at(0) });
  insert('consents', { id: uid('cs_'), studentId: B.id, type: 'ai_analysis', granted: true, scope: '生成 AI 分析', byUserId: uSunian.id, byRole: 'student', at: at(1) });
  insert('consents', { id: uid('cs_'), studentId: B.id, type: 'pro_sharing', granted: true, scope: '向受聘规划师共享档案', byUserId: uB.id, byRole: 'parent', at: at(22) });

  const bDialogue = [
    [2, 'q_a1', '做过一本手工 zine，画了 12 页，自己排版、打印、装订，送给朋友。', 'A'],
    [2, 'q_a2', '我会先想一个画面或者一句 slogan，再倒推活动流程。我更在意别人记不记得住。', 'A'],
    [3, 'q_c1', '计划总是写得很漂亮，执行到第三天就断了。画画的作业常常拖到最后一晚。', 'C'],
    [4, 'q_s1', '同桌心情不好会来找我，我一般是先陪她走一圈，不急着给建议。', 'S'],
    [5, 'q_career1', '想学视觉传达，也想过做短视频导演或者插画师。', 'CAREER']
  ];
  for (const [d, qid, text, dim] of bDialogue) {
    sig(B.id, d, {
      source: dim === 'CAREER' ? 'self' : 'dialogue', dimension: dim, strength: dim === 'C' ? 0.4 : 0.82, weight: dim === 'C' ? 0.85 : 1.1,
      excerpt: text, itemId: qid, ability: dim === 'A' ? { verbal: 0.75, spatial: 0.7 } : {},
      meta: dim === 'CAREER' ? { questionId: qid, careerId: 'designer' } : { questionId: qid }
    });
    insert('conversations', { studentId: B.id, kind: 'explore', questionId: qid, question: '（演示数据）', answer: text, reflection: reflectionFor(text, dim === 'CAREER' ? 'A' : dim), createdAt: at(d) });
  }
  sig(B.id, 8, { source: 'scenario', dimension: 'E', strength: 0.8, weight: 1.15, excerpt: '班级活动没人报名：改方案，换时间、换更轻的形式再发一次。降低参与成本往往比加大宣传有效。', itemId: 'sc_class_event', ability: { logic: 0.5, social: 0.5 }, meta: { scenarioId: 'sc_class_event', optionId: 'b' } });
  sig(B.id, 8, { source: 'scenario', dimension: 'A', strength: 0.5, weight: 1.15, excerpt: '班级活动没人报名：改方案。', itemId: 'sc_class_event', meta: { scenarioId: 'sc_class_event', optionId: 'b' } });
  sig(B.id, 13, { source: 'scenario', dimension: 'S', strength: 0.9, weight: 1.15, excerpt: '小组分歧：私下找组长，先弄清他真正担心什么。多数分歧背后是没被听见的担心。', itemId: 'sc_conflict', ability: { social: 0.9, verbal: 0.6 }, meta: { scenarioId: 'sc_conflict', optionId: 'b' } });
  for (const [d, cid, dim, liked, title] of [
    [3, 'c3', 'A', true, '为一场活动设计整套视觉'],
    [3, 'c15', 'A', true, '拍一条有质感的短片'],
    [4, 'c9', 'A', true, '写一个让人想看完的故事'],
    [6, 'c6', 'C', false, '把混乱的资料整理成清晰的表格'],
    [6, 'c13', 'R', false, '组装机器人并让它跑起来']
  ]) {
    sig(B.id, d, { source: 'card', dimension: dim, strength: liked ? 0.85 : 0.2, weight: liked ? 0.9 : 0.55, excerpt: `${liked ? '愿意尝试' : '不太想尝试'}：${title}`, itemId: cid, meta: { liked } });
  }
  sig(B.id, 14, { source: 'career', dimension: 'CAREER', strength: 0.9, weight: 1.3, excerpt: '了解「视觉 / UI 设计师」后自评 5/5：作品集就业、可以自由职业，这个我很向往。', itemId: 'designer', meta: { careerId: 'designer', rating: 5 } });
  sig(B.id, 14, { source: 'career', dimension: 'CAREER', strength: 0.75, weight: 1.1, excerpt: '了解「影视编导 / 短视频创作」后自评 4/5：想拍东西，但怕不稳定。', itemId: 'filmmaker', meta: { careerId: 'filmmaker', rating: 4 } });
  sig(B.id, 5, { source: 'value', dimension: 'V', strength: 0.9, weight: 1.4, excerpt: '收入差不多时，我最看重能表达自己。', itemId: 'q_v1', meta: { valueKey: 'creation', questionId: 'q_v1' } });
  sig(B.id, 9, { source: 'value', dimension: 'V', strength: 0.7, weight: 1.1, excerpt: '十年后，希望自己安排接什么活。', itemId: 'q_v2', meta: { valueKey: 'freedom', questionId: 'q_v2' } });
  sig(B.id, 17, { source: 'growth', dimension: 'A', strength: 0.9, weight: 1.15, excerpt: '给学校运动会做过主视觉，连续改了 7 版，最后印出来挂在操场边上。', itemId: 'growth-2', ability: { spatial: 0.8, verbal: 0.6, self: 0.7 }, meta: { kind: 'pride' } });
  sig(B.id, 10, { source: 'self', dimension: 'C', strength: 0.45, weight: 1, excerpt: '我知道自己容易半途而废，想把学习规划能力练起来。', itemId: 'self-2', meta: { kind: 'goal' } });
  sig(B.id, 19, { source: 'parent', dimension: 'A', strength: 0.8, weight: 1.25, excerpt: '她画画能坐一下午，但学校作业要催三遍。上次班级海报是她做的，老师专门打电话夸。', itemId: 'parent-obs-2', meta: { kind: 'observation', byRole: 'parent' } });
  sig(B.id, 19, { source: 'parent', dimension: 'C', strength: 0.55, weight: 1.1, excerpt: '作业拖到最后一晚才写，说过很多次也没用。', itemId: 'parent-obs-2b', meta: { kind: 'observation', byRole: 'parent' } });

  addDemoAssessment(B, 'riasec', { R: 2, I: 3, A: 5, S: 4, E: 3, C: 3 }, 8, uSunian.id);
  addDemoAssessment(B, 'mi', { lin: 4, log: 2, spa: 5, bod: 3, mus: 4, int: 3, intra: 4, nat: 2 }, 8, uSunian.id);

  const anB = saveAnalysis(B);
  const planB = savePlan(B, anB, '10', 24);

  insert('parentFeedback', { studentId: B.id, guardianId: uB.id, expectation: '希望她读个稳妥的专业，比如师范或者会计，设计太不稳定了。', resources: '可以支持艺考培训，但希望看到"回报"。', worries: '担心她只是三分钟热度，也担心设计行业加班严重。', createdAt: at(21) });

  // 付费版：演示订单（明确标注非真实支付）
  insert('orders', {
    id: uid('or_'), studentId: B.id, guardianId: uB.id, plan: 'pro', amount: 699, currency: 'CNY',
    status: 'demo_activated', demo: true, note: '演示模式：未调用支付网关，未产生真实交易。', createdAt: at(22)
  });
  updateStudentPlan(B.id);
  const session = insert('advisorSessions', {
    id: uid('as_'), studentId: B.id, advisorId: uAdvisor.id, status: 'reviewed',
    topic: '艺考与设计方向的可行性审核', createdAt: at(22), claimedAt: at(23), reviewedAt: at(25), reviewIds: []
  });

  const review = insert('professionalReviews', {
    id: uid('rv_'),
    studentId: B.id, sessionId: session.id, advisorId: uAdvisor.id,
    advisorName: uAdvisor.displayName, credential: uAdvisor.credential, at: at(25),
    assessment: '证据链完整，创意方向的判断可以成立。但需要明确：她的"坚持"目前只出现在有明确交付物的创作任务上，学业任务上并没有同样表现，这两件事不能互相证明。\n\n关于家长担心的稳定性：设计行业的收入分化确实大，但可迁移能力（审美、软件、表达能力）在品牌、电商、出版、教育内容等方向都有需求。建议不要用"稳定/不稳定"二选一，而是设计一条"主路径 + 保底能力"的组合。',
    agreements: ['创意表达（A）是最稳定的兴趣方向', '自我管理（C）是当前最需要补的能力'],
    corrections: [{ target: 'AI 建议的"3 个月内完成作品集"', reason: '高二课业压力大，3 个月不现实，容易造成新的挫败感', revised: '改为 5 个月，拆成每月 2 个小交付，与月考节奏错开' }],
    risks: ['艺考培训投入与回报周期长，家庭需明确预算上限', '把"喜欢画画"直接等同于"适合设计专业"，中间缺少真实项目验证'],
    nextSteps: ['暑假完成 1 次真实客户委托（可为学校社团免费做视觉）', '与 2 位在职设计师访谈，重点问加班与收入结构', '每月一次 30 分钟学习计划复盘，由家长计时不评判']
  });

  const advisorNote = `【真人规划师 周老师 · ${new Date(at(25)).toLocaleDateString('zh-CN')}】${review.assessment}\n修订：${review.corrections.map((c) => `${c.target} → ${c.revised}`).join('；')}`;
  const nextSections = {
    ...planB.sections,
    advisorNote,
    phases: planB.sections.phases.map((p) => (p.code === 'B'
      ? {
        ...p,
        actions: [...p.actions, '（规划师修订）作品集节点由 3 个月放宽到 5 个月，每月 2 个小交付，与月考节奏错开'],
        adjustIf: '若连续两次延期 → 缩小交付范围到原来的一半，优先保证完成（规划师修订）。'
      }
      : p)),
    actions: [...planB.sections.actions, { title: '每月一次 30 分钟计划复盘（家长只计时，不评价）', cadence: '每月', owner: '学生 + 家长' }]
  };
  const finalPlan = insert('plans', {
    id: uid('pl_'), studentId: B.id, version: 2, horizon: '10',
    sections: nextSections, analysisId: anB.id, analysisSignalCount: anB.signalCount,
    status: 'confirmed', confirmations: [
      { role: 'student', byUserId: uSunian.id, at: at(25.5), version: 2, agreed: true, note: '5 个月可以接受' },
      { role: 'parent', byUserId: uB.id, at: at(25.6), version: 2, agreed: true, note: '同意先试，但预算有上限' }
    ],
    advisorName: uAdvisor.displayName, advisorCredential: uAdvisor.credential,
    professionalReviewed: true, participants: ['学生', '家长', 'AI 导师', '真人规划师'], createdAt: at(25.5)
  });
  update('plans', planB.id, { status: 'superseded' });
  insert('planRevisions', { id: uid('pr_'), studentId: B.id, planId: finalPlan.id, version: 2, at: at(25), by: 'advisor', byName: uAdvisor.displayName, note: '真人规划师审核意见并入方案', changedFields: ['advisorNote', 'goals', 'actions'] });

  const bDisc = [
    ['parent', '她喜欢画画我们知道，但设计这行到底能不能养活自己？我和她爸都觉得当老师更稳。'],
    ['ai', '这个担心很具体，我按证据回答。苏念目前「创意表达」有 6 条证据（含一次连续改 7 版的主视觉），是全部维度里最稳定的；「条理执行」的证据则相反——她自己和家长都提到计划执行不到三天。\n\n所以问题不是"她能不能做设计"，而是"她能不能在没有外部截止日期时推进项目"。这恰好是可以通过任务验证的，不需要现在就用"稳定/不稳定"来定性。\n\n建议做一个 4 周的小实验：让她接一次真实的、有交付日期的委托（比如给社团做海报），你只负责提醒截止日，不评价作品。4 周后我们看的是"她是否按时交付"，而不是"画得好不好"。这样你和她的分歧就从"要不要学设计"变成了"她能不能承担交付责任"——后者是可以被验证的。'],
    ['parent', '这个可以试试。但如果她连这个都做不到呢？'],
    ['ai', '那也是一个有价值的结论，而且越早知道越好：说明她目前需要的是"外部结构"（固定节点、有人对账），这不等于不能做创意工作，但意味着她需要主动选择一个有团队和流程的环境，而不是自由职业。\n\n这正是专业版里真人规划师可以帮上忙的地方——他可以结合本地艺考与就业的实际情况，给出"主路径 + 保底能力"的组合建议，而不是简单二选一。是否开通由你决定，基础版的所有报告和规划都可以正常查看和导出。']
  ];
  for (const [i, [role, text]] of bDisc.entries()) {
    insert('conversations', { studentId: B.id, kind: 'discussion', role, text, createdAt: at(21 + i * 0.2) });
  }
  updateSessionReviews(session.id, review.id);

  /* ------------------------- 案例 C：助人型 / 资源有限 ------------------------- */
  const C = createStudent(uChenhao, {
    name: '陈昊', nickname: '昊子', ageBand: '12-15', age: 15, grade: '初三',
    region: '贵州·毕节', schoolType: '乡镇中学', userId: uChenhao.id, guardianId: uC.id,
    lowBandwidth: true,
    selfIntro: '我们学校没有生涯课，我也不知道外面有什么工作。'
  });
  insert('consents', { id: uid('cs_'), studentId: C.id, type: 'guardian', granted: true, scope: '监护人授权', byUserId: uC.id, byRole: 'parent', at: at(0) });
  insert('consents', { id: uid('cs_'), studentId: C.id, type: 'data_use', granted: true, scope: '平台内部分析', byUserId: uC.id, byRole: 'parent', at: at(0) });
  insert('consents', { id: uid('cs_'), studentId: C.id, type: 'ai_analysis', granted: true, scope: '生成 AI 分析', byUserId: uChenhao.id, byRole: 'student', at: at(1) });

  const cDialogue = [
    [3, 'q_s1', '邻居家奶奶不会用手机挂号，我帮她弄了。后来村里几个老人也来找我。', 'S'],
    [3, 'q_e1', '组织过村里的初中生一起打球，我自己去挨家叫人，还排了轮换，不然总有人不上场。', 'E'],
    [4, 'q_r2', '喜欢在外面干活，帮家里收玉米，修水管。在屋里坐着看书我坐不住。', 'R'],
    [5, 'q_career1', '想过当老师、当村医，还有一个是修车的，因为村里需要。', 'CAREER'],
    [6, 'q_c2', '重复的事我能做，但得有人一起。一个人做就没意思了。', 'C']
  ];
  for (const [d, qid, text, dim] of cDialogue) {
    sig(C.id, d, {
      source: dim === 'CAREER' ? 'self' : 'dialogue', dimension: dim, strength: 0.8, weight: 1.1,
      excerpt: text, itemId: qid, ability: dim === 'S' ? { social: 0.9 } : dim === 'R' ? { spatial: 0.8, self: 0.6 } : {},
      meta: dim === 'CAREER' ? { questionId: qid } : { questionId: qid }
    });
    insert('conversations', { studentId: C.id, kind: 'explore', questionId: qid, question: '（演示数据）', answer: text, reflection: reflectionFor(text, dim === 'CAREER' ? 'S' : dim), createdAt: at(d) });
  }
  sig(C.id, 9, { source: 'scenario', dimension: 'S', strength: 0.96, weight: 1.2, excerpt: '社区手机课堂：报名，并且认真准备每次讲什么。愿意为具体的人投入持续的时间。', itemId: 'sc_community', ability: { social: 0.85, verbal: 0.6 }, meta: { scenarioId: 'sc_community', optionId: 'a' } });
  sig(C.id, 11, { source: 'scenario', dimension: 'S', strength: 0.7, weight: 1.15, excerpt: '修收音机：叫上一个懂行的同学一起弄。协作不是能力不足，而是效率选择。', itemId: 'sc_repair', meta: { scenarioId: 'sc_repair', optionId: 'd' } });
  sig(C.id, 11, { source: 'scenario', dimension: 'R', strength: 0.5, weight: 1.15, excerpt: '修收音机：叫上同学一起弄。', itemId: 'sc_repair', meta: { scenarioId: 'sc_repair', optionId: 'd' } });
  for (const [d, cid, dim, liked, title] of [
    [4, 'c4', 'S', true, '听朋友讲他的烦恼并帮他理清'],
    [4, 'c16', 'S', true, '在社区做长期志愿服务'],
    [5, 'c5', 'E', true, '从零拉起一个 10 人小队完成任务'],
    [5, 'c7', 'R', true, '在田间或工地上解决一个实际问题'],
    [7, 'c2', 'I', false, '用数据验证一个流传很广的说法'],
    [7, 'c8', 'I', false, '读一篇论文并搞懂它的方法']
  ]) {
    sig(C.id, d, { source: 'card', dimension: dim, strength: liked ? 0.82 : 0.2, weight: liked ? 0.9 : 0.55, excerpt: `${liked ? '愿意尝试' : '不太想尝试'}：${title}`, itemId: cid, meta: { liked } });
  }
  sig(C.id, 13, { source: 'career', dimension: 'CAREER', strength: 0.8, weight: 1.2, excerpt: '了解「中小学教师」后自评 4/5：我们老师就是这样，我觉得我能干。', itemId: 'teacher', meta: { careerId: 'teacher', rating: 4 } });
  sig(C.id, 13, { source: 'career', dimension: 'CAREER', strength: 0.75, weight: 1.1, excerpt: '了解「社会工作 / 公益项目」后自评 4/5：跟帮村里人差不多。', itemId: 'social_worker', meta: { careerId: 'social_worker', rating: 4 } });
  sig(C.id, 6, { source: 'value', dimension: 'V', strength: 0.9, weight: 1.4, excerpt: '收入差不多时，我最看重真的帮到别人。', itemId: 'q_v1', meta: { valueKey: 'helping', questionId: 'q_v1' } });
  sig(C.id, 8, { source: 'growth', dimension: 'R', strength: 0.8, weight: 1.1, excerpt: '帮邻居修好漏水的水龙头，用生料带缠的，弄了一下午。', itemId: 'growth-3', ability: { spatial: 0.8, self: 0.6 }, meta: { kind: 'pride' } });
  sig(C.id, 17, { source: 'parent', dimension: 'S', strength: 0.85, weight: 1.25, excerpt: '村里谁家水管坏了都找他，他不用人教就会弄；但他说不清自己以后想干嘛。', itemId: 'parent-obs-3', meta: { kind: 'observation', byRole: 'parent' } });
  sig(C.id, 10, { source: 'self', dimension: 'I', strength: 0.4, weight: 0.9, excerpt: '我不知道有哪些工作，也没人跟我讲过。', itemId: 'self-3', meta: { kind: 'gap' } });

  const anC = saveAnalysis(C);
  insert('parentFeedback', { studentId: C.id, guardianId: uC.id, expectation: '希望他读个中专学门手艺，早点能挣钱。', resources: '家里能供他读到中专，大学负担重。', worries: '怕他成绩不够，也怕他不知道外面有什么路。', createdAt: at(18) });
  insert('welfareRecords', { id: uid('wf_'), studentId: C.id, programId: 'wpf-002', code: 'FP-DEMO-002', status: 'demo_redeemed', demo: true, at: at(2), note: '演示模式：未与任何公益机构系统对接。' });
  insert('conversations', {
    studentId: C.id, kind: 'discussion', role: 'parent',
    text: '他成绩中等，家里条件一般。我想让他学个手艺，但他好像更愿意帮人。', createdAt: at(18)
  });

  /* ------------------- 案例 D：全新档案（演示"初次进入"） ------------------- */
  const uXiaoman = makeUser('xiaoman', 'student', { displayName: '周小满' });
  const uD = makeUser('parent_d', 'parent', { displayName: '周小满家长' });
  const D = createStudent(uXiaoman, {
    name: '周小满', nickname: '小满', ageBand: '12-15', age: 13, grade: '初二',
    region: '甘肃·定西', schoolType: '乡镇中学', userId: uXiaoman.id, guardianId: uD.id,
    selfIntro: '刚注册，还没想清楚自己喜欢什么。'
  });
  insert('consents', { id: uid('cs_'), studentId: D.id, type: 'guardian', granted: true, scope: '监护人授权', byUserId: uD.id, byRole: 'parent', at: at(26) });
  insert('consents', { id: uid('cs_'), studentId: D.id, type: 'data_use', granted: true, scope: '平台内部分析', byUserId: uD.id, byRole: 'parent', at: at(26) });

  // 三个已探索档案标记为"已完成启程"，避免一进首页就弹动画
  for (const st of [A, B, C]) {
    update('students', st.id, { onboarding: { status: 'done', acts: 3, doneAt: at(3) } });
  }

  /* ------------------------- 完成 ------------------------- */
  insert('auditLog', { id: uid('aud_'), studentId: B.id, actorId: uAdvisor.id, actorRole: 'advisor', action: 'advisor.review', meta: { reviewId: review.id }, at: at(25) });

  console.log('演示数据已生成：');
  console.log('  学生：xiaoyu / sunian / chenhao / xiaoman  密码 demo123');
  console.log('  家长：parent_a / parent_b / parent_c / parent_d  密码 demo123');
  console.log('  规划师：counselor  密码 demo123');
  console.log(`  学生档案：林知远(免费版) 苏念(专业版已审核) 陈昊(公益版·低带宽) 周小满(全新空档案，用于演示启程动画)`);
  console.log('  量表：林知远、苏念已各完成霍兰德 + 多元智能一份；陈昊、周小满留空用于演示未作答状态');
}

function updateStudentPlan(studentId) {
  update('students', studentId, { plan: 'pro' });
}

function updateSessionReviews(sessionId, reviewId) {
  const s = findOne('advisorSessions', (x) => x.id === sessionId);
  if (s) update('advisorSessions', sessionId, { reviewIds: [reviewId] });
}

const direct = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (direct) {
  seedDemoData().then(() => { flush(); process.exit(0); }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
