import { useEffect, useMemo, useRef } from 'react';
import { sectors, type Sector } from './sectors';
export default function SectorWheel({sector}:{sector:Sector}) {
  const root=useRef<HTMLDivElement>(null), timer=useRef(0), initializing=useRef(true);
  const drag=useRef<{y:number;scroll:number;slug?:string;moved:boolean}|null>(null);
  const current=sectors.indexOf(sector);
  const ordered=useMemo(()=>Array.from({length:8},(_,i)=>sectors[(current-2+i+8)%8]),[current]);
  useEffect(()=>{
    const element=root.current, active=element?.querySelector<HTMLElement>('[aria-current=page]');
    if(element&&active)element.scrollTop=active.offsetTop+active.offsetHeight/2-element.clientHeight/2;
    const timeout=window.setTimeout(()=>{initializing.current=false;},250);
    return()=>{window.clearTimeout(timeout);window.clearTimeout(timer.current);};
  },[sector]);
  const settle=()=>{
    if(initializing.current||drag.current)return;
    window.clearTimeout(timer.current);
    timer.current=window.setTimeout(()=>{
      const element=root.current;if(!element)return;
      const center=element.scrollTop+element.clientHeight/2;
      const entries=Array.from(element.querySelectorAll<HTMLElement>('[data-sector]'));
      const nearest=entries.reduce((a,b)=>Math.abs(b.offsetTop+b.offsetHeight/2-center)<Math.abs(a.offsetTop+a.offsetHeight/2-center)?b:a);
      if(nearest?.dataset.sector&&nearest.dataset.sector!==sector.slug)location.hash=`/sector/${nearest.dataset.sector}`;
    },180);
  };
  return <nav className="detail-wheel" aria-label="八业滚轮导航"><p><span>行业序列</span><strong>{String(current+1).padStart(2,'0')} / 08</strong></p><div className="detail-wheel-viewport"><div className="detail-wheel-center"/><div className="detail-wheel-scroll" ref={root} onScroll={settle} onPointerDown={event=>{
    if(event.pointerType==='touch'||event.button!==0)return;
    drag.current={y:event.clientY,scroll:event.currentTarget.scrollTop,slug:(event.target as HTMLElement).closest<HTMLElement>('[data-sector]')?.dataset.sector,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.classList.add('is-dragging');window.clearTimeout(timer.current);
  }} onPointerMove={event=>{if(drag.current){const delta=event.clientY-drag.current.y;if(Math.abs(delta)>8)drag.current.moved=true;event.currentTarget.scrollTop=drag.current.scroll-delta;}}} onPointerUp={event=>{
    const start=drag.current;if(!start)return;drag.current=null;event.currentTarget.classList.remove('is-dragging');if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(!start.moved&&start.slug)location.hash=`/sector/${start.slug}`;else settle();
  }} onPointerCancel={event=>{drag.current=null;event.currentTarget.classList.remove('is-dragging');settle();}}>{ordered.map((s,i)=><a href={`#/sector/${s.slug}`} className={`detail-wheel-item ${s.id===sector.id?'is-current is-wheel-active':''}`} data-sector={s.slug} data-distance={Math.abs(i-2)} aria-current={s.id===sector.id?'page':undefined} key={s.id}><span>{String(sectors.indexOf(s)+1).padStart(2,'0')}</span><strong>{s.name}</strong><small>{s.slug.toUpperCase()}</small></a>)}</div></div><small>滚动或拖动切换</small></nav>;
}
