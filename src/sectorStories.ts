import type { Sector } from './sectors';

export interface SectorStory { title: string; context: string; pain: string; action: string; facts: [string,string,string]; }
export const stories: Record<string,SectorStory> = {
  drug: {title:'让研究证据\n走近新的答案',context:'从长安的研究园区走进实验室。每一次新药探索，都要从可靠的资料和可复核的证据开始。',pain:'论文、靶点与实验记录分散；重复检索和证据核对，挤占了研究人员的时间。',action:'AI 协助梳理癌症与罕见病研究资料，列出证据缺口和验证待办。候选假设仍需实验与专业人员验证。',facts:['文献与候选资料','证据表 / 验证待办','研究人员复核']},
  industry: {title:'把生产的异常\n变成清晰的行动',context:'从西安的产业园区走进车间。工艺、设备、检验与交付，是同一条生产链上的协作。',pain:'异常记录在表格里反复流转；批次追溯和跨部门交接，容易漏掉关键线索。',action:'AI 整理检验数据与缺陷分布，保留来源行，生成可交接的处置工单。现场判断与工艺变更由负责人确认。',facts:['批次与检验记录','缺陷汇总 / 处置工单','质量负责人确认']},
  ecommerce: {title:'让陕西的好物\n走进更远的生活',context:'从陕西工厂和产地出发，让产品通过电商走向消费者。上架、内容、库存和履约需要一起运转。',pain:'同一份商品资料要在多个平台重复整理；规格、标题和素材版本容易不一致。',action:'AI 将商品资料整理为淘宝、天猫、抖音、拼多多的上架草稿与核对清单；运营确认后，再按平台要求发布。',facts:['商品资料与规格','四平台草稿 / 核对单','运营确认后发布']},
  retail: {title:'把日常的琐碎\n变成踏实的经营',context:'走进西安街巷里的小店。进货、记账、收款和服务，构成了经营者每天真实的工作。',pain:'零散单据靠人工抄录；应收、账龄与对账差异，常常留到月底再处理。',action:'AI 核对应收台账，整理账龄和差异，留下逐笔可追溯的待办。账务处理与收付款仍由经营者决定。',facts:['单据与应收台账','账龄汇总 / 核对待办','经营者核实']},
  tourism: {title:'让长安的故事\n有新的抵达',context:'从城墙、街巷与古都记忆出发，把文化讲给今天的旅人。好的服务，也藏在路线和时间安排中。',pain:'路线、开放时段与游客需求分散；反复问询和行程修改，消耗了服务人员的精力。',action:'AI 根据提供的景点资料与需求整理路线草稿，标记开放时段与交通待核事项。发布前核对最新官方信息。',facts:['景点资料与需求','分区路线 / 行程草稿','时段与交通核对']},
  employment: {title:'让每一次练习\n都有成长的方向',context:'从西安高校、实训场地与社区出发，让学习连接真实岗位。能力需要通过具体任务逐步积累。',pain:'岗位要求写得笼统；学习内容与实际工作脱节，练习后也缺少可检查的成果。',action:'AI 对照岗位技能，整理实训任务与验收清单，帮助学习者发现差距、完成练习。就业录用由用人单位决定。',facts:['岗位与技能资料','技能缺口 / 实训任务','导师与本人复核']},
  government: {title:'让一件小事\n少些来回奔波',context:'走进区县与社区的办事服务。材料清楚、承办明确、进度可查，才能让群众少跑一趟。',pain:'材料是否齐全靠重复核对；跨部门待办和补件信息，容易在交接中遗漏。',action:'AI 按提供的材料清单核对缺项，分组整理承办部门和待办。受理条件与行政决定由工作人员依据正式规则确认。',facts:['事项与材料清单','补件核对 / 部门待办','工作人员确认']},
  agriculture: {title:'让土地的收获\n衔接新的机会',context:'从关中与秦岭的产地出发，连接采收、分拣、销售和交付。每一批农产品，都需要及时找到去向。',pain:'采收批次、可售余量和交货日期分散记录；库存与订单对不上，就容易耽误交付。',action:'AI 核对批次余量、日期和分配数量，整理分拣与交付待办。产品质量与实际库存仍需现场确认。',facts:['采收与分配台账','批次余量 / 交付窗口','产地负责人核对']},
};
export const storyFor = (sector:Sector) => stories[sector.slug];
// These are the user's existing finished films. No placeholder is called a film.
export const films: Record<string,{src:string;poster:string;seconds:number}> = {
  drug:{src:'/media/drug.mp4',poster:'/media/drug.png',seconds:10},
  industry:{src:'/media/industry.mp4',poster:'/media/industry.png',seconds:8},
  ecommerce:{src:'/media/ecommerce.mp4',poster:'/media/ecommerce.png',seconds:9},
};
