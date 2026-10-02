import type { MouseEvent, PointerEvent } from 'react';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    __XIAN_ACQUIRE_EXPERIENCE_AUDIO__?: ()=>AudioContext|null;
  }
}

let prepared:AudioContext|null=null;
let expires:number|undefined;

function createContext():AudioContext|null {
  const Constructor=window.AudioContext??window.webkitAudioContext;
  if(!Constructor)return null;
  try{return new Constructor();}catch{return null;}
}
function resume(context:AudioContext|null){
  // Called synchronously by the entry's pointer/click handler. Browsers still
  // enforce their own autoplay policy for a visit without user interaction.
  if(context&&context.state!=='closed')void context.resume().catch(()=>{});
}
export function prepareExperienceAudio(){
  if(!prepared||prepared.state==='closed')prepared=createContext();
  resume(prepared);
  window.clearTimeout(expires);
  const current=prepared;
  expires=window.setTimeout(()=>{
    if(prepared===current){prepared=null;if(current&&current.state!=='closed')void current.close().catch(()=>{});}
  },30000);
}
export function prepareExperienceAudioNavigation(event:MouseEvent<HTMLElement>|PointerEvent<HTMLElement>){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const target=event.target instanceof Element?event.target:null;
  const href=target?.closest('a')?.getAttribute('href');
  if(href&&/^#\/experience(?:\/|$)/.test(href))prepareExperienceAudio();
}
export function acquireExperienceAudioContext():AudioContext|null {
  window.clearTimeout(expires);
  const context=prepared&&prepared.state!=='closed'?prepared:createContext();
  prepared=null;resume(context);
  return context;
}
// The same-origin iframe acquires the exact context resumed by the navigation
// gesture. It owns that visit's context and closes it when the scene unmounts.
if(typeof window!=='undefined')window.__XIAN_ACQUIRE_EXPERIENCE_AUDIO__=acquireExperienceAudioContext;
