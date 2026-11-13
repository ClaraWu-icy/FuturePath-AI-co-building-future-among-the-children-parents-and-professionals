/**
 * 用户反馈入口
 *
 * 反馈由外部问卷承接（问卷星），应用本身不存反馈内容——这是有意的：
 * 反馈是"用户对我们说的话"，不应该和学生的成长档案混在同一个库里。
 *
 * 换问卷只改 FEEDBACK_URL 这一处；条目、卡片、侧栏都从这里取链接，
 * 不要在任何视图里直接写调查问卷的地址。
 */

export const FEEDBACK_URL = 'https://v.wjx.cn/vm/t1XGEcW.aspx';

/**
 * 带上"用户是在哪一步点的"。
 * 问卷星会把 URL 上的查询参数原样保留，若问卷里配置了同名的自定义参数题，
 * 后台就能按来源分桶；没配置也不会影响打开，多余的参数会被忽略。
 */
export function feedbackHref(step = '') {
  const base = FEEDBACK_URL.replace(/[#?]+$/, '');
  return step ? `${base}?source=${encodeURIComponent(step)}` : base;
}

const ATTRS = 'target="_blank" rel="noopener noreferrer"';

/** 侧栏 / 页脚用的单行链接 */
export function feedbackLink(step, label = '意见反馈') {
  return `<a class="fb-link" href="${feedbackHref(step)}" ${ATTRS}>${label}</a>`;
}

/** 结果页底部用的卡片：给一个具体的理由再让人点，比干巴巴一句"反馈"有用 */
export function feedbackCard(step, opts = {}) {
  const title = opts.title || '这份结果对你有帮助吗？';
  const sub = opts.sub || '花 1 分钟告诉我们哪里说得不对、哪里看不懂。反馈不会写进学生的档案，只用于改进产品。';
  return `<div class="card fb-card no-print">
    <div class="fb-row">
      <div class="grow">
        <div class="card-title">${title}</div>
        <p class="small muted" style="margin-top:4px;max-width:62ch">${sub}</p>
      </div>
      <a class="btn btn-primary" href="${feedbackHref(step)}" ${ATTRS}>去填问卷</a>
    </div>
  </div>`;
}
