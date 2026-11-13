/**
 * FuturePath AI — 领域知识库
 * 职业目录 / 动态提问库 / 情景任务 / 兴趣卡片 / 关键词词表
 * 所有内容为中文青少年语境编写，可直接替换或扩充。
 */

export const RIASEC = ['R', 'I', 'A', 'S', 'E', 'C'];

export const DIMENSIONS = {
  R: { key: 'R', name: '实践动手', short: '动手', desc: '喜欢操作、拆装、户外与真实场景中的具体任务', color: '#0f766e' },
  I: { key: 'I', name: '探究思考', short: '探究', desc: '喜欢追问原理、推理、数据与抽象问题', color: '#1d4ed8' },
  A: { key: 'A', name: '创意表达', short: '创意', desc: '喜欢想象、设计、写作、影像与审美表达', color: '#a21caf' },
  S: { key: 'S', name: '助人沟通', short: '助人', desc: '喜欢倾听、教学、协作与帮助他人成长', color: '#b45309' },
  E: { key: 'E', name: '组织影响', short: '影响', desc: '喜欢发起、组织、说服与推动事情发生', color: '#b91c1c' },
  C: { key: 'C', name: '条理执行', short: '条理', desc: '喜欢规则、流程、细节与稳定可靠的交付', color: '#475569' }
};

/**
 * 加德纳多元智能：八项。
 * 只作为"你更容易用哪种方式学"的描述框架，不合成总分，也不用于评价高低。
 */
export const MI_DIMENSIONS = {
  lin: { key: 'lin', name: '语言智能', short: '语言', desc: '用词句理解与表达：读、写、讲', color: '#0e7490' },
  log: { key: 'log', name: '逻辑数理智能', short: '逻辑', desc: '找规律、推理、用数据与模型', color: '#1d4ed8' },
  spa: { key: 'spa', name: '空间智能', short: '空间', desc: '图像、方位、结构与可视化', color: '#7c3aed' },
  bod: { key: 'bod', name: '身体动觉智能', short: '动觉', desc: '用身体和手来学习与解决问题', color: '#0f766e' },
  mus: { key: 'mus', name: '音乐智能', short: '音乐', desc: '音高、节奏、音色与旋律', color: '#be185d' },
  int: { key: 'int', name: '人际智能', short: '人际', desc: '读懂他人、协调关系、合作', color: '#b45309' },
  intra: { key: 'intra', name: '内省智能', short: '内省', desc: '理解自己的情绪、动机与边界', color: '#475569' },
  nat: { key: 'nat', name: '自然观察智能', short: '自然', desc: '观察、分类自然与环境中的变化', color: '#15803d' }
};

export const ABILITIES = {
  logic: { key: 'logic', name: '逻辑分析', desc: '拆解问题、找规律、推理' },
  verbal: { key: 'verbal', name: '语言表达', desc: '把想法讲清楚、写明白' },
  spatial: { key: 'spatial', name: '空间与动手', desc: '看图、动手、操作工具' },
  social: { key: 'social', name: '人际协作', desc: '理解他人、协调配合' },
  self: { key: 'self', name: '自我管理', desc: '计划、坚持、抗干扰' }
};

export const VALUES = [
  { key: 'achievement', name: '成就与影响', desc: '做出被看见的成果' },
  { key: 'stability', name: '稳定与保障', desc: '可预期的路径与生活' },
  { key: 'helping', name: '助人与利他', desc: '让别人变得更好' },
  { key: 'creation', name: '创造与表达', desc: '做出独一无二的东西' },
  { key: 'freedom', name: '自由与灵活', desc: '自己安排节奏与方式' },
  { key: 'income', name: '收入与回报', desc: '努力能换成实在的回报' },
  { key: 'truth', name: '探求与真理', desc: '把问题搞明白' },
  { key: 'belonging', name: '团队与归属', desc: '和一群合得来的人一起干' }
];

