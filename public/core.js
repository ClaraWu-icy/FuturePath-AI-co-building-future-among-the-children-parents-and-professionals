/* FuturePath AI — 前端核心：请求、状态、通用组件、图表 */

export const state = {
  token: localStorage.getItem('fp_token') || '',
  user: null,
  students: [],
  studentId: localStorage.getItem('fp_student') || '',
  meta: null,
  ai: null,
  lite: localStorage.getItem('fp_lite') === '1',
  lastRoute: ''
};

export const DIM_COLORS = { R: '#0f766e', I: '#1d4ed8', A: '#a21caf', S: '#b45309', E: '#b91c1c', C: '#475569' };

const RETRY_STATUS = new Set([404, 408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 写操作成功后广播一次，云同步层据此把档案回写到云端。
 * 用事件而不是直接 import，是为了避免 core ↔ cloud 的循环依赖；
 * 认证与云同步自身的接口不回写，免得自激。
 */
function notifyMutation(path, method) {
  if (method === 'GET') return;
  if (path.startsWith('/api/auth/') || path.startsWith('/api/cloud/')) return;
  window.dispatchEvent(new CustomEvent('fp:mutated', { detail: { path, method } }));
}

export async function api(path, { method = 'GET', body, raw = false } = {}) {
  // 分享型反向代理偶发返回纯文本 404（同一请求重试即 200），
  // 对幂等请求做有限重试，避免整页因为一次抖动而“加载失败”。
  const idempotent = method === 'GET';
  // GET 可安全重试；POST 仅在网关返回错误页（非 JSON / 502-504）时重试一次，
  // 此时请求并没有真正到达业务层，不会造成重复写入。
  const maxAttempts = idempotent ? 3 : 2;

  for (let attempt = 1; ; attempt += 1) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(state.token ? { Authorization: `Bearer ${state.token}`, 'X-Auth-Token': state.token } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (netErr) {
      if (attempt < maxAttempts) { await sleep(200 * attempt); continue; }
      throw new Error('网络连接失败，请检查网络后重试');
    }

    if (raw) {
      if (!res.ok) throw new Error('导出失败（' + res.status + '）');
      return res;
    }

    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // 非 JSON（多为代理的错误页）视作可重试故障
      if (attempt < maxAttempts) { await sleep(200 * attempt); continue; }
      throw new Error(res.ok ? '服务器返回格式异常' : `请求失败（${res.status}），请稍后重试`);
    }

    if (!res.ok) {
      const canRetry = attempt < maxAttempts
        && (idempotent ? RETRY_STATUS.has(res.status) : [502, 503, 504].includes(res.status));
      if (canRetry) {
        await sleep(200 * attempt);
        continue;
      }
      const err = new Error(data?.error || `请求失败（${res.status}）`);
      err.status = res.status;
      err.details = data?.details;
      if (res.status === 401 && !path.includes('/auth/login')) {
        clearSession();
        location.hash = '#/login';
      }
      throw err;
    }
    notifyMutation(path, method);
    return data;
  }
}
/**
 * 同时把 token 写进 Cookie。
 * 部分分享网关/反向代理会剥掉 Authorization 头，Cookie 则能正常透传，
 * 这样登录后的每个请求都不会莫名 401。
 */
function setTokenCookie(token) {
  try {
    document.cookie = `fp_token=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 14}; SameSite=Lax`;
  } catch { /* 隐私模式下可能失败，不影响 localStorage */ }
}

function clearTokenCookie() {
  try { document.cookie = 'fp_token=; path=/; max-age=0; SameSite=Lax'; } catch { /* 忽略 */ }
}

export function setSession({ token, user, students, studentId }) {
  if (token) { state.token = token; localStorage.setItem('fp_token', token); setTokenCookie(token); }
  if (user) state.user = user;
  if (students) state.students = students;
  if (studentId) { state.studentId = studentId; localStorage.setItem('fp_student', studentId); }
}

export function clearSession() {
  state.token = ''; state.user = null; state.students = []; state.studentId = '';
  localStorage.removeItem('fp_token');
  localStorage.removeItem('fp_student');
  clearTokenCookie();
}

/** 启动时把已存的 token 同步到 Cookie，兼容此前写入的会话 */
export function syncTokenCookie() {
  if (state.token) setTokenCookie(state.token);
}

export function currentStudent() {
  return state.students.find((s) => s.id === state.studentId) || state.students[0] || null;
}

export function selectStudent(id) {
  state.studentId = id;
  localStorage.setItem('fp_student', id);
}

export function setLite(on) {
  state.lite = Boolean(on);
  localStorage.setItem('fp_lite', on ? '1' : '0');
  document.documentElement.classList.toggle('lite', state.lite);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${withTime ? ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) : ''}`;
}

export function relTime(iso) {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '—';
  const diff = Date.now() - d;
  const day = 86400000;
  if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))} 分钟前`;
  if (diff < day) return `${Math.round(diff / 3600000)} 小时前`;
  if (diff < 30 * day) return `${Math.round(diff / day)} 天前`;
  return fmtDate(iso);
}

