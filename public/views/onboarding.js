/* ==========================================================================
 * 学生端 · 启程引导（开篇动画交互）
 * --------------------------------------------------------------------------
 * 学生第一次进来，先不面对表单和进度条，而是被一个轻松的故事带进去。
 * 三幕：门后的下午 → 三个小时 → 只能带走一件。每一幕的选择都真实写入证据库。
 *
 * 实现约束：
 *  - 零依赖，只用 CSS 动画 + SVG，不加载任何图片或视频（低带宽可用）。
 *  - 低带宽 / prefers-reduced-motion 下自动降级：无星星、无打字机、无飞入。
 *  - 全程键盘可用（1-6 选择、Enter 继续、Esc 跳过），文案挂在 aria-live 上。
 *  - 所有可点击步骤都渲染在"新创建的节点"里，避免监听器跨幕累积。
 * ========================================================================== */
import { api, esc, state, mentorAvatar } from '../core.js';

const reduced = () => document.documentElement.classList.contains('lite')
  || Boolean(state.lite)
  || Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function stars(n = 42) {
  let out = '';
  for (let i = 0; i < n; i += 1) {
    const x = (Math.random() * 100).toFixed(2);
    const y = (Math.random() * 58).toFixed(2);
    const size = (1 + Math.random() * 2.2).toFixed(1);
    const delay = (Math.random() * 4).toFixed(2);
    const o = (0.22 + Math.random() * 0.6).toFixed(2);
    out += `<span style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;animation-delay:${delay}s;opacity:${o}"></span>`;
  }
  return out;
}

