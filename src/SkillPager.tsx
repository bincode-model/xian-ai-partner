import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';

type Drag = {id:number;x:number;y:number;left:number;active:boolean};
const interactive = 'a,button,input,select,textarea,summary,label,[contenteditable="true"],[data-no-drag]';
const clampPage = (value:number,count:number)=>Math.max(0,Math.min(count-1,value));

/** A small DOM window over a native scroll-snap track. Touch stays browser-native. */
export default function SkillPager({count,renderPage}:{count:number;renderPage:(page:number)=>ReactNode}) {
  const viewport=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),ignoreClickUntil=useRef(0),measuredWidth=useRef(0),pageRef=useRef(0);
  const [page,setPage]=useState(0);
  const current=clampPage(page,count),start=Math.max(0,current-2),end=Math.min(count,current+3);
  pageRef.current=current;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const navigate=(next:number)=>{
    const element=viewport.current;if(!element)return;
    const target=clampPage(next,count);
    const instant=reduced()||Math.abs(target-current)>2;
    element.scrollTo({left:target*element.clientWidth,behavior:instant?'instant':'smooth'});
    // Scroll events advance the window during a smooth transition.
    if(instant)setPage(target);
  };
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    measuredWidth.current=element.clientWidth;
    const resize=new ResizeObserver(()=>{
      if(measuredWidth.current===element.clientWidth)return;
      measuredWidth.current=element.clientWidth;
      element.scrollTo({left:clampPage(pageRef.current,count)*element.clientWidth,behavior:'instant'});
    });
    resize.observe(element);return()=>resize.disconnect();
  },[count]);
  const endDrag=(event:PointerEvent<HTMLDivElement>,cancelled=false)=>{
    const state=drag.current;if(!state||state.id!==event.pointerId)return;
    const element=event.currentTarget;
    drag.current=null;
    element.classList.remove('is-dragging');
    if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);
    if(!state.active)return;
    ignoreClickUntil.current=Date.now()+250;
    const next=clampPage(Math.round(element.scrollLeft/element.clientWidth),count);
    // Freeze snap while dragging; release into the closest page without a jump.
    element.style.scrollSnapType='';
    element.scrollTo({left:next*element.clientWidth,behavior:cancelled||reduced()?'instant':'smooth'});
    if(cancelled||reduced())setPage(next);
  };
  const keyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
    if((event.target as Element).closest(interactive))return;
    const next=event.key==='ArrowLeft'?current-1:event.key==='ArrowRight'?current+1:event.key==='Home'?0:event.key==='End'?count-1:null;
    if(next===null)return;
    event.preventDefault();navigate(next);
  };
  const controls=(position:string)=><nav className={`skill-pager-controls ${position}`} aria-label={`技能翻页${position==='at-bottom'?'（页尾）':''}`}>
    <p><strong>{String(current+1).padStart(2,'0')}</strong><span>/ {count} 项</span></p>
    <span className="skill-pager-hint">按住拖动 · 左右翻阅</span>
    <div><button aria-label="上一个 Skill" disabled={current===0} onClick={()=>navigate(current-1)}>←</button><button aria-label="下一个 Skill" disabled={current>=count-1} onClick={()=>navigate(current+1)}>→</button></div>
  </nav>;
  return <div className="skill-pager">
    {controls('at-top')}
    <div ref={viewport} className="skill-pager-viewport" role="region" aria-roledescription="分页阅读" aria-label="Skills 阅读册，按左右方向键翻页" tabIndex={0}
      onKeyDown={keyDown}
      onScroll={event=>{const element=event.currentTarget;if(element.clientWidth&&(!measuredWidth.current||measuredWidth.current===element.clientWidth)){const next=clampPage(Math.round(element.scrollLeft/element.clientWidth),count);pageRef.current=next;setPage(next);}}}
      onPointerDown={event=>{
        if(event.pointerType!=='mouse'||event.button!==0||(event.target as Element).closest(interactive))return;
        drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,active:false};
        ignoreClickUntil.current=0;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        const state=drag.current;if(!state||state.id!==event.pointerId)return;
        const dx=event.clientX-state.x,dy=event.clientY-state.y,element=event.currentTarget;
        if(!state.active){
          if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){endDrag(event,true);return;}
          if(Math.abs(dx)<6)return;
          state.active=true;element.classList.add('is-dragging');element.style.scrollSnapType='none';
        }
        event.preventDefault();element.scrollLeft=state.left-dx;
      }}
      onPointerUp={event=>endDrag(event)} onPointerCancel={event=>endDrag(event,true)}
      onLostPointerCapture={event=>{if(drag.current?.id===event.pointerId)endDrag(event,true);}}
      onClickCapture={event=>{if(Date.now()<ignoreClickUntil.current){event.preventDefault();event.stopPropagation();ignoreClickUntil.current=0;}}}
      onDragStart={event=>event.preventDefault()}>
      {Array.from({length:count},(_,index)=><div key={index} className="skill-pager-page" role="group" aria-roledescription="页" aria-label={`第 ${index+1} 项，共 ${count} 项`} aria-hidden={index!==current} inert={index!==current} data-page={index}>{index>=start&&index<end?renderPage(index):null}</div>)}
    </div>
    <p className="skill-pager-announcement" role="status" aria-live="polite" aria-atomic="true">第 {current+1} 项，共 {count} 项</p>
    {controls('at-bottom')}
  </div>;
}