/** 职业目录：riasec 0-9；abilities 0-9 */
export const CAREERS = [
  {
    id: 'ai_engineer', name: '人工智能工程师', riasec: { R: 5, I: 9, A: 2, S: 2, E: 3, C: 6 },
    abilities: { logic: 9, verbal: 4, spatial: 4, social: 3, self: 7 },
    path: ['高中（物理/数学方向）', '本科：计算机 / 人工智能 / 自动化', '可选：硕士（算法方向）'],
    subjects: ['数学', '物理', '信息技术'], outlook: '需求持续增长，但对数学与持续学习要求高',
    salary: '中上', tags: ['技术', '高投入', '长期学习'], firstStep: '用 Python 做一个能解决身边小问题的工具'
  },
  {
    id: 'data_analyst', name: '数据分析师', riasec: { R: 3, I: 9, A: 3, S: 4, E: 4, C: 8 },
    abilities: { logic: 9, verbal: 5, spatial: 3, social: 4, self: 7 },
    path: ['高中（数学基础扎实）', '本科：统计学 / 数据科学 / 经济学', '实习：业务分析岗'],
    subjects: ['数学', '信息技术', '地理'], outlook: '各行业都需要，入门门槛适中但需业务理解',
    salary: '中上', tags: ['数据', '通用技能'], firstStep: '用公开数据做一份"我们学校食堂"分析'
  },
  {
    id: 'product_manager', name: '产品经理', riasec: { R: 3, I: 7, A: 6, S: 7, E: 8, C: 5 },
    abilities: { logic: 7, verbal: 8, spatial: 3, social: 8, self: 7 },
    path: ['本科：任意专业 + 互联网实习', '从运营/助理起步', '积累项目作品'],
    subjects: ['语文', '信息技术', '政治'], outlook: '竞争激烈，看重项目经验与沟通',
    salary: '中上', tags: ['沟通密集', '项目制'], firstStep: '为班级做一次需求调研并写成一页方案'
  },
  {
    id: 'doctor', name: '临床医生', riasec: { R: 6, I: 8, A: 2, S: 8, E: 4, C: 5 },
    abilities: { logic: 8, verbal: 6, spatial: 6, social: 8, self: 9 },
    path: ['高中（化学/生物）', '本科：临床医学（5 年）', '规培 3 年'],
    subjects: ['生物', '化学', '物理'], outlook: '周期长、责任重，社会需求稳定',
    salary: '中上', tags: ['长周期', '高责任'], firstStep: '阅读一本医学入门书并旁听一次健康讲座'
  },
  {
    id: 'nurse', name: '护理师 / 康复技师', riasec: { R: 7, I: 5, A: 2, S: 9, E: 3, C: 7 },
    abilities: { logic: 5, verbal: 5, spatial: 6, social: 9, self: 8 },
    path: ['中职/高职：护理', '或本科：护理学', '考取护士执业资格'],
    subjects: ['生物', '化学'], outlook: '就业面广，可向专科护理、康复方向发展',
    salary: '中等', tags: ['稳定', '照护'], firstStep: '参加一次社区健康志愿服务'
  },
  {
    id: 'teacher', name: '中小学教师', riasec: { R: 3, I: 6, A: 5, S: 9, E: 5, C: 6 },
    abilities: { logic: 6, verbal: 9, spatial: 3, social: 9, self: 7 },
    path: ['本科：师范类 / 学科专业', '考取教师资格证', '入编或民办学校'],
    subjects: ['语文/数学/英语', '教育学'], outlook: '需求稳定，公费师范生政策值得关注',
    salary: '中等', tags: ['稳定', '表达'], firstStep: '给低年级同学讲一次 15 分钟的小课'
  },
  {
    id: 'counselor', name: '心理咨询师', riasec: { R: 1, I: 8, A: 5, S: 9, E: 4, C: 5 },
    abilities: { logic: 7, verbal: 8, spatial: 2, social: 9, self: 8 },
    path: ['本科：心理学', '硕士：临床与咨询方向', '长期督导与个案积累'],
    subjects: ['生物', '语文'], outlook: '需求上升，成长期较长',
    salary: '中等', tags: ['倾听', '长周期'], firstStep: '读一本心理学入门书，练习 3 次深度倾听'
  },
  {
    id: 'mech_engineer', name: '机械 / 机器人工程师', riasec: { R: 9, I: 7, A: 3, S: 3, E: 4, C: 6 },
    abilities: { logic: 8, verbal: 4, spatial: 9, social: 4, self: 7 },
    path: ['高中（物理）', '本科：机械 / 机器人工程', '技能竞赛或企业实习'],
    subjects: ['物理', '数学', '通用技术'], outlook: '智能制造方向机会多',
    salary: '中上', tags: ['动手', '制造'], firstStep: '组装一次机器人套件并记录调试过程'
  },
  {
    id: 'elec_engineer', name: '电气 / 新能源工程师', riasec: { R: 8, I: 7, A: 2, S: 3, E: 5, C: 7 },
    abilities: { logic: 8, verbal: 4, spatial: 8, social: 4, self: 7 },
    path: ['本科：电气工程 / 新能源科学', '电网、能源企业或制造企业'],
    subjects: ['物理', '数学'], outlook: '新能源与电力系统持续投入',
    salary: '中上', tags: ['能源', '工程'], firstStep: '了解本地一家新能源企业并做访谈笔记'
  },
  {
    id: 'architect', name: '建筑 / 空间设计师', riasec: { R: 6, I: 6, A: 8, S: 4, E: 5, C: 5 },
    abilities: { logic: 6, verbal: 5, spatial: 9, social: 5, self: 7 },
    path: ['本科：建筑学（5 年）/ 环境设计', '作品集 + 实习'],
    subjects: ['数学', '美术', '物理'], outlook: '与城市更新、乡村建设结合有新机会',
    salary: '中等', tags: ['审美', '空间'], firstStep: '画一遍自己家的平面图并改造一个角落'
  },
  {
    id: 'designer', name: '视觉 / UI 设计师', riasec: { R: 4, I: 4, A: 9, S: 4, E: 4, C: 5 },
    abilities: { logic: 5, verbal: 5, spatial: 7, social: 5, self: 7 },
    path: ['本科/高职：视觉传达、数字媒体', '靠作品集就业', '可自由职业'],
    subjects: ['美术', '信息技术'], outlook: '门槛灵活，AI 工具放大个人产出',
    salary: '中等', tags: ['作品集', '灵活'], firstStep: '为班级活动设计一张海报'
  },
  {
    id: 'filmmaker', name: '影视编导 / 短视频创作', riasec: { R: 5, I: 5, A: 9, S: 6, E: 7, C: 4 },
    abilities: { logic: 5, verbal: 7, spatial: 7, social: 7, self: 7 },
    path: ['本科：广播电视编导 / 数字媒体', '剧组或 MCN 实习'],
    subjects: ['语文', '信息技术'], outlook: '内容行业波动大，能力可迁移',
    salary: '波动', tags: ['创作', '项目制'], firstStep: '用手机拍一条 3 分钟的人物小片'
  },
  {
    id: 'journalist', name: '记者 / 内容运营', riasec: { R: 3, I: 7, A: 8, S: 7, E: 6, C: 5 },
    abilities: { logic: 6, verbal: 9, spatial: 3, social: 8, self: 7 },
    path: ['本科：新闻传播 / 中文', '媒体或企业内容岗'],
    subjects: ['语文', '政治'], outlook: '传统媒体收缩，内容与品牌方向仍需求稳定',
    salary: '中等', tags: ['写作', '沟通'], firstStep: '采访一位身边的劳动者并写成 800 字'
  },
  {
    id: 'lawyer', name: '律师 / 法务', riasec: { R: 2, I: 8, A: 4, S: 6, E: 8, C: 6 },
    abilities: { logic: 9, verbal: 9, spatial: 2, social: 7, self: 8 },
    path: ['本科：法学', '法律职业资格考试', '实习律师 → 执业'],
    subjects: ['政治', '语文'], outlook: '门槛高、分化大，专业能力决定上限',
    salary: '分化', tags: ['考试', '表达'], firstStep: '读一个真实判决书并复述争议点'
  },
  {
    id: 'public_servant', name: '公共管理 / 基层公务员', riasec: { R: 4, I: 6, A: 3, S: 7, E: 6, C: 8 },
    abilities: { logic: 7, verbal: 7, spatial: 3, social: 8, self: 8 },
    path: ['本科：公共管理 / 法学 / 汉语言', '公务员或事业单位考试'],
    subjects: ['政治', '语文'], outlook: '竞争激烈，基层岗位需求稳定',
    salary: '中等', tags: ['稳定', '公共服务'], firstStep: '参与一次村/社区事务的志愿协助'
  },
  {
    id: 'accountant', name: '会计 / 审计', riasec: { R: 3, I: 6, A: 2, S: 4, E: 4, C: 9 },
    abilities: { logic: 8, verbal: 5, spatial: 2, social: 4, self: 8 },
    path: ['本科/高职：会计学', '初级会计职称 → 中级 / CPA'],
    subjects: ['数学', '政治'], outlook: '基础岗位受自动化影响，管理会计与审计仍稳',
    salary: '中等', tags: ['细致', '证书'], firstStep: '用表格给家庭记一个月账并做汇总'
  },
  {
    id: 'finance', name: '金融分析师', riasec: { R: 2, I: 8, A: 3, S: 5, E: 7, C: 7 },
    abilities: { logic: 9, verbal: 7, spatial: 2, social: 6, self: 8 },
    path: ['本科：金融 / 经济 / 数学', '实习 + 相关证书'],
    subjects: ['数学', '政治'], outlook: '周期性强，名校与实习影响大',
    salary: '高', tags: ['高压', '数字'], firstStep: '跟踪一家公司 3 个月并写一页观察'
  },
  {
    id: 'marketing', name: '市场营销 / 品牌运营', riasec: { R: 3, I: 6, A: 6, S: 7, E: 9, C: 5 },
    abilities: { logic: 7, verbal: 8, spatial: 4, social: 8, self: 7 },
    path: ['本科：市场营销 / 传播', '从执行岗做起'],
    subjects: ['语文', '政治'], outlook: '门槛相对开放，业绩导向',
    salary: '分化', tags: ['沟通', '结果导向'], firstStep: '为校园社团活动做一次推广并复盘数据'
  },
  {
    id: 'social_worker', name: '社会工作 / 公益项目', riasec: { R: 4, I: 5, A: 5, S: 9, E: 6, C: 6 },
    abilities: { logic: 6, verbal: 7, spatial: 3, social: 9, self: 8 },
    path: ['本科：社会工作 / 社会学', '社工机构或基金会'],
    subjects: ['政治', '语文'], outlook: '政策支持增加，收入中等',
    salary: '偏低-中等', tags: ['公益', '助人'], firstStep: '在一个公益组织做 8 小时志愿者'
  },
  {
    id: 'agri_tech', name: '现代农业技术 / 乡村振兴岗', riasec: { R: 8, I: 6, A: 3, S: 6, E: 6, C: 5 },
    abilities: { logic: 6, verbal: 5, spatial: 7, social: 6, self: 8 },
    path: ['高职/本科：农学、智慧农业', '农业企业、合作社、返乡创业'],
    subjects: ['生物', '化学', '地理'], outlook: '县域机会多，适合愿意扎根地方的学生',
    salary: '中等', tags: ['在地', '创业'], firstStep: '调研本地一种农产品从田间到餐桌的链条'
  },
  {
    id: 'chef', name: '餐饮 / 西点创业', riasec: { R: 8, I: 3, A: 6, S: 5, E: 7, C: 6 },
    abilities: { logic: 4, verbal: 5, spatial: 7, social: 6, self: 8 },
    path: ['中职/高职：烹饪工艺', '酒店或门店学徒', '可自主开店'],
    subjects: ['化学', '通用技术'], outlook: '技能型，口碑与选址决定收入',
    salary: '分化', tags: ['技能', '创业'], firstStep: '完整做一次 6 人份的菜单并算成本'
  },
  {
    id: 'sports_coach', name: '体育教练 / 运动康复', riasec: { R: 8, I: 4, A: 3, S: 7, E: 5, C: 5 },
    abilities: { logic: 5, verbal: 6, spatial: 7, social: 7, self: 8 },
    path: ['本科：体育教育 / 运动康复', '教练员或康复机构'],
    subjects: ['生物', '体育'], outlook: '健康需求上升，专项能力重要',
    salary: '中等', tags: ['运动', '健康'], firstStep: '为一位同学设计 4 周训练计划并跟踪'
  }
];

