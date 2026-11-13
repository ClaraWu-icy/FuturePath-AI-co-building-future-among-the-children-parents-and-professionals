/**
 * 云服务前端层：登录、档案上云 / 回填、同步状态。
 *
 * 三条边界，不要越界：
 *  1. 客户端只做「搬运」，不做业务判断。谁能看哪个档案、能不能定稿，仍然由服务端决定。
 *  2. 数据访问一律走 SDK，且初始化参数全部来自 publicConfig（cloud-config.js）。
 *  3. 云表按 owner_id 隔离，所以不能、也不需要手传 owner_id —— 由 DEFAULT auth.uid() 填。
 */
import { publicConfig } from './cloud-config.js';
import { api, state, setSession } from './core.js';

/** 本地集合 → 云表。改这张表就等于改同步范围。 */
export const TABLES = {
  students: 'fp_students',
  consents: 'fp_consents',
  signals: 'fp_signals',
  assessments: 'fp_assessments',
  analyses: 'fp_analyses',
  plans: 'fp_plans',
  planComments: 'fp_plan_comments'
};

const ACCOUNT_TABLE = 'fp_accounts';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';

let client = null;
let sdkLoading = null;
let lastIds = {};
let syncing = null;
let timer = null;
let lastSyncAt = null;
let lastError = '';

/** IIFE 全局形式（本项目没有打包步骤），按需加载：不用云端的人不必付这份流量 */
function ensureSdk() {
  if (globalThis.WorkBuddyCloud) return Promise.resolve(globalThis.WorkBuddyCloud);
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SDK_URL;
    tag.async = true;
    tag.crossOrigin = 'anonymous';
    tag.onload = () => (globalThis.WorkBuddyCloud
      ? resolve(globalThis.WorkBuddyCloud)
      : reject(new Error('云端 SDK 加载异常')));
    tag.onerror = () => reject(new Error('云端 SDK 加载失败，请检查网络后重试'));
    document.head.appendChild(tag);
  }).catch((err) => { sdkLoading = null; throw err; });
  return sdkLoading;
}

/** 云端只接受应用发布域名的 Origin；本地 4310 调试时明确降级，而不是静默失败 */
export function cloudSupport() {
  if (!publicConfig?.endpoint || !publicConfig?.publishableKey) return { ok: false, reason: '缺少云端配置' };
  try {
    if (location.origin !== new URL(publicConfig.endpoint).origin) {
      return { ok: false, reason: '云端登录只在发布域名可用，本地调试请用演示账号' };
    }
  } catch {
    return { ok: false, reason: '云端配置格式异常' };
  }
  return { ok: true, reason: '' };
}

async function clientOf() {
  if (client) return client;
  const s = await ensureSdk();
  client = s.createWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
    publishableKey: publicConfig.publishableKey
  });
  return client;
}

export function cloudStatus() {
  return {
    support: cloudSupport(),
    uid: state.user?.cloudUid || null,
    signedIn: Boolean(state.user?.cloudUid),
    lastSyncAt,
    lastError
  };
}

/* ------------------------------- 登录 ------------------------------- */

export async function currentCloudSession() {
  let c;
  try { c = await clientOf(); } catch { return null; }
  if (!c) return null;
  try {
    const { data } = await c.auth.getSession();
    return data || null;
  } catch {
    return null;
  }
}

export async function signInWithProvider(provider) {
  const support = cloudSupport();
  if (!support.ok) throw new Error(support.reason);
  const c = await clientOf();

  // 回调只能落在站点根路径（静态站点没有 history fallback），
  // 但根路径上的业务查询参数要带上，否则登录回来会丢掉分享码。
  const back = new URL(location.href);
  back.hash = '';
  for (const key of ['code', 'state', 'provider']) back.searchParams.delete(key);

  const { data, error } = await c.auth.signInWithOAuth({ provider, redirectTo: back.toString() });
  if (error) throw new Error(error.message || '无法发起云端登录');
  location.assign(data.url);
}

/**
 * 启动时的回调分发：必须先于任何路由守卫执行，code 是一次性的。
 * 只按 provider 调一个处理器 —— 两个都调会让每次成功登录都报另一个渠道的错误。
 */
export async function handleCloudCallback() {
  const url = new URL(location.href);
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) return { handled: false };

  const provider = url.searchParams.get('provider');
  if (provider !== 'workbuddy' && provider !== 'wechat') {
    return { handled: true, error: '授权回调缺少有效的登录方式，请重新登录。' };
  }
  let c;
  try { c = await clientOf(); } catch (err) { return { handled: true, error: err.message }; }
  if (!c) return { handled: true, error: '云端 SDK 未加载，无法完成登录。' };

  const fn = provider === 'workbuddy' ? c.auth.handleWorkBuddyCallback : c.auth.handleWechatWebCallback;
  if (typeof fn !== 'function') {
    return { handled: true, error: '当前云端 SDK 版本不支持该登录方式，请升级后重试。' };
  }

  const { data, error } = await fn.call(c.auth);
  if (error) return { handled: true, error: error.message || '登录失败，请重试。' };
  if (!data) return { handled: true };

  for (const key of ['code', 'state', 'provider']) url.searchParams.delete(key);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return { handled: true, session: data };
}

