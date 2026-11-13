import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const provider = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'simulated')).toLowerCase();

export const config = {
  root: ROOT,
  port: Number(process.env.PORT || 4310),
  host: process.env.HOST || '0.0.0.0',
  secret: process.env.AUTH_SECRET || 'futurepath-dev-secret-change-me',
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  publicDir: path.join(ROOT, 'public'),
  // AI 提供方：simulated（内置可解释规则引擎，默认）/ openai（任意 OpenAI 兼容接口）
  ai: {
    provider: provider === 'openai' ? 'openai' : 'simulated',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000)
  }
};

export const BUILD = 'v3-cookie-auth';

export function aiStatus() {
  const live = config.ai.provider === 'openai' && Boolean(config.ai.apiKey);
  return {
    build: BUILD,
    provider: config.ai.provider,
    live,
    mode: live ? 'llm' : 'simulated',
    model: live ? config.ai.model : 'futurepath-rule-engine-v1',
    note: live
      ? '已连接 OpenAI 兼容模型，结论文本由模型生成，结构化打分与证据仍由本地引擎计算。'
      : '当前为模拟模式：使用内置可解释规则引擎（非真实大模型调用），所有结论均来自学生作答记录的加权计算。'
  };
}