/** 提问库：dim → 问题。followUps 用于回答过短时追问 */
export const QUESTIONS = [
  { id: 'q_r1', dim: 'R', bands: ['12-15', '16-18', '19-22'], text: '最近半年，你有没有亲手把什么东西做出来、修好或者改好？说说那件事。', followUps: ['当时具体用了什么工具或材料？', '过程中哪一步最难，你怎么解决的？'] },
  { id: 'q_r2', dim: 'R', bands: ['12-15', '16-18'], text: '如果让你在户外待一整天做事，你更想干什么？', followUps: ['你更喜欢自己干还是和别人搭手？'] },
  { id: 'q_i1', dim: 'I', bands: ['12-15', '16-18', '19-22'], text: '有没有一个问题，你一直想弄明白，甚至自己去查过资料？', followUps: ['你查到的最有意思的一点是什么？', '你当时是怎么验证这个说法的？'] },
  { id: 'q_i2', dim: 'I', bands: ['16-18', '19-22'], text: '做题或做事时，你更喜欢"知道怎么做就行"还是"知道为什么这样"？举个最近的例子。', followUps: ['如果老师给的方法你觉得不对，你会怎么做？'] },
  { id: 'q_a1', dim: 'A', bands: ['12-15', '16-18', '19-22'], text: '你有没有做过一个"只有你想得出来"的东西？可以是画、文字、视频、歌、摆设，任何形式。', followUps: ['你希望别人看到它时有什么感觉？', '你改动最多的是哪一部分？'] },
  { id: 'q_a2', dim: 'A', bands: ['12-15', '16-18'], text: '如果要你给班级活动想一个主题，你会从哪儿开始想？', followUps: ['你会更在意氛围、内容，还是别人记不记得住？'] },
  { id: 'q_s1', dim: 'S', bands: ['12-15', '16-18', '19-22'], text: '最近有人因为什么事来找你帮忙？你当时做了什么？', followUps: ['你更擅长帮他解决问题，还是先让他好受一点？', '帮完之后你自己的感觉是什么？'] },
  { id: 'q_s2', dim: 'S', bands: ['16-18', '19-22'], text: '如果你要给低年级同学讲清楚一个知识点，你会选什么、怎么讲？', followUps: ['你怎么判断对方真的听懂了？'] },
  { id: 'q_e1', dim: 'E', bands: ['12-15', '16-18', '19-22'], text: '有没有一次是你发起、并且真的把一群人带动起来的事？哪怕很小。', followUps: ['你是怎么让大家愿意配合的？', '中间有人不配合时你怎么处理？'] },
  { id: 'q_e2', dim: 'E', bands: ['16-18', '19-22'], text: '如果你要说服家长同意你做一个"看起来没什么用"的决定，你会怎么讲？', followUps: ['你最担心他们反驳哪一点？'] },
  { id: 'q_c1', dim: 'C', bands: ['12-15', '16-18', '19-22'], text: '你平时怎么安排自己的作业和复习？有没有一套自己的办法？', followUps: ['这套办法什么时候失效过？', '你会用清单、表格或提醒工具吗？'] },
  { id: 'q_c2', dim: 'C', bands: ['12-15', '16-18', '19-22'], text: '一件需要重复做很多次、又不难的事情，你能坚持多久？举个例子。', followUps: ['是什么让你坚持下来或者放弃的？'] },
  { id: 'q_v1', dim: 'V', bands: ['12-15', '16-18', '19-22'], text: '如果未来工作的收入差不多，你最看重它带给你什么？', options: [
    { key: 'achievement', label: '做出被认可的成果' }, { key: 'stability', label: '稳定、可预期' },
    { key: 'helping', label: '真的帮到别人' }, { key: 'creation', label: '能表达自己' },
    { key: 'freedom', label: '时间与方式自由' }, { key: 'income', label: '收入越高越好' },
    { key: 'truth', label: '把问题搞明白' }, { key: 'belonging', label: '和合得来的人一起' }] },
  { id: 'q_v2', dim: 'V', bands: ['16-18', '19-22'], text: '想象 10 年后的一天，哪种状态让你更安心？', options: [
    { key: 'stability', label: '有编制、有固定节奏' }, { key: 'achievement', label: '在带一个重要的项目' },
    { key: 'freedom', label: '自己安排接什么活' }, { key: 'helping', label: '每天在直接帮具体的人' }] },
  { id: 'q_career1', dim: 'CAREER', bands: ['12-15', '16-18', '19-22'], text: '现在让你说出三个你觉得"还不错"的职业，你会说哪三个？为什么？', followUps: ['这三个里，哪个你最想试试？'] },
  { id: 'q_career2', dim: 'CAREER', bands: ['16-18', '19-22'], text: '有没有一个职业，你一想到就觉得"我肯定干不了"？是什么让你这么想？', followUps: ['如果那个障碍可以通过训练解决，你还排斥吗？'] }
];

