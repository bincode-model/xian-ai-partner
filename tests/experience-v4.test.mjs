import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { build } from 'rolldown';
import { projectIceLabels, startIceLabels } from '../public/experience/ice-labels.js';

const project=new URL('../',import.meta.url);
const engineSource=await readFile(new URL('public/assets/App3D-f554a111.js',project),'utf8');
const compiled=await build({input:new URL('src/audioExperience.ts',project).pathname,write:false,output:{format:'cjs'}});
const audioCode=compiled.output.find(file=>file.type==='chunk'&&file.isEntry).code;

function audioEnvironment(){
  let gesture=false,nextTimer=0;
  const contexts=[],timers=new Map();
  class AudioContext {
    state='suspended';resumes=0;closes=0;unlocked=false;
    constructor(){contexts.push(this);}
    resume(){
      this.resumes++;
      if(gesture||this.unlocked){this.unlocked=true;this.state='running';return Promise.resolve();}
      return Promise.reject(new Error('User activation required'));
    }
    close(){this.closes++;this.state='closed';return Promise.resolve();}
  }
  class Element {constructor(href){this.href=href;}closest(){return this;}getAttribute(){return this.href;}}
  const window={AudioContext,setTimeout:callback=>{timers.set(++nextTimer,callback);return nextTimer;},clearTimeout:id=>timers.delete(id)};
  const module={exports:{}};
  vm.runInNewContext(audioCode,{module,exports:module.exports,window,Element});
  return {api:module.exports,window,contexts,
    navigate(href='#/experience',options={}){
      gesture=true;
      try{module.exports.prepareExperienceAudioNavigation({target:new Element(href),button:0,...options});}finally{gesture=false;}
    },
    expire(){for(const callback of [...timers.values()])callback();},
  };
}

test('the home navigation gesture unlocks exactly the context later acquired by the iframe',()=>{
  const env=audioEnvironment();env.navigate();
  assert.equal(env.contexts.length,1);assert.equal(env.contexts[0].state,'running');
  const context=env.window.__XIAN_ACQUIRE_EXPERIENCE_AUDIO__();
  assert.equal(context,env.contexts[0]);assert.equal(context.state,'running');
  assert.equal(context.resumes,2,'entry resumes synchronously; acquisition attempts again without asking for another click');
  env.expire();assert.equal(context.closes,0,'the iframe owns an acquired context');
});

test('the actual engine AudioContext provider adopts the prepared context instead of creating a suspended second one',()=>{
  const env=audioEnvironment();env.navigate('#/experience/drug');
  const shared=env.window.__XIAN_ACQUIRE_EXPERIENCE_AUDIO__();
  const start=engineSource.indexOf('let gh;class $h'),end=engineSource.indexOf('class Zy',start);
  assert.ok(start>=0&&end>start);
  const source=engineSource.slice(start,end);
  const target={window:{AudioContext:env.window.AudioContext,__XIAN_EXPERIENCE_AUDIO_CONTEXT__:shared}};
  const provider=vm.runInNewContext(`${source};$h`,target);
  assert.equal(provider.getContext(),shared);assert.equal(provider.getContext(),shared);
  assert.equal(env.contexts.length,1);
});

test('repeated pointer/click preparation uses one context, while abandoned navigation is cleaned up',()=>{
  const env=audioEnvironment();env.navigate();env.navigate();
  assert.equal(env.contexts.length,1);assert.equal(env.contexts[0].resumes,2);
  env.expire();assert.equal(env.contexts[0].state,'closed');
  env.navigate();assert.equal(env.contexts.length,2);assert.equal(env.contexts[1].state,'running');
});

test('unrelated links and modifier-key navigation do not start or change the secondary soundscape',()=>{
  const env=audioEnvironment();env.navigate('#/sector/drug');env.navigate('#/experience',{ctrlKey:true});env.navigate('#/experience',{button:2});
  assert.equal(env.contexts.length,0);
});

