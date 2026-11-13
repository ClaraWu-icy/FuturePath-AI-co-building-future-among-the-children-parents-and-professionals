/**
 * FuturePath AI — 可解释分析引擎
 * 设计原则：
 * 1. 一切结论来自 signals（学生作答 / 情景任务 / 卡片 / 家长观察 / 规划师记录）
 * 2. 每个结论带 evidence refs，可回溯到原始作答
 * 3. 打分是可复现的加权计算，不是"编"出来的
 */
import {
  RIASEC, DIMENSIONS, MI_DIMENSIONS, ABILITIES, VALUES, CAREERS, QUESTIONS, KEYWORDS, ABILITY_KEYWORDS, CAREER_ALIASES
} from './content.js';
import { round, clamp } from '../util.js';

const DIM_LABEL = Object.fromEntries(RIASEC.map((k) => [k, DIMENSIONS[k].name]));

/* ---------------------------------- 文本抽取 --------------------------------- */

export function extractFromText(text) {
  const t = String(text || '').toLowerCase();
  const dims = {};
  const abilities = {};
  const hits = [];
  const careers = [];

  for (const dim of RIASEC) {
    let count = 0;
    for (const kw of KEYWORDS[dim]) {
      if (t.includes(kw.toLowerCase())) {
        count += 1;
        hits.push(kw);
      }
    }
    if (count) dims[dim] = count;
  }
  for (const [key, words] of Object.entries(ABILITY_KEYWORDS)) {
    let count = 0;
    for (const kw of words) if (t.includes(kw.toLowerCase())) count += 1;
    if (count) abilities[key] = count;
  }
  for (const [careerId, aliases] of Object.entries(CAREER_ALIASES)) {
    if (aliases.some((a) => t.includes(a.toLowerCase()))) careers.push(careerId);
  }
  return { dims, abilities, hits: [...new Set(hits)], careers: [...new Set(careers)] };
}

/** 由一段自由文本生成 0~N 条信号（主维度权重最高） */
export function signalsFromText(text, base) {
  const { dims, abilities, hits, careers } = extractFromText(text);
  const out = [];
  const entries = Object.entries(dims).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (entries.length) {
    entries.forEach(([dim, count], idx) => {
      out.push({
        ...base,
        dimension: dim,
        strength: clamp(0.42 + 0.12 * count, 0.35, 0.95),
        weight: idx === 0 ? 1.2 : 0.7,
        ability: normalizeAbility(abilities),
        meta: { ...(base.meta || {}), hits, autoExtracted: true }
      });
    });
  } else {
    // 没有关键词命中时，仍记录提问维度上的弱信号（回答本身就是证据）
    out.push({
      ...base,
      dimension: base.dimension || 'I',
      strength: 0.35,
      weight: 0.5,
      ability: normalizeAbility(abilities),
      meta: { ...(base.meta || {}), hits: [], autoExtracted: true, weak: true }
    });
  }
  careers.forEach((careerId) =>
    out.push({
      ...base,
      dimension: 'CAREER',
      strength: 0.7,
      weight: 1,
      ability: {},
      meta: { ...(base.meta || {}), careerId, autoExtracted: true }
    })
  );
  return out;
}

function normalizeAbility(raw) {
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = clamp((v / total) * 0.9, 0.2, 0.9);
  return out;
}

/* ---------------------------------- 画像聚合 --------------------------------- */

export function buildProfile(signals) {
  const buckets = Object.fromEntries(RIASEC.map((k) => [k, []]));
  const abilityBuckets = Object.fromEntries(Object.keys(ABILITIES).map((k) => [k, []]));
  const valueBuckets = {};
  const careerBuckets = {};
  const miBuckets = {};

  for (const s of signals) {
    if (RIASEC.includes(s.dimension)) {
      buckets[s.dimension].push(s);
      if (s.ability) {
        for (const [k, v] of Object.entries(s.ability)) {
          if (abilityBuckets[k]) abilityBuckets[k].push({ strength: v, weight: s.weight });
        }
      }
    } else if (s.dimension === 'V' && s.meta?.valueKey) {
      (valueBuckets[s.meta.valueKey] = valueBuckets[s.meta.valueKey] || []).push(s);
    } else if (s.dimension === 'CAREER' && s.meta?.careerId) {
      (careerBuckets[s.meta.careerId] = careerBuckets[s.meta.careerId] || []).push(s);
    } else if (s.dimension === 'MI' && s.meta?.miKey) {
      (miBuckets[s.meta.miKey] = miBuckets[s.meta.miKey] || []).push(s);
    }
  }

  const dimensions = RIASEC.map((key) => {
    const list = buckets[key];
    const wsum = list.reduce((a, s) => a + s.weight, 0) || 1;
    const avg = list.length ? list.reduce((a, s) => a + s.strength * s.weight, 0) / wsum : 0;
    // 量表一条信号代表一整份题目（6 题），按题量折算证据充分度，
    // 否则 36 题的量表会被当成"只答了一句话"，分数被系统性地压低。
    const units = list.reduce((a, s) => a + (Number(s.meta?.items) || 1), 0);
    const sufficiency = Math.min(1, 0.55 + 0.12 * units);
    return {
      key,
      name: DIMENSIONS[key].name,
      score: Math.round(avg * sufficiency * 100),
      raw: round(avg, 3),
      count: list.length,
      confidence: list.length >= 4 ? 'high' : list.length >= 2 ? 'medium' : 'low',
      evidence: list.slice().sort((a, b) => b.weight - a.weight).slice(0, 4)
    };
  });

  const abilities = Object.entries(ABILITY_MAP()).map(([key, meta]) => {
    const list = abilityBuckets[key];
    if (!list.length) return { key, name: meta.name, score: 0, count: 0, confidence: 'low' };
    const wsum = list.reduce((a, s) => a + s.weight, 0) || 1;
    const avg = list.reduce((a, s) => a + s.strength * s.weight, 0) / wsum;
    const sufficiency = Math.min(1, 0.55 + 0.12 * list.length);
    return { key, name: meta.name, score: Math.round(avg * sufficiency * 100), count: list.length, confidence: list.length >= 3 ? 'medium' : 'low' };
  });

  // 多元智能：独立于兴趣六维，来自自评量表，只作为"怎么学更顺"的参考，不合成总分
  const intelligences = Object.entries(MI_DIMENSIONS).map(([key, meta]) => {
    const list = miBuckets[key] || [];
    if (!list.length) return { key, name: meta.name, score: 0, count: 0 };
    const avg = list.reduce((a, s) => a + s.strength * s.weight, 0) / (list.reduce((a, s) => a + s.weight, 0) || 1);
    return { key, name: meta.name, score: Math.round(avg * 100), count: list.length, source: 'self-report' };
  });

  const values = Object.entries(valueBuckets)
    .map(([key, list]) => ({
      key,
      name: VALUES.find((v) => v.key === key)?.name || key,
      score: list.reduce((a, s) => a + s.weight, 0),
      count: list.length
    }))
    .sort((a, b) => b.score - a.score);

  const careerPrefs = Object.entries(careerBuckets)
    .map(([careerId, list]) => ({
      careerId,
      name: CAREERS.find((c) => c.id === careerId)?.name || careerId,
      count: list.length,
      strength: Math.max(...list.map((s) => s.strength)),
      evidence: list.map((s) => s.id)
    }))
    .sort((a, b) => b.strength - a.strength || b.count - a.count);

  const coverage = {
    signals: signals.length,
    dimensionsCovered: dimensions.filter((d) => d.count > 0).length,
    totalDimensions: RIASEC.length,
    scenarios: signals.filter((s) => s.source === 'scenario').length,
    dialogues: signals.filter((s) => s.source === 'dialogue').length,
    parentInputs: signals.filter((s) => s.source === 'parent').length
  };

  const vector = Object.fromEntries(dimensions.map((d) => [d.key, d.score]));
  return { dimensions, abilities, values, careerPrefs, intelligences, coverage, vector, totalSignals: signals.length };
}