/** 情景任务：选项对多维兴趣与能力加权，返回即时反馈 */
export const SCENARIOS = [
  {
    id: 'sc_tech_fest', title: '校园科技节：只剩 5 天', band: ['12-15', '16-18'],
    setup: '班级要出一个科技节展台，老师把这件事交给了你们小组。今天是周一，周五就要展示，组里 6 个人，谁都不知道从哪开始。',
    question: '你会先做哪件事？',
    options: [
      { id: 'a', text: '先把任务拆成清单，排出时间表，认领分工', effects: { C: 0.9, E: 0.5 }, ability: { self: 0.8, logic: 0.4 }, outcome: '你把混乱变成了可执行的计划。团队最缺的往往不是点子，而是有人愿意先把边界划清。' },
      { id: 'b', text: '先想一个别人没做过的点子，让展台有记忆点', effects: { A: 0.9, E: 0.4 }, ability: { verbal: 0.4, spatial: 0.3 }, outcome: '你把注意力放在了"差异化"上。创意型任务里，这是启动引擎的那一步。' },
      { id: 'c', text: '先把装置做出来，边做边改', effects: { R: 0.9, I: 0.4 }, ability: { spatial: 0.9, self: 0.4 }, outcome: '你选择用实物推进讨论。动手做原型，常常比开会更快暴露真问题。' },
      { id: 'd', text: '先去问上一届做过的人，踩过的坑在哪', effects: { I: 0.7, S: 0.6 }, ability: { social: 0.7, logic: 0.4 }, outcome: '你在收集一手信息。这类"先问再做"的习惯，在真实项目里非常值钱。' }
    ]
  },
  {
    id: 'sc_class_event', title: '班级活动没人报名', band: ['12-15', '16-18'],
    setup: '你负责组织一次班级周末活动，报名表发出去两天，只有 4 个人填。班主任问你怎么办。',
    question: '你的下一步是？',
    options: [
      { id: 'a', text: '一个个私聊，问他们不报名的真实原因', effects: { S: 0.8, E: 0.5 }, ability: { social: 0.9 }, outcome: '你去拿了真实反馈而不是猜。多数"没人参加"背后是具体的一个顾虑。' },
      { id: 'b', text: '改方案：换个时间、换个更轻的形式再发一次', effects: { E: 0.8, A: 0.5 }, ability: { logic: 0.5, social: 0.4 }, outcome: '你把问题当成方案问题来处理。降低参与成本，往往比加大宣传有效。' },
      { id: 'c', text: '先让几个关系好的同学带头报名，形成气氛', effects: { E: 0.9, S: 0.4 }, ability: { social: 0.7 }, outcome: '你用了"种子用户"策略。这是很多真实增长动作的雏形。' },
      { id: 'd', text: '做成表格，把报名进度和名单整理清楚给老师看', effects: { C: 0.9, E: 0.3 }, ability: { self: 0.6, logic: 0.4 }, outcome: '你用数据把局面讲清楚了。让上级一眼看懂现状，本身就是一种能力。' }
    ]
  },
  {
    id: 'sc_repair', title: '坏掉的旧收音机', band: ['12-15', '16-18'],
    setup: '家里一台旧收音机不出声了，扔了可惜。你有一下午的时间和一个工具箱。',
    question: '你会怎么开始？',
    options: [
      { id: 'a', text: '拆开看，先找到哪个零件不对', effects: { R: 1.0, I: 0.5 }, ability: { spatial: 0.9, logic: 0.5 }, outcome: '你选择了最直接的路径：打开它。动手型的人常常靠"拆"来理解世界。' },
      { id: 'b', text: '先搜型号和常见故障，按步骤排查', effects: { I: 0.9, C: 0.5 }, ability: { logic: 0.8 }, outcome: '你先建了知识框架再动手。这能省下大量试错时间。' },
      { id: 'c', text: '干脆改造成别的用途，比如小音箱或摆件', effects: { A: 0.9, R: 0.6 }, ability: { spatial: 0.6, verbal: 0.3 }, outcome: '你把"修"变成了"再创造"。很多设计工作就是这样开始的。' },
      { id: 'd', text: '叫上一个懂行的同学一起弄', effects: { S: 0.7, R: 0.5 }, ability: { social: 0.8 }, outcome: '你选择借助他人的知识。协作不是能力不足，而是效率选择。' }
    ]
  },
  {
    id: 'sc_community', title: '社区里的一件小事', band: ['12-15', '16-18', '19-22'],
    setup: '社区想在暑假办一个面向老人的手机使用小课堂，招募志愿者，一周两次，共四周。你有空，但会占用你一部分休息时间。',
    question: '你更可能？',
    options: [
      { id: 'a', text: '报名，并且认真准备每次讲什么', effects: { S: 1.0, C: 0.5 }, ability: { social: 0.8, verbal: 0.6 }, outcome: '你愿意为具体的人投入持续的时间。助人型动机通常来自这种真实接触。' },
      { id: 'b', text: '报名，但更想负责设计海报和宣传', effects: { A: 0.9, E: 0.4 }, ability: { spatial: 0.5, verbal: 0.5 }, outcome: '你想贡献自己的表达优势。公益项目同样需要专业分工。' },
      { id: 'c', text: '先去看一次，再决定要不要长期投入', effects: { I: 0.7, C: 0.5 }, ability: { logic: 0.5, self: 0.5 }, outcome: '你先做小成本试水。这是一种很成熟的决定方式。' },
      { id: 'd', text: '不太想去，但如果是组织统筹的角色可以考虑', effects: { E: 0.9, C: 0.4 }, ability: { social: 0.4, self: 0.4 }, outcome: '你更愿意站在"把事推起来"的位置。组织者角色也有其价值。' }
    ]
  },
  {
    id: 'sc_data', title: '一份看不懂的成绩单', band: ['16-18', '19-22'],
    setup: '你拿到自己一学期的成绩，发现总分没变，但各科波动很大。你想搞清楚到底发生了什么。',
    question: '你会？',
    options: [
      { id: 'a', text: '把每次考试按科目列成表，看趋势和拐点', effects: { I: 0.9, C: 0.8 }, ability: { logic: 0.9, self: 0.5 }, outcome: '你在用数据而不是感觉判断自己。这是分析型思维的日常版本。' },
      { id: 'b', text: '找波动最大的那科老师聊，问具体问题在哪', effects: { S: 0.7, I: 0.6 }, ability: { social: 0.7, verbal: 0.5 }, outcome: '你直接去找信息源。很多"想不明白"其实是"没问对人"。' },
      { id: 'c', text: '先回想那段时间自己的状态，写下几个可能原因', effects: { A: 0.5, I: 0.7 }, ability: { verbal: 0.6, self: 0.6 }, outcome: '你先从自身经验里找线索。内省也是重要的信息来源。' },
      { id: 'd', text: '制定下学期的改进计划，先做起来', effects: { C: 0.8, E: 0.6 }, ability: { self: 0.9 }, outcome: '你倾向于用行动解决问题。注意：先诊断再行动，效率通常更高。' }
    ]
  },
  {
    id: 'sc_conflict', title: '小组作业里的分歧', band: ['16-18', '19-22'],
    setup: '小组作业快交了，你和组长在方向上分歧很大。你觉得他的方案会失分，他认为你的想法太冒险。其他人都沉默。',
    question: '你会？',
    options: [
      { id: 'a', text: '把两种方案各写三条利弊，让大家投票', effects: { C: 0.7, E: 0.7 }, ability: { logic: 0.8, social: 0.6 }, outcome: '你把情绪冲突转成了可比较的选项。这是很有效的降温方式。' },
      { id: 'b', text: '私下找组长，先弄清他真正担心什么', effects: { S: 0.9, E: 0.5 }, ability: { social: 0.9, verbal: 0.6 }, outcome: '你处理的是人，不是方案。多数分歧背后是没被听见的担心。' },
      { id: 'c', text: '各做一版，用结果说话', effects: { R: 0.6, E: 0.7 }, ability: { self: 0.8 }, outcome: '你选择用产出裁决。代价是时间，但结论最有说服力。' },
      { id: 'd', text: '服从组长，把自己的意见记下来', effects: { C: 0.8, S: 0.4 }, ability: { self: 0.5 }, outcome: '你选择保住团队进度。注意长期这样可能让你真实判断被埋掉。' }
    ]
  }
];