test('a direct visit attempts audio but preserves the browser activation requirement',async()=>{
  const env=audioEnvironment();const context=env.api.acquireExperienceAudioContext();await Promise.resolve();
  assert.equal(context.state,'suspended');assert.equal(context.unlocked,false);assert.equal(context.resumes,1);
});

const identity=()=>({elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
function projectionEnvironment(hash='mercury'){
  const f=1/Math.tan(Math.PI/6),near=.1,far=100;
  const camera={matrixWorldInverse:identity(),projectionMatrix:{elements:[f/1.25,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]}};
  camera.matrixWorldInverse.elements[14]=-5;
  const mesh={matrixWorld:identity(),geometry:{boundingSphere:{center:{x:0,y:0,z:0}}},visible:true,material:{visible:true}};
  const cube={options:{hash,index:99},mesh};
  const scene={camera,cubes:[cube],isSceneVisible:true};
  const controller={isDetailOpen:false,scrollComposers:[{}, {passes:[{scene}]}],material:{uniforms:{uInCubes:{value:true},uProgress:{value:0},uDetailProgress:{value:0}}}};
  const raycaster={calls:[],setFromCamera(point,activeCamera){this.calls.push({point,activeCamera});},intersectObjects(meshes,recursive){assert.equal(recursive,false);assert.ok(meshes.includes(mesh));return [{object:mesh,distance:4}];}};
  return {controller,scene,camera,cube,mesh,raycaster,labels:()=>projectIceLabels(controller,raycaster,{width:1000,height:800})};
}

test('each label is mapped by the clicked cube hash, independent of its array order or index field',()=>{
  const planets=['mercury','mars','venus','earth','jupiter','saturn','uranus','neptune'];
  for(let index=0;index<planets.length;index++){
    const env=projectionEnvironment(planets[index]);const labels=env.labels();
    assert.equal(labels.length,1);assert.equal(labels[0].index,index);
    assert.equal(labels[0].x,.5);assert.equal(labels[0].y,.5);
    assert.equal(env.raycaster.calls[0].activeCamera,env.camera);
  }
});

test('labels follow the real mesh translation and moving camera matrices',()=>{
  const env=projectionEnvironment('venus');env.mesh.matrixWorld.elements[12]=1;
  let label=env.labels()[0];assert.ok(Math.abs(label.x-(.5+Math.sqrt(3)/12.5))<1e-10);
  env.camera.matrixWorldInverse.elements[12]=-1;label=env.labels()[0];assert.equal(label.x,.5);
  env.camera.matrixWorldInverse.elements[13]=-1;label=env.labels()[0];assert.ok(Math.abs(label.y-(.5+Math.sqrt(3)/10))<1e-10);
});

test('the local geometry center is transformed with the actual mesh rotation',()=>{
  const env=projectionEnvironment();env.mesh.geometry.boundingSphere.center.x=1;
  env.mesh.matrixWorld.elements=[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1];
  const label=env.labels()[0];assert.equal(label.x,.5);assert.ok(Math.abs(label.y-(.5-Math.sqrt(3)/10))<1e-10);
});

test('occluded, hidden, behind-camera and out-of-viewport cubes never receive labels',()=>{
  let env=projectionEnvironment();env.raycaster.intersectObjects=()=>[{object:{name:'a nearer cube'},distance:2},{object:env.mesh,distance:4}];assert.deepEqual(env.labels(),[]);
  env=projectionEnvironment();env.mesh.parent={visible:false};assert.deepEqual(env.labels(),[]);
  env=projectionEnvironment();env.mesh.matrixWorld.elements[14]=10;assert.deepEqual(env.labels(),[]);
  env=projectionEnvironment();env.mesh.matrixWorld.elements[12]=20;assert.deepEqual(env.labels(),[]);
  env=projectionEnvironment();env.mesh.matrixWorld.elements[13]=20;assert.deepEqual(env.labels(),[]);
  env=projectionEnvironment('unmapped');assert.deepEqual(env.labels(),[]);
});

test('labels hide during introduction, compositor transitions and other scene sections',()=>{
  for(const condition of ['detail','transition','overlay','outside','scene-hidden']){
    const env=projectionEnvironment();
    if(condition==='detail')env.controller.isDetailOpen=true;
    if(condition==='transition')env.controller.material.uniforms.uProgress.value=.3;
    if(condition==='overlay')env.controller.material.uniforms.uDetailProgress.value=.7;
    if(condition==='outside')env.controller.material.uniforms.uInCubes.value=false;
    if(condition==='scene-hidden')env.scene.isSceneVisible=false;
    assert.deepEqual(env.labels(),[],condition);
  }
});

test('label delivery follows projection changes, clears on busy/hidden states, and cancels on unmount',()=>{
  const env=projectionEnvironment();let id=0;const frames=new Map(),messages=[];
  const window={innerWidth:1000,innerHeight:800,requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:key=>frames.delete(key),__STARWRECK_ROUTE_BUSY__:false};
  const document={hidden:false};
  const stop=startIceLabels({window,document,send:data=>messages.push(data),getController:()=>env.controller,getRaycaster:()=>env.raycaster});
  const step=time=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(time));};
  step(0);assert.equal(messages.length,1);assert.equal(messages[0].labels.length,1);
  step(20);assert.equal(messages.length,1);
  env.mesh.matrixWorld.elements[12]=.1;step(40);assert.equal(messages.length,2);
  window.__STARWRECK_ROUTE_BUSY__=true;step(80);assert.deepEqual(messages.at(-1).labels,[]);
  window.__STARWRECK_ROUTE_BUSY__=false;step(120);assert.equal(messages.at(-1).labels.length,1);
  document.hidden=true;step(160);assert.deepEqual(messages.at(-1).labels,[]);
  stop();assert.equal(frames.size,0);assert.deepEqual(messages.at(-1).labels,[]);
});

