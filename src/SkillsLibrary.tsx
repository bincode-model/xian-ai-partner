import { useEffect, useMemo, useState } from 'react';
import type { Sector } from './sectors';
import './skills-library.css';
import SkillPager from './SkillPager';

type Schedule = {timezone:string;frequency:string;days:string[];startTime:string;endTime:string;dailyWork:string;runCondition:string;dataCutoff:string;expectedMinutes:number;missedRunPolicy:string;status:string};
type Delivery = {serviceObjects:string[];recipients:string[];channel:string;time:string;artifact:string;dispatchMode:string;approvalRole:string;escalationRole:string;trigger:string;recipientScope:string};
type Metric = {id:string;name:string;formula:string;operator:string;threshold:number;unit:string;sample:string;minimumSampleSize?:number;evidence:string;failureHandling:string;basis:string;status:string};
type MetricResult = {metricId:string;status:string;actualValue:number|null;sampleSize:number;evidenceRefs:string[]};
type Verification = {status:string;observedValue:number|null;sampleSize:number;executedAt:string|null;evidenceRefs:string[];reviewerRole:string;result:string;metricResults:MetricResult[]};
type Skill = {
  id:string;industry:string;industryName:string;module:string;department:string;role:string;name:string;
  scenario:string;trigger:string;inputs:string;processing:string;outputs:string;acceptance:string;humanReview:string;
  agentId:string;harnessIds:string[];permissions:string;failureHandling:string;priority:string;status:string;
  schedule:Schedule;delivery:Delivery;metrics:Metric[];verification:Verification;sourceRefs:string[];
};
type Industry = {id:string;name:string;skillCount:number;agentCount:number;shiftStart?:string;shiftEnd?:string;timezone?:string;dailyWorkSummary?:string[]};
type CatalogRecord = {id:string;name?:string;industry?:string;industryName?:string;[key:string]:unknown};
type WorkflowStep = {order:number;agentId:string;dependsOn:number[];parallelGroup:string;output:string;gate:string;skillIds:string[]};
type Catalog = {version:string;generatedAt:string;status:string;industries:Industry[];skills:Skill[];agents:CatalogRecord[];harness:CatalogRecord[];workflows:CatalogRecord[]};
type LibraryView='skills'|'agents'|'harness'|'workflows';
const PAGE_SIZE=8;
const fieldNames:Record<string,string>={
  industry:'行业',industryName:'行业',module:'业务模块',department:'部门',role:'岗位',name:'名称',description:'说明',purpose:'目标',scenario:'应用场景',trigger:'触发条件',inputs:'输入资料',processing:'处理过程',outputs:'交付产物',acceptance:'验收要求',humanReview:'人工复核',agentId:'调度 Agent',agentIds:'参与 Agent',skillIds:'绑定 Skills',harnessIds:'Harness 规则',permissions:'权限范围',failureHandling:'失败处理',priority:'优先级',status:'状态',responsibilities:'职责',responsibility:'职责',tools:'工具',toolBoundary:'工具边界',reviewer:'复核人',maxRetries:'最大重试次数',output:'产物',parallelGroup:'并行组',handoff:'交接',handoffTo:'下一环节',fallback:'异常处理',retryPolicy:'重试策略',timeout:'超时',timeoutSeconds:'超时（秒）',concurrency:'并发上限',concurrencyLimit:'并发上限',dispatchRule:'调度规则',scheduling:'调度方式',schedule:'建议排班',dependsOn:'前置依赖',steps:'执行步骤',order:'顺序',step:'环节',action:'动作',type:'类型',category:'类别',scope:'适用范围',rule:'规则',check:'检查',checkMethod:'检查方法',evidence:'验收证据',gate:'检查节点',failureAction:'失败处理',owner:'负责人',source:'来源',sources:'依据',entry:'入口',exit:'出口',enabled:'启用状态',conditions:'条件',humanGate:'人工确认节点',inputContract:'输入约定',outputContract:'输出约定',routing:'路由规则',cadence:'执行频率',reviewBoundary:'复核边界',riskLevel:'风险级别',notes:'说明',linkedSkills:'关联技能',linkedAgents:'关联 Agent',control:'控制要求',rationale:'设置原因',stage:'阶段',
  timezone:'时区',frequency:'频次',days:'工作日',startTime:'开始时间',endTime:'结束时间',dailyWork:'日常工作',runCondition:'运行前提',dataCutoff:'数据截止时间',expectedMinutes:'预计用时（分钟）',missedRunPolicy:'错过班次',delivery:'交付与推送',serviceObjects:'服务对象',recipients:'推送对象',channel:'交付渠道',time:'推送时间',artifact:'交付文件',dispatchMode:'推送状态',approvalRole:'审核人',escalationRole:'异常接收人',recipientScope:'接收范围',metrics:'量化标准',formula:'计算方法',operator:'比较',threshold:'建议阈值',unit:'单位',sample:'验证样本',basis:'标准依据',verification:'验证记录',observedValue:'实际观测',sampleSize:'样本量',executedAt:'验证时间',evidenceRefs:'证据记录',reviewerRole:'复核角色',result:'验证结论',metricResults:'指标实测',metricId:'指标编号',actualValue:'实测值',sourceRefs:'来源编号',shiftStart:'上班时间',shiftEnd:'下班时间',dailyWorkSummary:'日常工作摘要',scheduleSummary:'排班摘要',deliverySummary:'交付摘要',verificationStatus:'验证状态',dailyTaskCount:'日常任务数',eventTaskCount:'事件任务数',periodicTaskCount:'周期任务数',dailySummaryTime:'日结推送时间',
};
function textValue(value:unknown):string {
  if(value===null||value===undefined)return '—';
  if(Array.isArray(value))return value.length?value.map(textValue).join('；'):'—';
  if(typeof value==='object')return Object.entries(value).map(([key,item])=>`${fieldNames[key]??key}：${textValue(item)}`).join('；');
  return String(value);
}
const weekdayNames:Record<string,string>={MON:'周一',TUE:'周二',WED:'周三',THU:'周四',FRI:'周五',SAT:'周六',SUN:'周日',SERVICE_ROTA:'按服务轮值表',WORKDAY_RULE:'按工作日规则'};
function recordName(record:CatalogRecord):string{return textValue(record.name??record.title??record.role??record.id);}
function matches(record:object,query:string){return !query||textValue(record).toLocaleLowerCase().includes(query.toLocaleLowerCase());}
function metricTarget(metric:Metric):string{return `${metric.operator==='>='?'≥':metric.operator==='<='?'≤':metric.operator} ${metric.threshold}${metric.unit}`;}
function Fields({rows}:{rows:[string,unknown][]}){return <dl className="library-fields">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{textValue(value)}</dd></div>)}</dl>;}
function RecordDetail({record,agents,onSelect}:{record:CatalogRecord;agents:CatalogRecord[];onSelect:(view:LibraryView,search:string)=>void}) {
  const steps=Array.isArray(record.steps)?record.steps as WorkflowStep[]:[];
  return <details className="library-record"><summary><span className="library-code">{record.id}</span><div><h4>{recordName(record)}</h4><p>{textValue(record.module??record.scope??'规划配置')}</p></div><span className="record-status">{textValue(record.status??'待接入')}</span><span aria-hidden="true">＋</span></summary>
    {steps.length>0&&<ol className="library-workflow">{steps.map(step=><li key={step.order}><span className="workflow-order">{String(step.order).padStart(2,'0')}</span><div><p className="workflow-dependency">{step.dependsOn.length?`等待步骤 ${step.dependsOn.map(number=>String(number).padStart(2,'0')).join('、')} 完成`:`${step.parallelGroup||'准备'} · 可独立开始`}</p><button className="workflow-agent" onClick={()=>onSelect('agents',step.agentId)}>{agents.find(agent=>agent.id===step.agentId)?.name??step.agentId} ↗</button><p>{step.output}</p><p className="workflow-gate">验收：{step.gate}</p><div className="workflow-skills">{step.skillIds.map(id=><button key={id} onClick={()=>onSelect('skills',id)}>{id} ↗</button>)}</div></div></li>)}</ol>}
    <dl className="library-fields record-fields">{Object.entries(record).filter(([key])=>!['id','name','title','industry','industryName','steps'].includes(key)).map(([key,value])=><div key={key}><dt>{fieldNames[key]??key}</dt><dd>{(key==='skillIds'||key==='agentIds')&&Array.isArray(value)?<div className="library-id-links">{value.map(id=><button key={String(id)} onClick={()=>onSelect(key==='skillIds'?'skills':'agents',String(id))}>{String(id)} ↗</button>)}</div>:textValue(value)}</dd></div>)}</dl>
  </details>;
}
function SkillDetail({skill,onSelect}:{skill:Skill;onSelect:(view:LibraryView,search:string)=>void}){
  const schedule=skill.schedule,delivery=skill.delivery,verification=skill.verification;
  return <article className="skill-reading-page" aria-labelledby={`${skill.id}-title`}>
    <header className="skill-reading-heading"><div><p className="skill-reading-kicker">{skill.module} <span>{skill.id}</span></p><h3 id={`${skill.id}-title`}>{skill.name}</h3></div><span className="skill-reading-status">{verification.status}</span></header>
    <p className="skill-reading-scenario">{skill.scenario}</p>
    <div className="skill-reading-brief"><span>每天做什么</span><p>{schedule.dailyWork}</p></div>
    <div className="skill-reading-columns">
      <section><h4>工作内容</h4><Fields rows={[
        ['服务对象',delivery.serviceObjects],['输入资料',skill.inputs],['处理过程',skill.processing],['交付产物',skill.outputs],
      ]}/></section>
      <section><h4>建议排班 <span>北京时间 · 未启用</span></h4><p className="skill-reading-time">{schedule.startTime}<span>—</span>{schedule.endTime}</p><p className="skill-reading-cadence">{schedule.frequency} · {schedule.days.map(day=>weekdayNames[day]??day).join('、')} · 预计 {schedule.expectedMinutes} 分钟</p><Fields rows={[
        ['启动条件',schedule.runCondition],['推送时间',delivery.time],['推送对象',delivery.recipients],['渠道 / 文件',`${delivery.channel} · ${delivery.artifact}`],['审核角色',delivery.approvalRole],
      ]}/><p className="skill-reading-dispatch">{delivery.dispatchMode}</p></section>
    </div>
    <section className="skill-reading-metrics"><h4>量化标准 <span>建议试运行阈值 · 非实测结果</span></h4><div className="skill-metric-grid">{skill.metrics.map((item,index)=>{
      const result=verification.metricResults.find(current=>current.metricId===item.id);
      return <section className="skill-metric-card" key={item.id}><div className="skill-metric-heading"><span className="skill-metric-number">0{index+1}</span><h5>{item.name}</h5><strong>{metricTarget(item)}</strong></div><div className="skill-metric-definition"><p>{item.formula}</p><p className="skill-metric-sample">样本：{item.sample}</p><span className="skill-metric-actual">{result?.actualValue===null||result?.actualValue===undefined?'尚未测量':`实测 ${result.actualValue}${item.unit}`} · {result?.sampleSize??0} 份已测样本</span></div><details><summary>证据与判定细则 <span>＋</span></summary><Fields rows={[
        ['最少样本',item.minimumSampleSize??'见样本要求'],['证据要求',item.evidence],['未达标处理',item.failureHandling],['标准依据',item.basis],['验证状态',result?.status??item.status],['已有证据',result?.evidenceRefs??[]],
      ]}/></details></section>;
    })}</div></section>
    <details className="skill-boundaries"><summary>完整工作约定与验证记录 <span>＋</span></summary><Fields rows={[
      ['部门 / 岗位',`${skill.department} / ${skill.role}`],['优先 / 状态',`${skill.priority} / ${skill.status}`],['触发条件',skill.trigger],['验收要求',skill.acceptance],['人工复核',skill.humanReview],['排班时区',schedule.timezone],['数据截止',schedule.dataCutoff],['错过班次',schedule.missedRunPolicy],['异常接收人',delivery.escalationRole],['推送前提',delivery.trigger],['接收范围',delivery.recipientScope],['权限范围',skill.permissions],['失败处理',skill.failureHandling],['验证状态',verification.status],['验证结论',verification.result],['实际观测',verification.observedValue??'尚未测量'],['样本量',verification.sampleSize],['验证时间',verification.executedAt??'尚未执行'],['复核角色',verification.reviewerRole],['证据记录',verification.evidenceRefs],['来源编号',skill.sourceRefs],
    ]}/></details>
    <div className="library-binding"><span>关联调度</span><button onClick={()=>onSelect('agents',skill.agentId)}>{skill.agentId} ↗</button>{skill.harnessIds.map(id=><button key={id} onClick={()=>onSelect('harness',id)}>{id} ↗</button>)}</div>
  </article>;
}
export default function SkillsLibrary({sector}:{sector:Sector}) {
  const [catalog,setCatalog]=useState<Catalog|null>(null),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
  const [view,setView]=useState<LibraryView>('skills'),[query,setQuery]=useState(''),[module,setModule]=useState(''),[page,setPage]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/resources/skills/xian-skills-catalog-v3.json',{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error('catalog');return response.json();})
      .then((data:Catalog)=>{if(!Array.isArray(data.skills)||!Array.isArray(data.agents)||!Array.isArray(data.harness)||!Array.isArray(data.workflows)||data.skills.some(skill=>!skill.schedule||!skill.delivery||!Array.isArray(skill.metrics)||!skill.verification))throw new Error('schema');setCatalog(data);})
      .catch(error=>{if(error.name!=='AbortError')setFailed(true);});
    return()=>controller.abort();
  },[revision]);
  const sectorSkills=useMemo(()=>catalog?.skills.filter(skill=>skill.industry===sector.slug)??[],[catalog,sector.slug]);
  const modules=useMemo(()=>[...new Set(sectorSkills.map(skill=>skill.module))],[sectorSkills]);
  const agents=useMemo(()=>catalog?.agents.filter(agent=>agent.industry===sector.slug||sectorSkills.some(skill=>skill.agentId===agent.id))??[],[catalog,sector.slug,sectorSkills]);
  const harness=useMemo(()=>{const ids=new Set(sectorSkills.flatMap(skill=>skill.harnessIds));return catalog?.harness.filter(item=>ids.has(item.id)||item.industry===sector.slug||item.industry==='all')??[];},[catalog,sector.slug,sectorSkills]);
  const workflows=useMemo(()=>catalog?.workflows.filter(item=>item.industry===sector.slug)??[],[catalog,sector.slug]);
  const industry=catalog?.industries?.find(item=>item.id===sector.slug);
  const shiftStart=industry?.shiftStart??sectorSkills.map(skill=>skill.schedule.startTime).sort()[0];
  const shiftEnd=industry?.shiftEnd??sectorSkills.map(skill=>skill.schedule.endTime).sort().at(-1);
  const dailyWork=(industry?.dailyWorkSummary??[...new Set(sectorSkills.map(skill=>skill.schedule.dailyWork))]).slice(0,3);
  const skillRows=sectorSkills.filter(skill=>(!module||skill.module===module)&&matches(skill,query));
  const records=(view==='agents'?agents:view==='harness'?harness:workflows).filter(record=>matches(record,query));
  const count=view==='skills'?skillRows.length:records.length,pageCount=Math.max(1,Math.ceil(records.length/PAGE_SIZE)),currentPage=Math.min(page,pageCount-1);
  const scrollToBrowse=()=>document.getElementById('library-browse')?.scrollIntoView({behavior:'instant',block:'start'});
  const selectView=(next:LibraryView,search='')=>{setView(next);setQuery(search);setPage(0);setModule('');if(search)scrollToBrowse();};
  const changePage=(next:number)=>{setPage(next);scrollToBrowse();};
  const tabs:{key:LibraryView;name:string;count:number}[]=[{key:'skills',name:'Skills 清单',count:sectorSkills.length},{key:'agents',name:'Agent 调度',count:agents.length},{key:'harness',name:'Harness 规则',count:harness.length},{key:'workflows',name:'协作流程',count:workflows.length}];
  return <section className="skills-library" id="sector-work" aria-labelledby="skills-library-title">
    <header className="library-heading"><div><span className="eyebrow">SKILLS / XI’AN</span><h2 id="skills-library-title" tabIndex={-1}>{sector.name} Skills</h2>{catalog&&<p className="library-total">本行业 {sectorSkills.length} 项 · 八业共 {catalog.skills.length} 项</p>}</div><div className="library-heading-actions"><p className="library-status">规划清单 · 未接入，待验证</p><a className="library-download" href="/resources/skills/xian-eight-industries-skills.xlsx" download>下载八业完整 Excel <span>↓</span></a></div></header>
    {failed?<div className="library-load-state" role="alert"><p>清单暂时无法载入，可下载完整表格，或重新加载。</p><button onClick={()=>{setFailed(false);setRevision(value=>value+1);}}>重新加载</button></div>:!catalog?<p className="library-load-state" role="status">正在载入行业清单…</p>:<>
      <div className="library-shift-overview"><div><span>建议上班时间 · 轮值</span><strong>{shiftStart}—{shiftEnd}</strong><small>北京时间 · Asia/Shanghai · 未启用</small><small>服务窗口内按岗轮值，非连续工作时长。</small></div><div><span>日常任务参考</span><p>{dailyWork.join('；')}</p></div><div><span>岗位 Agent</span><strong>{agents.length}<small> 位</small></strong><small>按岗位分工，审核后交付</small></div></div>
      <nav className="library-tabs" id="library-browse" aria-label="清单类型">{tabs.map(tab=><button key={tab.key} aria-pressed={view===tab.key} onClick={()=>selectView(tab.key)}>{tab.name}<span>{tab.count}</span></button>)}</nav>
      <div className="library-toolbar"><label className="library-search"><span>搜索清单</span><input value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} placeholder={view==='skills'?'搜索工作、对象或编号':'搜索名称、编号或规则'}/></label>{view==='skills'&&<label className="library-module"><span>业务模块</span><select value={module} onChange={event=>{setModule(event.target.value);setPage(0);}}><option value="">全部模块</option>{modules.map(name=><option key={name} value={name}>{name}</option>)}</select></label>}<p aria-live="polite">{count} 项结果</p></div>
      <div className="library-results" key={`${view}-${query}-${module}-${currentPage}`}>
        {view==='skills'?(count>0&&<SkillPager key={`${sector.slug}-${query}-${module}`} count={skillRows.length} renderPage={index=><SkillDetail skill={skillRows[index]} onSelect={selectView}/>}/>):records.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map(record=><RecordDetail key={record.id} record={record} agents={agents} onSelect={selectView}/>)}
        {count===0&&<div className="library-empty"><p>没有找到符合条件的条目。</p>{(query||module)&&<button onClick={()=>{setQuery('');setModule('');setPage(0);}}>清除筛选</button>}</div>}
      </div>
      {view!=='skills'&&<footer className="library-pagination"><p>{count>0?`${currentPage*PAGE_SIZE+1}–${Math.min((currentPage+1)*PAGE_SIZE,count)} / ${count}`:'0 项结果'}</p><div><button disabled={currentPage===0} onClick={()=>changePage(currentPage-1)} aria-label="清单上一页">←</button><span>{currentPage+1} / {pageCount}</span><button disabled={currentPage>=pageCount-1} onClick={()=>changePage(currentPage+1)} aria-label="清单下一页">→</button></div></footer>}
    </>}
  </section>;
}