/** 兴趣卡片：like / dislike 两种反馈 */
export const CARDS = [
  { id: 'c1', title: '把一台坏掉的电器拆开研究', dim: 'R', tag: '动手' },
  { id: 'c2', title: '用数据验证一个流传很广的说法', dim: 'I', tag: '求证' },
  { id: 'c3', title: '为一场活动设计整套视觉', dim: 'A', tag: '设计' },
  { id: 'c4', title: '听朋友讲他的烦恼并帮他理清', dim: 'S', tag: '倾听' },
  { id: 'c5', title: '从零拉起一个 10 人小队完成任务', dim: 'E', tag: '组织' },
  { id: 'c6', title: '把混乱的资料整理成清晰的表格', dim: 'C', tag: '整理' },
  { id: 'c7', title: '在田间或工地上解决一个实际问题', dim: 'R', tag: '现场' },
  { id: 'c8', title: '读一篇论文并搞懂它的方法', dim: 'I', tag: '研究' },
  { id: 'c9', title: '写一个让人想看完的故事', dim: 'A', tag: '写作' },
  { id: 'c10', title: '给低年级同学讲懂一道难题', dim: 'S', tag: '教学' },
  { id: 'c11', title: '说服别人接受你的方案', dim: 'E', tag: '说服' },
  { id: 'c12', title: '把一件事按流程做到零差错', dim: 'C', tag: '严谨' },
  { id: 'c13', title: '组装机器人并让它跑起来', dim: 'R', tag: '工程' },
  { id: 'c14', title: '分析一个社会现象背后的原因', dim: 'I', tag: '分析' },
  { id: 'c15', title: '拍一条有质感的短片', dim: 'A', tag: '影像' },
  { id: 'c16', title: '在社区做长期志愿服务', dim: 'S', tag: '公益' },
  { id: 'c17', title: '策划一次能赚钱的小生意', dim: 'E', tag: '商业' },
  { id: 'c18', title: '把复杂流程写成别人能照着做的说明', dim: 'C', tag: '文档' }
];

