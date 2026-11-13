/* 学生端：标准化量表（霍兰德 RIASEC / 多元智能） */
import { state, api, esc, toast, setBusy, radarChart, barList, fmtDate, DIM_COLORS } from '../core.js';
import { pageHead, empty, modeBanner } from '../ui.js';
import { feedbackCard } from '../feedback.js';

const PAGE_SIZE = 8;
const ALLOWED = ['riasec', 'mi'];

/* ================================ 列表页 ================================ */

export async function assess(ctx) {
  const s = ctx.student;
  if (!s) return { html: empty('还没有学生档案', '请先建立档案，再开始测评。') };

  const scale = ALLOWED.includes(ctx.query.scale) ? ctx.query.scale : null;
  if (!scale) return listPage(s);
  if (ctx.query.view === 'result') return resultPage(s, scale);
  return runnerPage(s, scale);
}

async function listPage(s) {
  const data = await api(`/api/assess?studentId=${s.id}`);
  const both = data.instruments.every((i) => i.latest);

  return {
    html: `${pageHead('标准化测评', '两套公开的框架，用来把"我大概喜欢什么"说得更清楚一点。',
      '<a class="btn btn-ghost btn-sm" href="#/student/analysis">回到成长画像</a>')}
    ${modeBanner(state.ai)}
    <div class="callout callout-info" style="margin-top:12px">
      <strong>先说清楚这两个工具是什么、不是什么。</strong>
      它们是<strong>自评问卷</strong>，描述你现在的兴趣与学习偏好；不是能力测验，不预测成绩和收入，也不能用来给别人贴标签。
      结果会写进你的证据库，参与画像计算——所以请按真实情况答，不要按"哪个看起来更好"答。
    </div>

    <div class="assess-grid" style="margin-top:14px">
      ${data.instruments.map((ins) => instrumentCard(ins)).join('')}
    </div>

    ${both ? crossBlock(data.instruments) : ''}

    <div class="card" style="margin-top:14px">
      <div class="card-head"><div class="grow"><div class="card-title">做完之后会发生什么</div>
        <div class="card-sub">不是拿一个分数就结束</div></div></div>
      <div class="grid grid-2" style="gap:18px">
        <div>
          <div class="small strong">1. 立刻看到结构化的结果</div>
          <p class="small muted" style="margin-top:4px">霍兰德给三字代码与六维分数；多元智能给八项相对强弱与学习方式建议。</p>
        </div>
        <div>
          <div class="small strong">2. 结果进入证据库</div>
          <p class="small muted" style="margin-top:4px">每次作答写入对应维度的证据，画像里的结论可以回溯到"你在哪道题上选了什么档"。重测会替换上一次的量表证据，不叠加。</p>
        </div>
        <div>
          <div class="small strong">3. 和对话、任务记录对照</div>
          <p class="small muted" style="margin-top:4px">量表说"你愿意做什么"，情景任务看"你真的怎么做"。两者不一致的地方，才是值得聊的地方。</p>
        </div>
        <div>
          <div class="small strong">4. 可以随时重测</div>
          <p class="small muted" style="margin-top:4px">兴趣会变。隔半年重测一次，比较两份结果的差异，比纠结某一次的绝对分数有意义。</p>
        </div>
      </div>
    </div>`,
    mount() { /* 列表页无交互 */ }
  };
}