function motes(n = 7) {
  let out = '';
  for (let i = 0; i < n; i += 1) {
    const x = (6 + Math.random() * 88).toFixed(1);
    const delay = (Math.random() * 6).toFixed(1);
    const dur = (7 + Math.random() * 6).toFixed(1);
    out += `<i style="left:${x}%;animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
  }
  return out;
}

/** 打字机；点击文字可立即显示全文 */
function typeInto(el, text, speed = 24) {
  el.textContent = '';
  el.classList.add('typing');
  if (reduced()) {
    el.textContent = text;
    el.classList.remove('typing');
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let i = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      el.textContent = text;
      el.classList.remove('typing');
      el.removeEventListener('click', finish);
      resolve();
    };
    const timer = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i >= text.length) finish();
    }, speed);
    el.addEventListener('click', finish);
  });
}

/** 在指定容器内等待一次点击（容器每步都是新节点，监听器随节点销毁） */
function onClick(scope, attr) {
  return new Promise((resolve) => {
    const handler = (e) => {
      const btn = e.target.closest(`[${attr}]`);
      if (!btn || btn.disabled) return;
      scope.removeEventListener('click', handler);
      resolve(btn);
    };
    scope.addEventListener('click', handler);
  });
}

export async function startIntro({ student, replay = false, onDone = null } = {}) {
  if (!student) return null;
  if (document.querySelector('[data-story]')) return null;

  const data = await api(`/api/explore/intro?studentId=${encodeURIComponent(student.id)}`);
  const { mentor, acts, finale, state: introState } = data;
  const collected = introState.collected || [];

  const root = document.createElement('div');
  root.className = replay ? 'story replay' : 'story';
  root.dataset.story = '';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '启程引导：和 AI 导师小帆一起探索');
  root.innerHTML = `
    <div class="story-bg" aria-hidden="true">
      <div class="story-stars">${reduced() ? '' : stars()}</div>
      <div class="story-glow"></div>
      <svg class="story-hills" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path d="M0,224 L180,150 L340,214 L520,120 L700,206 L880,140 L1080,222 L1240,160 L1440,220 L1440,320 L0,320 Z" fill="rgba(9,54,54,.55)"/>
        <path d="M0,262 L220,208 L420,258 L640,196 L860,258 L1080,204 L1300,262 L1440,224 L1440,320 L0,320 Z" fill="rgba(6,38,42,.88)"/>
      </svg>
      <div class="story-motes">${reduced() ? '' : motes()}</div>
    </div>

    <div class="story-hud">
      <div class="story-brand"><span class="story-bulb" aria-hidden="true"></span>FuturePath AI · 启程</div>
      <div class="story-dots" data-dots aria-label="故事进度"></div>
      <button class="story-skip" data-skip aria-label="跳过启程动画">跳过</button>
    </div>

    <div class="story-scene" data-scene>
      <div class="story-figure">
        <div class="story-halo" aria-hidden="true"></div>
        <div class="story-avatar" data-avatar>${mentorAvatar(136, 'calm')}</div>
        <div class="story-plate"><strong>${esc(mentor.name)}</strong><span>${esc(mentor.role)}</span></div>
      </div>

      <div class="story-panel">
        <div class="story-chapter" data-chapter></div>
        <p class="story-narr" data-narr></p>
        <div class="story-bubble">
          <p class="story-line" data-line aria-live="polite"></p>
          <div class="story-choices" data-choices></div>
          <div class="story-note" data-note></div>
        </div>
      </div>
    </div>

    <div class="story-foot">
      <div class="story-clues" data-clues><span class="story-clues-label">已留下线索</span><b data-count>0</b></div>
      <div class="story-hint" data-hint>1-6 选择 · Enter 继续 · Esc 跳过</div>
    </div>

    <div class="story-confirm" data-confirm hidden>
      <div class="story-confirm-box">
        <h3>先不看了？</h3>
        <p>你已经留下的线索会保存下来，随时可以在首页点「重看启程」再走一遍。</p>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button class="btn btn-ghost btn-sm" data-confirm-cancel>继续看</button>
          <button class="btn btn-primary btn-sm" data-confirm-leave>跳过</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  const $ = (sel) => root.querySelector(sel);
  const scene = $('[data-scene]');
  const chapterEl = $('[data-chapter]');
  const narrEl = $('[data-narr]');
  const lineEl = $('[data-line]');
  const choicesEl = $('[data-choices]');
  const noteEl = $('[data-note]');
  const dotsEl = $('[data-dots]');
  const countEl = $('[data-count]');
  const cluesEl = $('[data-clues]');
  const avatarEl = $('[data-avatar]');
  const hintEl = $('[data-hint]');
  const confirmEl = $('[data-confirm]');

  let closed = false;
  let finished = false;
  let clueCount = collected.length;

  /** 每一步都渲染到新建节点里，旧监听器随旧节点一起销毁 */
  const step = (html) => {
    const box = document.createElement('div');
    box.className = 'story-step';
    box.innerHTML = html;
    noteEl.textContent = '';
    noteEl.appendChild(box);
    return box;
  };

  const setMood = (mood) => { avatarEl.innerHTML = mentorAvatar(136, mood); };

  const setDots = (n) => {
    dotsEl.innerHTML = Array.from({ length: acts.length + 1 }, (_, i) =>
      `<i class="${i < n ? 'on' : ''}${i === n ? ' now' : ''}"></i>`).join('');
  };

  const addClueChip = (label, answer) => {
    const chip = document.createElement('span');
    chip.className = 'story-clue-chip';
    chip.innerHTML = `<b>${esc(label)}</b>`;
    chip.title = answer || '';
    cluesEl.appendChild(chip);
    requestAnimationFrame(() => chip.classList.add('in'));
  };

  const bumpCount = () => {
    countEl.textContent = String(clueCount);
    cluesEl.classList.remove('bump');
    void cluesEl.offsetWidth;
    cluesEl.classList.add('bump');
  };

  const close = async ({ skipped = false } = {}) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    try {
      // 终章已经带 portrait 收尾过就不再重复提交
      if (!replay && !finished) await api('/api/explore/intro/finish', { method: 'POST', body: { studentId: student.id, skipped } });
    } catch { /* 网络抖动不影响关闭 */ }
    root.classList.add('leaving');
    await wait(reduced() ? 0 : 300);
    root.remove();
    document.body.style.overflow = '';
    onDone?.({ skipped });
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); confirmEl.hidden = false; return; }
    if (!confirmEl.hidden) return;
    const btns = [...choicesEl.querySelectorAll('[data-choice]:not([disabled])')];
    const n = Number(e.key);
    if (btns.length && n >= 1 && n <= btns.length) { e.preventDefault(); btns[n - 1].click(); return; }
    if (e.key === 'Enter') {
      const next = noteEl.querySelector('[data-next], [data-save]');
      if (next && !next.disabled) { e.preventDefault(); next.click(); }
    }
  };
  document.addEventListener('keydown', onKey);

  $('[data-skip]').addEventListener('click', () => { confirmEl.hidden = false; });
  $('[data-confirm-cancel]').addEventListener('click', () => { confirmEl.hidden = true; });
  $('[data-confirm-leave]').addEventListener('click', () => close({ skipped: true }));

  const transition = async () => {
    if (reduced()) { choicesEl.innerHTML = ''; noteEl.textContent = ''; return; }
    scene.classList.add('is-out');
    await wait(300);
    choicesEl.innerHTML = '';
    noteEl.textContent = '';
    scene.classList.remove('is-out');
    await wait(80);
  };

  const setChapter = (chapter, title) => {
    chapterEl.innerHTML = `<span>${esc(chapter)}</span><b>${esc(title)}</b>`;
    chapterEl.classList.remove('in');
    void chapterEl.offsetWidth;
    chapterEl.classList.add('in');
  };

  // 断点续入：已记录几幕就从下一幕开始（按 actId 去重，不按信号条数）
  const doneActs = new Set(collected.map((c) => c.actId));
  let startIndex = 0;
  if (!replay && introState.status === 'in_progress') startIndex = Math.min(doneActs.size, acts.length);
  if (!replay) {
    // 只有"续播"才把已完成的线索先铺上；从头再来一遍时由各幕自己重建，避免 chip 重复
    if (startIndex > 0) collected.slice(0, startIndex).forEach((c) => addClueChip(c.label, c.answer));
    countEl.textContent = String(clueCount);
  }

  /* ------------------------------- 序幕 ------------------------------- */
  const prologue = async () => {
    setDots(1);
    setChapter('序幕', '先认识一下');
    narrEl.textContent = '一个圆头圆脑的小东西从屏幕角落里冒出来，停在对话框上方，像是在等你先开口。它不是真人，是一个 AI 导师。';
    narrEl.classList.add('in');
    setMood('happy');
    await wait(reduced() ? 0 : 480);
    await typeInto(lineEl, `我是${mentor.name}。${mentor.promise}`);
    const box = step(`<p class="story-aside">接下来有七个问题，都是具体的事——你怎么过周末、别人找你帮什么忙、遇到事你会怎么做。答完会给你一张第一版的个人画像。</p>
      <div class="row"><button class="btn btn-primary" data-next>那就开始吧</button></div>`);
    hintEl.textContent = 'Enter 继续 · Esc 跳过';
    await onClick(box, 'data-next');
    await transition();
    narrEl.classList.remove('in');
  };

  /* ------------------------------- 三幕 ------------------------------- */
  const runAct = async (act, index) => {
    setDots(index + 1);
    setChapter(act.chapter, act.title);
    setMood('think');
    lineEl.textContent = '';
    choicesEl.innerHTML = '';
    noteEl.textContent = '';
    scene.classList.remove('finale');
    narrEl.textContent = act.narration;
    narrEl.classList.add('in');
    await wait(reduced() ? 0 : 240);
    await typeInto(lineEl, act.line);

    const choiceBox = document.createElement('div');
    choiceBox.className = 'story-choice-list';
    choiceBox.innerHTML = act.choices.map((c, i) => `
      <button class="story-choice" data-choice="${esc(c.id)}" style="animation-delay:${i * 55}ms">
        <span class="k" aria-hidden="true">${i + 1}</span>
        <span class="t"><b>${esc(c.label)}</b><span>${esc(c.sub || '')}</span></span>
      </button>`).join('');
    choicesEl.appendChild(choiceBox);

    const picked = await onClick(choiceBox, 'data-choice');
    const choiceId = picked.dataset.choice;
    const pickedLabel = picked.querySelector('b')?.textContent || '';
    choicesEl.innerHTML = `<div class="story-picked"><span>你选了</span><b>${esc(pickedLabel)}</b></div>`;

    // 可选：补一句自己的话（留空即跳过）
    const textBox = step(`<form class="story-textbox" data-form>
        <label for="story-note-${esc(act.id)}">${esc(act.textPrompt || '')}<span>不写也行</span></label>
        <div class="story-textrow">
          <input id="story-note-${esc(act.id)}" type="text" maxlength="120" autocomplete="off"
            placeholder="${esc(act.textPlaceholder || '')}" data-text />
          <button class="btn btn-primary btn-sm" type="submit" data-save>继续</button>
        </div>
      </form>`);
    textBox.querySelector('[data-text]')?.focus();
    await new Promise((resolve) => {
      textBox.querySelector('[data-form]').addEventListener('submit', (e) => { e.preventDefault(); resolve(); });
    });
    const note = String(textBox.querySelector('[data-text]')?.value || '').trim();
    noteEl.textContent = '';

    lineEl.innerHTML = '<span class="story-thinking" aria-label="小帆正在记录"><i></i><i></i><i></i></span>';
    let res;
    try {
      res = await api('/api/explore/intro', {
        method: 'POST',
        body: { studentId: student.id, actId: act.id, choiceId, text: note }
      });
    } catch (err) {
      lineEl.textContent = '';
      await typeInto(lineEl, `这次没记上（${err.message}）。网络不好的时候，记东西很容易丢。我们再试一次？`);
      const retryBox = step('<div class="row"><button class="btn btn-primary btn-sm" data-retry>重试这一幕</button></div>');
      await onClick(retryBox, 'data-retry');
      return runAct(act, index);
    }

    lineEl.textContent = '';
    setMood('happy');
    await typeInto(lineEl, res.reply);

    if (!replay) {
      doneActs.add(act.id);
      clueCount = doneActs.size;
      const clueLabel = (res.collected || []).find((c) => c.actId === act.id)?.label || act.chapter;
      addClueChip(clueLabel, pickedLabel);
      bumpCount();
    }

    await wait(reduced() ? 0 : 180);
    const isLast = index === acts.length - 1;
    const nextBox = step(`<div class="story-nextrow">
        <span class="story-aside">${replay ? '重看模式：这一幕不会重复记录' : `这条线索已写进你的档案，编号 L${clueCount}`}</span>
        <button class="btn btn-primary btn-sm" data-next>${isLast ? '走到路口' : '继续'}</button>
      </div>`);
    await onClick(nextBox, 'data-next');
    await transition();
    narrEl.classList.remove('in');
  };

  /* --------------------------- 终章：生成个人画像 --------------------------- */
  const CONF_WORD = { high: '置信度 较高', medium: '置信度 中等', low: '置信度 偏低' };
  const clip = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  /** 按句号截断，避免画像摘要断在半句上 */
  const clipSentence = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    let out = '';
    for (const part of t.split(/(?<=。)/)) {
      if ((out + part).length > n) break;
      out += part;
    }
    return out || clip(t, n);
  };

  const portraitHtml = (a) => {
    const dims = [...(a.profileSnapshot?.dimensions || [])].sort((x, y) => y.score - x.score);
    const top = (a.strengths || []).slice(0, 2);
    const hyp = (a.hypotheses || []).filter((h) => h.text).slice(0, 2);
    const careers = (a.careerMatches || []).slice(0, 3);
    const strengthLines = top.map((s) => {
      const [name, rank] = String(s.title).split('：');
      const refs = (s.evidence || []).slice(0, 3).map((r) => `<em>${esc(r)}</em>`).join('');
      return `<p><b>${esc(name)}</b> ${esc(rank || '')}${refs}</p>`;
    }).join('');

    return `
      <div class="sp">
        <div class="sp-top">
          <span class="sp-badge">第一版 · ${a.signalCount} 条证据</span>
          <span class="sp-badge sp-badge-${esc(a.confidence)}">${CONF_WORD[a.confidence] || '置信度 待补充'}</span>
          <span class="sp-badge sp-badge-ghost">由规则引擎计算 · 非真人判断</span>
        </div>
        <p class="sp-sum">${esc(clipSentence(a.summary, 120))}</p>
        <div class="sp-dims">
          ${dims.map((d, i) => `<div class="sp-dim">
            <span class="sp-name">${esc(d.name)}</span>
            <span class="sp-track"><i style="--w:${d.score}%;animation-delay:${i * 70}ms"></i></span>
            <b>${d.score}</b>
          </div>`).join('')}
        </div>
        <div class="sp-cols">
          <div class="sp-block"><h4>目前最清楚的两条</h4>${strengthLines || '<p>证据还太少，先不下结论。</p>'}</div>
          <div class="sp-block"><h4>还不确定</h4>${hyp.length
            ? hyp.map((h) => `<p>${esc(clip(h.text, 58))}</p>`).join('')
            : '<p>暂时没看到明显矛盾，可以再多做几次情景任务来验证。</p>'}</div>
        </div>
        ${careers.length ? `<div class="sp-careers"><span class="sp-label">可以先了解的方向</span>${careers
          .map((c) => `<span class="sp-career">${esc(c.name)}<b>${c.match}%</b></span>`).join('')}</div>` : ''}
      </div>`;
  };

  const runFinale = async () => {
    setDots(acts.length + 1);
    setMood('happy');
    setChapter(finale.chapter, finale.title);
    scene.classList.add('finale');
    narrEl.textContent = finale.line;
    narrEl.classList.add('in');
    choicesEl.innerHTML = '';
    noteEl.textContent = '';
    lineEl.innerHTML = '<span class="story-thinking" aria-label="小帆正在整理你的画像"><i></i><i></i><i></i></span>';

    // 七问答完就直接跑正式的分析链路：同一套打分、同一份证据索引，
    // 学生进画像页看到的和这里是同一份结果，不会出现"动画里一个说法、报表里另一个说法"。
    let analysis = null;
    let portraitError = '';
    try {
      const res = await api('/api/explore/intro/finish', {
        method: 'POST',
        body: { studentId: student.id, skipped: false, portrait: true }
      });
      finished = true;
      analysis = res?.analysis || null;
      portraitError = res?.portraitError || '';
    } catch (err) {
      portraitError = err.message || '画像生成失败';
    }
    lineEl.textContent = '';

    const extra = document.createElement('div');
    extra.className = 'story-finale';
    extra.innerHTML = analysis
      ? portraitHtml(analysis)
      : `<p class="story-aside">${esc(clip(portraitError, 80))}。七条线索已经存好了，画像可以在「我的画像」页面重新生成。</p>`;
    // 放进气泡里、按钮之前：先看画像，再决定下一步
    scene.querySelector('.story-bubble').insertBefore(extra, noteEl);

    await typeInto(lineEl, analysis ? finale.line2 : '先把这七条线索存好，画像随时可以再生成。');
    await wait(reduced() ? 0 : 220);

    const caveat = analysis?.caveats?.[0] || finale.note;
    const box = step(`<p class="story-caveat">${esc(caveat)}</p>
      <div class="row" style="margin-top:10px">
        <button class="btn btn-primary" data-finish-go>${esc(finale.cta)}</button>
        <button class="btn btn-ghost story-ghost" data-finish-home>${esc(finale.cta2)}</button>
      </div>`);
    hintEl.textContent = '';
    const go = await Promise.race([
      onClick(box, 'data-finish-go').then(() => 'analysis'),
      onClick(box, 'data-finish-home').then(() => 'explore')
    ]);
    await close({ skipped: false });
    if (go === 'analysis') location.hash = '#/student/analysis';
    else location.hash = '#/student/explore?tab=scenario';
  };

  (async () => {
    try {
      await wait(reduced() ? 0 : 400);
      if (startIndex === 0) await prologue();
      for (let i = startIndex; i < acts.length; i += 1) await runAct(acts[i], i);
      await runFinale();
    } catch (err) {
      if (!closed) {
        lineEl.textContent = `剧情走丢了（${err.message}）。你可以先跳过，之后在首页点「重看启程」再走一遍。`;
        confirmEl.hidden = false;
      }
    }
  })();

  return { close: () => close({ skipped: true }) };
}

/** 需要时自动开场；拿不到状态就安静跳过，绝不能挡住主功能 */
export async function maybeStartIntro({ student, force = false, replay = false, onDone = null } = {}) {
  if (!student) return false;
  if (!force) {
    try {
      const data = await api(`/api/explore/intro?studentId=${encodeURIComponent(student.id)}`);
      const status = data?.state?.status;
      if (status === 'done' || status === 'skipped') return false;
    } catch {
      return false;
    }
  }
  await startIntro({ student, replay, onDone });
  return true;
}
