/**
 * FuturePath AI — 标准化量表
 * --------------------------------------------------------------------------
 * 两套工具，都是学界公开、结构清楚的框架：
 *
 * 1. 霍兰德职业兴趣量表（RIASEC）
 *    Holland, J. L. (1997). Making vocational choices (3rd ed.)
 *    六个类型：现实型 R / 研究型 I / 艺术型 A / 社会型 S / 企业型 E / 常规型 C
 *    本实现：每个类型 6 道活动题，5 点 Likert（1 完全不像我 — 5 非常像我），共 36 题。
 *    输出：六维得分 + 三字代码（Holland Code）+ 区分度 + 一致性。
 *
 * 2. 多元智能自评（基于加德纳理论）
 *    Gardner, H. (1983/1999). Frames of Mind.
 *    八项：语言 / 逻辑数理 / 空间 / 身体动觉 / 音乐 / 人际 / 内省 / 自然观察
 *    本实现：每项 5 道自述题，5 点 Likert，共 40 题。
 *    输出：八项相对强弱 + 学习方式建议。**不合成总分**（多元智能本身不主张总分）。
 *
 * 诚实边界（写进结果页，也写在这里）：
 *  - 两套都是自评，不是能力测验，不能用于诊断、分班或给人贴标签。
 *  - 多元智能理论在学界仍有争议（八项智能是否彼此独立缺乏充分实证），
 *    这里只把它当作"描述自己怎么学更顺"的框架，不当作科学定论。
 *  - 兴趣量表测的是"现在愿意做什么"，不是"以后能做成什么"。
 *  - 每道题的维度归属只留在服务端，不下发前端，避免按分值作答。
 */
import { DIMENSIONS, MI_DIMENSIONS, RIASEC } from './content.js';

export const SCALE_VERSION = '1.0';

export const LIKERT = [
  { value: 1, label: '完全不像我', short: '不像' },
  { value: 2, label: '不太像', short: '不太像' },
  { value: 3, label: '一半一半', short: '一般' },
  { value: 4, label: '比较像', short: '比较像' },
  { value: 5, label: '非常像我', short: '很像' }
];

/* ============================== RIASEC 题库 ============================== */

const RIASEC_ITEMS = {
  R: [
    '把坏掉的台灯、耳机或自行车拆开，试着修好它',
    '自己动手组装一件家具或模型',
    '在户外干活：搬东西、翻土、修整场地',
    '学一门手艺（木工、焊接、烘焙、缝纫都算）',
    '亲手操作机器、工具或运动器材，而不是在旁边看',
    '把脑子里的想法做成实物，哪怕做得粗糙'
  ],
  I: [
    '追着一个"为什么"查到底，直到能讲清楚',
    '做需要推理和计算的题，越难越想试',
    '看科普、纪录片，了解世界是怎么运转的',
    '用数据或实验去验证一个说法是真是假',
    '研究一个系统的内部结构（算法、电路、生态系统）',
    '和别人争论时，更在意谁的逻辑站得住'
  ],
  A: [
    '写故事、诗、歌词，或者拍一段视频',
    '画图、做设计、搭配颜色和版式',
    '用音乐、影像或表演表达一种情绪',
    '想出一个别人没做过的点子，并把它做出来',
    '布置一个空间，让它看起来有感觉',
    '把一件事换一种说法，让它更有意思'
  ],
  S: [
    '听朋友讲他的烦恼，不急着给建议',
    '给同学讲题，直到他真的听懂',
    '照顾小孩、老人或小动物',
    '在团队里调解矛盾，让两边都能下台',
    '参加志愿服务，帮到具体的人',
    '主动去关心那个被冷落的人'
  ],
  E: [
    '发起一次活动，从定时间到拉人参加',
    '说服别人接受你的方案',
    '在小组里分工、盯进度',
    '推销一样东西，或者为某件事筹款',
    '站出来代表大家说话',
    '把一个想法讲得让人愿意跟着做'
  ],
  C: [
    '把一堆杂乱的信息整理成清楚的表格',
    '按清单一步步把事情做完，不漏项',
    '管预算、记账，盯着数字不出错',
    '检查一份材料里的错字和前后不一致',
    '把流程写成别人也能照做的步骤',
    '让文件和资料一直保持有序'
  ]
};

