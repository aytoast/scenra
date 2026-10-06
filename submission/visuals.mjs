import * as THREE from 'three'
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js'
import { buildMotionStudy } from './motion-study.mjs'
import { buildSpatialStudy } from './spatial-study.mjs'

// Independent website illustrations. No simulator, physics runtime, or iframe.
// Mount containers with data-visual="hero|scene|motion|monitor". Optional
// data-motion-url points to saved ARDY manifest; default is assets/fight-fall.json.
const COLORS = { paper: 0x191e1b, ink: 0x303b33, light: 0xe3e2d9, grey: 0xa4b0a7, roof: 0x78887b, rust: 0xc76b4d }
const PARENTS = [-1, 0, 1, 2, 3, 4, 5, 4, 7, 8, 9, 10, 10, 4, 13, 14, 15, 16, 16, 0, 19, 20, 21, 0, 23, 24, 25]
const BIND = [[0,.97,0],[0,1.04,-.047],[0,1.13,-.064],[0,1.23,-.072],[0,1.32,-.072],[0,1.57,-.037],[0,1.70,-.014],[-.032,1.50,-.019],[-.191,1.50,-.019],[-.486,1.50,-.019],[-.719,1.50,-.019],[-.789,1.50,-.019],[-.752,1.50,.013],[.032,1.50,-.019],[.191,1.50,-.019],[.486,1.50,-.019],[.719,1.50,-.019],[.789,1.50,-.019],[.752,1.50,.013],[-.095,.942,0],[-.095,.530,0],[-.095,.074,0],[-.095,.015,.161],[.095,.942,0],[.095,.530,0],[.095,.074,0],[.095,.015,.161]]
const Y = new THREE.Vector3(0, 1, 0)
const clamp = value => Math.min(1, Math.max(0, value))
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t) }
const instances = new Map()
const motionRequests = new Map()
let frameId = 0
let previousTime = 0
let listening = false
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

function savedMotion(manifestUrl) {
  if (!motionRequests.has(manifestUrl)) {
    motionRequests.set(manifestUrl, (async () => {
      const response = await fetch(manifestUrl)
      if (!response.ok) throw new Error('Saved ARDY manifest could not load.')
      const manifest = await response.json()
      if (manifest.version !== 1 || manifest.jointCount !== PARENTS.length || manifest.actorCount < 1 || manifest.actorCount > 8 || manifest.frameCount < 1 || manifest.frameCount > 36000 || !Number.isFinite(manifest.fps) || manifest.fps <= 0) throw new Error('Unsupported saved ARDY motion.')
      const binaryUrl = new URL(manifest.data, manifestUrl)
      if (binaryUrl.origin !== location.origin) throw new Error('Saved motion must use same origin.')
      const binary = await fetch(binaryUrl)
      if (!binary.ok) throw new Error('Saved ARDY motion could not load.')
      const buffer = await binary.arrayBuffer()
      const count = manifest.actorCount * manifest.frameCount * manifest.jointCount
      if (buffer.byteLength !== count * 12 * 4) throw new Error('Saved ARDY motion is incomplete.')
      const positions = new Float32Array(buffer, 0, count * 3)
      if (positions.some(value => !Number.isFinite(value))) throw new Error('Invalid saved ARDY positions.')
      return { manifest, positions }
    })())
  }
  return motionRequests.get(manifestUrl)
}

function line(points, opacity = .5, color = COLORS.ink) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)))
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  return new THREE.Line(geometry, material)
}