function instrumentCard(ins) {
  const latest = ins.latest;
  return `<div class="card as-card">
    <div class="card-head">
      <div class="grow">
        <div class="row row-tight" style="margin-bottom:6px">
          <span class="tag tag-info">${esc(ins.theory)}</span>
          ${ins.attempts ? `<span class="tag">已做 ${ins.attempts} 次</span>` : '<span class="tag">未做过</span>'}
        </div>
        <div class="card-title">${esc(ins.name)}</div>
        <div class="card-sub">${ins.itemCount} 题 · 约 ${ins.minutes} 分钟 · 5 点量表</div>
      </div>
    </div>
    <p class="small muted" style="margin:8px 0 10px">${esc(ins.intro)}</p>
    <div class="row row-tight" style="margin-bottom:12px">
      ${ins.dims.slice(0, 8).map((d) => `<span class="as-chip" style="--c:${d.color}">${esc(d.name)}</span>`).join('')}
    </div>
    ${latest ? `<div class="as-latest">
        <div class="spread">
          <div>
            <div class="tiny muted">上次结果 · ${fmtDate(latest.createdAt)}</div>
            <div class="as-latest-main">${latest.code ? `<span class="mono strong">${esc(latest.code)}</span>` : ''}
              ${latest.top.map((t) => `<span class="tag">${esc(t.name)} ${t.percent}</span>`).join('')}</div>
          </div>
          <a class="btn btn-ghost btn-sm" href="#/assess?scale=${ins.key}&view=result">看结果</a>
        </div>
      </div>` : ''}
    <div class="row" style="margin-top:12px">
      <a class="btn btn-primary" href="#/assess?scale=${ins.key}">${latest ? '重新测一次' : '开始作答'}</a>
      ${latest ? '' : `<span class="tiny muted">不需要注册额外账号，直接用当前档案</span>`}
    </div>
  </div>`;
}

function crossBlock(instruments) {
  const r = instruments.find((i) => i.key === 'riasec');
  const m = instruments.find((i) => i.key === 'mi');
  return `<div class="card" style="margin-top:14px">
    <div class="card-head"><div class="grow"><div class="card-title">两份结果怎么一起看</div>
      <div class="card-sub">兴趣说"愿不愿意做"，多元智能说"怎么学更顺"</div></div></div>
    <div class="grid grid-2" style="gap:14px">
      <div class="as-pair">
        <div class="tiny muted">霍兰德代码</div>
        <div class="as-pair-code mono">${esc(r.latest.code || '—')}</div>
        <div class="small">${r.latest.top.map((t) => `${esc(t.name)} ${t.percent}`).join(' · ')}</div>
      </div>
      <div class="as-pair">
        <div class="tiny muted">多元智能前三</div>
        <div class="as-pair-code">${m.latest.top.map((t) => esc(t.name.split('智能')[0])).join(' · ')}</div>
        <div class="small">${m.latest.top.map((t) => t.percent).join(' / ')}</div>
      </div>
    </div>
    <p class="small muted" style="margin-top:12px">
      常见的不一致：兴趣指向的方向，恰好不是你学得最顺的方式。这不是矛盾——"愿意花时间"通常比"现在学得快"更能决定五到十年后你在哪里。
      真正要警惕的是反过来：只因为学得顺就选了一个其实不想做的方向。
    </p>
  </div>`;
}

/* ================================ 作答页 ================================ */

async function runnerPage(s, scale) {
  const data = await api(`/api/assess/${scale}?studentId=${s.id}`);
  if (!data.canTake) {
    return {
      html: `${pageHead(data.name, data.intro)}
        <div class="card" style="margin-top:14px">${empty('当前角色不能作答', '家长 / 规划师可以查看结果，但量表必须由学生本人填写。',
        data.latest ? `<a class="btn btn-primary" href="#/assess?scale=${scale}&view=result">查看已有结果</a>` : '')}</div>`,
      mount() {}
    };
  }

  const answered = data.latest ? '这是重测，会替换上一次的量表证据（不会叠加）' : '按第一反应答，不用想"哪个更像好学生"';

  return {
    html: `${pageHead(data.name, `${data.theory} · ${data.itemCount} 题 · 约 ${data.minutes} 分钟`,
      `<a class="btn btn-ghost btn-sm" href="#/assess">返回测评列表</a>`)}
    <div class="card as-run" id="as-run">
      <div class="as-run-head">
        <div class="grow">
          <div class="small strong" id="as-hint">${esc(answered)}</div>
          <div class="tiny muted" style="margin-top:2px">1 完全不像我 · 3 一半一半 · 5 非常像我</div>
        </div>
        <div class="as-count"><span id="as-done">0</span> / ${data.itemCount}</div>
      </div>
      <div class="as-bar"><span id="as-bar-fill" style="width:0%"></span></div>
      <div id="as-pages"></div>
      <div class="as-foot">
        <button class="btn btn-ghost btn-sm" id="as-prev">上一页</button>
        <span class="tiny muted" id="as-page-label"></span>
        <span class="spacer"></span>
        <button class="btn btn-primary btn-sm" id="as-next">下一页</button>
        <button class="btn btn-primary" id="as-submit" hidden>提交并查看结果</button>
      </div>
      <p class="tiny muted" style="margin-top:10px">作答会暂存在这台设备上，中途关掉页面再回来可以接着答。</p>
    </div>`,
    mount() { mountRunner(s, data); }
  };
}

