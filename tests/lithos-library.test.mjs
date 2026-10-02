import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { build } from 'rolldown';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(await readFile(path.join(project,'public/resources/skills/xian-skills-catalog-v3.json'),'utf8'));
const research=JSON.parse(await readFile(path.join(project,'public/resources/drug-factor-b/metadata.json'),'utf8'));
const sources=Object.fromEntries(await Promise.all(['SkillsLibrary','SkillPager','ResearchViewer','Reveal','SectorPage'].map(async name=>{
  const bundle=await build({input:path.join(project,`src/${name}.tsx`),external:id=>id==='react'||id==='react/jsx-runtime'||id.endsWith('.css')||(name==='SkillsLibrary'&&id==='./SkillPager')||(name==='SectorPage'&&['./Operations','./Reveal','./SkillsLibrary','./SectorWheel'].includes(id)),transform:{define:{'import.meta.env.BASE_URL':'"/"'}},write:false,output:{format:'cjs'}});
  return [name,bundle.output.find(item=>item.type==='chunk'&&item.isEntry).code];
})));
const text=node=>node===null||node===undefined||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(typeof node.type==='function'?node.type(node.props):node.props?.children):String(node);
function all(node,predicate){
  if(node===null||node===undefined||typeof node!=='object')return [];
  if(Array.isArray(node))return node.flatMap(item=>all(item,predicate));
  if(typeof node.type==='function')return all(node.type(node.props),predicate);
  return [...(predicate(node)?[node]:[]),...all(node.props?.children,predicate)];
}
function find(node,type,label){const match=all(node,item=>item.type===type&&(label===undefined||text(item).includes(label)))[0];assert.ok(match,`Missing ${type}: ${label}`);return match;}
function environment(name,{failFetch=false,reducedMotion=false}={}){
  const slots=[],pending=[],listeners=new Map(),frameCallbacks=new Map(),actions=[],resizers=[];
  const element=(type,props,...children)=>({type,props:{...(props??{}),...(children.length?{children}: {})}});
  let cursor=0,fetchFails=failFetch,frameId=0;
  const react={createElement:element,Fragment:Symbol.for('fragment'),useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];},useMemo(factory){cursor++;return factory();},useEffect(effect,deps){const index=cursor++,old=slots[index];if(!old||!deps||deps.some((value,i)=>value!==old.deps?.[i]))pending.push(()=>{old?.cleanup?.();slots[index]={deps,cleanup:effect()};});}};
  const document={getElementById:id=>({scrollIntoView(options){actions.push({id,kind:'scroll',options});},focus(options){actions.push({id,kind:'focus',options});}}),querySelector:()=>({scrollIntoView(){}})};
  const window={addEventListener:(name,listener)=>listeners.set(name,listener),removeEventListener:(name)=>listeners.delete(name)};
  const module={exports:{}};
  const context=vm.createContext({module,exports:module.exports,console,window,document,AbortController,ResizeObserver:class {constructor(callback){resizers.push(callback);} observe(){} disconnect(){}},HTMLElement:class{},matchMedia:()=>({matches:reducedMotion}),fetch:async url=>({ok:!fetchFails,json:async()=>url.includes('metadata')?research:catalog}),requestAnimationFrame:fn=>{const id=++frameId;frameCallbacks.set(id,fn);return id;},cancelAnimationFrame:id=>frameCallbacks.delete(id),require:id=>id==='react'?react:id==='react/jsx-runtime'?{jsx:(type,props)=>element(type,props),jsxs:(type,props)=>element(type,props),Fragment:react.Fragment}:id.endsWith('.css')?{}:id==='./SkillPager'?({count,renderPage})=>element('div',{'data-skill-pages':count},renderPage(0)):['./Operations','./Reveal','./SkillsLibrary','./SectorWheel'].includes(id)?()=>element('div',{'data-child':id}):(()=>{throw new Error(`Unexpected dependency ${id}`);})()});
  vm.runInContext(sources[name],context,{filename:`${name}.compiled.cjs`});
  const Component=module.exports.default??module.exports;
  return {listeners,frameCallbacks,actions,resizers,setFetchFailure:value=>{fetchFails=value;},render(props={},attach){cursor=0;const tree=Component(props);attach?.(tree);pending.splice(0).forEach(effect=>effect());return tree;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const sector={slug:'tourism',id:'tourism',name:'文旅服务',color:'#e8702a'};
async function library(options){const env=environment('SkillsLibrary',options);env.render({sector});await flush();return [env,env.render({sector})];}
const skillPages=tree=>all(tree,node=>node.type==='article'&&node.props.className==='skill-reading-page');
const recordRows=tree=>all(tree,node=>node.type==='details'&&node.props.className?.split(' ').includes('library-record'));

test('the actual v3 catalog scopes the reading book to one industry and exposes the first Skill immediately',async()=>{
  const [,tree]=await library();
  assert.equal(skillPages(tree).length,1);
  assert.ok(text(tree).includes(`八业共 ${catalog.skills.length} 项`));
  const current=catalog.skills.filter(skill=>skill.industry==='tourism');
  assert.ok(text(skillPages(tree)[0]).includes(current[0].name));
  assert.ok(!text(tree).includes(catalog.skills.find(skill=>skill.industry==='drug').id));
  assert.equal(all(tree,node=>node.props['data-skill-pages'])[0].props['data-skill-pages'],current.length);
});

test('search and module filters operate on the loaded records and support an empty result',async()=>{
  const [env,tree]=await library();
  const wanted=catalog.skills.find(skill=>skill.industry==='tourism'&&skill.id.endsWith('015'));
  find(tree,'input').props.onChange({target:{value:wanted.id}});
  let rendered=env.render({sector});
  assert.equal(skillPages(rendered).length,1);
  assert.ok(text(rendered).includes(wanted.name));
  find(rendered,'input').props.onChange({target:{value:''}});
  rendered=env.render({sector});
  find(rendered,'select').props.onChange({target:{value:wanted.module}});
  rendered=env.render({sector});
  assert.equal(all(rendered,node=>node.props['data-skill-pages'])[0].props['data-skill-pages'],catalog.skills.filter(skill=>skill.industry==='tourism'&&skill.module===wanted.module).length);
  find(rendered,'input').props.onChange({target:{value:'不存在的任务XYZ'}});
  rendered=env.render({sector});
  assert.equal(skillPages(rendered).length,0);
  find(rendered,'button','清除筛选').props.onClick();
  assert.equal(skillPages(env.render({sector})).length,1);
});

test('skill bindings navigate to the corresponding Agent, Harness, and back to a skill',async()=>{
  const [env,tree]=await library();
  const skill=catalog.skills.find(skill=>skill.industry==='tourism');
  find(tree,'button',skill.agentId).props.onClick();
  let rendered=env.render({sector});
  assert.equal(recordRows(rendered).length,1);
  assert.ok(text(rendered).includes(catalog.agents.find(agent=>agent.id===skill.agentId).responsibility));
  find(rendered,'button',skill.id).props.onClick();
  rendered=env.render({sector});
  assert.equal(skillPages(rendered).length,1);
  assert.ok(text(rendered).includes(skill.acceptance));
  find(rendered,'button',skill.harnessIds[0]).props.onClick();
  rendered=env.render({sector});
  assert.equal(recordRows(rendered).length,1);
  assert.ok(text(rendered).includes(catalog.harness.find(item=>item.id===skill.harnessIds[0]).rule));
});

test('workflow steps expose real dependency and Agent mappings while keeping planned status',async()=>{
  const [env,tree]=await library();
  find(tree,'button','协作流程').props.onClick();
  let rendered=env.render({sector});
  assert.equal(recordRows(rendered).length,3);
  assert.ok(text(rendered).includes('等待步骤 01、02 完成'));
  assert.ok(text(rendered).includes('规划规格/待接入'));
  const workflow=catalog.workflows.find(item=>item.industry==='tourism');
  const agent=catalog.agents.find(item=>item.id===workflow.steps[0].agentId);
  find(rendered,'button',agent.name).props.onClick();
  rendered=env.render({sector});
  assert.equal(recordRows(rendered).length,1);
  assert.ok(text(rendered).includes(agent.id));
});


test('the reading page defaults to visible task, recipients, three metrics and honest verification state',async()=>{
  const [,tree]=await library();
  const skill=catalog.skills.find(item=>item.industry==='tourism');
  const page=skillPages(tree)[0];
  const visible=node=>node===null||node===undefined||typeof node==='boolean'?'':Array.isArray(node)?node.map(visible).join(''):typeof node==='object'?(node.type==='details'?'':typeof node.type==='function'?visible(node.type(node.props)):visible(node.props?.children)):String(node);
  assert.ok(visible(page).includes(skill.name));
  assert.ok(visible(page).includes(skill.schedule.dailyWork));
  assert.ok(visible(page).includes(skill.delivery.recipients.join('；')));
  for(const metric of skill.metrics){assert.ok(visible(page).includes(metric.name));assert.ok(visible(page).includes(`${metric.threshold}${metric.unit}`));assert.ok(visible(page).includes(metric.formula));}
  assert.ok(visible(page).includes(skill.verification.status));
  assert.ok(visible(page).includes('尚未测量'));
  assert.equal(skill.verification.sampleSize,0);
  assert.equal(skill.verification.observedValue,null);
});

test('schedule, delivery approval, suggested metrics and real verification state remain readable',async()=>{
  const [,tree]=await library();
  const skill=catalog.skills.find(item=>item.industry==='tourism');
  const row=skillPages(tree)[0];
  assert.ok(text(tree).includes('Asia/Shanghai'));
  assert.ok(text(tree).includes('建议上班时间'));
  assert.ok(text(row).includes(`${skill.schedule.startTime}—${skill.schedule.endTime}`));
  assert.ok(text(row).includes(skill.schedule.dailyWork));
  assert.ok(text(row).includes(skill.delivery.dispatchMode));
  assert.ok(text(row).includes(skill.delivery.time));
  assert.ok(text(row).includes(skill.metrics[0].basis));
  assert.ok(text(row).includes('尚未测量'));
  assert.ok(text(row).includes(skill.verification.result));
});

test('a catalog load failure provides retry and the same real workbook download',async()=>{
  const [env,tree]=await library({failFetch:true});
  assert.ok(text(tree).includes('清单暂时无法载入'));
  assert.equal(find(tree,'a','下载八业完整 Excel').props.href,'/resources/skills/xian-eight-industries-skills.xlsx');
  env.setFetchFailure(false);
  find(tree,'button','重新加载').props.onClick();
  env.render({sector});await flush();
  assert.equal(skillPages(env.render({sector})).length,1);
});

test('the research reader navigates real slide metadata and reaches page 31',async()=>{
  const env=environment('ResearchViewer');env.render();await flush();
  let tree=env.render();
  assert.equal(find(tree,'img').props.src,research.slides[0].src);
  assert.equal(find(tree,'button','上一页').props.disabled,true);
  find(tree,'button','下一页').props.onClick();tree=env.render();
  assert.equal(find(tree,'img').props.src,research.slides[1].src);
  find(tree,'select').props.onChange({target:{value:'30'}});tree=env.render();
  assert.equal(find(tree,'img').props.src,research.slides[30].src);
  assert.equal(find(tree,'button','下一页').props.disabled,true);
  assert.equal(find(tree,'a','打开 PDF').props.href,research.pdf);
  find(tree,'img').props.onError();tree=env.render();
  assert.equal(find(tree,'a','在 PDF 中查看本页').props.href,`${research.pdf}#page=31`);
  env.listeners.get('keydown')({key:'ArrowLeft',preventDefault(){}});tree=env.render();
  assert.equal(find(tree,'img').props.src,research.slides[29].src);
});

test('a metadata failure keeps the research PDF accessible',async()=>{
  const env=environment('ResearchViewer',{failFetch:true});env.render();await flush();
  assert.equal(find(env.render(),'a','查看完整 PDF').props.href,'/resources/drug-factor-b/factor-b-research.pdf');
});

function revealEnvironment(options){
  const env=environment('Reveal',options),events=new Map(),properties=new Map(),classes=new Set();
  const root={getBoundingClientRect:()=>({left:0,top:0}),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const mask={style:{setProperty:(key,value)=>properties.set(key,value)},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}};
  const render=()=>env.render({sector},tree=>{all(tree,node=>node.props?.ref).forEach(node=>{node.props.ref.current=node.props.className.startsWith('reveal-world')?root:mask;});});
  return {env,events,properties,classes,render};
}

test('the actual reveal follows the pointer, supports touch, and exposes a keyboard button',()=>{
  const {events,properties,classes,render}=revealEnvironment();let tree=render();
  events.get('pointermove')({clientX:100,clientY:80,pointerType:'mouse'});
  assert.equal(properties.get('--mx'),'100px');assert.ok(classes.has('is-active'));
  events.get('pointermove')({clientX:200,clientY:80,pointerType:'mouse'});
  assert.equal(properties.get('--mx'),'110px');
  events.get('pointerleave')();assert.ok(!classes.has('is-active'));
  events.get('pointerdown')({clientX:90,clientY:60,pointerType:'touch'});
  assert.equal(properties.get('--mx'),'90px');assert.ok(classes.has('is-active'));
  events.get('pointerup')({pointerType:'touch'});assert.ok(!classes.has('is-active'));
  find(tree,'button','查看内层').props.onClick();tree=render();
  assert.equal(find(tree,'button','回到外层').props['aria-pressed'],true);
});

test('reduced motion places the reveal immediately and schedules no animation frames',()=>{
  const {events,properties,env,render}=revealEnvironment({reducedMotion:true});render();
  events.get('pointermove')({clientX:30,clientY:20,pointerType:'mouse'});
  events.get('pointermove')({clientX:250,clientY:150,pointerType:'mouse'});
  assert.equal(properties.get('--mx'),'250px');assert.equal(properties.get('--my'),'150px');
  assert.equal(env.frameCallbacks.size,0);
});


test('all eight primary actions say 探索 Skills and navigate directly to the readable list',()=>{
  for(const industry of catalog.industries){
    const env=environment('SectorPage');
    const tree=env.render({sector:{...sector,slug:industry.id,id:industry.id==='retail'?'finance':industry.id,name:industry.name}});
    const action=find(tree,'a','探索 Skills');
    assert.equal(action.props.href,'#sector-work');
    let prevented=false;
    action.props.onClick({preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
    assert.equal(env.actions[0].id,'sector-work');
    assert.equal(env.actions[0].kind,'scroll');
    assert.equal(env.actions[0].options.behavior,'instant');
    assert.equal(env.actions[1].id,'skills-library-title');
    assert.equal(env.actions[1].kind,'focus');
    assert.equal(find(tree,'a','演讲稿').props.href,'/resources/speech/xian-ai-partner-speech-a4.pdf');
    if(industry.id==='drug')assert.equal(find(tree,'a','药研案例 · 31页').props.href,'#/research/factor-b');
  }
});

function pagerEnvironment(options={}){
  const env=environment('SkillPager',options),classes=new Set(),captures=new Set(),scrollCalls=[];
  const element={clientWidth:1000,scrollLeft:0,style:{},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)},setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),scrollTo(options){scrollCalls.push(options);this.scrollLeft=options.left;}};
  const render=()=>env.render({count:167,renderPage:index=>({type:'article',props:{children:`Skill ${index+1}`}})},tree=>{find(tree,'div').props;all(tree,node=>node.props.ref).forEach(node=>{node.props.ref.current=element;});});
  const viewport=tree=>all(tree,node=>node.props.className==='skill-pager-viewport')[0];
  const event=(extra={})=>({currentTarget:element,target:{closest:()=>null},pointerId:1,pointerType:'mouse',button:0,clientX:900,clientY:100,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra});
  const scroll=(tree,left)=>{element.scrollLeft=left;viewport(tree).props.onScroll(event());return render();};
  const button=(tree,label)=>all(tree,node=>node.type==='button'&&node.props['aria-label']===label)[0];
  return {env,element,classes,captures,scrollCalls,render,viewport,event,scroll,button};
}

test('the real pager keeps at most five detailed pages mounted and marks only the current one accessible',()=>{
  const p=pagerEnvironment();let tree=p.render();
  assert.equal(all(tree,node=>node.type==='article').length,3);
  assert.equal(p.button(tree,'上一个 Skill').props.disabled,true);
  tree=p.scroll(tree,3000);
  assert.equal(all(tree,node=>node.type==='article').length,5);
  assert.equal(all(tree,node=>node.props['data-page']!==undefined&&!node.props.inert).length,1);
  const active=all(tree,node=>node.props['data-page']===3)[0];
  assert.equal(active.props['aria-hidden'],false);
  assert.ok(text(active).includes('Skill 4'));
  tree=p.scroll(tree,166000);
  assert.equal(all(tree,node=>node.type==='article').length,3);
  assert.equal(p.button(tree,'下一个 Skill').props.disabled,true);
});

test('pager buttons and focused left/right keys use native smooth scrolling without changing vertical position',()=>{
  const p=pagerEnvironment();let tree=p.render();
  p.button(tree,'下一个 Skill').props.onClick();
  assert.equal(p.scrollCalls.at(-1).left,1000);
  assert.equal(p.scrollCalls.at(-1).behavior,'smooth');
  assert.equal('top' in p.scrollCalls.at(-1),false);
  tree=p.scroll(tree,1000);
  const right=p.event({key:'ArrowRight'});p.viewport(tree).props.onKeyDown(right);
  assert.equal(right.prevented,true);assert.equal(p.scrollCalls.at(-1).left,2000);
  const editing=p.event({key:'ArrowLeft',target:{closest:()=>({tagName:'INPUT'})}}),before=p.scrollCalls.length;
  p.viewport(tree).props.onKeyDown(editing);assert.equal(p.scrollCalls.length,before);assert.equal(editing.prevented,undefined);
  const vertical=p.event({key:'ArrowDown'});p.viewport(tree).props.onKeyDown(vertical);assert.equal(vertical.prevented,undefined);
});

test('mouse drag follows the pointer across several pages, then snaps and cancels the generated click',()=>{
  const p=pagerEnvironment();let tree=p.render(),surface=p.viewport(tree);
  surface.props.onPointerDown(p.event());
  const move=p.event({clientX:-2400});surface.props.onPointerMove(move);
  assert.equal(p.element.scrollLeft,3300);assert.equal(move.prevented,true);assert.ok(p.classes.has('is-dragging'));
  tree=p.scroll(tree,p.element.scrollLeft);surface=p.viewport(tree);
  assert.ok(text(all(tree,node=>node.props['data-page']===3)[0]).includes('Skill 4'));
  surface.props.onPointerUp(p.event({clientX:-2400}));
  assert.equal(p.scrollCalls.at(-1).left,3000);assert.equal(p.element.style.scrollSnapType,'');assert.equal(p.captures.size,0);
  const click=p.event();surface.props.onClickCapture(click);assert.equal(click.prevented,true);assert.equal(click.stopped,true);
  const next=p.event();surface.props.onClickCapture(next);assert.equal(next.prevented,undefined);
});

test('touch and vertical gestures stay native, and interactive controls never arm a drag',()=>{
  const p=pagerEnvironment(),tree=p.render(),surface=p.viewport(tree);
  surface.props.onPointerDown(p.event({pointerType:'touch'}));surface.props.onPointerMove(p.event({pointerType:'touch',clientX:300}));
  assert.equal(p.element.scrollLeft,0);assert.equal(p.captures.size,0);
  surface.props.onPointerDown(p.event({target:{closest:()=>({tagName:'BUTTON'})}}));surface.props.onPointerMove(p.event({clientX:300}));
  assert.equal(p.element.scrollLeft,0);assert.equal(p.captures.size,0);
  surface.props.onPointerDown(p.event());const vertical=p.event({clientX:898,clientY:180});surface.props.onPointerMove(vertical);
  assert.equal(vertical.prevented,undefined);assert.equal(p.captures.size,0);assert.equal(p.element.scrollLeft,0);
});

test('reduced motion jumps immediately, distant jumps stay populated, and resizing retains the same page',()=>{
  const p=pagerEnvironment({reducedMotion:true});let tree=p.render();
  p.button(tree,'下一个 Skill').props.onClick();assert.equal(p.scrollCalls.at(-1).behavior,'instant');
  tree=p.render();assert.ok(text(all(tree,node=>node.props['data-page']===1)[0]).includes('Skill 2'));
  p.viewport(tree).props.onKeyDown(p.event({key:'End'}));tree=p.render();
  assert.equal(p.scrollCalls.at(-1).left,166000);assert.ok(text(all(tree,node=>node.props['data-page']===166)[0]).includes('Skill 167'));
  p.element.clientWidth=400;p.env.resizers[0]();assert.equal(p.scrollCalls.at(-1).left,66400);assert.equal(p.scrollCalls.at(-1).behavior,'instant');
});
