// Local keyframe preview on saved ARDY positions; model inference is separate.
export const PUNCH={start:2.5,end:4.6,windup:3.35,contact:3.65,editStart:3.0,shoulder:8,elbow:9,wrist:10}
const clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x))
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)}
const add=(a,b)=>a.map((v,i)=>v+b[i])
const sub=(a,b)=>a.map((v,i)=>v-b[i])
const scale=(a,s)=>a.map(v=>v*s)
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0)
const length=a=>Math.hypot(...a)
const unit=a=>scale(a,1/Math.max(1e-8,length(a)))
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t)
const joint=(points,j)=>Array.from(points.subarray(j*3,j*3+3))
function put(points,j,value){points.set(value,j*3)}
export function sampleActor(motion,actor,time){
  const {manifest,positions}=motion,count=manifest.jointCount*3
  const f=clamp(time*manifest.fps,0,manifest.frameCount-1),a=Math.floor(f),b=Math.min(a+1,manifest.frameCount-1),mix=f-a
  const start=(actor*manifest.frameCount+a)*count,next=(actor*manifest.frameCount+b)*count,result=new Float32Array(count)
  for(let i=0;i<count;i++)result[i]=positions[start+i]+(positions[next+i]-positions[start+i])*mix
  return result
}
export function createPunchEdit(motion){
  const windup=joint(sampleActor(motion,0,PUNCH.windup),PUNCH.wrist)
  const contact=joint(sampleActor(motion,0,PUNCH.contact),PUNCH.wrist)
  const direction=unit([contact[0]-windup[0],0,contact[2]-windup[2]])
  function targets(settings){return {windup:add(sub(windup,scale(direction,settings.windup)),[0,settings.height,0]),contact:[...contact],windupTime:PUNCH.contact-settings.duration}}
  function edit(time,settings){
    const points=sampleActor(motion,0,time)
    if(time<PUNCH.editStart||time>=PUNCH.contact)return points
    const desired=targets(settings),strikeStart=desired.windupTime
    const wrist=time<strikeStart
      ?lerp(joint(points,PUNCH.wrist),desired.windup,smooth((time-PUNCH.editStart)/(strikeStart-PUNCH.editStart)))
      :lerp(desired.windup,desired.contact,Math.pow(clamp((time-strikeStart)/settings.duration),1.65))
    const shoulder=joint(points,PUNCH.shoulder),oldElbow=joint(points,PUNCH.elbow),oldWrist=joint(points,PUNCH.wrist)
    const upper=length(sub(oldElbow,shoulder)),lower=length(sub(oldWrist,oldElbow))
    const axis=unit(sub(wrist,shoulder)),distance=clamp(length(sub(wrist,shoulder)),Math.abs(upper-lower)+1e-5,upper+lower-1e-5)
    const target=add(shoulder,scale(axis,distance))
    const along=(upper*upper-lower*lower+distance*distance)/(2*distance)
    let pole=sub(sub(oldElbow,shoulder),scale(axis,dot(sub(oldElbow,shoulder),axis)))
    if(length(pole)<1e-5){const fallback=Math.abs(axis[1])<.9?[0,1,0]:[0,0,1];pole=sub(fallback,scale(axis,dot(fallback,axis)))}
    const elbow=add(add(shoulder,scale(axis,along)),scale(unit(pole),Math.sqrt(Math.max(0,upper*upper-along*along))))
    const shift=sub(target,oldWrist)
    put(points,PUNCH.elbow,elbow);put(points,PUNCH.wrist,target)
    for(const finger of [11,12])put(points,finger,add(joint(points,finger),shift))
    return points
  }
  return {targets,edit}
}
