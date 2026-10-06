import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// Server modules keep provider credentials outside browser bundle.
// @ts-expect-error JS server module intentionally used by integration test.
import { generateScene } from '../../../server/generate-scene.mjs'
// @ts-expect-error JS server module intentionally used by integration test.
import { uploadedFile, worldSemantics } from '../../../server/scene-api.mjs'

describe('scene creation workflow',()=>{
  it('runs image separation, world creation, prop generation and playable scene assembly in order',async()=>{
    const directory=await mkdtemp(path.join(os.tmpdir(),'scene-flow-'))
    try {
      await mkdir(path.join(directory,'source'))
      const source=path.join(directory,'source','0-source.png');await writeFile(source,'fixture')
      const calls:string[]=[]
      const result=await generateScene({directory,slug:'scene-test',id:'test',title:'Test scene',source,objects:['Wooden bench'],performers:true}, {
        generateEdit:async()=>{calls.push('image');return {output_image:'clean-plate.png'}},
        generateWorld:async(input:{image:string})=>{expect(input.image).toBe('clean-plate.png');calls.push('world')},
        generateSingleObject:async(input:{directImage:string})=>{expect(input.directImage).toBe(source);calls.push('prop')}
      })
      expect(calls).toEqual(['image','world','prop']);expect(result.status).toBe('completed')
      const scene=JSON.parse(await readFile(path.join(directory,'scene.json'),'utf8'))
      const project=JSON.parse(await readFile(path.join(directory,'project.json'),'utf8'))
      expect(scene.instances[0].physics).toBe('rigidbody');expect(scene.instances[0].position[2]).toBe(-3.8)
      expect(project.motion.manifest_url).toBe('/stageon/fight-fall.json')
    }finally{await rm(directory,{recursive:true,force:true})}
  })
  it('persists provider failure and stops before submitting later stages',async()=>{
    const directory=await mkdtemp(path.join(os.tmpdir(),'scene-failure-'))
    try {
      await mkdir(path.join(directory,'source'))
      const result=await generateScene({directory,slug:'test',id:'test',title:'Test',source:'source.png',objects:['Table']}, {generateEdit:async()=>{throw new Error('You have no credits remaining.')},generateWorld:async()=>{throw new Error('World must not be called')},generateSingleObject:async()=>{throw new Error('Tripo must not be called')}})
      expect(result.status).toBe('error');expect(result.error).toBe('You have no credits remaining.')
      expect(JSON.parse(await readFile(path.join(directory,'.creation-job.json'),'utf8')).status).toBe('error')
    }finally{await rm(directory,{recursive:true,force:true})}
  })
  it('preserves Marble orientation defaults and explicit world metadata',()=>{
    expect(worldSemantics({assets:{splats:{semantics_metadata:{metric_scale_factor:1.468,ground_plane_offset:0.845}}}})).toEqual({metric_scale_factor:1.468,ground_plane_offset:0.845,flip_y:true})
    expect(worldSemantics({assets:{splats:{semantics_metadata:{flip_y:false}}}}).flip_y).toBe(false)
  })
  it('rejects corrupt imported assets before writing scene files',()=>{
    const file=(name:string,data:string)=>({name,data:`data:application/octet-stream;base64,${Buffer.from(data).toString('base64')}`})
    expect(()=>uploadedFile(file('fake.glb','not a model'),'glb')).toThrow('Choose valid GLB model.')
    expect(()=>uploadedFile(file('fake.spz','not a splat'),'spz')).toThrow('Choose valid World Labs SPZ file.')
    expect(()=>uploadedFile(file('fake.png','not an image'),'image')).toThrow('Choose PNG, JPEG or WebP image.')
  })
})