function mountRunner(s, data) {
  const storeKey = `fp_assess_${s.id}_${data.scale}`;
  const items = data.items;
  const total = items.length;
  const pages = [];
  for (let i = 0; i < total; i += PAGE_SIZE) pages.push(items.slice(i, i + PAGE_SIZE));

  let answers = {};
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
    for (const it of items) if (saved[it.id] >= 1 && saved[it.id] <= 5) answers[it.id] = Number(saved[it.id]);
  } catch { answers = {}; }

  let page = 0;
  const root = document.getElementById('as-pages');
  const doneEl = document.getElementById('as-done');
  const fillEl = document.getElementById('as-bar-fill');
  const labelEl = document.getElementById('as-page-label');
  const prevBtn = document.getElementById('as-prev');
  const nextBtn = document.getElementById('as-next');
  const submitBtn = document.getElementById('as-submit');

  const answeredCount = () => Object.keys(answers).length;

  root.innerHTML = pages.map((group, pi) => `
    <div class="as-page" data-page="${pi}" ${pi === 0 ? '' : 'hidden'}>
      ${group.map((it) => {
    const idx = items.findIndex((x) => x.id === it.id);
    return `<div class="as-item" data-item="${it.id}">
          <div class="as-q"><span class="as-n">${String(idx + 1).padStart(2, '0')}</span><span>${esc(it.text)}</span></div>
          <div class="as-scale" role="radiogroup" aria-label="第 ${idx + 1} 题：${esc(it.text)}">
            ${data.options.map((o) => `<button type="button" class="as-opt" role="radio" aria-checked="false"
                data-val="${o.value}" title="${esc(o.label)}" aria-label="${esc(o.label)}">
                <span class="as-dot" aria-hidden="true">${o.value}</span>
                <span class="as-lb">${esc(o.short)}</span>
              </button>`).join('')}
          </div>
        </div>`;
  }).join('')}
    </div>`).join('');

  const paint = () => {
    root.querySelectorAll('.as-item').forEach((row) => {
      const val = answers[row.dataset.item];
      row.querySelectorAll('.as-opt').forEach((btn) => {
        const on = Number(btn.dataset.val) === val;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
      });
      row.classList.toggle('done', Boolean(val));
    });
    const n = answeredCount();
    doneEl.textContent = String(n);
    fillEl.style.width = `${Math.round((n / total) * 100)}%`;
  };

  const showPage = (i) => {
    page = Math.max(0, Math.min(pages.length - 1, i));
    root.querySelectorAll('.as-page').forEach((el) => { el.hidden = Number(el.dataset.page) !== page; });
    labelEl.textContent = `第 ${page + 1} / ${pages.length} 页`;
    prevBtn.disabled = page === 0;
    const last = page === pages.length - 1;
    nextBtn.hidden = last;
    submitBtn.hidden = !last;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = () => {
    try { localStorage.setItem(storeKey, JSON.stringify(answers)); } catch { /* 隐私模式下忽略 */ }
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.as-opt');
    if (!btn) return;
    const row = btn.closest('.as-item');
    answers[row.dataset.item] = Number(btn.dataset.val);
    save();
    paint();
  });

  prevBtn.addEventListener('click', () => showPage(page - 1));
  nextBtn.addEventListener('click', () => {
    const missing = pages[page].filter((it) => !answers[it.id]);
    if (missing.length) {
      toast(`本页还有 ${missing.length} 题没答`, 'error');
      const first = root.querySelector(`.as-page[data-page="${page}"] .as-item[data-item="${missing[0].id}"]`);
      first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      first?.classList.add('need');
      setTimeout(() => first?.classList.remove('need'), 1200);
      return;
    }
    showPage(page + 1);
  });

  submitBtn.addEventListener('click', async (e) => {
    const missing = items.filter((it) => !answers[it.id]);
    if (missing.length) {
      const pi = Math.floor(items.findIndex((x) => x.id === missing[0].id) / PAGE_SIZE);
      toast(`还有 ${missing.length} 题没答，已跳到第一处`, 'error');
      showPage(pi);
      const row = root.querySelector(`.as-item[data-item="${missing[0].id}"]`);
      row?.classList.add('need');
      setTimeout(() => row?.classList.remove('need'), 1400);
      return;
    }
    setBusy(e.currentTarget, true, '正在计分…');
    try {
      const out = await api(`/api/assess/${data.scale}`, {
        method: 'POST',
        body: { studentId: s.id, answers }
      });
      try { localStorage.removeItem(storeKey); } catch { /* ignore */ }
      const shell = document.getElementById('as-run');
      shell.outerHTML = `<div id="as-result">${resultHtml(data, out.result, { fresh: true, signals: out.signals.length })}</div>`;
      history.replaceState(null, '', `#/assess?scale=${data.scale}&view=result`);
      resultMount(data, out.result);
      // 两份量表都完成时，画像与初步方案已经在服务端生成，这里直接给入口
      const j = out.journey;
      if (j && j.progress > 0 && j.next && j.next.key !== 'assess') {
        document.getElementById('as-result')?.insertAdjacentHTML('afterend', `
          <div class="card" style="margin-top:16px;border-color:var(--brand-line);background:var(--brand-soft)">
            <div class="card-head"><div class="grow"><div class="card-title">两份量表已齐，画像和初步方案已生成</div>
              <div class="card-sub">不需要再点一次"生成"：我刚按这两份结果算了画像，并据此写了一版可以修改的初稿</div></div>
              <span class="tag tag-good">${j.progress}%</span></div>
            <div class="row row-tight">
              <a class="btn btn-primary" href="#/start">看流程与下一步</a>
              <a class="btn btn-ghost" href="#/student/analysis">先看画像</a>
              <a class="btn btn-ghost" href="#/student/plan">看初步方案</a>
            </div>
          </div>`);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'error');
      setBusy(e.currentTarget, false);
    }
  });

  paint();
  showPage(0);
}

