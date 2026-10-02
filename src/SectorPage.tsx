import { useMemo, useState } from 'react';
import { sectors, type Sector } from './sectors';
import { skills } from './catalog';
import Reveal from './Reveal';
import Operations from './Operations';
import SectorWheel from './SectorWheel';
import SkillsLibrary from './SkillsLibrary';
import { films, storyFor } from './sectorStories';
import type { CSSProperties, MouseEvent } from 'react';
import './project-links.css';

const liveProjects = [
  { id: 'game', name: '星骸解压', category: '星球游戏', href: 'https://wutiantian.cn/?view=experience', action: '进入星骸游戏' },
  { id: 'ecommerce', name: '电商工作台', category: '电商项目', href: 'https://work.bincode.top/ecommerce/', action: '打开电商项目' },
];
function scrollToWork(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const section=document.getElementById('sector-work');
  section?.scrollIntoView({behavior:'instant',block:'start'});
  document.getElementById('skills-library-title')?.focus({preventScroll:true});
}
export default function SectorPage({sector}:{sector:Sector}){
  const available=useMemo(()=>skills.filter(s=>s.domain_id===sector.id),[sector]);
  const departments=useMemo(()=>[...new Set(available.map(s=>s.department))],[available]);
  const [department,setDepartment]=useState(departments[0]??'');
  const [query,setQuery]=useState('');
  const rows=available.filter(s=>s.department===department&&(!query||`${s.name}${s.role}${s.pain_point}${s.id}`.includes(query)));
  const index=sectors.indexOf(sector);
  const story=storyFor(sector), film=films[sector.slug];
  const featuredProject = sector.slug === 'ecommerce' ? liveProjects[1] : sector.slug === 'tourism' ? liveProjects[0] : undefined;
  return <main className="sector-page lithos-v3" style={{'--planet-accent':sector.color} as CSSProperties}>
    <section className="sector-hero sector-detail-reference">
      <Reveal sector={sector}/>
      <header className="sector-header"><a href="#/home">AI终身合伙人 <span>XI’AN</span></a><a href="#/experience">返回二级八业场景 ↗</a></header>
      <div className="detail-title"><p><span>{String(index+1).padStart(2,'0')}</span> / 08　{sector.name}</p><h1>{story.title.split('\n').map(line=><span key={line}>{line}</span>)}</h1></div>
      <SectorWheel sector={sector}/>
      <details className="lithos-mobile-index"><summary>八业索引 <span>＋</span></summary><nav aria-label="切换行业">{sectors.map((item,i)=><a key={item.id} href={`#/sector/${item.slug}`} aria-current={item.id===sector.id?'page':undefined}><span>{String(i+1).padStart(2,'0')}</span>{item.name}</a>)}</nav></details>
      <div className="lithos-caption"><span>{sector.place}</span><p>{sector.line}</p></div>
      <div className="detail-action"><p>查看任务、班次与交付标准</p><div>
        <a className="lithos-primary" href="#sector-work" onClick={scrollToWork}>探索 Skills <span>↓</span></a>
        <div className="lithos-secondary-actions">
          {film&&<a className="industry-watch" href={`#/watch/${sector.slug}`}>行业影片 · {String(film.seconds).padStart(2,'0')}秒 <span>↗</span></a>}
          {featuredProject&&<a className="industry-project-link" href={featuredProject.href} target="_blank" rel="noopener noreferrer">{featuredProject.action} ↗</a>}
          {sector.slug==='drug'&&<a className="industry-work-link" href="#/research/factor-b">药研案例 · 31页 ↗</a>}
        </div>
      </div></div>
    </section>
    <SkillsLibrary sector={sector}/>
    <section className="lithos-context" aria-label={`${sector.name}工作方式`}><p>{story.action}</p><dl className="industry-facts">{story.facts.map((value,i)=><div key={value}><dt>{['工作输入','交付成果','确认环节'][i]}</dt><dd>{value}</dd></div>)}</dl></section>
    {sector.slug==='drug'&&<section className="research-case" aria-labelledby="research-case-title"><a className="research-case-cover" href="#/research/factor-b"><img src="/resources/drug-factor-b/slides/01.png" alt="B因子抑制剂领域调研，31页原版演示文稿" loading="lazy"/></a><div><span className="eyebrow">RESEARCH CASE / 31 PAGES</span><h2 id="research-case-title">B因子抑制剂领域调研</h2><p>从靶点机制、疾病领域到研发格局，查看完整的药物研发调研案例。</p><div className="research-case-actions"><a className="lithos-primary" href="#/research/factor-b">逐页预览 <span>↗</span></a><a href="/resources/drug-factor-b/factor-b-research.pdf" target="_blank" rel="noopener noreferrer">打开 PDF ↗</a><a href="/resources/drug-factor-b/factor-b-research.pptx" download>下载原版 PPT ↓</a></div></div></section>}
    <section className="linked-projects" aria-labelledby="linked-projects-heading"><div className="linked-projects-intro"><h2 id="linked-projects-heading">已上线项目</h2><p>在新窗口继续体验</p></div><div className="linked-project-list">{liveProjects.map(project=><a key={project.id} className="linked-project" href={project.href} target="_blank" rel="noopener noreferrer"><span className="linked-project-category">{project.category}</span><strong>{project.name}</strong><span className="linked-project-action">打开项目 <span aria-hidden="true">↗</span></span><span className="project-link-sr-only">（新窗口打开）</span></a>)}</div></section>
    <section className="sector-work legacy-work" aria-labelledby="legacy-work-heading"><div className="work-intro"><div><span className="eyebrow">PUT IT TO WORK</span><h2 id="legacy-work-heading">文件任务</h2></div><div><p>{sector.result}</p><span className="work-scope">原有 {available.length} 项技能规格 · 1 条可运行文件流程</span><p className="small-note">上传资料，查看交付结果。此处为已接入的文件流程。</p></div></div>
      <details className="legacy-specifications"><summary>查看原有岗位规格 <span>{departments.length} 个部门 · {available.length} 项 ＋</span></summary><div className="department-layout"><nav className="department-list" aria-label={`${sector.name}部门`}>{departments.map((d,i)=><button key={d} onClick={()=>{setDepartment(d);setQuery('');}} aria-pressed={department===d}><span>{String(i+1).padStart(2,'0')}</span>{d}<span>↗</span></button>)}</nav><div className="role-panel"><div className="role-panel-heading"><h3>{department}</h3><input aria-label="搜索部门内的技能与岗位" placeholder="搜索岗位或具体工作" value={query} onChange={e=>setQuery(e.target.value)}/></div>{rows.map(s=><details key={s.id} className="skill-detail"><summary><span className="skill-code">{s.id}</span><div><h4>{s.name}</h4><span>{s.role}</span></div><span>＋</span></summary><div className="skill-open"><p>{s.pain_point}</p><dl>{[['输入',s.inputs],['产物',s.outputs],['触发',s.trigger],['验收',s.acceptance],['复核',s.review_boundary]].map(([k,v])=><div key={String(k)}><dt>{k}</dt><dd>{Array.isArray(v)?v.join('；'):v}</dd></div>)}</dl><span className="skill-state">技能规格 · 尚未作为独立执行器接入</span></div></details>)}{rows.length===0&&<p className="empty-note">没有找到匹配的任务，换一个关键词试试。</p>}</div></div></details>
      <Operations sector={sector} department={department} available={available}/>
    </section>
    <section className="next-world"><span className="eyebrow">NEXT WORLD</span><a href={`#/sector/${sectors[(index+1)%8].slug}`}>{sectors[(index+1)%8].name} <span>↗</span></a></section><footer className="site-footer"><a href="#/home">AI终身合伙人 · 西安</a><a href="/resources/speech/xian-ai-partner-speech-a4.pdf" target="_blank" rel="noopener noreferrer">演讲稿 · A4 PDF ↗</a><a href="/resources/presentation-v6/xian-ai-partner-industry-v6.pptx" download>比赛路演 · PPT ↓</a><a href="/resources/presentation-v6/xian-ai-partner-industry-v6.pdf" target="_blank" rel="noopener noreferrer">路演预览 · PDF ↗</a><a href="#/experience">返回八业索引 ↑</a></footer>
  </main>;
}