function ABILITY_MAP() {
  return ABILITIES;
}

/* ---------------------------------- 职业匹配 --------------------------------- */

/**
 * 去均值余弦（Pearson 相关）。
 * 直接用余弦会把所有职业都算得很像（向量全为正），这里先各自去均值，
 * 再算相关，才能区分"哪个方向更像"。
 */
function similarity(a, b, keys) {
  const mean = (o) => keys.reduce((s, k) => s + (o[k] || 0), 0) / keys.length;
  const ma = mean(a); const mb = mean(b);
  let num = 0; let da = 0; let db = 0;
  for (const k of keys) {
    const x = (a[k] || 0) - ma; const y = (b[k] || 0) - mb;
    num += x * y; da += x * x; db += y * y;
  }
  if (!da || !db) return 0;
  return num / Math.sqrt(da * db);
}

const VALUE_CAREER_AFFINITY = {
  helping: ['social_worker', 'nurse', 'teacher', 'counselor', 'sports_coach', 'doctor'],
  creation: ['designer', 'filmmaker', 'architect', 'journalist', 'chef'],
  truth: ['ai_engineer', 'data_analyst', 'doctor', 'counselor'],
  achievement: ['product_manager', 'lawyer', 'finance', 'marketing'],
  stability: ['public_servant', 'accountant', 'teacher', 'nurse'],
  income: ['finance', 'marketing', 'product_manager'],
  freedom: ['designer', 'filmmaker', 'chef', 'marketing'],
  belonging: ['teacher', 'sports_coach', 'social_worker', 'nurse']
};

export function careerMatches(profile, limit = 5) {
  const topValues = (profile.values || []).slice(0, 2).map((v) => v.key);
  const interest = {};
  for (const d of profile.dimensions) interest[d.key] = d.score || 0;
  const ability = {};
  for (const a of profile.abilities) ability[a.key] = a.score || 0;

  const scored = CAREERS.map((c) => {
    const interestFit = similarity(interest, c.riasec, RIASEC);
    const abilityFit = similarity(ability, c.abilities, Object.keys(ABILITIES));
    const pref = profile.careerPrefs.find((p) => p.careerId === c.id);
    const prefBoost = pref ? Math.min(0.12, 0.03 * pref.count + 0.06 * pref.strength) : 0;
    const valueBoost = topValues.some((v) => (VALUE_CAREER_AFFINITY[v] || []).includes(c.id)) ? 2.6 : 0;
    // 校准：余弦相似度普遍偏高，压缩到 35-90 的可解释区间，并按证据量打折
    const raw = interestFit * 0.62 + abilityFit * 0.3 + prefBoost;
    const evidenceFactor = Math.min(1, 0.76 + profile.coverage.signals * 0.01);
    const match = clamp(47 + raw * 45 * evidenceFactor + valueBoost, 0, 92);
    const overlap = RIASEC.map((k) => ({ k, v: (c.riasec[k] || 0) / 9 }))
      .sort((x, y) => y.v - x.v).slice(0, 2).map((x) => x.k);
    const gaps = Object.entries(c.abilities)
      .filter(([k, v]) => v >= 7 && (ability[k] || 0) < 45)
      .slice(0, 2)
      .map(([k]) => ABILITIES[k].name);
    return { ...c, match: round(match), overlap, gaps, pref };
  }).sort((a, b) => b.match - a.match);

  const top = scored.slice(0, limit);
  const topScore = top[0]?.match || 0;
  return top.map((c) => ({
    careerId: c.id,
    name: c.name,
    match: c.match,
    why: buildCareerWhy(c, profile),
    gaps: c.gaps,
    path: c.path,
    subjects: c.subjects,
    outlook: c.outlook,
    salary: c.salary,
    firstStep: c.firstStep,
    tags: c.tags,
    confidence: topScore - c.match < 4 ? 'medium' : c.match >= 55 ? 'high' : 'low',
    evidence: profile.dimensions.filter((d) => c.overlap.includes(d.key)).flatMap((d) => d.evidence.map((e) => e.id)).slice(0, 3)
  }));
}

function buildCareerWhy(career, profile) {
  const parts = career.overlap.map((k) => {
    const d = profile.dimensions.find((x) => x.key === k);
    return `${d.name}（${d.score} 分）`;
  });
  return `你的高分区集中在 ${parts.join('、')}，与「${career.name}」的核心要求方向一致。`;
}

/* ---------------------------------- 动态提问 --------------------------------- */

