import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { build } from 'rolldown';
import { startIceLabels } from '../public/experience/ice-labels.js';

const project=new URL('../',import.meta.url);
const bridgeSource=await readFile(new URL('public/experience/bridge.js',project),'utf8');
const engineSource=await readFile(new URL('public/assets/App3D-f554a111.js',project),'utf8');
const planets=['mercury','mars','venus','earth','jupiter','saturn','uranus','neptune'];
const sectors=['drug','industry','ecommerce','retail','tourism','employment','government','agriculture'];

async function bridgeEnvironment({deferredBoot=false,audioContext=null}={}){
  const listeners=new Map(),documentListeners=new Map(),messages=[],enters=[],exits=[],sound=[],timers=new Map();
  let timerId=0,resumes=0,stage=null,releaseBoot;
  const boot=new Promise(resolve=>{releaseBoot=resolve;});
  const add=(map,type,handler)=>map.set(type,[...(map.get(type)||[]),handler]);
  const emit=(type,detail)=>{for(const handler of listeners.get(type)||[])handler({type,detail});};
  const location={origin:'https://test.local',pathname:'/',hash:''};
  const parent={postMessage:data=>messages.push({...data}),__XIAN_ACQUIRE_EXPERIENCE_AUDIO__:()=>audioContext};
  const controller={isDetailOpen:false,scroll:{y:17.4},restored:[],centerScroll(y){this.scroll.y=y;this.restored.push(y);},render(){}};
  const window={parent,__STARWRECK_IGLOO_CONTROLLER__:controller,__STARWRECK_ROUTE_BUSY__:false,
    addEventListener:(type,handler)=>add(listeners,type,handler),
    __STARWRECK_SET_VENDOR_SOUND__:enabled=>sound.push(enabled),
    __STARWRECK_RESUME_VENDOR_AUDIO__:()=>{resumes++;return Promise.resolve();},
    __STARWRECK_IGLOO_READY__:boot,requestAnimationFrame:()=>0,cancelAnimationFrame(){},
  };
  const busy=value=>{window.__STARWRECK_ROUTE_BUSY__=value;emit('starwreck:experience-route-busy',{busy:value});};
  window.__XIAN_ENTER_STORY__=slug=>{
    assert.equal(window.__STARWRECK_ROUTE_BUSY__,false,'must wait for animation');
    assert.equal(controller.isDetailOpen,false,'must exit before entering another ice cube');
    enters.push(slug);busy(true);controller.isDetailOpen=true;controller.scroll.y=4;
    stage='enter';location.pathname=`/portfolio/${slug}`;
    emit('starwreck:experience-route',{scene:'project',params:{project:slug}});return true;
  };
  window.__STARWRECK_EXIT_PORTFOLIO__=()=>{
    assert.equal(window.__STARWRECK_ROUTE_BUSY__,false,'exit must be deferred while busy');
    exits.push(true);busy(true);stage='exit';location.pathname='/';
    emit('starwreck:experience-route',{scene:'home'});return true;
  };
  const selections=[];
  window.__XIAN_SELECT_PARTICLE__=index=>selections.push(index);
  const document={addEventListener:(type,handler)=>add(documentListeners,type,handler),documentElement:{classList:{contains:()=>false}}};
  const context=vm.createContext({window,document,parent,location,startIceLabels,history:{replaceState(){}},
    MutationObserver:class{observe(){}},setTimeout:(callback)=>{timers.set(++timerId,callback);return timerId;},clearTimeout:id=>timers.delete(id),
    __loadEngine:async()=>{},console,
  });
  const source=bridgeSource.replace(/^import \{ startIceLabels \} from '[^']+';\n/, '').replace(/import\('\/assets\/index-2eb69c09\.js(?:\?[^']*)?'\)/,'__loadEngine()');
  assert.notEqual(source,bridgeSource,'only the engine loader is mocked');
  const initialized=vm.runInContext(`(async()=>{${source}\n})()`,context);
  if(!deferredBoot){releaseBoot();await initialized;}
  return {messages,enters,exits,sound,selections,controller,window,
    get resumes(){return resumes;},
    async ready(){releaseBoot();await initialized;},
    command(data,overrides={}){for(const handler of listeners.get('message')||[])handler({origin:location.origin,source:parent,data,...overrides});},
    emit,
    gesture(type,event={}){for(const handler of documentListeners.get(type)||[])handler(event);},
    finish(){const completed=stage;stage=null;if(completed==='exit')controller.isDetailOpen=false;busy(false);},
    timers(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(callback=>callback());},
    opens(){return messages.filter(message=>message.type==='xian-story-open');},
  };
}