function primitives(scene) {
  const gradient = new THREE.DataTexture(new Uint8Array([120, 185, 245]), 3, 1, THREE.RedFormat)
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter
  gradient.needsUpdate = true
  const materials = new Map()
  const strokes = []
  const material = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshToonMaterial({ color, gradientMap: gradient }))
    return materials.get(color)
  }
  function mesh(geometry, color, position = [0, 0, 0], parent = scene, edges = false) {
    const object = new THREE.Mesh(geometry, material(color))
    object.position.set(...position)
    parent.add(object)
    if (edges) {
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), new THREE.LineBasicMaterial({ color: COLORS.ink, transparent: true, opacity: .63, depthWrite: false }))
      edge.renderOrder = 1
      object.add(edge)
      strokes.push({ edge, count: edge.geometry.attributes.position.count })
    }
    return object
  }
  const box = (size, color, position, parent, edges = true) => mesh(new THREE.BoxGeometry(...size), color, position, parent, edges)
  const sphere = (radius, color, position, parent) => mesh(new THREE.SphereGeometry(radius, 16, 10), color, position, parent)
  const cylinder = (top, bottom, height, color, position, parent, edges = false) => mesh(new THREE.CylinderGeometry(top, bottom, height, 12), color, position, parent, edges)
  function bar(from, to, radius, color, parent) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
    const object = cylinder(radius, radius, a.distanceTo(b), color, [0, 0, 0], parent)
    object.position.copy(a).add(b).multiplyScalar(.5)
    object.quaternion.setFromUnitVectors(Y, b.sub(a).normalize())
    return object
  }
  return { mesh, box, sphere, cylinder, bar, material, strokes, gradient }
}

function contact(parent, x, z, radius, opacity = .065) {
  const object = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color: COLORS.ink, transparent: true, opacity, depthWrite: false }))
  object.rotation.x = -Math.PI / 2
  object.position.set(x, .047, z)
  object.scale.y = .7
  parent.add(object)
  return object
}

