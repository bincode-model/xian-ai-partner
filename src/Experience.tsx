import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { atlas, sectors } from './sectors';
import { storyFor } from './sectorStories';
import './experience-fixes.css';
import './experience-v4.css';
import './audioExperience';

type SoundWindow = Window & {
  __STARWRECK_SET_VENDOR_SOUND__?: (enabled:boolean)=>void;
  __STARWRECK_RESUME_VENDOR_AUDIO__?: ()=>Promise<unknown>|void;
  __XIAN_RELEASE_AUDIO__?: ()=>void;
};
type LabelViewport = {width:number;height:number};
type LabelWindow = Window & {
  __XIAN_UPDATE_ICE_LABELS__?: (source:Window,labels:unknown,viewport?:LabelViewport)=>boolean;
};

export default function Experience({initialSlug}:{initialSlug?:string}) {
  const frame=useRef<HTMLIFrameElement>(null), closeButton=useRef<HTMLButtonElement>(null), indexButton=useRef<HTMLButtonElement>(null);
  const [current,setCurrent]=useState(0), [ready,setReady]=useState(false), [failed,setFailed]=useState(false);
  const [drawer,setDrawer]=useState(false), [story,setStory]=useState<number|null>(null), [busy,setBusy]=useState(false), [particleMode,setParticleMode]=useState(false);
  const initialRequested=useRef(false);
  const iceLabels=useRef<Array<HTMLButtonElement|null>>([]);
  const send=useCallback((data:Record<string,unknown>)=>frame.current?.contentWindow?.postMessage(data,location.origin),[]);
  const closeStory=useCallback(()=>{
    initialRequested.current=true;setStory(null);send({type:'xian-close-story-command'});indexButton.current?.focus();
  },[send]);
  useEffect(()=>{
    const paintLabels=(source:Window,labels:unknown,viewport?:LabelViewport)=>{
      if(source!==frame.current?.contentWindow||!Array.isArray(labels))return false;
      const width=viewport?.width??frame.current?.clientWidth, height=viewport?.height??frame.current?.clientHeight;
      if(!Number.isFinite(width)||!Number.isFinite(height)||!width||!height||width<0||height<0)return false;
      const shown=new Set<number>();
      for(const point of labels){
        if(!point||!Number.isInteger(point.index)||point.index<0||point.index>=8||shown.has(point.index)||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>1||point.y<0||point.y>1)continue;
        const opacity=point.opacity??1;
        if(!Number.isFinite(opacity)||opacity<=0||opacity>1)continue;
        const label=iceLabels.current[point.index];
        if(label){
          // The child calls this after rendering its real camera. Transform
          // updates stay outside React and keep full subpixel precision.
          label.style.transform=`translate3d(${point.x*width}px,${point.y*height}px,0) translate(-50%,calc(-100% - 18px))`;
          label.style.opacity=String(opacity);
          if(label.hidden)label.hidden=false;
          shown.add(point.index);
        }
      }
      iceLabels.current.forEach((label,index)=>{if(label&&!shown.has(index)&&!label.hidden)label.hidden=true;});
      return true;
    };
    const labelWindow=window as LabelWindow;
    labelWindow.__XIAN_UPDATE_ICE_LABELS__=paintLabels;
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
      const data=event.data;
      if(data?.type==='xian-ready'){setReady(true);setFailed(false);}
      if(data?.type==='xian-ice-labels')paintLabels(event.source as Window,data.labels,data.viewport);
      if(data?.type==='xian-error')setFailed(true);
      if(data?.type==='xian-busy')setBusy(Boolean(data.busy));
      if(data?.type==='xian-particle-mode')setParticleMode(Boolean(data.active));
      if(data?.type==='xian-select'&&Number.isInteger(data.index)&&data.index>=0&&data.index<8)setCurrent(data.index);
      if(data?.type==='xian-story-open'&&Number.isInteger(data.index)&&data.index>=0&&data.index<8){setStory(data.index);setCurrent(data.index);}
      if(data?.type==='xian-story-close')setStory(null);
      if(data?.type==='xian-open'&&typeof data.slug==='string'&&sectors.some(s=>s.slug===data.slug))location.hash=`/sector/${data.slug}`;
    };
    window.addEventListener('message',receive);return()=>{
      window.removeEventListener('message',receive);
      if(labelWindow.__XIAN_UPDATE_ICE_LABELS__===paintLabels)delete labelWindow.__XIAN_UPDATE_ICE_LABELS__;
    };
  },[]);
  useEffect(()=>{
    if(!ready||initialRequested.current||!initialSlug)return;
    const index=sectors.findIndex(sector=>sector.slug===initialSlug);if(index<0)return;
    initialRequested.current=true;send({type:'xian-story-command',index});
  },[ready,initialSlug,send]);
  useEffect(()=>{if(story!==null&&!drawer)closeButton.current?.focus();},[story,drawer]);
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      if(drawer){setDrawer(false);indexButton.current?.focus();}
      else if(story!==null||busy)closeStory();
    };
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
  },[drawer,story,busy,closeStory]);
  useEffect(()=>{
    const resumeSound=()=>{
      // A same-origin call retains activation from the parent UI gesture.
      try{
        const scene=frame.current?.contentWindow as SoundWindow|null;
        scene?.__STARWRECK_SET_VENDOR_SOUND__?.(true);
        Promise.resolve(scene?.__STARWRECK_RESUME_VENDOR_AUDIO__?.()).catch(()=>{});
      }catch{send({type:'xian-resume-sound-command'});}
    };
    const scene=frame.current?.contentWindow as SoundWindow|null;
    window.addEventListener('pointerdown',resumeSound,true);window.addEventListener('keydown',resumeSound,true);
    return()=>{window.removeEventListener('pointerdown',resumeSound,true);window.removeEventListener('keydown',resumeSound,true);try{scene?.__XIAN_RELEASE_AUDIO__?.();}catch{/* The iframe may already be detached. */}};
  },[send]);
  const openStory=(index:number)=>{
    setDrawer(false);setCurrent(index);
    if(failed){setStory(index);return;}
    send({type:'xian-story-command',index});
  };
  const reloadScene=()=>{setReady(false);setFailed(false);if(frame.current)frame.current.src=`/experience/index.html?v=20261001-presentation5&boot=${Date.now()}`;};
  const sector=sectors[story??current], content=storyFor(sector), particleContent=storyFor(sectors[current]);
  return <main className="experience-page experience-preserved experience-fixed">
    <iframe ref={frame} title="长安八业 · 冰屋与冰块体验" src="/experience/index.html?v=20261001-presentation5" className="experience-frame" allow="autoplay" onError={()=>setFailed(true)}/>
    <div className="experience-ice-labels" hidden={story!==null||busy||drawer||particleMode} aria-label="冰块对应行业">{sectors.map((s,index)=><button ref={element=>{iceLabels.current[index]=element;}} key={s.id} className="experience-ice-label" hidden aria-label={`查看${s.name}冰块介绍`} onClick={()=>openStory(index)}><span>{String(index+1).padStart(2,'0')}</span><strong>{s.name}</strong></button>)}</div>
    <header className="experience-header"><div className="experience-brand-group"><a className="experience-brand-link" href="#/home">AI终身合伙人 <span>XI’AN / CHANG’AN</span></a>{(story!==null||busy)&&<button className="experience-return" onClick={closeStory}>← 返回二级界面</button>}</div><div><a href="#/home">返回首页 ↗</a><button ref={indexButton} aria-expanded={drawer} aria-controls="experience-drawer" onClick={()=>setDrawer(!drawer)}>八业索引 <span>{drawer?'×':'＋'}</span></button></div></header>
    {drawer&&<aside id="experience-drawer" className="experience-sector-drawer"><span className="eyebrow">CHANG’AN / 08</span><h2>走进一个行业。</h2><nav aria-label="八个行业冰块">{sectors.map((s,index)=><div className="experience-index-entry" key={s.id}><button onClick={()=>openStory(index)} aria-label={`查看${s.name}介绍`}><span>{String(index+1).padStart(2,'0')}</span><strong>{s.name}</strong><small>{s.place}</small><i>＋</i></button><a href={`#/sector/${s.slug}`} aria-label={`进入${s.name}行业页`}>进入行业页 ↗</a></div>)}</nav></aside>}
    {!ready&&<div className="experience-loading" role="status">{failed?<><p>场景暂时无法加载，仍可通过八业索引查看内容。</p><button onClick={reloadScene}>重新加载场景 ↗</button></>:<span>冰屋与八枚冰块正在装配…</span>}</div>}
    {particleMode&&story===null&&!drawer&&<section className="particle-industry-panel" aria-label={`${sectors[current].name}粒子介绍`}><div className="particle-industry-heading"><span>{String(current+1).padStart(2,'0')} / 08</span><h2>{sectors[current].name}</h2><div><button aria-label="上一个粒子行业" onClick={()=>send({type:'xian-select-command',index:(current+7)%8})}>←</button><button aria-label="下一个粒子行业" onClick={()=>send({type:'xian-select-command',index:(current+1)%8})}>→</button></div></div><div className="particle-industry-copy"><p>{particleContent.context} {particleContent.pain}</p><p>{particleContent.action}</p></div><div className="particle-industry-actions"><span>拖动粒子，点击左右两侧切换行业。</span><a href={`#/sector/${sectors[current].slug}`}>进入行业页 ↗</a></div><small>八业 Skills 目录可查阅与下载，另有 8 条已接入的文件流程；具体能力见行业页。</small></section>}
    <p className="experience-scroll-note">{busy?'镜头过渡中 · 可随时返回':particleMode?'继续滚动，或拖动粒子':ready?'向下滚动，穿过冰屋 · 点击冰块查看介绍':''}</p>
    <dialog open={story!==null} className="portfolio-story is-visible" style={{'--planet-accent':sector.color} as CSSProperties} aria-labelledby="story-name" onCancel={event=>{event.preventDefault();closeStory();}}>
      <button ref={closeButton} className="portfolio-story-close" onClick={closeStory} aria-label="关闭行业介绍，返回二级界面">×</button>
      <div className="portfolio-story-media"><div className="story-atlas"><img src={atlas(sector)} alt={`${sector.name}行业场景`}/></div><span/></div>
      <div className="portfolio-story-content"><p className="portfolio-story-kicker">{String((story??current)+1).padStart(2,'0')} / 08 · 长安行业故事</p><h1 id="story-name">{sector.name}</h1><h2>{sector.place}</h2><div className="portfolio-story-copy"><p>{content.context} {content.pain}</p><p>{content.action}</p></div><div className="portfolio-story-facts"><span>{content.facts[0]}</span><span>{content.facts[1]}</span></div></div>
    </dialog>
  </main>;
}