test('closing during entry cancels the delayed story, safely exits, and restores the previous scroll',async()=>{
  const env=await bridgeEnvironment();
  env.command({type:'xian-story-command',index:2});
  env.command({type:'xian-close-story-command'});
  assert.equal(env.exits.length,0);
  env.timers();assert.equal(env.opens().length,0);
  env.finish();assert.equal(env.exits.length,1);assert.equal(env.opens().length,0);
  env.finish();env.timers();assert.equal(env.opens().length,0);
  assert.equal(env.controller.scroll.y,17.4);
});

test('an index choice while a story is open exits the old project before opening the chosen one',async()=>{
  const env=await bridgeEnvironment();
  env.command({type:'xian-story-command',index:0});env.finish();
  assert.equal(env.opens().at(-1).index,0);
  env.command({type:'xian-story-command',index:7});assert.equal(env.exits.length,1);
  assert.deepEqual(env.enters,['mercury']);
  env.finish();assert.deepEqual(env.enters,['mercury','neptune']);
  env.finish();assert.equal(env.opens().at(-1).index,7);
});

test('closing cancels both an active transition and a queued replacement story',async()=>{
  const env=await bridgeEnvironment();
  env.command({type:'xian-story-command',index:1});
  env.command({type:'xian-story-command',index:5});
  env.command({type:'xian-close-story-command'});
  env.finish();env.finish();env.timers();
  assert.deepEqual(env.enters,['mars']);assert.equal(env.opens().length,0);
});

test('a new index selection during the exit animation opens once after exit',async()=>{
  const env=await bridgeEnvironment();
  env.command({type:'xian-story-command',index:1});env.finish();
  env.command({type:'xian-close-story-command'});
  env.command({type:'xian-story-command',index:4});env.finish();env.finish();
  assert.deepEqual(env.enters,['mars','jupiter']);assert.equal(env.opens().at(-1).index,4);
});

test('close before readiness removes a queued initial story and Escape closes inside the iframe',async()=>{
  const env=await bridgeEnvironment({deferredBoot:true});
  env.command({type:'xian-story-command',index:1});env.command({type:'xian-close-story-command'});
  await env.ready();assert.deepEqual(env.enters,[]);
  env.command({type:'xian-story-command',index:2});env.finish();
  env.gesture('keydown',{key:'Escape'});assert.equal(env.exits.length,1);
  env.finish();assert.equal(env.messages.at(-1).type,'xian-busy');
});

test('native ice interaction remembers the browsing position and does not lose scene state',async()=>{
  const env=await bridgeEnvironment();env.controller.scroll.y=26.25;
  env.gesture('pointerdown');env.window.__XIAN_ENTER_STORY__('earth');env.finish();
  env.command({type:'xian-close-story-command'});env.finish();
  assert.equal(env.controller.scroll.y,26.25);
  assert.equal(env.controller.restored.length,1);
});

test('sound stays enabled and resumes directly on iframe pointer and keyboard gestures',async()=>{
  const env=await bridgeEnvironment();
  assert.equal(env.window.__STARWRECK_DESIRED_SOUND__,true);
  assert.deepEqual(env.sound,[true]);
  env.gesture('pointerdown');env.gesture('keydown',{key:'ArrowRight'});
  assert.equal(env.resumes,3);assert.ok(env.sound.every(Boolean));
});