/** 关键词词表：用于从自由文本中抽取倾向证据 */
export const KEYWORDS = {
  R: ['动手', '拆', '修', '装', '组装', '工具', '机器', '机器人', '电路', '焊接', '户外', '田', '种', '实验操作', '模型', '零件', '螺丝', '开车', '做饭', '运动', '跑', '球', '体力', '搭建', '实物'],
  I: ['为什么', '原理', '研究', '推理', '数学', '数据', '规律', '逻辑', '实验', '查资料', '论文', '好奇', '弄清楚', '分析', '证明', '算法', '编程', '代码', '天文', '物理', '假设', '验证'],
  A: ['画', '设计', '音乐', '写', '故事', '创作', '摄影', '拍', '视频', '剪辑', '表演', '海报', '审美', '想象', '配色', '排版', '小说', '诗', '舞台', '风格'],
  S: ['帮助', '帮', '倾听', '陪', '教', '讲给', '团队', '照顾', '分享', '沟通', '志愿', '公益', '安慰', '合作', '一起', '照顾', '理解别人', '心理', '老师'],
  E: ['组织', '领导', '带', '说服', '创业', '比赛', '策划', '销售', '谈判', '发起', '推动', '拉人', '安排别人', '负责', '主持', '协调', '生意', '赚钱'],
  C: ['计划', '整理', '规则', '细节', '表格', '清单', '流程', '坚持', '有序', '记录', '检查', '按步骤', '时间表', '记账', '汇总', '准确', '不出错', '归档']
};

