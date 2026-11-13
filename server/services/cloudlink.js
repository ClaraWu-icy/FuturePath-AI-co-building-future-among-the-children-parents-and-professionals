/**
 * 云服务接入：把「云登录身份」与「应用内档案」对上，并负责个人档案的上下行。
 *
 * 分工要说清楚，避免以后误解：
 *  - 云数据库（fp_* 表）是个人档案的**存档**：RLS 由 owner_id 决定，用户只能读写自己那份。
 *  - 服务端仍然是业务逻辑与权限判定的唯一入口（谁能不能看某个档案、能不能定稿），
 *    它持有一份 JSON 镜像，供规则引擎直接读取；镜像在登录时从云端恢复，写入后回写云端。
 *  - 所以这个文件里只有「身份映射」和「快照导入/导出」，不放任何业务规则。
 */
import { find, findOne, insert, table, update, logEvent } from '../db.js';
import { uid, nowISO, bad } from '../util.js';
import { createStudent, recordConsent } from './students.js';

/** 需要上云的实体：本地集合名 → 云表名。加一个实体只改这张表。 */
export const CLOUD_ENTITIES = {
  students: 'fp_students',
  consents: 'fp_consents',
  signals: 'fp_signals',
  assessments: 'fp_assessments',
  analyses: 'fp_analyses',
  plans: 'fp_plans',
  planComments: 'fp_plan_comments'
};

export function userByCloudUid(cloudUid) {
  if (!cloudUid) return null;
  return findOne('users', (u) => u.cloudUid === cloudUid) || null;
}

/** 头像等展示信息只作为快照存一份，不参与任何权限判断 */
function cloudNameOf(name) {
  const base = String(name || '云用户').trim().slice(0, 16) || '云用户';
  return `${base}-${uid('').slice(0, 4)}`;
}

/**
 * 云登录后绑定本地档案。
 * 首次登录会建档案（角色由用户当场选，不能从云端推断），之后只做查找。
 */
export function linkCloudAccount({ cloudUid, cloudName, role, displayName, childName, ageBand, guardianConsent }) {
  if (!cloudUid || typeof cloudUid !== 'string') throw bad('缺少云账号标识');

  const existing = userByCloudUid(cloudUid);
  if (existing) {
    return { user: existing, created: false, needsProfile: false };
  }

  if (!role) return { user: null, created: false, needsProfile: true };
  if (!['student', 'parent'].includes(role)) throw bad('云账号目前只支持学生或家长');

  const name = cloudNameOf(displayName || childName || cloudName);
  const user = insert('users', {
    id: uid('u_'),
    name,
    displayName: String(displayName || '').slice(0, 20) || name,
    role,
    cloudUid,
    cloudName: String(cloudName || '').slice(0, 40),
    verified: true,
    status: 'active',
    createdAt: nowISO(),
    authProvider: 'workbuddy-cloud'
  });

  let student = null;
  if (role === 'student') {
    student = createStudent(user, {
      name: String(displayName || cloudName || '同学').slice(0, 20),
      ageBand,
      userId: user.id
    });
    recordConsent(student.id, user, {
      type: 'guardian',
      granted: Boolean(guardianConsent),
      scope: '云账号注册时学生自述已获监护人同意'
    });
    recordConsent(student.id, user, { type: 'data_use', granted: true, scope: '平台内部分析与规划生成' });
  } else {
    if (!childName) throw bad('请填写孩子的称呼');
    student = createStudent(user, { name: childName, ageBand, guardianId: user.id });
    recordConsent(student.id, user, { type: 'guardian', granted: true, scope: '监护人注册时确认监护关系' });
    recordConsent(student.id, user, { type: 'data_use', granted: true, scope: '平台内部分析与规划生成' });
  }

  logEvent('cloud.link', { userId: user.id, role });
  return { user, student, created: true, needsProfile: false };
}

function ownedStudents(user) {
  return find('students', (s) => s.userId === user.id || s.guardianId === user.id);
}

/** 服务端镜像 → 云端快照（前端负责真正写进 fp_* 表） */
export function exportSnapshot(user) {
  const students = ownedStudents(user);
  const ids = new Set(students.map((s) => s.id));
  const byStudent = (name) => (ids.size ? table(name).filter((r) => ids.has(r.studentId)) : []);

  return {
    exportedAt: nowISO(),
    account: {
      appUserId: user.id,
      role: user.role,
      name: user.name,
      displayName: user.displayName || user.name,
      cloudUid: user.cloudUid || null
    },
    entities: {
      students,
      consents: byStudent('consents'),
      signals: byStudent('signals'),
      assessments: byStudent('assessments'),
      analyses: byStudent('analyses'),
      plans: byStudent('plans'),
      planComments: byStudent('planComments')
    }
  };
}

/**
 * 云端快照 → 服务端镜像（登录或换设备时恢复）。
 * 只接受属于当前用户的行：学生行必须挂在本人名下，其余行必须挂在这些学生上，
 * 否则就算云表被写坏，也不会把别人的档案塞进这个账号。
 */
export function importSnapshot(user, bundle) {
  const entities = bundle?.entities || {};
  const counts = {};
  const skipped = {};

  const incomingStudents = Array.isArray(entities.students) ? entities.students : [];
  const accepted = incomingStudents.filter((s) => s && s.id && (s.userId === user.id || s.guardianId === user.id));
  skipped.students = incomingStudents.length - accepted.length;

  for (const row of accepted) {
    const local = findOne('students', (s) => s.id === row.id);
    if (local) update('students', row.id, { ...row, userId: local.userId || row.userId, guardianId: local.guardianId ?? row.guardianId });
    else insert('students', { ...row, userId: row.userId || null, guardianId: row.guardianId || null });
  }
  counts.students = accepted.length;

  const ids = new Set(ownedStudents(user).map((s) => s.id));
  for (const key of ['consents', 'signals', 'assessments', 'analyses', 'plans', 'planComments']) {
    const rows = (Array.isArray(entities[key]) ? entities[key] : [])
      .filter((r) => r && r.id && ids.has(r.studentId));
    skipped[key] = (entities[key]?.length || 0) - rows.length;
    let n = 0;
    for (const row of rows) {
      if (findOne(key, (r) => r.id === row.id)) update(key, row.id, row);
      else insert(key, row);
      n += 1;
    }
    counts[key] = n;
  }

  logEvent('cloud.import', { userId: user.id, counts });
  return { counts, skipped };
}