/* ============================ 多元智能题库 ============================ */

const MI_ITEMS = {
  lin: [
    '我能用几句话把一件复杂的事讲明白',
    '我喜欢读文字类的东西：小说、报道、长文',
    '人名、地名、台词这类东西我记得比别人快',
    '写东西时，我能找到更准确的那个词',
    '别人说过我"会讲话"或"会写"'
  ],
  log: [
    '我喜欢找出数字或事情之间的规律',
    '遇到问题我会先拆成几步再动手',
    '我能很快看出一个说法哪里不合逻辑',
    '我喜欢用图表、公式或模型来解释事情',
    '做数学或推理题时，我能一个人啃很久'
  ],
  spa: [
    '我能看着平面图想象出它立起来的样子',
    '到一个新地方，我很快能记住路线',
    '我能在脑子里"转"一个物体，想象它另一面什么样',
    '拼图、乐高、装东西这类事我上手快',
    '我对颜色、比例、位置是否协调很敏感'
  ],
  bod: [
    '学动作时，我看一遍就能模仿个大概',
    '我手比较巧：拆、装、剪、缝、切都还行',
    '我需要动起来才能想清楚事情',
    '打球、跳舞、骑车这类身体活动我学得快',
    '我能用手做出比较精细的东西'
  ],
  mus: [
    '我能听出一段旋律准不准、跑没跑调',
    '我会不自觉地跟着节奏打拍子',
    '听过几遍的旋律我能记住',
    '不同的声音（雨声、车声、乐器）会让我有感觉',
    '我试过自己写歌、编曲，或认真练一种乐器'
  ],
  int: [
    '我能察觉别人今天情绪不太对',
    '朋友之间有矛盾时会来找我',
    '几个人意见不同时，我能找到大家都接受的做法',
    '我大概知道什么话会让对方舒服或难受',
    '在陌生的群体里，我比较快能和人熟起来'
  ],
  intra: [
    '我知道自己什么时候是在硬撑',
    '我会定期想"我到底想要什么"',
    '我能说出自己擅长什么、不擅长什么',
    '情绪上来时，我能先停一下再决定怎么做',
    '我喜欢一个人待着，整理自己的想法'
  ],
  nat: [
    '我能注意到植物、天气、季节的细小变化',
    '我认识不少动植物，能叫出名字',
    '我喜欢观察动物或昆虫怎么活动',
    '我会留意环境里的规律（哪里风大、哪里积水）',
    '我对"人怎么影响自然"这类问题有兴趣'
  ]
};

/* ============================== 结果解释文案 ============================== */