test('render-synchronized labels preserve the original scene hook, update every frame, and deliver before returning',()=>{
  const env=projectionEnvironment('neptune'),messages=[],direct=[],args=['renderer','scene','camera'];
  let previousCalls=0,frameRequests=0;
  const scene={onAfterRender(...received){assert.equal(this,scene);assert.deepEqual(received,args);previousCalls++;}};
  const original=scene.onAfterRender;env.controller.mainMesh={parent:scene};
  const window={innerWidth:1000,innerHeight:800,parent:{__XIAN_UPDATE_ICE_LABELS__(source,labels,viewport){assert.equal(source,window);assert.deepEqual(viewport,{width:1000,height:800});direct.push(labels);return true;}},requestAnimationFrame(){frameRequests++;return 1;},cancelAnimationFrame(){}};
  const stop=startIceLabels({window,document:{hidden:false},send:data=>messages.push(data),getController:()=>env.controller,getRaycaster:()=>env.raycaster});
  for(let frame=0;frame<5;frame++){
    env.mesh.matrixWorld.elements[12]=frame*.00001;
    scene.onAfterRender(...args);
    assert.equal(direct.length,frame+1,'subpixel movement must reach the DOM each render, without waiting 40ms');
    assert.deepEqual(direct.at(-1),env.labels(),'positions follow the current mesh/camera exactly, without interpolation lag');
  }
  assert.equal(previousCalls,5);assert.equal(frameRequests,0);assert.deepEqual(messages,[]);
  stop();assert.equal(scene.onAfterRender,original);assert.deepEqual(direct.at(-1),[]);
  scene.onAfterRender(...args);assert.equal(previousCalls,6);assert.equal(direct.length,6);
});

