import { useEffect, useRef } from 'react';
import Carousel from './Carousel';
import { prepareExperienceAudioNavigation } from './audioExperience';
export default function Home() {
  const video=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    const element=video.current;if(!element)return;
    let stopped=false;
    const activate=()=>{if(stopped)return;element.muted=false;void element.play().catch(()=>{});};
    element.muted=false;void element.play().catch(()=>{if(!stopped){element.muted=true;void element.play().catch(()=>{});}});
    window.addEventListener('pointerdown',activate,{once:true});window.addEventListener('keydown',activate,{once:true});
    return()=>{stopped=true;element.pause();window.removeEventListener('pointerdown',activate);window.removeEventListener('keydown',activate);};
  },[]);
  return <main onPointerDownCapture={prepareExperienceAudioNavigation} onClickCapture={prepareExperienceAudioNavigation}><section className="film-home" aria-label="AI终身合伙人首页影片"><video ref={video} src="/media/home-original.mp4" poster="/media/home.png" autoPlay loop playsInline preload="auto" aria-label="AI终身合伙人原声影片"/><a className="film-enter" href="#/experience">进入八大行业 <span>↗</span></a></section><Carousel/><section className="shared-chapter"><span className="eyebrow">02 — GROW TOGETHER</span><h2>从一份资料，<br /><i>到一次真实的交付。</i></h2><div className="shared-steps"><article><span>01 / CONNECT</span><h3>找到具体岗位</h3><p>八个行业，按部门与岗位细分工作。</p></article><article><span>02 / CREATE</span><h3>让任务开始流转</h3><p>提交资料，运行文件流程，查看每一步。</p></article><article><span>03 / DELIVER</span><h3>留下可检查的成果</h3><p>下载产物，交给负责人复核与确认。</p></article></div><a href="#/experience" className="text-link">走进长安的八个世界 <span>↗</span></a></section><footer className="site-footer"><span>AI终身合伙人 · 西安</span><span>有热爱，也有新的可能。</span><a href="#/home">回到首页 ↑</a></footer></main>;
}
