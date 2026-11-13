import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { uid, nowISO } from './util.js';

let DB_FILE = null;

/**
 * 选择真正可写的数据文件。
 * 本地运行时用 data/db.json；部署到只读镜像或只读挂载时自动退到临时目录，
 * 并带走已有的演示数据，避免线上首屏是空库。
 */
function dbFile() {
  if (DB_FILE) return DB_FILE;
  const preferred = path.join(config.dataDir, 'db.json');
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.accessSync(config.dataDir, fs.constants.W_OK);
    DB_FILE = preferred;
  } catch {
    const fbDir = path.join(os.tmpdir(), 'futurepath-ai-data');
    fs.mkdirSync(fbDir, { recursive: true });
    DB_FILE = path.join(fbDir, 'db.json');
    try {
      if (fs.existsSync(preferred) && !fs.existsSync(DB_FILE)) fs.copyFileSync(preferred, DB_FILE);
    } catch { /* 忽略复制失败，至少保证能写 */ }
    console.warn(`[db] 数据目录不可写，已切换到 ${DB_FILE}`);
  }
  return DB_FILE;
}

const EMPTY = {
  users: [],
  students: [],
  signals: [],
  assessments: [],
  exploreSessions: [],
  analyses: [],
  discussions: [],
  plans: [],
  planComments: [],
  planRevisions: [],
  advisorSessions: [],
  advisorNotes: [],
  events: []
};

let state = null;
let writeTimer = null;
let writing = false;

function load() {
  if (state) return state;
  const file = dbFile();
  if (fs.existsSync(file)) {
    try {
      state = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
      // 兜底：确保每个集合都存在
      for (const key of Object.keys(EMPTY)) if (!Array.isArray(state[key])) state[key] = [];
      return state;
    } catch (err) {
      console.error('[db] 数据文件损坏，将重新初始化：', err.message);
    }
  }
  state = structuredClone(EMPTY);
  return state;
}

export function db() {
  return load();
}

export function dbFilePath() {
  return dbFile();
}

export function table(name) {
  const data = load();
  if (!Array.isArray(data[name])) data[name] = [];
  return data[name];
}

export function insert(name, doc) {
  const row = { id: doc.id || uid(name.slice(0, 2) + '_'), createdAt: doc.createdAt || nowISO(), ...doc };
  table(name).push(row);
  persist();
  return row;
}

export function update(name, id, patch) {
  const row = table(name).find((r) => r.id === id);
  if (!row) return null;
  Object.assign(row, typeof patch === 'function' ? patch(row) : patch, { updatedAt: nowISO() });
  persist();
  return row;
}

export function remove(name, id) {
  const rows = table(name);
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return false;
  rows.splice(i, 1);
  persist();
  return true;
}

export function find(name, predicate) {
  return table(name).filter(predicate);
}

export function findOne(name, predicate) {
  return table(name).find(predicate) || null;
}

export function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 30);
}

export function flush() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!state || writing) return;
  writing = true;
  const file = dbFile();
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[db] 写入失败：', err.message);
  } finally {
    writing = false;
  }
}

export function logEvent(type, payload = {}) {
  insert('events', { type, payload });
}

export async function resetAll() {
  state = structuredClone(EMPTY);
  fs.mkdirSync(path.dirname(dbFile()), { recursive: true });
  fs.writeFileSync(dbFile(), JSON.stringify(state, null, 2), 'utf8');
}
