import { useEffect, useRef, useState } from 'react';
import type { Sector } from './sectors';
import { films } from './sectorStories';
export default function FilmPage({sector,fromStory=false}:{sector:Sector;fromStory?:boolean}) {
  const ref=useRef<HTMLVideoElement>(null), film=films[sector.slug];
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const video=ref.current;if(!video)return;
    let disposed=false;
    video.muted=false;void video.play().catch(()=>{if(!disposed){video.muted=true;void video.play().catch(()=>{});}});
    const enable=()=>{video.muted=false;void video.play().catch(()=>{});};
    window.addEventListener('pointerdown',enable,{once:true});window.addEventListener('keydown',enable,{once:true});
    return()=>{disposed=true;video.pause();window.removeEventListener('pointerdown',enable);window.removeEventListener('keydown',enable);};
  },[]);
  const back=fromStory?`#/experience/${sector.slug}`:`#/sector/${sector.slug}`;
  return <main className="industry-film">{film&&<video ref={ref} src={film.src} poster={film.poster} autoPlay playsInline controls loop preload="auto" onError={()=>setFailed(true)} aria-label={`${sector.name}宣传影片`}/>}<a href={back} className="film-back">← 返回{sector.name}</a>{(!film||failed)&&<div className="film-error"><h1>{film?'影片暂时无法播放':'该行业暂未制作成片'}</h1><p>{film?'请重新加载，或返回行业继续浏览。':'现有药研、工业、电商成片可从对应行业观看。'}</p>{film&&<button onClick={()=>{setFailed(false);ref.current?.load();}}>重新加载</button>}<a href={back}>返回行业 ↗</a></div>}</main>;
}