function curvedRoof(p, parent, width, depth, height) {
  const positions = [], indices = [], columns = 8, rows = 10
  for (let row = 0; row <= rows; row++) {
    const z = (row / rows - .5) * depth, edge = Math.abs(z / (depth / 2))
    for (let column = 0; column <= columns; column++) {
      const x = (column / columns - .5) * width
      const y = height + .48 * (1 - edge) + .14 * edge ** 5 + .09 * (Math.abs(x) / (width / 2)) ** 6 * edge ** 3
      positions.push(x, y, z)
    }
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const index = row * (columns + 1) + column
    indices.push(index, index + columns + 1, index + 1, index + 1, index + columns + 1, index + columns + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const roof = p.mesh(geometry, COLORS.roof, [0, 0, 0], parent)
  roof.material.side = THREE.DoubleSide
  for (const row of [0, rows / 2, rows]) {
    const path = []
    for (let column = 0; column <= columns; column++) path.push(positions.slice((row * (columns + 1) + column) * 3, (row * (columns + 1) + column) * 3 + 3))
    parent.add(line(path, .72))
  }
  for (const column of [0, columns]) {
    const path = []
    for (let row = 0; row <= rows; row++) path.push(positions.slice((row * (columns + 1) + column) * 3, (row * (columns + 1) + column) * 3 + 3))
    parent.add(line(path, .72))
  }
}

function temple(p, root, full = true) {
  const pieces = []
  const floor = p.box([7.1, .11, 5.5], COLORS.light, [0, -.055, 0], root)
  for (let x = -3; x <= 3; x += 1) root.add(line([[x,.008,-2.5],[x,.008,2.5]], .085))
  for (let z = -2; z <= 2; z += 1) root.add(line([[-3.5,.008,z],[3.5,.008,z]], .085))
  function pavilion(width, depth, position, turn = 0) {
    const group = new THREE.Group()
    group.position.set(...position)
    group.rotation.y = turn
    root.add(group)
    p.box([width, .2, depth], COLORS.grey, [0, .1, 0], group)
    const count = Math.round(width / .9)
    for (let i = 0; i <= count; i++) {
      const x = -width / 2 + .14 + (width - .28) * i / count
      p.cylinder(.042, .055, 1.62, COLORS.grey, [x,.99,depth / 2 - .11], group)
      if (i < count) {
        const panelX = x + (width - .28) / count / 2
        p.box([.53,1.19,.07], COLORS.light, [panelX,.93,-depth / 2 + .07], group)
        for (const offset of [-.16,0,.16]) p.box([.012,.56,.016], COLORS.grey, [panelX+offset,1.14,-depth / 2 + .11], group, false)
        p.box([.52,.015,.017], COLORS.grey, [panelX,1.14,-depth / 2 + .12], group, false)
      }
    }
    curvedRoof(p, group, width + .45, depth + .46, 1.82)
    p.box([width + .25,.07,.085], COLORS.grey, [0,2.33,0], group)
    pieces.push({ group, position: group.position.clone(), order: pieces.length })
  }
  pavilion(5.4, 1.25, [-.6,0,-2.1])
  if (full) pavilion(3.2, 1.2, [-3.0,0,-.02], Math.PI / 2)
  const gate = new THREE.Group()
  gate.position.set(2.8,0,-2.1)
  root.add(gate)
  p.box([.25,1.75,.23], COLORS.grey, [-.47,.875,0], gate)
  p.box([.25,1.75,.23], COLORS.grey, [.47,.875,0], gate)
  p.box([1.19,.22,.22], COLORS.light, [0,1.71,0], gate)
  curvedRoof(p, gate, 1.55,.64,1.9)
  pieces.push({ group: gate, position: gate.position.clone(), order: pieces.length })
  // Bamboo silhouette: sparse stems and pointed leaves preserve quiet linework.
  const bamboo = new THREE.Group()
  bamboo.position.set(3.05,0,-.55)
  root.add(bamboo)
  for (let i = 0; i < 4; i++) {
    const x = (i-.5)*.15, height = 1.85 + (i%2)*.35
    p.bar([x,0,0],[x+.08,height,-.04],.012,COLORS.grey,bamboo)
    for (let j = 0; j < 3; j++) {
      const y = .8 + j*.39, side = j%2 ? -1 : 1
      const leaf = p.mesh(new THREE.ConeGeometry(.045,.4,3), COLORS.grey, [x+side*.14,y,.02], bamboo)
      leaf.rotation.z = -side*1.15
    }
  }
  return { pieces, floor, bamboo }
}

function props(p, root) {
  const items = []
  const bench = new THREE.Group()
  bench.position.set(-1.95,0,.8)
  root.add(bench)
  p.box([1.08,.10,.34], COLORS.grey, [0,.54,0], bench)
  for (const x of [-.4,.4]) for (const z of [-.10,.10]) p.box([.06,.5,.06], COLORS.light,[x,.25,z],bench)
  p.box([.89,.035,.03], COLORS.grey, [0,.26,.11],bench)
  items.push({ group: bench, position: bench.position.clone() })
  const table = new THREE.Group()
  table.position.set(1.12,0,.58)
  root.add(table)
  p.box([.8,.09,.61], COLORS.light,[0,.66,0],table)
  for (const x of [-.30,.30]) for (const z of [-.22,.22]) p.box([.055,.62,.055],COLORS.grey,[x,.31,z],table)
  p.cylinder(.12,.105,.025,COLORS.grey,[.15,.727,0],table)
  p.cylinder(.046,.035,.056,COLORS.paper,[-.12,.74,.08],table)
  items.push({ group: table, position: table.position.clone() })
  const burner = new THREE.Group()
  burner.position.set(2.14,0,-.64)
  root.add(burner)
  p.cylinder(.32,.22,.22,COLORS.grey,[0,.35,0],burner)
  const lip = p.mesh(new THREE.TorusGeometry(.30,.035,8,24),COLORS.light,[0,.47,0],burner)
  lip.rotation.x = Math.PI/2
  for (const x of [-.4,.4]) {
    const handle = p.mesh(new THREE.TorusGeometry(.105,.025,8,18),COLORS.grey,[x,.41,0],burner)
    handle.rotation.y = Math.PI/2
  }
  for (const angle of [0,2.1,4.2]) p.bar([Math.cos(angle)*.13,.25,Math.sin(angle)*.13],[Math.cos(angle)*.17,.04,Math.sin(angle)*.17],.036,COLORS.grey,burner)
  for (const x of [-.075,0,.075]) p.bar([x,.47,0],[x,.76,0],.006,COLORS.rust,burner)
  items.push({ group: burner, position: burner.position.clone() })
  for (const item of items) item.shadow=contact(root,item.position.x,item.position.z,.54)
  return items
}

function actor(p, parent, color = COLORS.light) {
  const group = new THREE.Group()
  parent.add(group)
  const joints = BIND.map(value => new THREE.Vector3(...value))
  const segments = [[19,20,.074],[20,21,.051],[23,24,.074],[24,25,.051],[8,9,.047],[9,10,.034],[14,15,.047],[15,16,.034],[7,8,.040],[13,14,.040],[5,6,.041]]
  const bones = segments.map(([a,b,radius]) => ({ a, b, object: p.cylinder(radius,radius*.94,1,color,[0,0,0],group) }))
  const torso = p.cylinder(.145,.13,1,color,[0,0,0],group)
  const pelvis = p.sphere(.135,color,[0,0,0],group)
  pelvis.scale.set(1.14,.64,.7)
  const head = p.sphere(.111,COLORS.light,[0,0,0],group)
  head.scale.set(.91,1.16,.95)
  const elbows = [9,15,20,24].map(index => ({ index, object: p.sphere(.043,color,[0,0,0],group) }))
  const hands = [10,16].map(index => ({ index, object: p.sphere(.045,color,[0,0,0],group) }))
  const feet = [[21,22],[25,26]].map(([a,b]) => ({ a,b,object:p.box([.08,.045,.17],COLORS.grey,[0,0,0],group,false) }))
  const direction = new THREE.Vector3()
  function connect(object, a, b) {
    const start=joints[a],end=joints[b]
    direction.subVectors(end,start)
    object.position.copy(start).add(end).multiplyScalar(.5)
    object.scale.y=Math.max(.015,direction.length())
    object.quaternion.setFromUnitVectors(Y,direction.normalize())
  }
  function pose(points) {
    joints.forEach((joint,index)=>joint.set(points[index*3],points[index*3+1],points[index*3+2]))
    bones.forEach(({a,b,object})=>connect(object,a,b))
    connect(torso,0,5)
    pelvis.position.copy(joints[0])
    head.position.copy(joints[6]).addScaledVector(Y,.035)
    elbows.concat(hands).forEach(({index,object})=>object.position.copy(joints[index]))
    feet.forEach(({a,b,object})=>{object.position.copy(joints[a]).add(joints[b]).multiplyScalar(.5);object.position.y+=.018})
  }
  const rest=BIND.map(point=>[...point])
  rest[9]=[-.25,1.18,.07];rest[10]=[-.17,1.02,.14]
  rest[15]=[.25,1.18,.07];rest[16]=[.17,1.02,.14]
  pose(rest.flat())
  return {group,pose}
}

function cameraRig(p, root) {
  const rail = new THREE.Group()
  rail.position.set(1.75,0,1.95)
  root.add(rail)
  for (const z of [-.20,.20]) p.bar([-1.6,.055,z],[1.6,.055,z],.026,COLORS.grey,rail)
  for (let x=-1.45;x<1.5;x+=.42) p.box([.045,.025,.56],COLORS.grey,[x,.026,0],rail,false)
  const dolly = new THREE.Group()
  rail.add(dolly)
  p.box([.51,.065,.43],COLORS.grey,[0,.16,0],dolly)
  for(const x of [-.2,.2])for(const z of[-.20,.20]){
    const wheel=p.cylinder(.061,.061,.04,COLORS.ink,[x,.11,z],dolly)
    wheel.rotation.x=Math.PI/2
  }
  p.cylinder(.035,.065,.65,COLORS.grey,[0,.5,0],dolly)
  const camera = new THREE.Group()
  camera.position.y=.88
  camera.rotation.y=.42
  dolly.add(camera)
  p.box([.29,.23,.30],COLORS.grey,[0,0,0],camera)
  const lens=p.cylinder(.062,.073,.2,COLORS.ink,[0,0,-.24],camera)
  lens.rotation.x=Math.PI/2
  p.box([.21,.16,.036],COLORS.ink,[0,0,-.35],camera)
  p.box([.035,.025,.19],COLORS.ink,[0,.16,.01],camera)
  p.box([.08,.025,.045],COLORS.ink,[-.13,.095,.06],camera)
  contact(root,1.75,1.95,.42)
  const boom=new THREE.Group()
  boom.position.set(-2.35,0,1.6)
  root.add(boom)
  p.bar([0,.02,0],[.10,1.73,0],.023,COLORS.grey,boom)
  p.bar([.10,1.73,0],[1.6,2.65,-1.14],.018,COLORS.ink,boom)
  const microphone=p.cylinder(.034,.034,.18,COLORS.ink,[1.63,2.62,-1.17],boom)
  microphone.rotation.z=.7
  for(const z of[-.16,.16])p.bar([0,.1,0],[.17,.01,z],.017,COLORS.grey,boom)
  return {rail,dolly,camera,boom}
}

function directorVillage(p, root, scene, renderer) {
  const group=new THREE.Group()
  group.position.set(-2.75,0,2.40)
  group.rotation.y=-.32
  root.add(group)
  const chair=new THREE.Group()
  group.add(chair)
  p.box([.39,.038,.35],COLORS.grey,[0,.43,0],chair)
  p.box([.37,.27,.025],COLORS.light,[0,.73,.16],chair)
  for(const x of[-.2,.2]){
    p.bar([x,.02,-.19],[x,.68,.17],.015,COLORS.ink,chair)
    p.bar([x,.02,.20],[x,.57,-.19],.015,COLORS.ink,chair)
    p.bar([x,.60,.15],[x,.60,-.2],.018,COLORS.ink,chair)
  }
  const director=actor(p,group,COLORS.grey)
  const seated=BIND.map(point=>[...point])
  for(let i=0;i<19;i++)seated[i][1]-=.37
  seated[19]=[-.1,.50,0];seated[23]=[.1,.50,0]
  seated[20]=[-.11,.44,-.32];seated[24]=[.11,.44,-.32]
  seated[21]=[-.11,.055,-.32];seated[25]=[.11,.055,-.32]
  seated[22]=[-.11,.035,-.44];seated[26]=[.11,.035,-.44]
  seated[9]=[-.25,.64,-.18];seated[15]=[.25,.64,-.18]
  seated[10]=[-.13,.60,-.30];seated[16]=[.13,.60,-.30]
  director.pose(seated.flat())
  for(const [x,z]of[[-.72,.27],[.61,.37],[.05,.96]]){
    const crew=actor(p,group,COLORS.light)
    crew.group.position.set(x,0,z)
    crew.group.rotation.y=x<0?-.3:.25
  }
  const monitor=new THREE.Group()
  monitor.position.set(0,1.03,-.8)
  group.add(monitor)
  p.box([.65,.41,.06],COLORS.ink,[0,0,0],monitor)
  p.bar([0,-.2,0],[0,-.86,0],.017,COLORS.grey,monitor)
  for(const x of[-.19,.19])p.bar([0,-.83,0],[x,-1.0,.11],.017,COLORS.grey,monitor)
  const target=new THREE.WebGLRenderTarget(256,160,{depthBuffer:true})
  target.texture.colorSpace=THREE.SRGBColorSpace
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(.59,.35),new THREE.MeshBasicMaterial({map:target.texture}))
  screen.position.set(0,0,.037)
  monitor.add(screen)
  const feedCamera=new THREE.PerspectiveCamera(46,256/160,.1,40)
  feedCamera.position.set(1.8,1.4,2.6)
  feedCamera.lookAt(0,1,-.28)
  let feedFrame=0
  return {
    target,
    renderFeed(){
      if(feedFrame++%3!==0)return
      renderer.setRenderTarget(target)
      renderer.setClearColor(COLORS.paper,1)
      renderer.clear()
      renderer.render(scene,feedCamera)
      renderer.setRenderTarget(null)
    },
  }
}

function build(instance) {
  if(instance.type==='detail'){buildMotionStudy(instance,primitives,actor,BIND,COLORS,savedMotion);return}
  if(instance.type==='capture'){buildSpatialStudy(instance,{primitives,temple,props,actor,bind:BIND,colors:COLORS});return}
  const {scene,renderer,type}=instance
  const p=primitives(scene), root=new THREE.Group()
  scene.add(root)
  const architecture=temple(p,root,type!=='motion')
  const items=props(p,root)
  const actors=[actor(p,root,COLORS.light),actor(p,root,COLORS.rust)]
  actors[0].group.position.set(-.75,.025,-.3)
  actors[1].group.position.set(.75,.025,-.3)
  const rig=cameraRig(p,root)
  const village=type==='monitor'?directorVillage(p,root,scene,renderer):null
  if(type==='motion'){
    rig.rail.visible=false
    rig.boom.visible=false
    architecture.pieces.forEach(({group})=>{group.visible=false})
    architecture.bamboo.visible=false
    items.forEach(({group,shadow})=>{group.visible=false;shadow.visible=false})
  }
  if(type==='scene'){
    rig.rail.visible=false
    rig.boom.visible=false
    rig.dolly.visible=false
    const column=p.cylinder(.42,.47,4.2,COLORS.roof,[.6,2.1,3],root)
    p.cylinder(.55,.55,.16,COLORS.grey,[.6,.08,3],root)
    p.cylinder(.53,.53,.18,COLORS.grey,[.6,4.16,3],root)
  }
  const frameCorners=line([[-3.42,.02,-2.66],[-3.42,.02,-2.9],[-3.1,.02,-2.9]],.55,COLORS.rust)
  root.add(frameCorners)
  const offset=new THREE.Vector3(), right=new THREE.Vector3()
  const camera=instance.camera
  const target=type==='motion'?new THREE.Vector3(0,.65,-.1):new THREE.Vector3(0,.5,0)
  const start=type==='motion'?new THREE.Vector3(4.5,3.5,7.6):new THREE.Vector3(8.5,7.2,10)
  camera.position.copy(start);camera.lookAt(target)
  instance.resizeScene=()=>{
    const width=instance.mount.clientWidth,height=instance.mount.clientHeight
    const aspect=width/Math.max(1,height)
    if(type==='scene'){camera.aspect=aspect;camera.updateProjectionMatrix();return}
    let viewHeight=type==='motion'?3.55:type==='hero'?8.65:type==='monitor'?8.1:6.65
    viewHeight=Math.max(viewHeight,(type==='motion'?4.2:8.4)/Math.max(.5,aspect))
    camera.left=-viewHeight*aspect/2;camera.right=-camera.left;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix()
    if(type==='hero'&&aspect>1.45){right.set(1,0,0).applyQuaternion(camera.quaternion);root.position.copy(right).multiplyScalar(viewHeight*aspect*.195)}else root.position.set(0,0,0)
  }
  const interpolated=new Float32Array(PARENTS.length*3)
  instance.update=(elapsed,isReduced)=>{
    const seconds=elapsed/1000
    const phase=(seconds%14)/14
    if(type==='hero'){
      const angle=isReduced?0:Math.sin(seconds*.095)*.075
      camera.position.copy(start).applyAxisAngle(Y,angle)
      camera.lookAt(target)
    }
    if(type==='scene'){
      const reveal=1
      architecture.pieces.forEach(({group,position,order})=>{
        const progress=1
        group.position.copy(position);group.position.y=(1-progress)*1.25
        group.scale.y=Math.max(.015,progress)
        group.visible=progress>.015
      })
      p.strokes.forEach(({edge,count})=>edge.geometry.setDrawRange(0,count))
      items.forEach(({group,position},index)=>{
        const settle=1
        group.position.copy(position).addScaledVector(Y,(1-settle)*.8)
        group.rotation.y=(1-settle)*(.18+index*.12)
        group.visible=true
      })
      const travel=isReduced?1:phase<.08?0:phase<.58?smooth((phase-.08)/.5):phase<.78?1:1-smooth((phase-.78)/.22)
      camera.position.set(1+travel*3,1.35+travel*.12,5+travel*.6)
      if(instance.mount.clientWidth<500)camera.position.z+=2
      camera.lookAt(0,1.02,0)
      const status=instance.mount.closest('figure')?.querySelector('[data-scene-status]')
      if(status){const labels=document.documentElement.lang.startsWith('zh')?['柱后起镜','横移显露人物','停留取景','回到起点']:['Behind column','Slide to reveal actors','Hold framing','Return'];status.textContent=labels[phase<.08?0:phase<.58?1:phase<.78?2:3]}
    }
    if(type!=='motion')rig.dolly.position.x=isReduced?0:Math.sin(seconds*.25)*.75
    if(instance.motion){
      const {manifest,positions}=instance.motion
      const fractional=isReduced||type==='scene'?0:(seconds*manifest.fps)%manifest.frameCount
      const frame=Math.floor(fractional),next=Math.min(frame+1,manifest.frameCount-1),alpha=fractional-frame
      {
        actors.forEach((performer,index)=>{
          const actorIndex=Math.min(index,manifest.actorCount-1)
          const start=(actorIndex*manifest.frameCount+frame)*manifest.jointCount*3
          const nextStart=(actorIndex*manifest.frameCount+next)*manifest.jointCount*3
          for(let joint=0;joint<interpolated.length;joint++)interpolated[joint]=positions[start+joint]+(positions[nextStart+joint]-positions[start+joint])*alpha
          performer.pose(interpolated)
          performer.group.position.set(0,.025,-.30)
        })
      }
      const progress=frame/Math.max(1,manifest.frameCount-1)*100
      instance.mount.style.setProperty('--motion-progress',`${progress.toFixed(3)}%`)
      if(type==='motion')instance.mount.parentElement?.style.setProperty('--motion-progress',`${progress.toFixed(3)}%`)
      const label=instance.mount.closest('figure')?.querySelector('[data-motion-time]')
      if(label)label.textContent=`${(frame/manifest.fps).toFixed(1)} / ${(manifest.frameCount/manifest.fps).toFixed(1)} s`
    }
    if(village)village.renderFeed()
    if(type==='hero')renderer.setClearColor(COLORS.paper,0)
  }
  instance.cleanupExtra=()=>{village?.target.dispose();p.gradient.dispose()}
  instance.resizeScene()
  const url=new URL(instance.mount.dataset.motionUrl||'assets/fight-fall.json',document.baseURI)
  savedMotion(url.href).then(motion=>{
    if(instance.disposed)return
    instance.motion=motion
    instance.elapsed=0
    instance.dirty=true
    instance.mount.dataset.motion='ready'
    schedule()
  }).catch(()=>{
    if(instance.disposed)return
    instance.mount.dataset.motion='unavailable'
    instance.dirty=true
    schedule()
  })
}

function createInstance(mount) {
  const type=mount.dataset.visual
  let renderer
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'})}catch{
    mount.dataset.visualError='WebGL unavailable'
    mount.classList.add('visual-ready')
    const fallback=document.createElement('span')
    fallback.className='visual-fallback'
    fallback.textContent=document.documentElement.lang.startsWith('zh')?'3D 预览不可用':'3D preview unavailable'
    mount.append(fallback)
    return null
  }
  renderer.outputColorSpace=THREE.SRGBColorSpace
  renderer.setClearColor(COLORS.paper,type==='hero'?0:1)
  const canvas=renderer.domElement
  canvas.className='scenra-visual-canvas'
  canvas.style.cssText='display:block;width:100%;height:100%;position:absolute;inset:0;pointer-events:none'
  canvas.setAttribute('aria-hidden','true')
  mount.append(canvas)
  const scene=new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff,0xb5b6a8,2.8))
  const sunlight=new THREE.DirectionalLight(0xffffff,2.1)
  sunlight.position.set(-3,7,4)
  scene.add(sunlight)
  const camera=['scene','capture'].includes(type)?new THREE.PerspectiveCamera(48,1,.1,70):new THREE.OrthographicCamera(-4,4,4,-4,.1,70)
  const outline=new OutlineEffect(renderer,{defaultThickness:.0015,defaultColor:[.157,.192,.161],defaultAlpha:.82})
  const instance={mount,type,scene,camera,renderer,outline,canvas,visible:false,dirty:true,contextLost:false,disposed:false,elapsed:0,motion:null}
  const controls=mount.closest('figure')
  const controlEvents=new AbortController()
  controls?.querySelector('[data-play]')?.addEventListener('click',event=>{
    instance.paused=!instance.paused
    event.currentTarget.textContent=instance.paused?event.currentTarget.dataset.resume:event.currentTarget.dataset.pause
    event.currentTarget.setAttribute('aria-pressed',String(instance.paused));instance.dirty=true;schedule()
  },{signal:controlEvents.signal})
  controls?.querySelector('[data-restart]')?.addEventListener('click',()=>{instance.elapsed=0;instance.dirty=true;schedule()},{signal:controlEvents.signal})
  instance.controlEvents=controlEvents
  build(instance)
  const resize=()=>{
    if(instance.disposed)return
    const width=mount.clientWidth,height=mount.clientHeight
    if(!width||!height)return
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7,Math.sqrt(1100000/(width*height))))
    renderer.setSize(width,height,false)
    instance.resizeScene()
    instance.dirty=true
    schedule()
  }
  instance.resizeObserver=new ResizeObserver(resize)
  instance.resizeObserver.observe(mount)
  instance.intersectionObserver=new IntersectionObserver(([entry])=>{instance.visible=entry.isIntersecting;instance.dirty=true;schedule()},{rootMargin:'40px',threshold:.01})
  instance.intersectionObserver.observe(mount)
  instance.loseContext=event=>{event.preventDefault();instance.contextLost=true}
  instance.restoreContext=()=>{instance.contextLost=false;instance.dirty=true;resize()}
  canvas.addEventListener('webglcontextlost',instance.loseContext)
  canvas.addEventListener('webglcontextrestored',instance.restoreContext)
  resize()
  return instance
}