const RIASEC_NOTES = {
  R: {
    label: '现实型',
    text: '你更愿意和实物、工具、机器、身体打交道，而不是只处理文字和概念。这类人上手快、能落地，但容易跳过"为什么"，停在"会做"而不是"能设计"。',
    action: '把一件修好/做好的东西留下过程记录（照片 + 三行说明），它会成为你最有说服力的作品。'
  },
  I: {
    label: '研究型',
    text: '你愿意为一个问题花时间，喜欢推理、验证、把机制弄清楚。这类人不怕复杂，但要留意：一直在准备、迟迟不产出，是这条路上最常见的坑。',
    action: '选一个你真好奇的问题，两周内产出一页结论（哪怕结论是"我还没搞明白，卡在这里"）。'
  },
  A: {
    label: '艺术型',
    text: '你需要表达：文字、图像、声音、空间都行。你在意"是不是我自己的东西"，对重复和套话耐受度低。要留意的是，表达欲需要作品来接住。',
    action: '一个月内做完一件能被别人看到的小作品，不要停在草稿。'
  },
  S: {
    label: '社会型',
    text: '你的注意力天然落在人身上：谁需要帮忙、谁被落下、气氛对不对。这类人是团队里的黏合剂，但容易把别人的事排在自己前面。',
    action: '做一次有边界的帮助：只帮到"他能自己做"为止，然后记录结果。'
  },
  E: {
    label: '企业型',
    text: '你喜欢把事推起来：定目标、拉人、说服、承担结果。这类人行动力强，但要小心把"赢"当成唯一反馈。',
    action: '发起一件 3 个人以内、两周能结束的小事，从头到尾负责一次。'
  },
  C: {
    label: '常规型',
    text: '你靠秩序做事：清单、流程、细节、可预期的交付。这类人常常是让事情真正落地的那一个，但要注意别让"按流程"变成不敢变。',
    action: '把一个混乱的东西（文件夹、班费账、社团资料）整理成别人能直接用的结构。'
  }
};

const MI_NOTES = {
  lin: {
    text: '你更容易通过"读、写、讲"来学习：把内容说出来或写下来，比反复看更有效。',
    learn: '读完一章后合上书，用自己的话讲 3 分钟；讲不顺的地方就是没懂的地方。'
  },
  log: {
    text: '你倾向于找规律、讲逻辑、用数据说话。抽象的东西对你不算难，难的是忍受没有结构的材料。',
    learn: '把知识点整理成因果链或公式，再找一个反例去检验它。'
  },
  spa: {
    text: '你用图像和空间思考：位置、结构、比例对你来说是可以"看见"的。',
    learn: '把要记的东西画成图（思维导图、流程图、剖面图），比抄笔记有效。'
  },
  bod: {
    text: '你通过身体和手来理解世界。坐着听讲对你来说效率最低，动手做一遍往往就懂了。',
    learn: '把抽象内容变成一个可以操作的动作或模型，边做边记。'
  },
  mus: {
    text: '你对声音、节奏、韵律敏感。信息如果能带上节奏，你记得更牢。',
    learn: '把要背的内容编成有节奏的口诀，或录成音频在路上听。'
  },
  int: {
    text: '你在与人互动中理解得最快：讨论、教别人、观察别人的反应，都是你的学习方式。',
    learn: '找一个同学互相讲，讲给对方听比独自看三遍更有效。'
  },
  intra: {
    text: '你需要独处来消化：想清楚自己的位置、情绪和目标之后，你的效率会明显提高。',
    learn: '每天留 10 分钟写"今天什么让我有劲/没劲"，一个月后回看模式。'
  },
  nat: {
    text: '你擅长观察和分类：自然界的差异、变化、规律对你有天然的吸引力。',
    learn: '把知识放进真实场景里观察（植物、天气、地理），用分类和比较来记。'
  }
};

/* ============================== 量表元信息 ============================== */

const INSTRUMENTS = {
  riasec: {
    key: 'riasec',
    name: '霍兰德职业兴趣量表',
    short: '霍兰德 RIASEC',
    theory: 'Holland, 1997 · 六类型兴趣模型',
    intro: '36 道活动题。判断"你愿不愿意做"，不是"你做得好不好"。没有正确答案，凭第一反应答。',
    minutes: 6,
    dimensionOf: (item) => item.dim,
    dims: RIASEC.map((k) => ({ key: k, ...DIMENSIONS[k] })),
    items: RIASEC.flatMap((k) => RIASEC_ITEMS[k].map((text, i) => ({ id: `${k.toLowerCase()}${i + 1}`, dim: k, text })))
  },
  mi: {
    key: 'mi',
    name: '多元智能自评（加德纳）',
    short: '多元智能',
    theory: 'Gardner, 1983 · 八项智能',
    intro: '40 道自述题。判断"这句话像不像你"，不是"你有多聪明"。八项之间不做总分比较。',
    minutes: 5,
    dimensionOf: (item) => item.dim,
    dims: Object.entries(MI_DIMENSIONS).map(([key, v]) => ({ key, ...v })),
    items: Object.entries(MI_ITEMS).flatMap(([k, arr]) => arr.map((text, i) => ({ id: `${k}${i + 1}`, dim: k, text })))
  }
};