test('particle button uses its actual engine callback and the bridge maps all eight industry routes',async()=>{
  const env=await bridgeEnvironment();
  const callback=engineSource.match(/onClick:t=>\{Q\.emit\("webgl_ui_particles_clicked"\),(window\.dispatchEvent\(new CustomEvent\("starwreck:particle-open".*?\)\))\}\}\),this\.texts/);
  assert.ok(callback,'engine particle link must use the controlled bridge event');
  for(let index=0;index<8;index++){
    vm.runInNewContext(`(function(){${callback[1]}}).call({parent:{parent:{currentLink:${index}}}})`,{
      window:{dispatchEvent:event=>env.emit(event.type,event.detail)},
      CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    });
    assert.equal(env.messages.at(-1).slug,sectors[index]);
  }
  assert.doesNotMatch(engineSource,/window\.location\.href=Be\.links/);
});

test('untrusted commands and invalid particle indices cannot navigate the parent',async()=>{
  const env=await bridgeEnvironment();
  env.command({type:'xian-story-command',index:1},{origin:'https://other.test'});
  env.command({type:'xian-story-command',index:1},{source:{}});
  env.command({type:'xian-story-command',index:88});env.emit('starwreck:particle-open',{index:88});
  assert.deepEqual(env.enters,[]);assert.equal(env.messages.some(message=>message.type==='xian-open'),false);
});

const compiled=await build({input:new URL('src/Experience.tsx',project).pathname,external:id=>id==='react'||id==='react/jsx-runtime'||id.endsWith('.css'),write:false,output:{format:'cjs'}});
const componentCode=compiled.output.find(file=>file.type==='chunk'&&file.isEntry).code;
function componentEnvironment(props={}){
  const hooks=[],listeners=new Map(),messages=[],effects=[],cleanups=[];let cursor=0,stateWrites=0;
  const scene={postMessage:data=>messages.push({...data})};
  const element=(type,props,...children)=>({type,props:{...(props||{}),...(children.length?{children}:{})}});
  const react={createElement:element,
    useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],next=>{stateWrites++;hooks[i]=typeof next==='function'?next(hooks[i]):next;}];},
    useRef(initial){const i=cursor++;return hooks[i]??=( {current:initial} );},
    useCallback(callback){cursor++;return callback;},
    useEffect(effect,deps){const i=cursor++,previous=hooks[i];if(!previous||deps.some((dep,j)=>dep!==previous[j])){hooks[i]=deps;effects.push(effect);}},
  };
  const location={origin:'https://test.local',hash:''};
  const window={addEventListener(type,handler){listeners.set(type,[...(listeners.get(type)||[]),handler]);},removeEventListener(){}};
  const module={exports:{}};
  const context=vm.createContext({module,exports:module.exports,window,location,console,
    require(id){if(id==='react')return react;if(id==='react/jsx-runtime')return {jsx:(type,props)=>element(type,props),jsxs:(type,props)=>element(type,props)};if(id.endsWith('.css'))return {};throw new Error(id);},
  });
  vm.runInContext(componentCode,context);
  function descendants(node){if(Array.isArray(node))return node.flatMap(descendants);if(!node||typeof node!=='object')return [];return [node,...descendants(node.props?.children)];}
  function render(){cursor=0;const tree=(module.exports.default??module.exports)(props);const nodes=descendants(tree);
    for(const node of nodes){if(node.props.ref){const runtime=node.type==='iframe'?{contentWindow:scene,clientWidth:1000,clientHeight:800}:{focus(){},style:{},hidden:Boolean(node.props.hidden)};node.runtime=runtime;if(typeof node.props.ref==='function')node.props.ref(runtime);else node.props.ref.current=runtime;}}
    effects.splice(0).forEach(effect=>{const cleanup=effect();if(typeof cleanup==='function')cleanups.push(cleanup);});return nodes;
  }
  return {render,messages,get stateWrites(){return stateWrites;},
    paint(labels,source=scene,viewport={width:1000,height:800}){return window.__XIAN_UPDATE_ICE_LABELS__?.(source,labels,viewport);},
    dispose(){cleanups.splice(0).forEach(cleanup=>cleanup());},
    receive(data){for(const handler of listeners.get('message')||[])handler({origin:location.origin,source:scene,data});}};
}