/* ------------------------------- 交互反馈 ------------------------------- */

let toastTimer = null;
export function toast(message, type = 'info', ms = 3200) {
  const box = document.getElementById('toast');
  if (!box) return;
  box.innerHTML = `<div class="toast toast-${type}" role="status">
    <span class="toast-mark" aria-hidden="true">${type === 'error' ? '!' : type === 'ok' ? '✓' : 'i'}</span>
    <span>${esc(message)}</span></div>`;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), ms);
}

export function setBusy(el, busy, text = '处理中…') {
  if (!el) return;
  if (busy) {
    el.dataset.original = el.innerHTML;
    el.disabled = true;
    el.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(text)}`;
  } else {
    el.disabled = false;
    el.innerHTML = el.dataset.original || el.innerHTML;
  }
}

export function modal({ title, body, actions = [{ label: '知道了', value: null }], wide = false }) {
  const host = document.getElementById('modal');
  return new Promise((resolve) => {
    host.innerHTML = `<div class="modal-backdrop" data-close>
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">
          ${actions.map((a, i) => `<button class="btn ${a.kind || (i === actions.length - 1 ? 'btn-primary' : 'btn-ghost')}" data-idx="${i}" ${a.disabled ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}
        </div>
      </div></div>`;
    host.classList.add('open');
    const close = (val) => { host.classList.remove('open'); host.innerHTML = ''; document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    host.querySelectorAll('[data-idx]').forEach((b) => b.addEventListener('click', () => close(actions[Number(b.dataset.idx)].value)));
    host.querySelector('[data-close]').addEventListener('click', (e) => { if (e.target.matches('[data-close]')) close(null); });
    host.querySelector('button')?.focus();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板', 'ok');
  } catch {
    toast('复制失败，请手动选择文本', 'error');
  }
}

/* ------------------------------- 图表 ------------------------------- */

export function radarChart(dims, { size = 300, max = 100 } = {}) {
  const cx = size / 2; const cy = size / 2 + 4; const r = size * 0.31;
  const n = dims.length || 6;
  const pt = (i, v) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rr = (Math.max(0, Math.min(max, v)) / max) * r;
    return [cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr];
  };
  const rings = [0.25, 0.5, 0.75, 1].map((k) =>
    `<polygon points="${dims.map((_, i) => pt(i, max * k).join(',')).join(' ')}" fill="none" stroke="var(--line)" stroke-width="1" ${k === 1 ? '' : 'stroke-dasharray="2 4"'}/>`
  ).join('');
  const axes = dims.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, max)[0]}" y2="${pt(i, max)[1]}" stroke="var(--line)"/>`).join('');
  const shape = dims.map((d, i) => pt(i, d.score).join(',')).join(' ');
  const labels = dims.map((d, i) => {
    // 标签固定在环外固定距离，避免 100 分时顶点与文字叠在一起
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lr = r + 34;
    const x = cx + Math.cos(angle) * lr;
    const y = cy + Math.sin(angle) * lr;
    const anchor = Math.abs(x - cx) < 12 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x}" y="${y + 4}" text-anchor="${anchor}" font-size="11.5" fill="var(--muted)">${esc(d.name)}</text>
      <text x="${x}" y="${y + 18}" text-anchor="${anchor}" font-size="10.5" fill="${DIM_COLORS[d.key] || 'var(--brand)'}" font-weight="600">${d.score}</text>`;
  }).join('');
  const dots = dims.map((d, i) => {
    const [x, y] = pt(i, d.score);
    return `<circle cx="${x}" cy="${y}" r="3.4" fill="${DIM_COLORS[d.key] || 'var(--brand)'}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size + 26}" class="radar" role="img" aria-label="兴趣六维雷达图：${dims.map((d) => d.name + d.score + '分').join('，')}">
    ${rings}${axes}
    <polygon points="${shape}" fill="rgba(15,118,110,.14)" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${labels}
  </svg>`;
}

export function barList(items, { color = 'var(--brand)' } = {}) {
  return `<div class="barlist">${items.map((it) => `
    <div class="barrow">
      <span class="barlabel">${esc(it.name)}</span>
      <span class="bartrack"><span class="barfill" style="width:${Math.max(2, Math.min(100, it.score))}%;background:${it.color || color}"></span></span>
      <span class="barval">${it.score}</span>
    </div>`).join('')}</div>`;
}

export function ring(pct, { size = 64, label = '' } = {}) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="ring" role="img" aria-label="完成度 ${pct}%">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="6"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--brand)" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="53%" text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)">${pct}%</text>
    ${label ? `<text x="50%" y="72%" text-anchor="middle" font-size="9" fill="var(--muted)">${esc(label)}</text>` : ''}
  </svg>`;
}