export function listInstruments() {
  return Object.values(INSTRUMENTS).map((ins) => ({
    key: ins.key,
    name: ins.name,
    short: ins.short,
    theory: ins.theory,
    intro: ins.intro,
    minutes: ins.minutes,
    itemCount: ins.items.length,
    dims: ins.dims.map((d) => ({ key: d.key, name: d.name, desc: d.desc, color: d.color }))
  }));
}

export function getInstrument(scale) {
  return INSTRUMENTS[scale] || null;
}

/** 下发题目：只给 id / 序号 / 题干，不带维度归属 */
export function publicItems(scale) {
  const ins = getInstrument(scale);
  if (!ins) return null;
  return ins.items.map((it, i) => ({ id: it.id, n: i + 1, text: it.text }));
}

/* ================================ 计分 ================================ */

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const sd = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
};

function round1(n) {
  return Math.round(n * 10) / 10;
}

function normaliseAnswers(scale, answers) {
  const ins = getInstrument(scale);
  const out = {};
  for (const item of ins.items) {
    const raw = answers?.[item.id];
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 1 && v <= 5) out[item.id] = Math.round(v);
  }
  return out;
}

/**
 * RIASEC：六维求和 → 0-100（(sum-n)/(4n)），再做组内 z 分数用于比较相对强弱。
 * 输出三字代码、区分度、六边形一致性。
 */
function scoreRiasec(items, answers) {
  const byDim = {};
  for (const k of RIASEC) byDim[k] = items.filter((it) => it.dim === k);

  const rows = RIASEC.map((k) => {
    const values = byDim[k].map((it) => answers[it.id]).filter((v) => v !== undefined);
    const sum = values.reduce((a, b) => a + b, 0);
    const n = byDim[k].length;
    const answered = values.length;
    const percent = answered ? Math.round(((sum - answered) / (answered * 4)) * 100) : 0;
    return {
      key: k,
      name: DIMENSIONS[k].name,
      short: DIMENSIONS[k].short,
      desc: DIMENSIONS[k].desc,
      color: DIMENSIONS[k].color,
      label: RIASEC_NOTES[k].label,
      raw: sum,
      max: n * 5,
      avg: answered ? round1(sum / answered) : 0,
      percent: Math.max(0, Math.min(100, percent)),
      answered,
      count: n,
      itemSd: round1(sd(values))
    };
  });

  const m = mean(rows.map((r) => r.percent));
  const s = sd(rows.map((r) => r.percent)) || 1;
  for (const r of rows) r.z = round1((r.percent - m) / s);

  const sorted = [...rows].sort((a, b) => b.raw - a.raw || RIASEC.indexOf(a.key) - RIASEC.indexOf(b.key));
  sorted.forEach((r, i) => { r.rank = i + 1; });

  const code = sorted.slice(0, 3).map((r) => r.key).join('');
  const diff = Math.round(((sorted[0].raw - sorted[sorted.length - 1].raw) / (byDim.R.length * 4)) * 100);
  const i1 = RIASEC.indexOf(sorted[0].key);
  const i2 = RIASEC.indexOf(sorted[1].key);
  const dist = Math.min(Math.abs(i1 - i2), 6 - Math.abs(i1 - i2));
  const consistency = dist === 1 ? 'high' : dist === 2 ? 'medium' : 'low';
  const gap12 = sorted[0].raw - sorted[1].raw;

  return {
    rows,
    code,
    top: sorted.slice(0, 3).map((r) => r.key),
    low: sorted.slice(-1).map((r) => r.key),
    quality: {
      differentiation: Math.max(0, Math.min(100, diff)),
      differentiationLabel: diff >= 45 ? '明确' : diff >= 22 ? '中等' : '平缓',
      consistency,
      consistencyLabel: { high: '高（相邻类型）', medium: '中（间隔一位）', low: '低（相对类型）' }[consistency],
      topGap: gap12
    }
  };
}