export function nextQuestion(signals, band = '16-18') {
  const asked = new Set(signals.map((s) => s.meta?.questionId).filter(Boolean));
  const askedDims = new Set(signals.map((s) => s.dimension));
  const pool = QUESTIONS.filter((q) => q.bands.includes(band));

  // 优先级：覆盖最少的维度 → 该维度里最未问过的问题
  const dimCount = {};
  for (const q of pool) dimCount[q.dim] = 0;
  for (const s of signals) if (s.dimension in dimCount) dimCount[s.dimension] += 1;

  const ordered = pool
    .filter((q) => !asked.has(q.id))
    .sort((a, b) => (dimCount[a.dim] - dimCount[b.dim]) || Math.random() - 0.5);

  const q = ordered[0] || null;
  const remaining = ordered.length;
  return {
    question: q,
    remaining,
    progress: Math.round(((pool.length - remaining) / pool.length) * 100),
    reason: q
      ? `${DIM_LABEL[q.dim] || (q.dim === 'V' ? '价值观' : '职业偏好')} 方向目前证据最少（${dimCount[q.dim] || 0} 条），优先补足。`
      : '基础问题已问完，可以进入情景任务或生成分析。',
    needMore: remaining > 0,
    suggestions: signals.length < 3 ? ['再回答 2-3 个问题，分析会更可靠'] : ['可以去做一个情景任务验证你的判断']
  };
}

/* ---------------------------------- 分析报告 --------------------------------- */

export function analyze(student, signals) {
  const profile = buildProfile(signals);
  const matches = careerMatches(profile, 5);
  const evidenceIndex = [];
  const refMap = new Map();

  const refOf = (signal) => {
    if (!signal) return null;
    if (refMap.has(signal.id)) return refMap.get(signal.id);
    const ref = `E${evidenceIndex.length + 1}`;
    refMap.set(signal.id, ref);
    evidenceIndex.push({
      ref,
      id: signal.id,
      source: signal.source,
      dimension: signal.dimension,
      excerpt: (signal.excerpt || '').slice(0, 140),
      createdAt: signal.createdAt,
      itemId: signal.itemId
    });
    return ref;
  };

  const sortedDims = [...profile.dimensions].sort((a, b) => b.score - a.score);
  const topDims = sortedDims.filter((d) => d.count > 0).slice(0, 3);
  const sortedAbilities = [...profile.abilities].sort((a, b) => b.score - a.score);
  const topAbilities = sortedAbilities.filter((a) => a.count > 0).slice(0, 2);

  const strengths = topDims.map((d, i) => {
    const best = d.evidence[0];
    const refs = d.evidence.map((e) => refOf(e)).filter(Boolean);
    const rankWord = i === 0 ? '最稳定的兴趣方向' : i === 1 ? '明确的第二方向' : '正在浮现的方向';
    return {
      title: `${d.name}：${rankWord}`,
      dimension: d.key,
      score: d.score,
      text: scaleStrengthText(d) || `${d.name}维度累计 ${d.count} 条证据，加权得分 ${d.score}。你提到「${truncate(best?.excerpt, 46)}」——这类描述反复出现，说明它不是偶然偏好，而是你在具体情境里自然会做出的选择。`,
      evidence: refs,
      confidence: d.confidence
    };
  });

  // 待验证假设
  const hypotheses = [];
  const lowEvidenceHighScore = sortedDims.find((d) => d.count > 0 && d.count <= 2 && d.score >= 45);
  if (lowEvidenceHighScore) {
    hypotheses.push({
      id: 'h_coverage_' + lowEvidenceHighScore.key,
      text: `你对「${lowEvidenceHighScore.name}」的倾向可能被高估——目前只有 ${lowEvidenceHighScore.count} 条证据。`,
      why: '证据量偏少时，单次回答的权重会被放大，得分容易偏高。',
      verifyBy: `再做 1 个与${lowEvidenceHighScore.name}相关的情景任务，或请家长补充一次观察。`,
      dimension: lowEvidenceHighScore.key,
      confidence: 'low',
      evidence: lowEvidenceHighScore.evidence.map((e) => refOf(e))
    });
  }
  const parentVsStudent = findTension(signals, profile);
  if (parentVsStudent) hypotheses.push(parentVsStudent);

  if (sortedDims[0] && sortedDims[1] && sortedDims[0].score - sortedDims[1].score <= 6 && sortedDims[1].count > 0) {
    hypotheses.push({
      id: 'h_close_top2',
      text: `「${sortedDims[0].name}」与「${sortedDims[1].name}」目前几乎并列（${sortedDims[0].score} / ${sortedDims[1].score}），还分不出主次。`,
      why: '两者得分差距在误差范围内，可能只是最近接触到的内容不同造成的。',
      verifyBy: '把这两个方向各做一次真实的小任务（各 2 小时以上），再对比自己的投入度。',
      confidence: 'medium',
      evidence: [...sortedDims[0].evidence.slice(0, 1), ...sortedDims[1].evidence.slice(0, 1)].map((e) => refOf(e))
    });
  }
  if (matches.length >= 2 && matches[0].match - matches[1].match <= 3) {
    hypotheses.push({
      id: 'h_tie_career',
      text: `「${matches[0].name}」和「${matches[1].name}」的匹配度接近，暂时不能只押一个。`,
      why: '两者的兴趣结构高度重叠，真正的差别在能力与工作方式，需要实践验证。',
      verifyBy: `分别找一位${matches[0].name}和${matches[1].name}从业者聊 20 分钟，问"一天里最耗神的 part 是什么"。`,
      confidence: 'medium',
      evidence: []
    });
  }
  if (profile.coverage.parentInputs === 0) {
    hypotheses.push({
      id: 'h_no_parent',
      text: '目前所有证据都来自你本人，缺少家庭视角的交叉验证。',
      why: '自我报告容易受近期情绪与"我希望自己是这样"影响。',
      verifyBy: '请家长在「家长讨论」里补充 1 条他/她观察到的具体行为。',
      confidence: 'medium',
      evidence: []
    });
  }

  // 成长建议（绑定假设与职业）
  const suggestions = [];
  const topCareer = matches[0];
  if (topCareer) {
    suggestions.push({
      title: `用 2 小时验证「${topCareer.name}」`,
      action: topCareer.firstStep,
      horizon: '本周',
      evidence: topCareer.evidence.slice(0, 2),
      linkedTo: 'career'
    });
  }
  if (hypotheses[0]) {
    suggestions.push({
      title: '补一条能证伪的证据',
      action: hypotheses[0].verifyBy,
      horizon: '两周内',
      evidence: hypotheses[0].evidence || [],
      linkedTo: 'hypothesis'
    });
  }
  const weakestAbility = sortedAbilities.filter((a) => a.count > 0).slice(-1)[0];
  if (weakestAbility) {
    suggestions.push({
      title: `补一项基础能力：${weakestAbility.name}`,
      action: abilityAction(weakestAbility.key),
      horizon: '本学期',
      evidence: [],
      linkedTo: 'ability'
    });
  }
  if (student.ageBand === '12-15') {
    suggestions.push({
      title: '先扩大样本，不急着定方向',
      action: '这个阶段最重要的不是选专业，而是每学期接触 1 个全新领域（农业、制造、医疗、传媒都可）。方向感来自比较，不来自想象。',
      horizon: '本学期',
      evidence: [],
      linkedTo: 'stage'
    });
  } else {
    suggestions.push({
      title: '把兴趣接到"可交付的作品"上',
      action: '选一个方向，做出一件能被别人看到的东西（作品、报告、小程序、一场活动），再判断要不要继续。',
      horizon: '3 个月内',
      evidence: [],
      linkedTo: 'stage'
    });
  }

  const stated = profile.careerPrefs[0];
  const preference = stated ? {
    statedCareerId: stated.careerId,
    statedName: stated.name,
    statedStrength: Math.round(stated.strength * 100),
    topCareerId: matches[0]?.careerId,
    topCareerName: matches[0]?.name,
    aligned: matches[0]?.careerId === stated.careerId,
    note: matches[0]?.careerId === stated.careerId
      ? `你主动提到的「${stated.name}」与证据计算的最优方向一致。`
      : `你主动提到「${stated.name}」，而证据计算更偏向「${matches[0]?.name}」。这不代表你选错了——主动偏好本身也是重要证据，两者都应保留，用实践来分辨。`
  } : null;

  if (preference && !preference.aligned && stated.strength >= 0.8) {
    hypotheses.push({
      id: 'h_pref_mismatch',
      text: `你主动提到的「${preference.statedName}」与算法最优方向「${preference.topCareerName}」不一致。`,
      why: '主动偏好反映你已有认知与向往，算法反映行为证据；两者冲突时，通常说明你还缺少对某个方向的真实接触。',
      verifyBy: `分别做一次两个方向的真实小任务（各 2 小时），比较哪一次你更愿意在下班/放学后继续做。`,
      confidence: 'medium',
      evidence: stated.evidence?.slice(0, 2) || []
    });
  }

  const coverageScore = Math.round((profile.coverage.dimensionsCovered / RIASEC.length) * 60 + Math.min(40, profile.coverage.signals * 3));
  const overallConfidence = coverageScore >= 75 ? 'high' : coverageScore >= 45 ? 'medium' : 'low';

  const summary = buildSummary(student, profile, topDims, topAbilities, matches, coverageScore);

  return {
    studentId: student.id,
    signalCount: signals.length,
    mode: 'simulated',
    profileSnapshot: {
      dimensions: profile.dimensions.map(({ key, name, score, count, confidence }) => ({ key, name, score, count, confidence })),
      abilities: profile.abilities,
      intelligences: profile.intelligences,
      values: profile.values.slice(0, 4),
      careerPrefs: profile.careerPrefs.slice(0, 4)
    },
    summary,
    strengths,
    hypotheses,
    suggestions,
    careerMatches: matches,
    preference,
    scaleInsight: buildScaleInsight(signals),
    evidenceIndex,
    coverage: { ...profile.coverage, score: coverageScore },
    confidence: overallConfidence,
    caveats: buildCaveats(profile, overallConfidence)
  };
}

