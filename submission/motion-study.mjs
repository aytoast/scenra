import * as THREE from 'three'
import {PUNCH,sampleActor,createPunchEdit} from './punch-edit.mjs'

export function buildMotionStudy(instance,primitives,actor,bind,colors,loadMotion){
  const {scene,camera,mount,renderer}=instance,p=primitives(scene),root=new THREE.Group()
  scene.add(root)
  const origins=[0,4]
  const takes=origins.map(x=>{
    const group=new THREE.Group();group.position.x=x;root.add(group)
    p.box([3.4,.065,2.2],0x29342e,[.25,-.055,0],group)
    return {group,actors:[actor(p,group,colors.light),actor(p,group,colors.rust)]}
  })
  const cameras=origins.map(x=>{const view=camera.clone();view.position.set(x+.12,2.35,5);view.lookAt(x+.15,1.0,0);return view})
  const marker=p.sphere(.032,0xe99575,[0,0,0],takes[1].group)
  const trace=new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:28},()=>new THREE.Vector3())),new THREE.LineBasicMaterial({color:0xe99575,transparent:true,opacity:.5}))
  takes[1].group.add(trace);marker.visible=trace.visible=false
  const form=mount.closest('figure'),settings={height:0,windup:.18,duration:.15},events=new AbortController()
  const apply=form.querySelector('[data-apply-punch]'),status=form.querySelector('[data-edit-status]'),timeline=form.querySelector('[data-study-time]')
  let motion,editor,applied=false,scrubbing=false,seek=PUNCH.start
  const labels=form.querySelectorAll('[data-take-label]')
  function invalidate(){instance.dirty=true;window.dispatchEvent(new Event('scenra-visual-change'))}
  function updateStatus(){status.textContent=status.dataset.applied.replace('18 cm',Math.round(settings.windup*100)+' cm').replace('150 ms',Math.round(settings.duration*1000)+' ms')}
  function applyEdit(){
    if(!motion)return
    applied=true;scrubbing=false;instance.elapsed=0;instance.paused=false
    const play=form.querySelector('[data-play]');play.textContent=play.dataset.pause;play.setAttribute('aria-pressed','false')
    form.querySelector('.study-inputs').hidden=false
    labels[1].textContent=labels[1].dataset.edited
    apply.setAttribute('aria-pressed','true')
    updateStatus()
    mount.dataset.edit='applied';invalidate()
  }
  apply.addEventListener('click',applyEdit,{signal:events.signal})
  for(const input of form.querySelectorAll('[data-study]')){
    input.addEventListener('input',()=>{
      settings[input.dataset.study]=Number(input.value)
      input.parentElement.querySelector('output').textContent=input.dataset.study==='duration'?Math.round(Number(input.value)*1000)+' ms':'+'+Math.round(Number(input.value)*100)+' cm'
      applied=true;mount.dataset.edit='applied';invalidate()
      updateStatus()
    },{signal:events.signal})
  }
  form.querySelector('[data-reset-study]').addEventListener('click',()=>{
    applied=false;scrubbing=false;instance.elapsed=0
    for(const input of form.querySelectorAll('[data-study]')){input.value=input.defaultValue;settings[input.dataset.study]=Number(input.value);input.parentElement.querySelector('output').textContent=input.dataset.study==='duration'?Math.round(Number(input.value)*1000)+' ms':'+'+Math.round(Number(input.value)*100)+' cm'}
    form.querySelector('.study-inputs').hidden=true
    labels[1].textContent=labels[1].dataset.pending
    apply.setAttribute('aria-pressed','false');status.textContent=status.dataset.original
    mount.dataset.edit='original';invalidate()
  },{signal:events.signal})
  timeline.addEventListener('input',()=>{
    seek=Number(timeline.value);scrubbing=true;instance.paused=true
    const button=form.querySelector('[data-play]');button.textContent=button.dataset.resume;button.setAttribute('aria-pressed','true')
    invalidate()
  },{signal:events.signal})
  form.querySelector('[data-play]').addEventListener('click',()=>{if(!instance.paused){scrubbing=false;instance.elapsed=(seek-PUNCH.start+.35)*1000}},{signal:events.signal})
  form.querySelector('[data-restart]').addEventListener('click',()=>{scrubbing=false;invalidate()},{signal:events.signal})
  instance.resizeScene=()=>{}
  instance.update=(elapsed,reduced)=>{
    if(!motion)return
    const phase=elapsed/1000%3.8
    const t=scrubbing?seek:reduced?PUNCH.windup:Math.min(PUNCH.end,PUNCH.start+Math.max(0,phase-.35))
    seek=t;timeline.value=String(t);form.querySelector('[data-study-clock]').textContent=t.toFixed(2)+' s'
    takes.forEach((take,index)=>{
      take.actors[0].pose(index&&applied?editor.edit(t,settings):sampleActor(motion,0,t))
      take.actors[1].pose(sampleActor(motion,1,t))
    })
    marker.visible=trace.visible=applied
    if(applied){
      const target=editor.targets(settings);marker.position.set(...target.windup)
      const positions=trace.geometry.attributes.position
      for(let j=0;j<positions.count;j++){const point=editor.edit(target.windupTime+settings.duration*j/(positions.count-1),settings);positions.setXYZ(j,point[30],point[31],point[32])}
      positions.needsUpdate=true
    }
    const stage=t<(applied?PUNCH.contact-settings.duration:PUNCH.windup)?0:t<PUNCH.contact?1:t<3.82?2:3
    form.querySelectorAll('[data-phase]').forEach((el,i)=>el.classList.toggle('active',i===stage))
    mount.dataset.edit=applied?'applied':'original';mount.dataset.motionTime=t.toFixed(3)
    const original=sampleActor(motion,0,t),edited=applied?editor.edit(t,settings):original
    mount.dataset.originalWrist=Array.from(original.slice(30,33)).map(v=>v.toFixed(4)).join(',')
    mount.dataset.editedWrist=Array.from(edited.slice(30,33)).map(v=>v.toFixed(4)).join(',')
  }
  instance.renderFrame=()=>{
    const width=mount.clientWidth,height=mount.clientHeight,stacked=matchMedia('(max-width:600px)').matches
    const panes=stacked?[[0,height/2,width,height/2],[0,0,width,height/2]]:[[0,0,width/2,height],[width/2,0,width/2,height]]
    renderer.autoClear=false;renderer.setScissorTest(true)
    cameras.forEach((view,i)=>{
      const [x,y,w,h]=panes[i],aspect=w/Math.max(1,h),viewHeight=Math.max(2.5,2.8/aspect)
      view.left=-viewHeight*aspect/2;view.right=-view.left;view.top=viewHeight/2;view.bottom=-viewHeight/2;view.updateProjectionMatrix()
      renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.clear(true,true,true);renderer.render(scene,view)
    })
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.autoClear=true
  }
  instance.cleanupExtra=()=>{events.abort();p.gradient.dispose()}
  apply.disabled=true
  const url=new URL(mount.dataset.motionUrl||'assets/fight-fall.json',document.baseURI)
  loadMotion(url.href).then(value=>{
    if(instance.disposed)return
    motion=value;editor=createPunchEdit(value);apply.disabled=false
    mount.dataset.motion='saved-ardy-keyframe-preview';instance.elapsed=0;invalidate()
  }).catch(()=>{
    if(instance.disposed)return
    status.textContent=status.dataset.unavailable;mount.dataset.motion='unavailable';invalidate()
  })
}