function scoreMi(items, answers) {
  const keys = Object.keys(MI_DIMENSIONS);
  const rows = keys.map((k) => {
    const list = items.filter((it) => it.dim === k);
    const values = list.map((it) => answers[it.id]).filter((v) => v !== undefined);
    const sum = values.reduce((a, b) => a + b, 0);
    const answered = values.length;
    const percent = answered ? Math.round(((sum - answered) / (answered * 4)) * 100) : 0;
    return {
      key: k,
      name: MI_DIMENSIONS[k].name,
      short: MI_DIMENSIONS[k].short,
      desc: MI_DIMENSIONS[k].desc,
      color: MI_DIMENSIONS[k].color,
      raw: sum,
      max: list.length * 5,
      avg: answered ? round1(sum / answered) : 0,
      percent: Math.max(0, Math.min(100, percent)),
      answered,
      count: list.length,
      itemSd: round1(sd(values)),
      note: MI_NOTES[k]?.text || '',
      learn: MI_NOTES[k]?.learn || ''
    };
  });

  const m = mean(rows.map((r) => r.percent));
  const s = sd(rows.map((r) => r.percent)) || 1;
  for (const r of rows) r.z = round1((r.percent - m) / s);

  const sorted = [...rows].sort((a, b) => b.percent - a.percent);
  sorted.forEach((r, i) => { r.rank = i + 1; });

  return {
    rows,
    top: sorted.slice(0, 3).map((r) => r.key),
    low: sorted.slice(-2).map((r) => r.key),
    quality: {
      differentiation: Math.round(sorted[0].percent - sorted[sorted.length - 1].percent),
      differentiationLabel: '按相对强弱排序，不做总分'
    }
  };
}

/**
 * 统一计分入口。
 * @returns {object} 结果（不含持久化信息），含 quality / notes / caveats
 */