test('RAF fallback retains every subpixel frame and upgrades to the real scene render hook',()=>{
  const env=projectionEnvironment(),messages=[],frames=new Map();let id=0;
  const window={innerWidth:1000,innerHeight:800,requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:key=>frames.delete(key)};
  const step=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));};
  const stop=startIceLabels({window,document:{hidden:false},send:data=>messages.push(data),getController:()=>env.controller,getRaycaster:()=>env.raycaster});
  for(let frame=0;frame<4;frame++){env.mesh.matrixWorld.elements[12]=frame*.00001;step(frame*1000/60);assert.equal(messages.length,frame+1);}
  const scene={onAfterRender(){}};const original=scene.onAfterRender;env.controller.mainMesh={parent:scene};
  step(80);assert.equal(frames.size,0);assert.notEqual(scene.onAfterRender,original);
  env.mesh.matrixWorld.elements[12]=.25;scene.onAfterRender();assert.deepEqual(messages.at(-1).labels,env.labels());
  stop();assert.equal(scene.onAfterRender,original);
});

test('viewport edges fade progressively while occlusion hides immediately and BVH settings are restored',()=>{
  const env=projectionEnvironment();const originalRaycast=env.raycaster.intersectObjects;
  env.raycaster.firstHitOnly=false;
  env.raycaster.intersectObjects=(...args)=>{assert.equal(env.raycaster.firstHitOnly,true);return originalRaycast(...args);};
  const placeAtX=pixels=>{env.mesh.matrixWorld.elements[12]=(pixels/1000-.5)*12.5/Math.sqrt(3);};
  placeAtX(83);const edge=env.labels()[0];assert.ok(edge.opacity>0&&edge.opacity<.2);
  placeAtX(90);const midway=env.labels()[0];assert.ok(Math.abs(midway.opacity-.5)<1e-12);
  placeAtX(120);assert.equal(env.labels()[0].opacity,1);
  assert.equal(env.raycaster.firstHitOnly,false);
  env.raycaster.intersectObjects=()=>[];assert.deepEqual(env.labels(),[]);assert.equal(env.raycaster.firstHitOnly,false);
  env.raycaster.intersectObjects=()=>{throw new Error('raycast fixture');};assert.throws(()=>env.labels(),/raycast fixture/);assert.equal(env.raycaster.firstHitOnly,false);
});

test('render-hook cleanup preserves later hook owners and hidden tabs clear labels immediately',()=>{
  const env=projectionEnvironment(),messages=[],listeners=new Map();
  const scene={onAfterRender(){}};env.controller.mainMesh={parent:scene};
  const document={hidden:false,addEventListener:(type,handler)=>listeners.set(type,handler),removeEventListener:(type,handler)=>{if(listeners.get(type)===handler)listeners.delete(type);}};
  const window={innerWidth:1000,innerHeight:800,requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
  const stop=startIceLabels({window,document,send:data=>messages.push(data),getController:()=>env.controller,getRaycaster:()=>env.raycaster});
  scene.onAfterRender();assert.equal(messages.at(-1).labels.length,1);
  document.hidden=true;listeners.get('visibilitychange')();assert.deepEqual(messages.at(-1).labels,[]);
  const installed=scene.onAfterRender;const later=function(...args){installed.apply(this,args);};scene.onAfterRender=later;
  stop();assert.equal(scene.onAfterRender,later);assert.equal(listeners.size,0);
  const count=messages.length;scene.onAfterRender();assert.equal(messages.length,count);
});

test('a unavailable direct sink falls back to postMessage without changing industry mapping',()=>{
  const env=projectionEnvironment('jupiter'),messages=[];let callback;
  const window={innerWidth:1000,innerHeight:800,get parent(){throw new Error('cross-origin access denied');},requestAnimationFrame:fn=>{callback=fn;return 1;},cancelAnimationFrame(){}};
  const stop=startIceLabels({window,document:{hidden:false},send:data=>messages.push(data),getController:()=>env.controller,getRaycaster:()=>env.raycaster});
  callback(0);assert.equal(messages[0].labels[0].index,4);assert.deepEqual(messages[0].viewport,{width:1000,height:800});stop();
});

test('reduced motion disables decorative opacity transitions without adding transform lag',async()=>{
  const css=await readFile(new URL('src/experience-v4.css',project),'utf8');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.experience-ice-label\{transition:none\}\}/);
  assert.doesNotMatch(css,/transition:[^;}]*\b(?:transform|all)\b/);
});
