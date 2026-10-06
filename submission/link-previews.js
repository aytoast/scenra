// Local previews keep article reading independent of third-party metadata requests.
window.mountLinkPreviews = function (language, content) {
  const zh = language === 'zh';
  const records = [
    {name:'World Labs',url:'https://www.worldlabs.ai/blog/marble-world-model',source:'World Labs',description:zh?'从场景图片构建三维环境。':'Build 3D environments from images.'},
    {name:'Tripo',url:'https://www.tripo3d.ai/',source:'Tripo',description:zh?'生成独立 3D 道具，接入场景布置与物理交互。':'Generate independent 3D props for staging and physical interaction.'},
    {name:'ARDY',url:'https://research.nvidia.com/labs/sil/projects/ardy/',source:'NVIDIA Research',description:zh?'人物动作模型，提供导演台中的动作来源。':'Character motion model supplying movement for director workspace.'},
    {name:'Rapier',url:'https://rapier.rs/',source:'Rapier',description:zh?'刚体物理引擎，计算配置的重力与碰撞。':'Rigid-body physics engine for configured gravity and collisions.'},
    {name:'Three.js',url:'https://threejs.org/',source:'Three.js',description:zh?'用于场景、人物、道具与摄影机的三维渲染。':'3D rendering for scenes, actors, props and cameras.'},
    {name:'Blender',url:'https://www.blender.org/features/',source:'Blender',description:zh?'三维建模、动画与摄影机工作区。':'3D modeling, animation and camera workspace.'},
    {name:'Higgsfield',url:'https://higgsfield.ai/blog/higgsfield-3d-jutsu',source:'Higgsfield',description:zh?'3D Jutsu 的官方流程：场景、动画时间线、摄影机与参考视频。':'Official 3D Jutsu workflow: scenes, animation timelines, cameras and reference video.'},
    {name:'PICO',url:'https://developer.picoxr.com/document/web/',source:'PICO Developer',description:zh?'官方 Web 开发文档，介绍浏览器与 WebXR 接入。':'Official web development documentation covering browser and WebXR integration.'},
    {name:'WebXR',url:'https://www.w3.org/TR/webxr/',source:'W3C',description:zh?'浏览器中的 XR 设备接口，包括空间位姿、视图与输入。':'Browser XR device interfaces covering spatial poses, views and input.'},
    {name:'Perspective Camera',url:'https://threejs.org/docs/pages/PerspectiveCamera.html',source:'Three.js Docs',title:'PerspectiveCamera',description:zh?'透视摄影机。位置与朝向决定视点，FOV 决定视野范围。':'Perspective camera. Position and orientation define viewpoint; FOV defines field of view.'},
    {name:zh?'动态刚体':'dynamic rigid bodies',url:'https://rapier.rs/docs/user_guides/javascript/rigid_bodies/',source:'Rapier Docs',description:zh?'动态刚体根据质量、重力、外力和接触更新运动状态。':'Dynamic rigid-body motion responds to mass, gravity, applied forces and contact.'},
    {name:zh?'碰撞体':'colliders',url:'https://rapier.rs/docs/user_guides/javascript/colliders/',source:'Rapier Docs',description:zh?'定义物理接触的几何形状，以及摩擦和反弹等接触属性。':'Geometry for physical contact, with properties such as friction and restitution.'},
    ...content.references.slice(0,3).map(([title,description,url],i)=>({name:['Morpheus','How Far is Video Generation from World Model','GEN3C'][i],title,url,source:'arXiv',description,reference:['2504.02918','2411.02385','2503.03751'][i]}))
  ];
  const controller = new AbortController();
  const options = {signal:controller.signal};
  let active = null, openTimer, closeTimer, touchLink = null, touchWasOpen = false;
  const card = document.createElement('aside');
  card.id='link-preview';card.className='link-preview';card.hidden=true;
  card.setAttribute('aria-label',zh?'链接预览':'Link preview');
  document.body.append(card);
  const byUrl = new Map(records.map(record=>[record.url,record]));
  const pattern = new RegExp([...records].sort((a,b)=>b.name.length-a.name.length).map(record=>record.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  function recordFor(link) {
    const direct = byUrl.get(link.href);
    if (direct) return direct;
    const match = link.origin === location.origin && link.pathname === location.pathname && link.hash.match(/^#ref-(\d+)$/);
    return match ? byUrl.get(content.references[Number(match[1])-1]?.[2]) : undefined;
  }
  // Only annotate prose, preserving titles, reference anchors and existing links.
  const walker = document.createTreeWalker(document.querySelector('article'),NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement.closest('p,dt,dd,li')&&!node.parentElement.closest('a,button,script,sup,h1,h2,h3')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const matches=[...node.textContent.matchAll(pattern)];if(!matches.length)continue;
    const fragment=document.createDocumentFragment();let start=0;
    for(const match of matches){
      fragment.append(node.textContent.slice(start,match.index));
      const record=records.find(item=>item.name===match[0]);
      const link=document.createElement('a');link.className='reference-chip';link.href=record.url;link.target='_blank';link.rel='noopener';link.textContent=match[0];fragment.append(link);start=match.index+match[0].length;
    }
    fragment.append(node.textContent.slice(start));node.replaceWith(fragment);
  }
  function hide(){clearTimeout(openTimer);clearTimeout(closeTimer);if(active){active.removeAttribute('aria-describedby');active=null}card.hidden=true}
  function scheduleHide(){clearTimeout(openTimer);clearTimeout(closeTimer);closeTimer=setTimeout(hide,180)}
  function show(link){
    clearTimeout(openTimer);clearTimeout(closeTimer);
    const record=recordFor(link);if(!record)return;
    if(active)active.removeAttribute('aria-describedby');active=link;
    card.replaceChildren();
    if(record.image){const image=document.createElement('img');image.src=record.image;image.alt='';image.className='preview-image';card.append(image)}
    else if(record.reference){const banner=document.createElement('div');banner.className='preview-paper';banner.textContent='arXiv:'+record.reference;card.append(banner)}
    const body=document.createElement('div');body.className='preview-body';
    const source=document.createElement('div');source.className='preview-source';source.textContent=record.source;
    const domain=document.createElement('div');domain.className='preview-domain';domain.textContent=new URL(record.url).hostname;
    const title=document.createElement('a');title.className='preview-title';title.href=record.url;title.target='_blank';title.rel='noopener';title.textContent=record.title||record.name;
    const description=document.createElement('p');description.textContent=record.description;
    body.append(source,domain,title,description);card.append(body);card.hidden=false;
    link.setAttribute('aria-describedby',card.id);
    const bounds=link.getBoundingClientRect(),width=card.offsetWidth,height=card.offsetHeight;
    let left=bounds.right+12;if(left+width>innerWidth-12)left=bounds.left-width-12;
    left=Math.max(12,Math.min(left,innerWidth-width-12));
    let top=bounds.top-24;
    if(innerWidth<600)top=bounds.bottom+10;
    card.style.left=left+'px';card.style.top=Math.max(12,Math.min(top,innerHeight-height-12))+'px';
  }
  for(const link of document.querySelectorAll('article a')){
    if(!recordFor(link))continue;
    link.dataset.preview='true';
    link.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'){touchLink=link;touchWasOpen=active===link}},options);
    link.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;clearTimeout(closeTimer);openTimer=setTimeout(()=>show(link),160)},options);
    link.addEventListener('pointerleave',scheduleHide,options);
    link.addEventListener('focus',()=>show(link),options);
    link.addEventListener('blur',event=>{if(!card.contains(event.relatedTarget))scheduleHide()},options);
    link.addEventListener('click',event=>{if((touchLink===link&&!touchWasOpen)||(matchMedia('(hover: none)').matches&&active!==link)){event.preventDefault();show(link)}touchLink=null},options);
  }
  card.addEventListener('pointerenter',()=>clearTimeout(closeTimer),options);
  card.addEventListener('pointerleave',scheduleHide,options);
  card.addEventListener('focusin',()=>clearTimeout(closeTimer),options);
  card.addEventListener('focusout',event=>{if(event.relatedTarget!==active&&!card.contains(event.relatedTarget))scheduleHide()},options);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide()},options);
  document.addEventListener('pointerdown',event=>{if(!card.contains(event.target)&&!event.target.closest('[data-preview]'))hide()},options);
  window.addEventListener('scroll',hide,{...options,passive:true});
  window.addEventListener('resize',hide,options);
  return ()=>{hide();controller.abort();card.remove()};
};