/** 云会话 → 应用会话；首次登录返回 needsProfile，让用户先选角色 */
export async function exchangeCloudSession(profile = {}) {
  const session = await currentCloudSession();
  if (!session?.user?.id) throw new Error('云端会话已失效，请重新登录');

  const out = await api('/api/auth/cloud', {
    method: 'POST',
    body: {
      cloudUid: session.user.id,
      cloudName: session.user.name || '',
      ...profile
    }
  });
  if (out.needsProfile) return { needsProfile: true };

  setSession({ token: out.token, user: out.user, students: out.students, studentId: out.studentId });

  // 读云端失败不该把人挡在门外：登录已经成立，稍后写回时还会重试。
  let remoteCount = 0;
  try {
    const pulled = await pullAll();
    remoteCount = Object.values(pulled).reduce((n, rows) => n + rows.length, 0);
    if (remoteCount === 0) {
      // 新档案云端是空的：先把本地镜像推上去
      await syncNow();
    } else {
      const imported = await api('/api/cloud/import', { method: 'POST', body: { entities: pulled } });
      if (imported.students?.length) {
        setSession({ user: out.user, students: imported.students, studentId: imported.studentId });
      }
    }
  } catch (err) {
    lastError = err.message || '云端档案读取失败';
    window.dispatchEvent(new CustomEvent('fp:cloud', { detail: cloudStatus() }));
  }
  return { user: out.user, remoteCount, created: Boolean(out.created) };
}

export async function cloudSignOut() {
  try {
    const c = await clientOf();
    if (c) await c.auth.signOut();
  } catch { /* 云端登出失败也要清掉本地会话 */ }
  lastIds = {};
  lastSyncAt = null;
}

/* ------------------------------- 同步 ------------------------------- */

async function pullAll() {
  const c = await clientOf();
  const bundle = {};
  for (const [key, table] of Object.entries(TABLES)) {
    const { data, error } = await c.database.from(table).select('app_id, student_id, payload');
    if (error) throw new Error(`读取云端档案失败（${table}）：${error.message || '未知错误'}`);
    const rows = data || [];
    bundle[key] = rows.map((r) => r.payload).filter(Boolean);
    lastIds[key] = new Set(rows.map((r) => r.app_id));
  }
  return bundle;
}

async function pushAll(snapshot) {
  const c = await clientOf();
  const ownerName = state.user?.displayName || state.user?.name || null;
  let written = 0;

  for (const [key, table] of Object.entries(TABLES)) {
    const rows = snapshot.entities?.[key] || [];
    const payload = rows.map((row) => ({
      app_id: row.id,
      student_id: row.studentId || row.id,
      // owner_name 只是展示快照；权限永远看 owner_id
      owner_name: ownerName,
      payload: row,
      updated_at: new Date().toISOString()
    }));

    if (payload.length) {
      const { error } = await c.database.from(table).upsert(payload, { onConflict: 'owner_id,app_id' });
      // upsert 被 RLS 拦下时不会抛错，只会少写行，所以这里把错误显式抛出来
      if (error) throw new Error(`写入云端失败（${table}）：${error.message || '未知错误'}`);
      written += payload.length;
    }

    const current = new Set(rows.map((r) => r.id));
    const stale = [...(lastIds[key] || [])].filter((id) => !current.has(id));
    if (stale.length) {
      const { error } = await c.database.from(table).delete().in('app_id', stale);
      if (error) throw new Error(`清理云端旧记录失败（${table}）：${error.message || '未知错误'}`);
    }
    lastIds[key] = current;
  }

  // 账号行：一条就够，记录角色与展示名，方便云端管理界面辨认
  if (snapshot.account) {
    const { error } = await c.database.from(ACCOUNT_TABLE).upsert({
      app_user_id: snapshot.account.appUserId,
      role: snapshot.account.role,
      owner_name: ownerName,
      payload: snapshot.account,
      updated_at: new Date().toISOString()
    }, { onConflict: 'owner_id' });
    if (error) throw new Error(`写入云端账号失败：${error.message || '未知错误'}`);
  }
  return written;
}

export async function syncNow() {
  if (!state.user?.cloudUid) return null;
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const snapshot = await api('/api/cloud/snapshot');
      await pushAll(snapshot);
      lastSyncAt = new Date();
      lastError = '';
      window.dispatchEvent(new CustomEvent('fp:cloud', { detail: cloudStatus() }));
      return snapshot;
    } catch (err) {
      lastError = err.message || '同步失败';
      window.dispatchEvent(new CustomEvent('fp:cloud', { detail: cloudStatus() }));
      throw err;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** 写操作后合并成一次同步，避免连续点选时把云端打满 */
export function scheduleSync() {
  if (!state.user?.cloudUid) return;
  if (!cloudSupport().ok) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow().catch(() => { /* 失败状态已经记在 lastError */ }); }, 900);
}

window.addEventListener('fp:mutated', (e) => {
  if (e.detail?.path?.startsWith('/api/auth/')) return;
  scheduleSync();
});