function animate(time) {
  frameId=0
  if(!reduced.matches&&previousTime&&time-previousTime<1000/60-.5){frameId=requestAnimationFrame(animate);return}
  const delta=previousTime?Math.min(50,time-previousTime):0
  previousTime=time
  let continuing=false
  for(const instance of instances.values()){
    if(!instance.mount.isConnected||!instance.visible||instance.contextLost||document.hidden)continue
    if(!reduced.matches&&!instance.paused)instance.elapsed+=delta
    if(instance.dirty||!reduced.matches){
      instance.update(instance.elapsed,reduced.matches)
      if(instance.renderFrame)instance.renderFrame()
      else instance.outline.render(instance.scene,instance.camera)
      instance.dirty=false
      if(!instance.ready){
        instance.ready=true
        instance.mount.classList.add('visual-ready')
        instance.mount.dispatchEvent(new CustomEvent('scenra-visual-ready',{bubbles:true}))
      }
    }
    if(!reduced.matches&&!instance.paused)continuing=true
  }
  if(continuing)frameId=requestAnimationFrame(animate)
  else previousTime=0
}

function schedule(){if(!frameId&&!document.hidden)frameId=requestAnimationFrame(animate)}
function visibility(){previousTime=0;if(document.hidden){cancelAnimationFrame(frameId);frameId=0}else schedule()}
function motionPreference(){for(const instance of instances.values())instance.dirty=true;schedule()}

