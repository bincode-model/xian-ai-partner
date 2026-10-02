import type { DomainId } from './types';
export interface Sector { id: DomainId; slug: string; name: string; english: string; line: string; place: string; result: string; object: string; color: string; }
export const sectors: Sector[] = [
  { id: 'drug', slug: 'drug', name: '药物研发', english: 'LIFE & DISCOVERY', line: '让分散的证据，走近研究的答案。', place: '西安高新区 · 生命科学', result: '候选证据、研究缺口、验证待办', object: '培养皿、显微镜与细胞生命研究', color: '#ddb786' },
  { id: 'industry', slug: 'industry', name: '智能制造', english: 'PRECISION & PRODUCTION', line: '让每一次异常，都有清晰的回响。', place: '西安产业园区 · 生产现场', result: '缺陷分布、批次追溯、处置工单', object: '精密机械臂与传动结构', color: '#b9c8d3' },
  { id: 'ecommerce', slug: 'ecommerce', name: '电商助企', english: 'GOODS & CONNECTION', line: '让陕西好物，走进更远的生活。', place: '陕西好物 · 多平台经营', result: '四平台商品草稿、字段核对清单', object: '陕西好物与自动分拣台', color: '#d79c7c' },
  { id: 'finance', slug: 'retail', name: '小店经营', english: 'NEIGHBOURHOOD & BUSINESS', line: '把琐碎的账，变成踏实的每一天。', place: '西安街巷 · 小微商户', result: '应收明细、账龄汇总、核对待办', object: '咖啡设备与温控结构', color: '#c6b493' },
  { id: 'tourism', slug: 'tourism', name: '文旅服务', english: 'CHANG’AN & JOURNEYS', line: '让长安的故事，有新的抵达。', place: '长安城墙 · 文化与旅途', result: '分区路线、开放时段核对、行程草稿', object: '文物修复与精密扫描台', color: '#dfaf86' },
  { id: 'employment', slug: 'employment', name: '就业技能', english: 'PEOPLE & POSSIBILITIES', line: '让每一次练习，都有成长的方向。', place: '西安高校与社区 · 岗位实训', result: '岗位技能缺口、实训任务、验收清单', object: '无人实训台与机电教具', color: '#b4c9c1' },
  { id: 'government', slug: 'government', name: '政务便民', english: 'SERVICE & EVERYDAY LIFE', line: '让一件小事，少一些来回奔波。', place: '区县与社区 · 办事服务', result: '材料缺口、承办分组、受理核对单', object: '社区办事终端与扫描结构', color: '#d4c3ad' },
  { id: 'agriculture', slug: 'agriculture', name: '乡村产业', english: 'LAND & LIVELIHOODS', line: '让土地的收获，衔接新的机会。', place: '关中与秦岭 · 农产品协作', result: '采收批次、交付窗口、分拣待办', object: '果品检测与农业传感设备', color: '#a9bd97' },
];
export const atlas = (sector: Sector) => `/media/xian/${['drug', 'ecommerce', 'tourism'].includes(sector.slug) ? 'lithos-v6' : 'lithos-v3'}/${sector.slug}.png`;
export const bySlug = (slug: string) => sectors.find(s => s.slug === slug) ?? sectors[0];