export function scoreInstrument(scale, answers) {
  const ins = getInstrument(scale);
  if (!ins) throw new Error('量表不存在');
  const clean = normaliseAnswers(scale, answers);
  const answered = Object.keys(clean).length;
  const total = ins.items.length;
  const values = Object.values(clean);

  const base = {
    scale,
    scaleName: ins.name,
    scaleVersion: SCALE_VERSION,
    itemCount: total,
    answered,
    completeness: Math.round((answered / total) * 100)
  };

  const quality = {
    flat: answered > 0 && new Set(values).size === 1,
    rushed: false,
    incomplete: answered < total
  };

  const core = scale === 'riasec' ? scoreRiasec(ins.items, clean) : scoreMi(ins.items, clean);

  // 同一维度内部作答差异：太小说明没区分，太大说明题目可能没读懂
  const answeredRows = core.rows.filter((r) => r.answered >= 2);
  const avgSd = mean(answeredRows.map((r) => r.itemSd));
  quality.avgItemSd = round1(avgSd);
  quality.inconsistent = avgSd >= 1.35;
  quality.compressed = avgSd > 0 && avgSd <= 0.4;

  const notes = core.top.map((key, i) => {
    if (scale === 'riasec') {
      const row = core.rows.find((r) => r.key === key);
      return {
        rank: i + 1,
        key,
        title: `${RIASEC_NOTES[key].label}（${row.name}）· 第 ${i + 1} 位`,
        text: RIASEC_NOTES[key].text,
        action: RIASEC_NOTES[key].action,
        percent: row.percent
      };
    }
    const row = core.rows.find((r) => r.key === key);
    return {
      rank: i + 1,
      key,
      title: `${row.name} · 第 ${i + 1} 位`,
      text: MI_NOTES[key].text,
      action: MI_NOTES[key].learn,
      percent: row.percent
    };
  });

  const caveats = [];
  if (quality.incomplete) {
    caveats.push(`只答了 ${answered}/${total} 题，结果按已答题目计算，参考价值有限。`);
  }
  if (quality.flat) {
    caveats.push('本次所有题目都选了同一档，六个/八个维度无法区分，这次结果不建议使用，请重测。');
  }
  if (quality.compressed) {
    caveats.push(`同一维度内的题目作答几乎一致（平均标准差 ${quality.avgItemSd}），可能是快速勾选，建议重测。`);
  }
  if (quality.inconsistent) {
    caveats.push(`同一维度内的题目作答差异较大（平均标准差 ${quality.avgItemSd}），可能是题目理解不一致，结果仅供参考。`);
  }

  if (scale === 'riasec') {
    caveats.push(
      '兴趣量表测的是"现在愿意做什么"，不是"以后能做成什么"，也不预测收入与成就。',
      '霍兰德六类型是描述工具，不是把人分成六种。多数人是 2–3 个类型的组合。'
    );
    if (core.quality.topGap <= 2) {
      caveats.push(`第 1、2 位的原始分只差 ${core.quality.topGap} 分，代码的前两位顺序可以互换。`);
    }
    if (core.quality.differentiation < 22) {
      caveats.push(`区分度 ${core.quality.differentiation}/100，六个维度拉不开差距——说明你的兴趣还没分化，这在中学阶段很常见，不代表没有特点。`);
    }
    if (core.quality.consistency === 'low') {
      caveats.push('你最高的两个类型在霍兰德六边形上正好相对（如 R 与 S、I 与 E）。这类组合的人常常要同时满足两种很不同的需求，选专业时更要看具体课程，而不是只看专业名。');
    }
  } else {
    caveats.push(
      '多元智能描述的是"你更容易用哪种方式学"，不是智商，更不是高低排名。',
      '加德纳的多元智能理论在学界仍有争议（八项智能是否彼此独立缺少充分实证）。本量表只作为自我观察的框架，不用于分班、诊断或评价他人。',
      '自评会受"我希望自己是"的影响。想更准，就对照具体作品和别人的观察看。'
    );
    if (mean(core.rows.map((r) => r.percent)) >= 85) {
      caveats.push('你把大部分题都打了高分，八项之间拉不开差距。下次可以刻意区分"最喜欢"和"也还行"。');
    }
  }

  return {
    ...base,
    scores: core.rows.sort((a, b) => a.rank - b.rank),
    top: core.top,
    low: core.low,
    code: core.code || null,
    quality: { ...quality, ...core.quality },
    notes,
    caveats,
    summary: buildSummary(scale, core, quality)
  };
}

function buildSummary(scale, core, quality) {
  if (quality.flat) return '本次作答全部选了同一档，无法形成有效结果。';
  const first = core.rows.find((r) => r.key === core.top[0]);
  if (scale === 'riasec') {
    const names = core.top.map((k) => RIASEC_NOTES[k].label).join(' → ');
    const alt = core.top.slice(0, 2).map((k) => DIMENSIONS[k].name).join('、');
    return `你的霍兰德代码是 ${core.code}（${names}）。得分最高的两项是${alt}，区分度 ${core.quality.differentiation}/100，属于${core.quality.differentiationLabel}的兴趣结构。`;
  }
  const second = core.rows.find((r) => r.key === core.top[1]);
  return `目前最突出的是「${first.name}」（${first.percent}），其次是「${second.name}」（${second.percent}）。把这八项当成分工不同的工具，而不是排名。`;
}

export { RIASEC_NOTES, MI_NOTES, RIASEC_ITEMS, MI_ITEMS };