function dispose(instance) {
  instance.disposed=true
  instance.resizeObserver.disconnect()
  instance.intersectionObserver.disconnect()
  instance.canvas.removeEventListener('webglcontextlost',instance.loseContext)
  instance.canvas.removeEventListener('webglcontextrestored',instance.restoreContext)
  instance.cleanupExtra?.()
  instance.controlEvents?.abort()
  const geometries=new Set(),materials=new Set()
  instance.scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material)})
  geometries.forEach(geometry=>geometry.dispose())
  materials.forEach(material=>material.dispose())
  instance.renderer.dispose()
  instance.canvas.remove()
  instance.mount.classList.remove('visual-ready')
}

function mountAll(scope=document) {
  for(const [mount,instance]of instances)if(!mount.isConnected){dispose(instance);instances.delete(mount)}
  for(const mount of scope.querySelectorAll('[data-visual]')){
    if(instances.has(mount)||!['hero','scene','motion','monitor','detail','capture'].includes(mount.dataset.visual))continue
    const instance=createInstance(mount)
    if(instance)instances.set(mount,instance)
  }
  if(!listening&&instances.size){document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',motionPreference);listening=true}
  schedule()
}

function destroy() {
  cancelAnimationFrame(frameId);frameId=0;previousTime=0
  for(const instance of instances.values())dispose(instance)
  instances.clear()
  if(listening){document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motionPreference);listening=false}
}

window.ScenraVisuals={mountAll,destroy}
window.addEventListener('scenra-visual-change',schedule)
window.dispatchEvent(new CustomEvent('scenra-visuals-available'))
