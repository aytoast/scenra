import * as THREE from 'three'

// Two cameras render one scene and one scripted spatial pose. No image assets.
export function buildSpatialStudy(instance, {primitives,temple,props,actor,bind,colors}) {
  const {scene,renderer,camera,mount}=instance
  const p=primitives(scene),root=new THREE.Group()
  scene.add(root)
  temple(p,root,true)
  props(p,root)
  const performers=[actor(p,root,colors.light),actor(p,root,colors.rust)]
  performers[0].group.position.set(-.62,0,-.35)
  performers[1].group.position.set(.64,0,-.35)
  performers[0].group.rotation.y=.55
  performers[1].group.rotation.y=-.55
  p.cylinder(.12,.16,2.6,colors.roof,[-1.25,1.3,1.35],root)

  const rig=new THREE.Group()
  root.add(rig)
  const operator=actor(p,rig,colors.grey)
  operator.group.position.y=.16
  const pose=bind.map(point=>[...point])
  pose[9]=[-.25,1.19,.07];pose[10]=[-.22,1.02,.12]
  pose[15]=[.27,1.25,-.10];pose[16]=[.24,1.18,-.28]
  pose[21]=[-.13,.074,0];pose[22]=[-.13,.015,.12]
  pose[25]=[.13,.074,0];pose[26]=[.13,.015,.12]
  operator.pose(pose.flat())
  const headset=new THREE.Group()
  headset.position.set(0,1.85,-.04)
  rig.add(headset)
  p.box([.28,.135,.13],colors.light,[0,0,-.10],headset)
  p.box([.24,.085,.014],colors.ink,[0,0,-.173],headset,false)
  for(const x of [-.13,.13])p.box([.025,.05,.21],colors.ink,[x,0,.018],headset,false)
  p.box([.055,.022,.23],colors.ink,[0,.11,.015],headset,false)
  p.box([.055,.045,.085],colors.light,[.24,1.34,-.30],rig,false)
  p.box([.62,.075,.25],colors.rust,[0,.13,0],rig)
  for(const x of [-.29,.29]){
    const wheel=p.cylinder(.105,.105,.07,colors.ink,[x,.105,0],rig)
    wheel.rotation.z=Math.PI/2
  }

  const observation=new THREE.PerspectiveCamera(43,1,.1,70)
  observation.position.set(7,5.3,8.8)
  observation.lookAt(0,.9,.35)
  observation.layers.enable(1)
  // Hide operator and view frustum from capture, retain them in observer camera.
  rig.traverse(object=>object.layers.set(1))
  const previewCamera=camera.clone()
  previewCamera.far=4.8
  const frustum=new THREE.CameraHelper(previewCamera)
  frustum.setColors(new THREE.Color(0xb2cfb9),new THREE.Color(0xb2cfb9),new THREE.Color(0xb2cfb9),new THREE.Color(0xb2cfb9),new THREE.Color(0xb2cfb9))
  frustum.material.transparent=true;frustum.material.opacity=.48
  frustum.layers.set(1)
  scene.add(frustum)
  const routePoints=Array.from({length:41},(_,i)=>new THREE.Vector3(-2.35+i/40*4.5,.035,2.4+Math.sin(i/40*Math.PI)*.18))
  const route=new THREE.Line(new THREE.BufferGeometry().setFromPoints(routePoints),new THREE.LineDashedMaterial({color:0xb2cfb9,dashSize:.12,gapSize:.09,transparent:true,opacity:.6}))
  route.computeLineDistances();route.layers.set(1);root.add(route)
  const target=new THREE.Vector3(0,1.2,-.35)
  const form=mount.closest('figure'),positionInput=form.querySelector('[data-capture="position"]'),fovInput=form.querySelector('[data-capture="fov"]')
  const events=new AbortController()
  let cursor=0,manualPose=false
  function updateFrustum(){
    previewCamera.position.copy(camera.position);previewCamera.quaternion.copy(camera.quaternion)
    previewCamera.fov=camera.fov;previewCamera.aspect=camera.aspect
    previewCamera.updateProjectionMatrix();previewCamera.updateMatrixWorld(true);frustum.update()
  }
  function invalidate(){instance.dirty=true;window.dispatchEvent(new Event('scenra-visual-change'))}
  positionInput.addEventListener('input',()=>{
    manualPose=true
    instance.elapsed=Number(positionInput.value)*12000
    instance.paused=true
    const button=form.querySelector('[data-play]')
    button.textContent=button.dataset.resume;button.setAttribute('aria-pressed','true')
    invalidate()
  },{signal:events.signal})
  fovInput.addEventListener('input',()=>{
    camera.fov=Number(fovInput.value);camera.updateProjectionMatrix()
    fovInput.parentElement.querySelector('output').textContent=camera.fov+'°'
    invalidate()
  },{signal:events.signal})
  instance.resizeScene=()=>{}
  instance.update=(elapsed,reduced)=>{
    const phase=(elapsed%24000)/24000
    cursor=reduced&&!manualPose ? .62 : phase<=.5 ? phase*2 : 2-phase*2
    const travel=cursor*cursor*(3-2*cursor)
    rig.position.set(-2.35+travel*4.5,0,2.4+Math.sin(travel*Math.PI)*.18)
    rig.rotation.y=Math.atan2(rig.position.x-target.x,rig.position.z-target.z)
    headset.rotation.x=-Math.atan2(.65,Math.hypot(rig.position.x-target.x,rig.position.z-target.z))
    rig.updateMatrixWorld(true)
    camera.position.set(0,0,-.18).applyMatrix4(headset.matrixWorld)
    camera.lookAt(target)
    camera.updateMatrixWorld(true)
    updateFrustum()
    positionInput.value=String(cursor)
    mount.dataset.cameraPose=camera.position.toArray().map(value=>value.toFixed(3)).join(',')
    mount.dataset.views='shared-scene'
  }
  instance.renderFrame=()=>{
    const width=mount.clientWidth,height=mount.clientHeight,stacked=matchMedia('(max-width:600px)').matches
    const panes=stacked?[[0,height/2,width,height/2],[0,0,width,height/2]]:[[0,0,width/2,height],[width/2,0,width/2,height]]
    renderer.autoClear=false
    renderer.setScissorTest(true)
    ;[camera,observation].forEach((view,i)=>{
      const [x,y,w,h]=panes[i]
      view.aspect=w/Math.max(1,h);view.updateProjectionMatrix()
      if(i===0)updateFrustum()
      renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h)
      renderer.clear(true,true,true)
      renderer.render(scene,view)
    })
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height)
    renderer.autoClear=true
  }
  instance.cleanupExtra=()=>{events.abort();p.gradient.dispose()}
}