/** AI 导师形象：纯 SVG，可换表情，低带宽模式下关闭动画 [ref:avatar] */
export function mentorAvatar(size = 72, mood = 'calm') {
  const mouth = mood === 'happy' ? 'M-7,12 q7,7 14,0' : mood === 'think' ? 'M-5,14 q5,-3 10,0' : 'M-5,13 q5,4 10,0';
  return `<svg class="mentor-svg mood-${mood}" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="AI 导师（虚拟形象）">
    <defs>
      <radialGradient id="ma-g" cx="40%" cy="32%" r="74%">
        <stop offset="0%" stop-color="#7dd3c8"/><stop offset="55%" stop-color="#2dd4bf"/><stop offset="100%" stop-color="#0f766e"/>
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="92" rx="21" ry="4" fill="rgba(15,118,110,.14)"/>
    <g class="mentor-float">
      <rect x="19" y="16" width="62" height="66" rx="26" fill="url(#ma-g)"/>
      <path d="M27 30c6-7 14-11 23-11 9 0 17 4 23 11-7 5-15 8-23 8s-16-3-23-8z" fill="rgba(255,255,255,.2)"/>
      <ellipse cx="50" cy="52" rx="21" ry="17.5" fill="rgba(255,255,255,.92)"/>
      <g class="mentor-blink">
        <ellipse cx="42.5" cy="49" rx="2.7" ry="3.6" fill="#123"/>
        <ellipse cx="57.5" cy="49" rx="2.7" ry="3.6" fill="#123"/>
        <circle cx="43.4" cy="47.6" r=".9" fill="#fff"/><circle cx="58.4" cy="47.6" r=".9" fill="#fff"/>
      </g>
      <path d="${mouth}" stroke="#0f766e" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="36" cy="58" rx="3.2" ry="2.2" fill="#fca5a5" opacity=".5"/>
      <ellipse cx="64" cy="58" rx="3.2" ry="2.2" fill="#fca5a5" opacity=".5"/>
      <circle cx="50" cy="12" r="3.2" fill="#fbbf24"/>
      <line x1="50" y1="8.8" x2="50" y2="15.2" stroke="rgba(255,255,255,.5)" stroke-width="1"/>
    </g>
  </svg>`;
}

export function emptyState(title, text, action = '') {
  return `<div class="empty"><div class="empty-mark">○</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export function statusTag(text, kind = 'neutral') {
  return `<span class="tag tag-${kind}">${esc(text)}</span>`;
}

export function scoreTone(score) {
  if (score >= 70) return 'good';
  if (score >= 45) return 'mid';
  return 'low';
}

/** 触发一次同路由重绘（数据变更后使用） */
export function refresh() {
  window.dispatchEvent(new Event('hashchange'));
}

/** 带鉴权下载（Markdown / HTML 导出） */
export async function download(path) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="([^"]+)"/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : 'futurepath-export';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