/**
 * 量表来源的证据不要用"你提到"的口吻——那是打分，不是原话。
 */
function scaleStrengthText(dim) {
  const scale = dim.evidence.filter((e) => e.source === 'assessment');
  if (!scale.length) return null;
  const items = scale.reduce((a, e) => a + (Number(e.meta?.items) || 0), 0);
  const percent = Math.round(scale[0].meta?.score ?? dim.score);
  const others = dim.evidence.length - scale.length;
  const head = `量表（${items} 题）给出 ${percent} 分`;
  if (!others) {
    return `${head}。这反映的是"你愿不愿意做这类事"，不是"你做得好不好"——它给的是一个需要验证的方向，而不是结论。`;
  }
  return `${head}，另有 ${others} 条记录（对话 / 情景任务 / 家长观察）指向同一个方向。两类证据互相印证：量表说"愿意做"，具体经历说"确实做过"。`;
}

const MI_LEARN = {
  lin: '读、写、讲：把要学的东西用自己的话讲一遍或写成一段笔记，比反复看更有效。',
  log: '先找规律再记细节：把知识点整理成因果链或表格，再用例题验证。',
  spa: '画出来：思维导图、结构图、时间轴，让抽象关系先变成图。',
  bod: '动手做一遍：实验、模型、角色扮演，身体参与过的内容不容易忘。',
  mus: '带上节奏：口诀、朗读、录音回听，把内容变成有韵律的东西。',
  int: '找人一起学：讲给别人听、小组讨论，在互动里校正理解。',
  intra: '留独处时间：先自己想清楚，再写下来，最后才讨论。',
  nat: '放回真实场景：观察、分类、比较，把知识挂在具体事物上。'
};

/**
 * 量表解读：把两套自评读成"兴趣结构 + 潜力方向 + 学习方式"。
 * 只描述，不定性：所有句子都要能落回具体分数，且明确写出自评的边界。
 */