test('actual UI keeps index active with an open nonmodal story and allows close during camera motion',()=>{
  const env=componentEnvironment();env.render();
  env.receive({type:'xian-ready'});env.receive({type:'xian-story-open',index:0});env.receive({type:'xian-busy',busy:true});
  let nodes=env.render();assert.equal(nodes.find(node=>node.type==='dialog').props.open,true);
  const index=nodes.find(node=>node.props['aria-controls']==='experience-drawer');assert.equal(index.props.disabled,undefined);index.props.onClick();
  nodes=env.render();assert.ok(nodes.find(node=>node.props.id==='experience-drawer'));
  const entry=nodes.find(node=>node.props['aria-label']==='查看电商助企介绍');assert.equal(entry.props.disabled,undefined);entry.props.onClick();
  assert.deepEqual(env.messages.at(-1),{type:'xian-story-command',index:2});
  nodes=env.render();const close=nodes.find(node=>node.props['aria-label']==='关闭行业介绍，返回二级界面');
  assert.equal(close.props.disabled,undefined);close.props.onClick();
  assert.deepEqual(env.messages.at(-1),{type:'xian-close-story-command'});
  assert.equal(env.render().find(node=>node.type==='dialog').props.open,false);
});

test('ice introduction keeps one return action while the index exposes eight real industry links',()=>{
  const env=componentEnvironment();let nodes=env.render();
  nodes.find(node=>node.props['aria-controls']==='experience-drawer').props.onClick();nodes=env.render();
  const industryLinks=nodes.filter(node=>node.type==='a'&&/^#\/sector\//.test(node.props.href));
  assert.equal(industryLinks.length,8);
  assert.deepEqual(industryLinks.map(node=>node.props.href),sectors.map(slug=>`#/sector/${slug}`));
  assert.doesNotMatch(componentCode,/showModal/);
  env.receive({type:'xian-story-open',index:0});nodes=env.render();
  const returns=nodes.filter(node=>node.type==='button'&&node.props.children==='← 返回二级界面');
  assert.equal(returns.length,1);
  assert.equal(nodes.some(node=>node.props.className==='portfolio-story-actions'),false);
});


test('versioned entry and engine imports keep their circular dependency on the same module URL',async()=>{
  const index=await readFile(new URL('public/assets/index-2eb69c09.js',project),'utf8');
  const html=await readFile(new URL('public/experience/index.html',project),'utf8');
  assert.ok(bridgeSource.includes("import('/assets/index-2eb69c09.js?v=20261001-ops4')"));
  assert.ok(index.includes('import("./App3D-f554a111.js?v=20261001-ops4")'));
  assert.ok(engineSource.includes('from"./index-2eb69c09.js?v=20261001-ops4"'));
  assert.doesNotMatch(engineSource,/from"\.\/index-2eb69c09\.js"/);
  assert.ok(html.includes('/experience/bridge.js?v=20261001-presentation5'));
  assert.ok(bridgeSource.includes('./ice-labels.js?v=20261001-presentation5'));
});


test('Escape while freely browsing does not restore an unrelated old pointer position',async()=>{
  const env=await bridgeEnvironment();env.controller.scroll.y=8;env.gesture('pointerdown');
  env.controller.scroll.y=25;env.gesture('keydown',{key:'Escape'});
  assert.equal(env.controller.scroll.y,25);assert.equal(env.controller.restored.length,0);
  assert.equal(env.exits.length,0);
});


test('return before the iframe is ready also cancels an initial deep-linked introduction',()=>{
  const env=componentEnvironment({initialSlug:'drug'});env.render();
  env.receive({type:'xian-busy',busy:true});
  const nodes=env.render();nodes.find(node=>node.props.className==='experience-return').props.onClick();
  env.receive({type:'xian-ready'});env.render();
  assert.equal(env.messages.some(message=>message.type==='xian-story-command'),false);
  assert.equal(env.messages.at(-1).type,'xian-close-story-command');
});


test('scene readiness starts sound without any extra scene click and adopts the navigation context',async()=>{
  const audioContext={state:'running',closes:0,close(){this.closes++;this.state='closed';return Promise.resolve();}};
  const env=await bridgeEnvironment({audioContext});
  assert.equal(env.window.__XIAN_EXPERIENCE_AUDIO_CONTEXT__,audioContext);
  assert.equal(env.resumes,1);assert.equal(env.sound.at(-1),true);
  env.window.__XIAN_RELEASE_AUDIO__();env.emit('pagehide');
  assert.equal(audioContext.closes,1);assert.equal(audioContext.state,'closed');
});

test('real UI places only validated cube labels and label clicks open the matching introduction',()=>{
  const env=componentEnvironment();const nodes=env.render();
  const label=nodes.find(node=>node.props['aria-label']==='查看电商助企冰块介绍');
  assert.equal(label.runtime.hidden,true);
  env.receive({type:'xian-ice-labels',labels:[{index:2,x:.25,y:.4}]});
  assert.equal(label.runtime.hidden,false);assert.equal(label.runtime.style.transform,'translate3d(250px,320px,0) translate(-50%,calc(-100% - 18px))');
  label.props.onClick();assert.deepEqual(env.messages.at(-1),{type:'xian-story-command',index:2});
  env.receive({type:'xian-story-open',index:2});
  assert.equal(env.render().find(node=>node.props.className==='experience-ice-labels').props.hidden,true);
  env.receive({type:'xian-story-close'});env.receive({type:'xian-busy',busy:true});
  assert.equal(env.render().find(node=>node.props.className==='experience-ice-labels').props.hidden,true);
});

test('invalid label payloads cannot place a chip outside the frame or inject an industry',()=>{
  const env=componentEnvironment();const nodes=env.render();
  env.receive({type:'xian-ice-labels',labels:[{index:2,x:-3,y:.4},{index:14,x:.5,y:.5},{index:1,x:NaN,y:.5}]});
  assert.ok(nodes.filter(node=>node.props.className==='experience-ice-label').every(node=>node.runtime.hidden));
});

test('same-frame labels update transforms without React state writes or repeatedly hiding visible chips',()=>{
  const env=componentEnvironment();const nodes=env.render();
  const label=nodes.find(node=>node.props['aria-label']==='查看乡村产业冰块介绍').runtime;
  let hidden=true;const visibility=[];
  Object.defineProperty(label,'hidden',{get:()=>hidden,set:value=>{hidden=value;visibility.push(value);}});
  const writes=env.stateWrites;
  assert.equal(env.paint([{index:7,x:.5,y:.5,opacity:1}]),true);
  assert.equal(env.paint([{index:7,x:.500025,y:.500025,opacity:.75}]),true);
  assert.deepEqual(visibility,[false]);assert.equal(env.stateWrites,writes);
  assert.equal(label.style.transform,'translate3d(500.02500000000003px,400.02000000000004px,0) translate(-50%,calc(-100% - 18px))');
  assert.equal(label.style.opacity,'0.75');
  assert.equal(label.style.left,undefined);assert.equal(label.style.top,undefined);
  env.paint([]);assert.deepEqual(visibility,[false,true]);
  env.paint([]);assert.deepEqual(visibility,[false,true]);
});

test('the direct label sink rejects other frames and releases its callback on unmount',()=>{
  const env=componentEnvironment();const nodes=env.render();
  const label=nodes.find(node=>node.props['aria-label']==='查看药物研发冰块介绍').runtime;
  assert.equal(env.paint([{index:0,x:.5,y:.5}],{}),false);assert.equal(label.hidden,true);
  env.paint([{index:0,x:.5,y:.5,opacity:NaN}]);assert.equal(label.hidden,true);
  assert.equal(env.paint([{index:0,x:.5,y:.5}]),true);assert.equal(label.hidden,false);
  env.dispose();assert.equal(env.paint([{index:0,x:.5,y:.5}]),undefined);
});
