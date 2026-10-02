import { useEffect, useState } from 'react';
import './research-viewer.css';

type Slide = { number: number; title: string; src: string; width: number; height: number };
type Research = { title: string; slideCount: number; description: string; pdf: string; ppt: string; slides: Slide[] };

export default function ResearchViewer() {
  const [research, setResearch] = useState<Research|null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(false);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/resources/drug-factor-b/metadata.json', {signal:controller.signal})
      .then(response => { if (!response.ok) throw new Error('metadata'); return response.json(); })
      .then((data:Research) => { if (!data.slides?.length) throw new Error('slides'); setResearch(data); })
      .catch(err => { if (err.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const key = (event:KeyboardEvent) => {
      if (!research || event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement && ['SELECT','INPUT','TEXTAREA','BUTTON','A','SUMMARY'].includes(event.target.tagName))) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); setPage(value => Math.min(research.slides.length-1,value+1)); setImageError(false); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setPage(value => Math.max(0,value-1)); setImageError(false); }
    };
    window.addEventListener('keydown',key);
    return () => window.removeEventListener('keydown',key);
  }, [research]);
  const slide=research?.slides[page];
  const changePage=(value:number) => { setPage(value); setImageError(false); };
  return <main className="research-viewer">
    <header className="research-viewer-header"><a href="#/sector/drug">← 返回药物研发</a><div><a href={research?.pdf??'/resources/drug-factor-b/factor-b-research.pdf'} target="_blank" rel="noopener noreferrer">打开 PDF ↗</a><a href={research?.ppt??'/resources/drug-factor-b/factor-b-research.pptx'} download>下载 PPT ↓</a></div></header>
    <div className="research-viewer-title"><span className="eyebrow">RESEARCH CASE</span><h1>{research?.title??'B因子抑制剂领域调研'}</h1><p>原版演示文稿 · {research?.slideCount??31} 页</p></div>
    {error ? <div className="research-viewer-error" role="alert"><p>预览暂时无法载入，可以直接打开完整 PDF。</p><a href="/resources/drug-factor-b/factor-b-research.pdf" target="_blank" rel="noopener noreferrer">查看完整 PDF ↗</a></div> : !slide ? <p className="research-viewer-loading" role="status">正在载入演示文稿…</p> : <>
      <div className="research-reader-controls"><button onClick={()=>changePage(Math.max(0,page-1))} disabled={page===0} aria-label="上一页">← 上一页</button><label>页码 <select value={page} onChange={event=>changePage(Number(event.target.value))}>{research!.slides.map((item,i)=><option key={item.number} value={i}>{item.number} / {research!.slides.length} · {item.title}</option>)}</select></label><button onClick={()=>changePage(Math.min(research!.slides.length-1,page+1))} disabled={page===research!.slides.length-1} aria-label="下一页">下一页 →</button></div>
      <figure className="research-slide" aria-label={`第 ${slide.number} 页：${slide.title}`}>
        {imageError ? <div className="research-viewer-error" role="alert"><p>此页图片暂时无法载入。</p><a href={`${research!.pdf}#page=${slide.number}`} target="_blank" rel="noopener noreferrer">在 PDF 中查看本页 ↗</a></div> : <img key={slide.src} src={slide.src} alt={`第 ${slide.number} 页：${slide.title}`} width={slide.width} height={slide.height} onError={()=>setImageError(true)}/>}
        <figcaption aria-live="polite">{String(slide.number).padStart(2,'0')} / {research!.slides.length}　{slide.title}</figcaption>
      </figure>
      <details className="research-outline"><summary>浏览全部章节 <span>＋</span></summary><nav aria-label="演示文稿章节">{research!.slides.map((item,i)=><button key={item.number} aria-current={i===page?'page':undefined} onClick={()=>{changePage(i);document.querySelector('.research-reader-controls')?.scrollIntoView({behavior:'instant',block:'start'});}}><span>{String(item.number).padStart(2,'0')}</span>{item.title}</button>)}</nav></details>
    </>}
  </main>;
}