export const ABILITY_KEYWORDS = {
  logic: ['推理', '逻辑', '分析', '算', '数据', '规律', '为什么', '证明', '拆解', '步骤', '判断'],
  verbal: ['讲', '说', '写', '表达', '演讲', '沟通', '复述', '解释', '故事', '汇报', '辩论'],
  spatial: ['画', '装', '拆', '动手', '空间', '图', '模型', '设计', '搭', '工具', '操作'],
  social: ['一起', '团队', '合作', '帮', '倾听', '沟通', '协调', '同学', '朋友', '老师', '家长'],
  self: ['坚持', '计划', '自律', '每天', '安排', '完成', '记录', '复盘', '时间', '早起', '练']
};

export const CAREER_ALIASES = {
  ai_engineer: ['人工智能', 'AI', '算法', '程序员', '编程', '软件开发', '工程师'],
  data_analyst: ['数据分析', '数据', '统计'],
  product_manager: ['产品经理', '产品'],
  doctor: ['医生', '临床', '医学'],
  nurse: ['护士', '护理', '康复'],
  teacher: ['老师', '教师', '教书'],
  counselor: ['心理', '咨询师'],
  mech_engineer: ['机械', '机器人', '制造'],
  elec_engineer: ['电气', '电力', '新能源'],
  architect: ['建筑', '设计师', '室内设计'],
  designer: ['设计', 'UI', '平面', '美术'],
  filmmaker: ['导演', '影视', '短视频', '编导', 'up主'],
  journalist: ['记者', '编辑', '媒体', '写作'],
  lawyer: ['律师', '法律', '法务'],
  public_servant: ['公务员', '编制', '事业单位', '政府'],
  accountant: ['会计', '审计', '财务'],
  finance: ['金融', '投行', '证券', '银行'],
  marketing: ['市场', '营销', '品牌', '运营'],
  social_worker: ['社工', '公益', '志愿者'],
  agri_tech: ['农业', '农村', '种植', '乡村'],
  chef: ['厨师', '烘焙', '餐饮', '开店'],
  sports_coach: ['教练', '体育', '健身', '运动康复']
};

/* 开篇引导脚本已独立到 server/ai/intro.js（七问 → 个人画像），此处仅做转发以保持原有引用不变。 */
export { INTRO_STORY, INTRO_CLUE_LABEL } from './intro.js';
