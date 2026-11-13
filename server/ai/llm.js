/**
 * 可选的真实模型接入层（OpenAI 兼容 /chat/completions）。
 * 设计：结构化打分与证据始终由本地引擎计算，模型只负责把结构化事实写成更自然的叙述，
 * 并在失败/超时时静默回退到规则引擎文本 —— 绝不在未配置时假装调用模型。
 */
import { config, aiStatus } from '../config.js';

function buildPrompt(kind, payload) {
  const base =
    '你是 FuturePath AI 的生涯分析引擎，服务对象是中国青少年及其家长。' +
    '你必须只使用给出的结构化事实，不得编造分数、经历或职业信息。' +
    '语言要求：简体中文，克制、具体、不说教，不使用"天生""注定""必须"等绝对化表达。' +
    '不要输出 Markdown 标题，不要输出与任务无关的解释。';
  if (kind === 'analysis') {
    return `${base}\n\n任务：根据以下结构化分析结果，改写 "summary" 字段（120-180 字）并给出 3 条 "suggestions"（每条 40-70 字，必须落到可执行动作）。\n只输出 JSON：{"summary":"...","suggestions":["...","...","..."]}\n\n结构化事实：\n${JSON.stringify(payload, null, 2)}`;
  }
  if (kind === 'discuss') {
    return `${base}\n\n任务：以 AI 导师身份回复家长。要求：先确认家长的观察，再把它与已有证据对齐（指出一致或冲突），最后提出 1 个具体的追问。140-220 字。\n只输出 JSON：{"text":"..."}\n\n上下文：\n${JSON.stringify(payload, null, 2)}`;
  }
  return `${base}\n\n只输出 JSON：{"text":"..."}\n\n${JSON.stringify(payload)}`;
}

async function callModel(kind, payload) {
  const status = aiStatus();
  if (!status.live) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.apiKey}`
      },
      body: JSON.stringify({
        model: config.ai.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你只输出合法 JSON，不输出任何其他内容。' },
          { role: 'user', content: buildPrompt(kind, payload) }
        ]
      })
    });
    if (!res.ok) {
      console.warn(`[ai] 模型返回 ${res.status}，回退到规则引擎`);
      return null;
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (err) {
    console.warn('[ai] 模型调用失败，回退到规则引擎：', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 用模型润色分析文本；失败返回 null，由调用方保留规则文本 */
export async function polishAnalysis(analysis) {
  if (!aiStatus().live) return null;
  const payload = {
    studentAgeBand: analysis.ageBand,
    dimensions: analysis.profileSnapshot.dimensions,
    abilities: analysis.profileSnapshot.abilities.map((a) => ({ name: a.name, score: a.score })),
    values: analysis.profileSnapshot.values,
    topCareers: analysis.careerMatches.slice(0, 3).map((c) => ({ name: c.name, match: c.match, gaps: c.gaps })),
    strengths: analysis.strengths.map((s) => s.title),
    hypotheses: analysis.hypotheses.map((h) => h.text),
    signals: analysis.signalCount,
    ruleSummary: analysis.summary,
    ruleSuggestions: analysis.suggestions.map((s) => s.title)
  };
  const out = await callModel('analysis', payload);
  if (!out || typeof out.summary !== 'string') return null;
  return out;
}

export async function polishDiscussion(payload) {
  if (!aiStatus().live) return null;
  const out = await callModel('discuss', payload);
  if (!out || typeof out.text !== 'string') return null;
  return out;
}
