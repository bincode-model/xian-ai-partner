import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { sectors, atlas } from './sectors';

// Reuse the 5190 reference's negative radius, card geometry and spring/inertia.
const N = sectors.length, BASE_ANGLE = 360 / N;
const radiusEm = (0.5 * 24 + 0.5) / Math.tan(Math.PI / 12); // Preserve the reference's depth/spacing, with eight industry positions.
export default function Carousel() {
  const section = useRef<HTMLElement>(null), ring = useRef<HTMLDivElement>(null);
  const currentRotation = useRef(0), targetRotation = useRef(0), velocity = useRef(0);
  const direction = useRef(-1), clickTarget = useRef<number | null>(null);
  const deformation = useRef(0), deformationForce = useRef(0);
  const drag = useRef<{x:number; rotation:number; lastX:number; lastTime:number; index?:number} | null>(null);
  const suppressClick = useRef(false), visible = useRef(false);
  const pause = useRef({hover:false,focus:false,until:0});
  const [current, setCurrent] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    let animation = 0, previousTime = 0;
    const render = (now:number) => {
      const dt = Math.min(2, (now - (previousTime || now)) / 16.666 || 1);
      previousTime = now;
      if (visible.current) {
        const previous = currentRotation.current;
        if (drag.current) currentRotation.current = targetRotation.current;
        else if (clickTarget.current !== null) {
          const diff = clickTarget.current - currentRotation.current;
          if (Math.abs(diff) < .05 || reduce) {
            currentRotation.current = clickTarget.current; clickTarget.current = null; velocity.current = 0;
          } else { velocity.current = diff * (1 - Math.pow(.92, dt)); currentRotation.current += velocity.current; }
          targetRotation.current = currentRotation.current;
        } else if (!reduce && !pause.current.hover && !pause.current.focus && now > pause.current.until) {
          const speed = .24 * direction.current;
          velocity.current = speed + (velocity.current - speed) * Math.pow(.982, dt);
          currentRotation.current += velocity.current * dt;
          targetRotation.current = currentRotation.current;
        } else velocity.current = 0;
        const instantV = (currentRotation.current - previous) / dt;
        const force = -.16 * (deformation.current - instantV) - .52 * deformationForce.current;
        deformationForce.current = Math.max(-8, Math.min(8, deformationForce.current + force));
        deformation.current = Math.max(-25, Math.min(25, deformation.current + deformationForce.current));
        const element = ring.current;
        if (element) {
          element.style.transform = `rotateY(${currentRotation.current}deg)`;
          element.style.setProperty('--vel', `${reduce ? 0 : deformation.current}`);
          element.style.setProperty('--abs-vel', `${reduce ? 0 : Math.abs(deformation.current)}`);
          element.querySelectorAll<HTMLElement>('.card').forEach((card, index) => {
            const diff = ((index * BASE_ANGLE + currentRotation.current) % 360 + 540) % 360 - 180;
            const out = Math.abs(diff) > 90;
            card.style.opacity = out ? '0' : '1'; card.style.pointerEvents = out ? 'none' : 'auto';
            card.tabIndex = out ? -1 : 0;
          });
        }
        const selectedRotation = clickTarget.current ?? currentRotation.current;
        const selected = ((Math.round(-selectedRotation / BASE_ANGLE) % N) + N) % N;
        setCurrent(last => last === selected ? last : selected);
      }
      animation = requestAnimationFrame(render);
    };
    const observer = new IntersectionObserver(entries => { visible.current = entries[0].isIntersecting; }, {threshold:.08});
    if (section.current) observer.observe(section.current);
    animation = requestAnimationFrame(render);
    const wheel = (event:WheelEvent) => {
      // Preserve vertical page scrolling; horizontal or Shift+wheel spins the arc.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) && !event.shiftKey) return;
      event.preventDefault(); clickTarget.current = null;
      const delta = event.deltaX || event.deltaY; direction.current = delta > 0 ? -1 : 1;
      velocity.current = velocity.current * .45 + Math.max(-8, Math.min(8, -delta * .052)) * .55;
    };
    const root = section.current; root?.addEventListener('wheel', wheel, {passive:false});
    return () => { cancelAnimationFrame(animation); observer.disconnect(); root?.removeEventListener('wheel', wheel); };
  }, [reduce]);
  const moveTo = (index:number) => {
    pause.current.until = performance.now() + 6000;
    setCurrent(index);
    const lap = Math.round(currentRotation.current / 360) * 360;
    const candidates = [lap - index * BASE_ANGLE, lap - 360 - index * BASE_ANGLE, lap + 360 - index * BASE_ANGLE];
    clickTarget.current = candidates.reduce((best, next) => Math.abs(next-currentRotation.current) < Math.abs(best-currentRotation.current) ? next : best);
    targetRotation.current = clickTarget.current;
  };
  const down = (event:PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    suppressClick.current = false; clickTarget.current = null; velocity.current = 0;
    drag.current = {x:event.clientX,rotation:currentRotation.current,lastX:event.clientX,lastTime:performance.now(),index:Number((event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index)};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event:PointerEvent<HTMLDivElement>) => {
    const start = drag.current; if (!start) return;
    const dx = event.clientX - start.x; targetRotation.current = start.rotation + dx * .18;
    if (Math.abs(dx) > 8) suppressClick.current = true;
    if (dx) direction.current = dx > 0 ? 1 : -1;
    const now = performance.now(), dt = now - start.lastTime;
    if (dt > 0) velocity.current = (event.clientX - start.lastX) * .18 / (dt / 16.666);
    start.lastX = event.clientX; start.lastTime = now;
  };
  const up = (event:PointerEvent<HTMLDivElement>) => {
    const start=drag.current;if (!start) return; drag.current = null;
    if(event.type!=='pointercancel'&&!suppressClick.current&&Number.isInteger(start.index))moveTo(start.index!);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    velocity.current = Math.max(-12, Math.min(12, velocity.current));
  };
  return <section id="industries" className="reference-carousel" ref={section} aria-labelledby="industry-title" onFocusCapture={()=>{pause.current.focus=true;}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))pause.current.focus=false;}}>
    <div className="reference-intro"><span className="eyebrow">CHANG’AN / EIGHT LIVING WORLDS</span><h2 id="industry-title">深入行业。<br/><i>从一件实事开始。</i></h2></div>
    <motion.div className="scene" initial={{opacity:0,y:'16rem'}} whileInView={{opacity:1,y:'12rem'}} viewport={{once:true,amount:.1}} transition={{duration:reduce ? 0 : 1.2,ease:[.16,1,.3,1]}}>
      <div ref={ring} className="a3d" style={{'--n':N,'--z-trans':`calc(-1 * ${radiusEm}em)`} as CSSProperties} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveTo((current+(e.key==='ArrowRight'?1:N-1))%N);}}}>
        {sectors.map((sector,index)=><button className="card" data-index={index} key={sector.id} style={{'--i':index} as CSSProperties} aria-label={`聚焦${sector.name}`} onClick={()=>{if(!suppressClick.current)moveTo(index);}}><div className="reference-card-image"><img src={atlas(sector)} alt={sector.object} draggable={false}/></div></button>)}
      </div>
    </motion.div>
    <div className="reference-caption" onPointerEnter={()=>{pause.current.hover=true;}} onPointerLeave={()=>{pause.current.hover=false;}}><span>{String(current+1).padStart(2,'0')} / 08</span><h3>{sectors[current].name}</h3><p>{sectors[current].line}</p><a className="text-link" href={`#/experience/${sectors[current].slug}`}>走进这个行业 <span>↗</span></a></div>
    <div className="reference-bottom" onPointerEnter={()=>{pause.current.hover=true;}} onPointerLeave={()=>{pause.current.hover=false;}}><p>拖动浏览 · 点击聚焦</p><nav aria-label="八个行业索引">{sectors.map((sector,index)=><button key={sector.id} aria-label={sector.name} aria-pressed={current===index} onClick={()=>moveTo(index)}>{String(index+1).padStart(2,'0')}</button>)}</nav><div><button aria-label="上一个行业" onClick={()=>moveTo((current+N-1)%N)}>←</button><button aria-label="下一个行业" onClick={()=>moveTo((current+1)%N)}>→</button></div></div>
  </section>;
}
