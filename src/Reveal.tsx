import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { atlas, type Sector } from './sectors';

export default function Reveal({ sector, compact = false }: { sector: Sector; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const element = root.current, mask = layer.current;
    if (!element || !mask) return;
    let frame = 0, active = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const target = { x: 0, y: 0 }, smooth = { x: 0, y: 0 };
    const draw = () => {
      smooth.x += (target.x - smooth.x) * (motion.matches ? 1 : .1);
      smooth.y += (target.y - smooth.y) * (motion.matches ? 1 : .1);
      mask.style.setProperty('--mx', `${smooth.x}px`); mask.style.setProperty('--my', `${smooth.y}px`);
      if (active && !motion.matches && (Math.abs(target.x - smooth.x) > .1 || Math.abs(target.y - smooth.y) > .1)) frame = requestAnimationFrame(draw);
      else frame = 0;
    };
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect(); target.x = event.clientX - box.left; target.y = event.clientY - box.top;
      if (!active) { active = true; smooth.x = target.x; smooth.y = target.y; mask.classList.add('is-active'); }
      if (!frame) draw();
    };
    const leave = () => { active = false; cancelAnimationFrame(frame); frame = 0; mask.classList.remove('is-active'); };
    const touchEnd = (event: PointerEvent) => { if (event.pointerType === 'touch') leave(); };
    element.addEventListener('pointermove', move); element.addEventListener('pointerdown', move); element.addEventListener('pointerleave', leave); element.addEventListener('pointerup', touchEnd); element.addEventListener('pointercancel', leave);
    return () => { leave(); element.removeEventListener('pointermove', move); element.removeEventListener('pointerdown', move); element.removeEventListener('pointerleave', leave); element.removeEventListener('pointerup', touchEnd); element.removeEventListener('pointercancel', leave); };
  }, []);
  return <div ref={root} className={`reveal-world ${compact ? 'compact' : ''} ${revealed ? 'fully-revealed' : ''}`} style={{ '--accent': sector.color } as CSSProperties}>
    <div className="atlas-frame"><img src={atlas(sector)} alt={`${sector.name} · 实物场景与科技内层`} draggable={false} /></div>
    <div className="reveal-mask" ref={layer} aria-hidden="true"><div className="atlas-frame atlas-inner"><img src={atlas(sector)} alt="" draggable={false} /></div></div>
    {!compact && <><span className="reveal-hint">移动光圈，探索内层 <span>· 触屏可轻触或切换查看</span></span><button className="reveal-switch" aria-pressed={revealed} onClick={() => setRevealed(!revealed)}>{revealed ? '回到外层' : '查看内层'} <span aria-hidden="true">↗</span></button></>}
  </div>;
}