/* ================================ 结果页 ================================ */

async function resultPage(s, scale) {
  const data = await api(`/api/assess/${scale}?studentId=${s.id}`);
  const res = await api(`/api/assess/${scale}/result?studentId=${s.id}`);
  if (!res.latest) {
    return {
      html: `${pageHead(data.name, data.intro)}
        <div class="card" style="margin-top:14px">${empty('还没有结果', '做完这一份量表就能看到结果。',
        `<a class="btn btn-primary" href="#/assess?scale=${scale}">开始作答</a>`)}</div>`,
      mount() {}
    };
  }
  return {
    html: `${pageHead(data.name, `最近一次 · ${fmtDate(res.latest.createdAt, true)}`,
      `<a class="btn btn-ghost btn-sm" href="#/assess?scale=${scale}">重新测一次</a>
       <a class="btn btn-ghost btn-sm" href="#/assess">全部测评</a>`)}
    <div id="as-result">${resultHtml(data, res.latest.result, { fresh: false })}</div>
    ${res.history.length > 1 ? `<div class="card" style="margin-top:14px">
      <div class="card-head"><div class="grow"><div class="card-title">历史记录</div>
        <div class="card-sub">兴趣会变，比较差异比纠结某一次分数更有意义</div></div></div>
      <div class="stack" style="gap:8px">
        ${res.history.map((h) => `<div class="spread as-history">
          <span class="small">${fmtDate(h.createdAt, true)}</span>
          <span class="row row-tight">${h.code ? `<span class="mono strong">${esc(h.code)}</span>` : ''}
            ${h.top.map((t) => `<span class="tag">${esc(t.name)} ${t.percent}</span>`).join('')}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}`,
    mount() { resultMount(data, res.latest.result); }
  };
}

function resultHtml(data, r, { fresh, signals = null }) {
  return `${fresh ? `<div class="callout callout-good" style="margin-top:12px">
      <strong>结果已保存。</strong>本次作答写入了 ${signals} 条证据，会参与成长画像的计算。
      想让它更准，下一步是去做一个情景任务，看你在具体情境里是不是也这样选。
    </div>` : ''}
  <div class="card as-result" style="margin-top:14px">
    <div class="card-head">
      <div class="grow">
        <div class="card-title">${data.scale === 'riasec' ? '你的霍兰德代码' : '你的多元智能结构'}</div>
        <div class="card-sub">${esc(r.summary)}</div>
      </div>
      <span class="tag">${r.answered}/${r.itemCount} 题</span>
    </div>
    ${data.scale === 'riasec' ? hollandBody(r) : miBody(r)}
  </div>
  ${data.scale === 'riasec' ? careersBlock(r) : ''}
  <div class="card" style="margin-top:14px">
    <div class="card-head"><div class="grow"><div class="card-title">结果怎么解释、哪里不能信</div>
      <div class="card-sub">这一段比分数重要</div></div></div>
    <ul class="as-caveats">${r.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
  </div>
  <div class="row" style="margin-top:14px">
    <a class="btn btn-primary" href="#/student/analysis">去看成长画像</a>
    <a class="btn btn-ghost" href="#/student/explore">去做情景任务</a>
    <a class="btn btn-ghost" href="#/assess">返回测评列表</a>
  </div>
  ${feedbackCard(`assess-${data.scale}`, {
    title: '这份结果说得像你吗？',
    sub: '如果你觉得某一条判断不对，或者解释绕得看不懂，直接告诉我们。反馈不会写进档案，只用来改产品。'
  })}`;
}

function hollandBody(r) {
  const top = r.scores.slice(0, 3);
  const dims = r.scores.map((x) => ({ key: x.key, name: x.name, score: x.percent }));
  return `
  <div class="as-code-row">
    ${top.map((t, i) => `<div class="as-code-box" style="--c:${DIM_COLORS[t.key] || 'var(--brand)'}">
        <div class="as-code-letter">${esc(t.key)}</div>
        <div class="as-code-name">${esc(t.name)}</div>
        <div class="as-code-pct">${t.percent}</div>
        <div class="tiny muted">第 ${i + 1} 位</div>
      </div>`).join('')}
    <div class="as-quality">
      <div class="as-q-row"><span>区分度</span><strong>${r.quality.differentiation}/100 · ${esc(r.quality.differentiationLabel)}</strong></div>
      <div class="as-q-row"><span>一致性</span><strong>${esc(r.quality.consistencyLabel)}</strong></div>
      <div class="as-q-row"><span>作答质量</span><strong>${r.quality.flat ? '无效（全部同档）' : r.quality.inconsistent ? '偏低（同维度差异大）' : '正常'}</strong></div>
      <div class="tiny muted" style="margin-top:6px">区分度＝最高与最低类型的分差；一致性＝前两型在六边形上的距离。</div>
    </div>
  </div>

  <div class="grid grid-2" style="margin-top:16px;gap:18px">
    <div>
      <div class="card-sub" style="margin-bottom:6px">六类型分数（0–100）</div>
      ${radarChart(dims, { size: 320 })}
    </div>
    <div>
      <div class="card-sub" style="margin-bottom:8px">原始分（每题 1–5，每型 6 题）</div>
      ${barList(r.scores.map((x) => ({ name: `${x.key} ${x.short}`, score: x.percent, color: DIM_COLORS[x.key] })), {})}
      <div class="as-raw">${r.scores.map((x) => `<span>${x.key} <b>${x.raw}</b>/${x.max}</span>`).join('')}</div>
    </div>
  </div>

  <div class="divider"></div>
  <div class="card-sub" style="margin-bottom:10px">前三名分别意味着什么</div>
  <div class="stack" style="gap:12px">
    ${r.notes.map((n) => `<div class="as-note" style="--c:${DIM_COLORS[n.key] || 'var(--brand)'}">
      <div class="spread"><div class="strong small">${esc(n.title)}</div><span class="mono tag">${n.percent}</span></div>
      <p class="small" style="margin:6px 0">${esc(n.text)}</p>
      <p class="tiny" style="color:var(--brand);margin:0">可以先做这件事：${esc(n.action)}</p>
    </div>`).join('')}
  </div>`;
}

function miBody(r) {
  const sorted = [...r.scores].sort((a, b) => b.percent - a.percent);
  const colorOf = Object.fromEntries(r.scores.map((x) => [x.key, x.color]));
  return `
  <div class="as-mi-top">
    ${r.notes.map((n, i) => `<div class="as-mi-card" style="--c:${colorOf[n.key] || 'var(--brand)'}">
      <div class="tiny muted">第 ${i + 1} 位</div>
      <div class="strong">${esc(n.title.split(' · ')[0])}</div>
      <div class="as-mi-pct">${n.percent}</div>
      <p class="tiny" style="margin:6px 0 0">${esc(n.text)}</p>
    </div>`).join('')}
  </div>
  <div class="divider"></div>
  <div class="card-sub" style="margin-bottom:8px">八项相对强弱（0–100，不做总分）</div>
  <div class="as-mi-bars">${barList(sorted.map((x) => ({ name: x.name, score: x.percent, color: x.color || '#0f766e' })))}</div>
  <div class="divider"></div>
  <div class="card-sub" style="margin-bottom:10px">你可以这样学</div>
  <div class="stack" style="gap:10px">
    ${r.notes.map((n) => `<div class="as-note" style="--c:${colorOf[n.key] || 'var(--brand)'}">
      <div class="strong small">${esc(n.title.split(' · ')[0])}</div>
      <p class="small" style="margin:4px 0 0">${esc(n.action)}</p>
    </div>`).join('')}
  </div>`;
}

function careersBlock(r) {
  const list = r.careers || [];
  if (!list.length) return '';
  return `<div class="card" style="margin-top:14px">
    <div class="card-head"><div class="grow"><div class="card-title">可以与这些方向对照</div>
      <div class="card-sub">结合你目前的全部记录计算，不是"你只能做这些"</div></div></div>
    <div class="grid grid-2" style="gap:12px">
      ${list.map((c) => `<div class="as-career">
        <div class="spread"><div class="strong small">${esc(c.name)}</div><span class="mono tag">${c.match}%</span></div>
        <p class="tiny muted" style="margin:4px 0 0">${esc(c.why)}</p>
        <p class="tiny" style="color:var(--brand);margin:4px 0 0">先试一步：${esc(c.firstStep)}</p>
      </div>`).join('')}
    </div>
    <p class="tiny muted" style="margin-top:10px">匹配度是兴趣结构的相似度，不含你的成绩、家庭条件与地区机会。真正决定要不要走这条路的，是去做一次真实的小任务。</p>
  </div>`;
}

function resultMount(data, r) {
  window.__FP_ASSESS = { scale: data.scale, result: r };
}
