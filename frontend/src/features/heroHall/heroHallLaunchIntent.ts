const EXPLICIT_HERO_HALL_TERMS = [
  '智能体',
  'agent',
  '阵容',
  'lineup',
  '英雄殿堂',
  '组合智能体',
  '知识路径',
  '图谱规划',
];

const PLANNING_INTENT_TERMS = ['规划', '方案', '策略', '路径', '图谱', '推荐', '打造', '搭建', '设计', '计划', '优化', '怎么', '如何'];
const BUSINESS_CONTEXT_TERMS = [
  '业务',
  '品牌',
  '营销',
  '招商',
  '获客',
  '线索',
  '销售',
  '成交',
  '转化',
  '增长',
  '私域',
  '复购',
  '招生',
  '课程',
  '短视频',
  '内容',
  '餐饮',
  '门店',
  '直播',
  '电商',
];

export function shouldReserveHeroHallLaunch(message: string) {
  const text = String(message || '').trim().toLowerCase();

  if (!text) {
    return false;
  }

  if (EXPLICIT_HERO_HALL_TERMS.some((term) => text.includes(term))) {
    return true;
  }

  const hasPlanningIntent = PLANNING_INTENT_TERMS.some((term) => text.includes(term));
  const businessMatches = BUSINESS_CONTEXT_TERMS.filter((term) => text.includes(term)).length;

  return (hasPlanningIntent && businessMatches >= 1) || (text.length >= 6 && businessMatches >= 2);
}
