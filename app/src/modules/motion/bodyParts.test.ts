import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { BODY_PARTS, bodyPartPose } from './bodyParts'
import { decodeSavedMotion } from './stageonData'
import { moveMotionCollider } from './colliderStep'
const assets = new URL('../../../public/stageon/', import.meta.url)
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('fight-fall.json', assets)), 'utf8'))
const raw = readFileSync(fileURLToPath(new URL('fight-fall.bin', assets)))
const motion = decodeSavedMotion(manifest, raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength) as ArrayBuffer)
const offset: [number,number,number] = [0,0.03,-3]

describe('saved fighter collisions', () => {
  it.each([[0, 180], [180, 40]])('resolves prop contact after scrub from frame %i to %i without sweep impulse', async (from, to) => {
    await RAPIER.init()
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    try {
      const part = BODY_PARTS[0]
      const initial = bodyPartPose(motion, 0, part, from / 20, offset, { position: new Vector3(), rotation: new Quaternion(), halfLength: 0 })
      const target = bodyPartPose(motion, 0, part, to / 20, offset, { position: new Vector3(), rotation: new Quaternion(), halfLength: 0 })
      const actor = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(initial.position.x, initial.position.y, initial.position.z).setRotation(initial.rotation))
      const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(initial.halfLength, part.radius).setCollisionGroups(0x00020001), actor)
      const propStart = target.position.clone().add(new Vector3(.12, 0, 0))
      const prop = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(propStart.x, propStart.y, propStart.z).setCcdEnabled(true))
      const propCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(.12, .12, .12), prop)
      capsule.setHalfHeight(target.halfLength)
      moveMotionCollider(actor, target.position, target.rotation, true)
      let contacts = 0
      for (let step = 0; step < 30; step++) {
        world.step()
        world.contactPairsWith(propCollider, other => { if (other === capsule || other.handle === capsule.handle) contacts++ })
      }
      expect(contacts).toBeGreaterThan(0)
      expect(new Vector3().copy(prop.translation()).distanceTo(propStart)).toBeGreaterThan(.01)
      expect(new Vector3().copy(actor.linvel()).length()).toBeLessThan(.001)
      expect(new Vector3().copy(prop.linvel()).length()).toBeLessThan(10)
      expect(Object.values(prop.translation()).every(Number.isFinite)).toBe(true)
    } finally { world.free() }
  })
  it('aligns capsules with interpolated limb endpoints and keeps every pose finite', () => {
    const pose = { position: new Vector3(), rotation: new Quaternion(), halfLength:0 }
    for (let actor=0;actor<2;actor++) for (let frame=0;frame<240;frame+=3) for (const part of BODY_PARTS) {
      bodyPartPose(motion,actor,part,(frame+0.5)/20,offset,pose)
      expect([...pose.position.toArray(),...pose.rotation.toArray(),pose.halfLength].every(Number.isFinite)).toBe(true)
      expect(pose.rotation.length()).toBeCloseTo(1)
    }
  })
  it('recorded motion contacts and moves dynamic prop through Rapier, without scripted impulses', async () => {
    await RAPIER.init()
    const world = new RAPIER.World({x:0,y:-9.81,z:0})
    try {
      world.createCollider(RAPIER.ColliderDesc.cuboid(10,0.05,10).setTranslation(0,-0.05,0))
      const prop = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(1.3,0.28,-3.65).setLinearDamping(0.45).setAngularDamping(0.35).setCcdEnabled(true))
      const propCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.4,0.28,0.3),prop)
      const bodies = Array.from({length:2},(_,actor)=>BODY_PARTS.map(part=>{
        const pose=bodyPartPose(motion,actor,part,0,offset,{position:new Vector3(),rotation:new Quaternion(),halfLength:0})
        const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pose.position.x,pose.position.y,pose.position.z).setRotation(pose.rotation))
        body.userData={actor}
        const collider=world.createCollider(RAPIER.ColliderDesc.capsule(pose.halfLength,part.radius).setCollisionGroups(0x00020001),body)
        return {body,collider,part,actor,pose}
      })).flat()
      let contacts=0, displacement=0
      for(let step=1;step<=720;step++) {
        for(const item of bodies) {
          bodyPartPose(motion,item.actor,item.part,step/60,offset,item.pose)
          item.collider.setHalfHeight(item.pose.halfLength)
          item.body.setNextKinematicTranslation(item.pose.position)
          item.body.setNextKinematicRotation(item.pose.rotation)
        }
        world.step()
        world.contactPairsWith(propCollider,other=>{if(other.parent()?.userData)contacts++})
        const p=prop.translation();displacement=Math.max(displacement,Math.hypot(p.x-1.3,p.z+3.65))
      }
      expect(contacts).toBeGreaterThan(0)
      expect(displacement).toBeGreaterThan(0.1)
      expect(Object.values(prop.translation()).every(Number.isFinite)).toBe(true)
    } finally {world.free()}
  })
})