function buildScaleInsight(signals) {
  const scaleSignals = signals.filter((s) => s.source === 'assessment');
  if (!scaleSignals.length) return null;

  const riasec = scaleSignals.filter((s) => s.meta?.assessmentScale === 'riasec');
  const mi = scaleSignals.filter((s) => s.meta?.assessmentScale === 'mi');

  const interests = riasec.map((s) => ({
    key: s.dimension,
    name: DIMENSIONS[s.dimension]?.name || s.dimension,
    desc: DIMENSIONS[s.dimension]?.desc || '',
    percent: Math.round(s.meta?.score ?? 0),
    rank: s.meta?.rank || null
  })).sort((a, b) => b.percent - a.percent);

  const potentials = mi.map((s) => {
    const key = s.meta?.miKey;
    return {
      key,
      name: MI_DIMENSIONS[key]?.name || key,
      desc: MI_DIMENSIONS[key]?.desc || '',
      percent: Math.round(s.meta?.score ?? 0),
      rank: s.meta?.rank || null
    };
  }).sort((a, b) => b.percent - a.percent);

  if (!interests.length && !potentials.length) return null;

  const code = riasec[0]?.meta?.code || null;
  const top = interests.slice(0, 2);
  const topThree = interests.slice(0, 3);
  const strongest = potentials.slice(0, 2);
  const weakest = potentials[potentials.length - 1];
  const narrative = [];

  if (code && topThree.length) {
    narrative.push(`霍兰德代码 ${code}：${topThree.map((t) => `${t.name} ${t.percent}`).join(' · ')}。`);
    if (top.length === 2) {
      const gap = top[0].percent - top[1].percent;
      narrative.push(gap <= 5
        ? `前两位只差 ${gap} 分，顺序可以互换——别把这三个字母当成"命定"，它只说明目前这两种兴趣几乎并列。`
        : `第 1 位比第 2 位高 ${gap} 分，结构还算清楚；这个组合通常意味着你更愿意在「${top[0].desc}」这类事上花时间，其次是「${top[1].desc}」。`);
    }
  }

  if (strongest.length) {
    narrative.push(`多元智能自评排在最前的是${strongest.map((s) => `${s.name} ${s.percent}`).join('、')}。这更像"你用什么方式学得进去"，不是能力排名。`);
    if (weakest && weakest.percent < strongest[0].percent - 10) {
      narrative.push(`相对最弱的是${weakest.name}（${weakest.percent}）。这不是缺陷，只说明这类内容要换个入口——比如先做成图、动手做一遍，或找人讲一遍。`);
    }
  }

  return {
    code,
    interests,
    potentials,
    topInterests: topThree,
    topPotentials: strongest,
    learningStyle: strongest[0] ? MI_LEARN[strongest[0].key] || '' : '',
    narrative,
    source: '自评量表',
    caveat: '量表是自评，不是能力测验：它描述"现在愿意做什么、怎么学更顺"，不预测成绩与收入，也不能用来评价别人。'
  };
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function abilityAction(key) {
  return {
    logic: '每周挑一个"我原本以为懂了"的概念，用 200 字写下它的推导过程，交给别人挑错。',
    verbal: '每周做一次 3 分钟不看稿的复述：把本周学到的一件事讲给家人听，记录对方提问。',
    spatial: '做一次真实的空间任务：量房并画出平面图，或按图纸组装一件家具。',
    social: '主动承担一次需要协调 3 人以上的小事，事后写下"谁在什么时候不配合、我怎么处理"。',
    self: '把一个大任务拆成 5 个 30 分钟的动作，写在纸上，每完成一个划掉。连续做两周。'
  }[key] || '选择一个具体的小任务，连续做两周。';
}

function findTension(signals, profile) {
  const parentSignals = signals.filter((s) => s.source === 'parent' && RIASEC.includes(s.dimension));
  if (!parentSignals.length) return null;
  const top = [...profile.dimensions].sort((a, b) => b.score - a.score)[0];
  if (!top) return null;
  const conflict = parentSignals.find((s) => s.dimension !== top.key && s.strength >= 0.6);
  if (!conflict) return null;
  return {
    id: 'h_parent_tension',
    text: `家长的观察指向「${DIM_LABEL[conflict.dimension]}」，与你自评最高的「${top.name}」不完全一致。`,
    why: `家长描述的是「${truncate(conflict.excerpt, 50)}」。家庭观察往往能捕捉到你在家中的另一面。`,
    verifyBy: '请家长和学生各自举一个最近的具体例子，看哪个更接近"没人要求时你也会做"的状态。',
    confidence: 'medium',
    evidence: [conflict.id, ...top.evidence.slice(0, 1).map((e) => e.id)]
  };
}

function buildSummary(student, profile, topDims, topAbilities, matches, coverageScore) {
  const name = student.name;
  if (!topDims.length) {
    return `${name} 目前还没有足够的探索记录，暂时无法形成可靠的画像。建议先完成 3 个对话问题和 1 个情景任务——那时系统才能给出有依据的判断，而不是猜测。`;
  }
  const dimText = topDims.map((d) => `${d.name}（${d.score}）`).join('、');
  const abText = topAbilities.length ? topAbilities.map((a) => a.name).join('、') : '尚不明显';
  const careerText = matches.slice(0, 2).map((m) => `${m.name}（${m.match}%）`).join('、');
  const valueText = profile.values.length ? `在价值观上，你更看重「${profile.values[0].name}」` : '价值观线索还不够';
  const strengthWord = coverageScore >= 75 ? '较为清晰' : coverageScore >= 45 ? '初步成形' : '还在早期';
  return `${name} 的画像目前${strengthWord}：${dimText} 是证据最集中的三个方向，其中 ${topDims[0].name} 最稳定。相对突出的能力是 ${abText}；${valueText}。据此，与现有证据最匹配的职业方向是 ${careerText}。需要说明的是，这些是基于 ${profile.coverage.signals} 条记录计算的倾向，不是对你的定性结论——下面列出的待验证假设，比结论本身更值得你花时间。`;
}

function buildCaveats(profile, confidence) {
  const out = [];
  if (profile.coverage.signals < 5) out.push('证据量偏少（少于 5 条），任何结论都只应作为起点假设。');
  if (profile.coverage.dimensionsCovered < 3) out.push('仅覆盖了部分兴趣维度，未覆盖的方向不代表"没有兴趣"，可能只是还没接触过。');
  if (profile.coverage.parentInputs === 0) out.push('缺少家长视角，家庭场景中的行为未被纳入。');
  if (profile.coverage.scenarios === 0) out.push('尚未完成情景任务，行为层面的证据较弱（当前主要依赖自我描述）。');
  if (profile.intelligences?.some((i) => i.count > 0)) {
    out.push('多元智能部分来自自评量表，描述的是学习偏好，不是能力测验；不要用它给自己或同学分类。');
  }
  if (confidence === 'low') out.push('整体置信度低：建议先补充探索，再据此做选科或专业决定。');
  return out;
}

/* ---------------------------------- 规划生成 --------------------------------- */

export function generatePlan(student, analysis, horizon = '5') {
  const top = analysis.profileSnapshot.dimensions.slice().sort((a, b) => b.score - a.score);
  const career = analysis.careerMatches[0];
  const career2 = analysis.careerMatches[1];
  const career3 = analysis.careerMatches[2];
  const dimName = (i) => top[i]?.name || '探索';
  const years = horizon === '10' ? 10 : 5;
  const ageNow = student.age || (student.ageBand === '12-15' ? 14 : student.ageBand === '19-22' ? 20 : 17);
  const y = (offset) => ageNow + offset;
  const stageOf = (offset) => {
    const age = ageNow + offset;
    if (age <= 15) return '初中';
    if (age <= 18) return '高中';
    if (age <= 22) return '高等教育';
    return '职业初期';
  };
  const values = analysis.profileSnapshot.values || [];

  const sections = {
    vision: `用 ${years} 年，把「${dimName(0)}」上的兴趣变成能被别人看见的能力，在 ${career ? career.name : '一个具体领域'} 方向完成从"感兴趣"到"能交付"的转变；同时保留 ${dimName(1)} 作为第二支撑，不提前锁死路径。`,

    summary: {
      stage: `${student.grade || stageOf(0)} · ${playerStageLabel(student.ageBand)} · 已积累 ${analysis.signalCount} 条证据`,
      interests: top.slice(0, 3).map((d) => `${d.name}（${d.score}）`),
      abilities: analysis.profileSnapshot.abilities.filter((a) => a.count > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((a) => `${a.name}（${a.score}）`),
      values: values.slice(0, 2).map((v) => v.name),
      openQuestions: (analysis.hypotheses || []).slice(0, 3).map((h) => h.text),
      scope: `本规划适用于 ${stageOf(0)} 至 ${stageOf(years)} 阶段。它是基于当前证据的工作假设，不是对 ${years} 年后职业与收入的预测；每次新增证据后应重新校准。`
    },

    positioning: {
      headline: career ? `${career.name}方向 · 以${dimName(0)}为核` : `以${dimName(0)}为核的探索期`,
      detail: analysis.summary
    },

    paths: [career, career2, career3].filter(Boolean).map((c, i) => ({
      name: c.name,
      match: c.match,
      role: i === 0 ? '主路径' : i === 1 ? '并行备选' : '低成本备选',
      evidence: c.why + (c.gaps?.length ? ` 当前短板：${c.gaps.join('、')}。` : ''),
      toVerify: i === 0
        ? `这条路径最需要验证的是：你能否忍受它日常里最枯燥的部分（而不是只喜欢它的高光时刻）。`
        : `这条路径与主路径的差别不在兴趣，而在工作方式与回报结构，需要用真实接触来比较。`,
      tasks: [c.firstStep, `找一位${c.name}从业者聊 20 分钟，问"一天里最耗神的是什么"`, `完成一次 ${c.name} 相关的最小任务（不超过 2 小时）`],
      skills: Object.entries(c.abilities || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => ABILITIES[k]?.name).filter(Boolean),
      difficulties: c.gaps?.length ? `需要补：${c.gaps.join('、')}；同时要接受这条路径的入门周期与不确定性。` : '入门门槛之外，最大风险是"只看到介绍，没接触过日常"。',
      alternatives: i === 0 && career2 ? `若主路径验证失败，可平移到 ${career2.name}（兴趣结构重叠度高）。` : '若资源受限，可先走"技能先行"路线：先用 6 个月掌握一项可换钱的入门技能。',
      familySupport: i === 0 ? '提供一次真实体验机会（参观 / 短期实践）与不超过约定额度的预算。' : '不急于否定，允许用一次低成本尝试来验证。',
      path: c.path,
      firstStep: c.firstStep
    })),

    phases: [
      {
        code: 'A',
        title: '打底：认识自己，建立探索习惯',
        range: `现在 — 1 年内（${stageOf(0)}）`,
        goal: '把"我好像喜欢"变成"我做过、我知道自己喜不喜欢"，并建立每周固定的投入节奏。',
        actions: [
          `每周固定 2 小时投入「${dimName(0)}」相关的事，记录做了什么、卡在哪`,
          '每月写一篇 300 字复盘：这周最投入的 30 分钟在做什么',
          '完成 2 次低成本职业体验（线上访谈或校内实践均可）'
        ],
        deliverables: ['1 份兴趣投入记录（不少于 8 周）', '2 份职业访谈笔记'],
        resources: ['家长：每学期 1 次体验机会 + 时间保障', '学校：学科老师或生涯课老师 30 分钟交流', 'AI 导师：每 8 周重新分析一次'],
        alternatives: '若线下机会受限，用公开课、纪录片、从业者公开访谈替代，仍要求写复盘。',
        metrics: ['连续 8 周有投入记录', '能说清 3 个具体场景下自己喜欢/不喜欢什么'],
        reviewAt: '每 8 周',
        adjustIf: '连续 4 周无法投入 → 把单次时长降到 30 分钟，或换一个更易启动的载体。'
      },
      {
        code: 'B',
        title: '积累：把兴趣变成可迁移能力',
        range: `1 — 3 年内（${stageOf(1)}）`,
        goal: '产出第一件能被外部评价的作品或成果，并接受一次真实反馈。',
        actions: [
          career ? `按路径推进：${career.path.slice(0, 2).join(' → ')}` : '确定一条入门路径并完成前置学习',
          `完成一件可展示的作品：${career ? career.firstStep : '能被他人使用或评价的东西'}`,
          analysis.suggestions[0] ? `针对待验证假设做一次实验：${analysis.suggestions[0].action}` : '每学期补 1 个从未接触过的领域'
        ],
        deliverables: ['1 件公开作品 / 1 次公开展示', '1 份包含失败经验的复盘'],
        resources: ['工具与素材（低成本替代方案优先）', '一位可提供反馈的成年人（老师 / 从业者 / 规划师）'],
        alternatives: '若作品方向受阻，改为"拆解并复现一个现成作品"，同样计入交付。',
        metrics: ['是否按时交付', '是否收到并处理了至少 1 条负面反馈'],
        reviewAt: '每学期末',
        adjustIf: '连续两次延期 → 缩小交付范围到原来的一半，优先保证完成。'
      },
      {
        code: 'C',
        title: '定向：接上升学与专业选择',
        range: `3 — 5 年内（${stageOf(3)}）`,
        goal: '用证据而非想象做一次关键选择（选科 / 志愿 / 专业 / 第一份工作）。',
        actions: [
          '把候选路径压缩到 2 条，各做一次"真实一天"体验',
          '查证目标专业/岗位的官方要求（以当年官方发布为准，不使用过时数据）',
          '与家长完成一次结构化讨论：分歧写成可验证的问题，而不是态度之争'
        ],
        deliverables: ['1 份选择依据说明（含被放弃的选项与理由）', '1 份家长共识记录'],
        resources: ['学校升学指导', '目标院校/企业公开信息', '（专业版）真人规划师审核'],
        alternatives: career2 ? `若主路径受限，切换到 ${career2.name}，两者共享的能力可直接迁移。` : '若目标受阻，先进入相邻领域积累，再二次选择。',
        metrics: ['选择依据中至少 3 条来自亲身经历而非他人建议', '关键节点未错过截止时间'],
        reviewAt: '每学期 + 关键节点前 3 个月',
        adjustIf: '出现新的强证据（持续 3 个月以上的新兴趣）→ 重新评估，而不是硬走原路。'
      },
      {
        code: 'D',
        title: '展开：在真实世界里校准',
        range: `5 — 10 年内（${stageOf(6)} 起）`,
        goal: '进入真实的学习/工作环境，用实际表现替换推测，形成自己的方法论。',
        actions: [
          '完成学业或职业入门，进入真实项目',
          '每年做一次"方向体检"：还在做这件事的理由是什么',
          '把经验教给别人一次（带新人 / 分享 / 写教程）'
        ],
        deliverables: ['独立负责 1 个完整项目', '1 份个人能力盘点'],
        resources: ['行业导师 / 同行网络', '持续学习预算'],
        alternatives: '若行业环境变化，优先迁移"可迁移能力"（分析、表达、协作、交付），而不是死守岗位名称。',
        metrics: ['能否独立交付', '是否有可复用的方法沉淀'],
        reviewAt: '每年一次',
        adjustIf: '连续 2 年无成长感 → 换环境而不是硬撑；先确认是能力瓶颈还是环境瓶颈。'
      }
    ],

    actions: [
      { title: `每周 2 小时「${dimName(0)}」专项投入`, cadence: '每周', owner: '学生' },
      { title: '每月一次与家长的 20 分钟方向复盘（只对账，不评价）', cadence: '每月', owner: '学生 + 家长' },
      { title: '每学期更新一次本规划，记录改了什么、为什么', cadence: '每学期', owner: '学生' },
      ...(student.plan === 'pro' ? [{ title: '每季度与规划师对齐一次，校准路径', cadence: '每季度', owner: '规划师' }] : [])
    ],

    risks: [
      { risk: '兴趣衰减：新鲜感过去后投入下降', response: '把目标从"坚持"改成"做出一个小成品"，用交付驱动持续。' },
      { risk: '证据偏差：只接触过少量领域就下结论', response: `每学期补 1 个全新领域；${analysis.hypotheses[0]?.verifyBy || '用情景任务交叉验证'}。` },
      ...(career2 ? [{ risk: `过早锁定「${career.name}」，忽略并列方向`, response: `保留 ${career2.name} 作为备选，用 1 次真实访谈比较两者的日常状态。` }] : []),
      { risk: '家庭期待与个人倾向不一致', response: '在家长讨论中把分歧写成具体问题，用证据而不是态度讨论。' },
      { risk: '资源不足被误判为能力不足', response: '优先选择零成本替代任务（公开课、校内实践、开源项目），并把"没机会做"与"做不好"分开记录。' }
    ],

    support: [
      { who: '家庭', what: '提供尝试预算与时间（每学期 1 次外部体验），不替孩子做选择。' },
      { who: '学校', what: '争取学科老师或生涯课老师的 1 次 30 分钟交流。' },
      { who: 'AI 导师', what: '每学期重新分析一次，检查假设是否被证伪。' },
      ...(student.plan === 'pro' ? [{ who: '规划师', what: '审核路径可行性，补充本地升学与就业信息。' }] : [])
    ]
  };

  return { horizon: String(years), sections, analysisId: analysis.id };
}

function playerStageLabel(band) {
  return { '12-15': '初中阶段', '16-18': '高中阶段', '19-22': '高等教育/间隔年' }[band] || band;
}

/* ---------------------------------- 家长讨论回复 --------------------------------- */

export function discussReply({ student, analysis, messages, parentText }) {
  const profile = analysis?.profileSnapshot;
  const dims = profile?.dimensions?.slice().sort((a, b) => b.score - a.score) || [];
  const top = dims[0];
  const relevantEvidence = analysis?.evidenceIndex?.filter((e) => e.source === 'parent').slice(-2) || [];
  const refs = relevantEvidence.map((e) => e.ref);

  let reply = `我记下了这条观察。`;
  if (top) {
    reply += `把它和现有证据放在一起看：${student.name} 目前最稳定的方向是「${top.name}」（${top.score} 分）。`;
  }
  reply += `你描述的这件事，更接近"${guessDimension(parentText)}"的表现，我会把它作为一条新证据纳入画像，并重新计算权重——如果它和之前的结论冲突，我会明确标出来，而不是硬凑一致。`;

  const hypothesis = analysis?.hypotheses?.[0];
  if (hypothesis) {
    reply += `\n\n现在最需要澄清的是这个假设：${hypothesis.text} 你家里有没有见过相反的情况？`;
  } else {
    reply += `\n\n为了判断这条观察的代表性，我想确认一个细节：这件事是他主动做的，还是你要求之后才做的？`;
  }
  reply += `\n\n（提示：具体的"什么时候、做了什么、结果如何"比评价性的描述更有用，比如"上周三自己把路由器拆了又装回去"就比"他动手能力很强"更可验证。）`;

  return { text: reply, refs, cited: hypothesis ? [hypothesis.text] : [] };
}

function guessDimension(text) {
  const { dims } = extractFromText(text);
  const best = Object.entries(dims).sort((a, b) => b[1] - a[1])[0];
  return best ? DIM_LABEL[best[0]] : '综合表现';
}

/* ---------------------------------- 规划导出 --------------------------------- */

/**
 * 方案讨论里的 AI 回应：不抢人的判断权，只做三件事——
 * 把模糊的说法落到方案的具体段落、给一条可执行的修改、把"改不改"交回学生与家长。
 */
export function planDiscussReply({ student, plan, text, role = 'student' }) {
  const t = String(text || '').trim();
  const s = plan?.sections || {};
  const who = role === 'parent' ? '家长' : role === 'advisor' ? '规划师' : '你';
  const phase = (s.phases || [])[0];
  const parts = [`我记下了${who}说的「${truncate(t, 40)}」。`];
  const topics = [];

  if (/成绩|分数|考试|排名|作业|时间|耽误|影响|太累/.test(t)) {
    topics.push('时间冲突');
    parts.push(`这属于"投入和学业抢时间"。方案里对应的是阶段 ${phase?.code || 'A'} 的第一条行动「${truncate((phase?.actions || [])[0] || '', 28)}」。真要落地，建议把它从"每周固定几次"降成"每周一次、每次 45 分钟"，并把评估指标从"做出作品"改成"完成 3 次记录"——先保住可持续性。`);
  }
  if (/钱|费用|预算|贵|负担|经济/.test(t)) {
    topics.push('成本');
    parts.push('关于成本，方案里的体验任务刻意选了零成本或低成本的形式（公开课、开源项目、校内活动）。如果要追加培训或设备投入，建议先只投一次性的最小金额，验证过再追加——预算上限需要家长确认。');
  }
  if (/不现实|太远|太难|不可能|稳定|就业|找工作|没前途/.test(t)) {
    topics.push('现实性');
    parts.push(`方案里保留了多条路径和"替代路径"，就是为了避免把${student?.ageBand === '12-15' ? '初中' : '高中'}阶段的一个判断当成终身决定。如果对第 1 条路径的现实性有疑问，可以把它换成第 2 条作为主路径——但要写明理由，方便以后回看。`);
  }
  if (/不想|不喜欢|没兴趣|讨厌|反对/.test(t)) {
    topics.push('不认同');
    parts.push('不认同本身就是有价值的信息。方案里任何一条都可以被否决：点「编辑方案」删掉或改写，改动会生成新版本并重新走确认，旧版本不会被覆盖。');
  }
  if (/同意|支持|可以|没问题|挺好/.test(t) && topics.length === 0) {
    topics.push('认同');
    parts.push('同意的话，还需要学生和家长分别在方案页确认一次；两边都确认后才会变成最终方案。中途任何一方反悔，方案都会退回待确认。');
  }

  if (!topics.length) {
    parts.push('这条我还没法直接对到方案的某一段。能说得再具体一点吗——是哪个阶段、哪条行动让你觉得不对，或者你希望改成什么样？具体到"把 A 阶段的每周两次改成每周一次"这种程度，我就能给出明确的修改建议。');
  }

  parts.push(`我不会自己动手改方案：修改要由学生或家长点「编辑方案」写入，生成 v${(plan?.version || 1) + 1} 后重新确认。`);
  return { text: parts.join('\n\n'), topics };
}

export function planToMarkdown(student, plan) {
  const s = plan.sections;
  const L = [];
  const sum = s.summary || {};
  L.push(`# ${student.name} 的个人成长与职业发展规划`);
  L.push('');
  L.push(`> 周期：${plan.horizon} 年 · 版本 v${plan.version} · 状态：${planStatusLabel(plan.status)}`);
  L.push(`> 生成：${new Date(plan.createdAt).toLocaleString('zh-CN')} · 依据：${plan.analysisSignalCount || 0} 条成长记录`);
  L.push(`> 参与者：${(plan.participants || []).join(' / ')}${plan.professionalReviewed ? ` · 已由真人规划师（${plan.advisorName}）审核` : ' · 未经真人规划师审核'}`);
  L.push('');
  L.push('## 一、方向愿景');
  L.push(s.vision || '');
  L.push('');
  L.push('## 二、个人发展摘要');
  if (sum.stage) L.push(`- **当前阶段**：${sum.stage}`);
  if (sum.interests?.length) L.push(`- **兴趣证据**：${sum.interests.join('、')}`);
  if (sum.abilities?.length) L.push(`- **已表现能力**：${sum.abilities.join('、')}`);
  if (sum.values?.length) L.push(`- **重视的价值**：${sum.values.join('、')}`);
  if (sum.openQuestions?.length) {
    L.push('- **仍待澄清**：');
    for (const q of sum.openQuestions) L.push(`  - ${q}`);
  }
  if (sum.scope) L.push(`- **适用范围与限制**：${sum.scope}`);
  L.push('');
  L.push('## 三、多路径分析');
  for (const p2 of s.paths || []) {
    L.push(`### ${p2.name}（匹配度 ${p2.match} · ${p2.role}）`);
    L.push(`- **与现有证据的关联**：${p2.evidence}`);
    L.push(`- **需要验证的假设**：${p2.toVerify}`);
    L.push(`- **可尝试的体验任务**：${(p2.tasks || []).join('；')}`);
    L.push(`- **需要培养的能力**：${(p2.skills || []).join('、') || '待补充'}`);
    L.push(`- **可能遇到的困难**：${p2.difficulties}`);
    L.push(`- **低成本替代方案**：${p2.alternatives}`);
    L.push(`- **家长可提供的支持**：${p2.familySupport}`);
    L.push('');
  }
  L.push('## 四、分阶段路线图');
  for (const ph of s.phases || []) {
    L.push(`### 阶段 ${ph.code}｜${ph.title}（${ph.range}）`);
    L.push(`- **阶段目标**：${ph.goal}`);
    L.push(`- **具体行动**：${(ph.actions || []).join('；')}`);
    L.push(`- **预期成果**：${(ph.deliverables || []).join('；')}`);
    L.push(`- **所需资源**：${(ph.resources || []).join('；')}`);
    L.push(`- **可选替代路径**：${ph.alternatives}`);
    L.push(`- **评估指标**：${(ph.metrics || []).join('；')}`);
    L.push(`- **复盘时间**：${ph.reviewAt}`);
    L.push(`- **调整条件**：${ph.adjustIf}`);
    L.push('');
  }
  L.push('## 五、日常行动');
  for (const a of s.actions || []) L.push(`- [ ] ${a.title}（${a.cadence} · ${a.owner}）`);
  L.push('');
  L.push('## 六、风险与应对');
  for (const r of s.risks || []) L.push(`- **${r.risk}** → ${r.response}`);
  L.push('');
  L.push('## 七、支持系统');
  for (const p3 of s.support || []) L.push(`- **${p3.who}**：${p3.what}`);
  if (s.advisorNote) {
    L.push('');
    L.push('## 八、真人规划师意见');
    L.push(s.advisorNote);
  }
  L.push('');
  L.push('## 九、说明');
  L.push('本规划由 FuturePath AI 依据学生成长记录生成，随新证据更新；它是可修改的工作假设，不是判决，也不预测十年后的职业与收入。职业与升学信息请以官方最新发布为准。');
  return L.join('\n');
}

export function planStatusLabel(status) {
  return { draft: '草稿', pending_confirm: '待学生与家长确认', confirmed: '已确认', superseded: '已被新版本替代' }[status] || status;
}
