// Geometry and temporal filtering shared by the camera controller and unit checks.
export const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
function angle(a,b,c) {
  const u=[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)];
  const v=[c.x-b.x,c.y-b.y,(c.z||0)-(b.z||0)];
  const norm=Math.hypot(...u)*Math.hypot(...v);
  return norm<1e-8?0:Math.acos(clamp(u.reduce((s,x,i)=>s+x*v[i],0)/norm,-1,1))*180/Math.PI;
}
export function analyzeHand(landmarks) {
  if(!landmarks||landmarks.length!==21) return null;
  const p=landmarks;
  const palm=Math.max(distance(p[0],p[9]),distance(p[5],p[17]),.015);
  const extended=[false,...[[5,6,8],[9,10,12],[13,14,16],[17,18,20]].map(([m,j,t])=>angle(p[m],p[j],p[t])>145&&distance(p[t],p[0])>distance(p[j],p[0])*1.10)];
  extended[0]=angle(p[1],p[2],p[4])>143&&distance(p[4],p[5])/palm>.57&&distance(p[4],p[17])>distance(p[3],p[17])*1.04;
  const pinch=distance(p[4],p[8])/palm;
  return {count:extended.filter(Boolean).length,extended,pinch,palm,tip:{x:1-p[8].x,y:p[8].y}};
}
export class NumberLatch {
  constructor(holdMs=500){this.holdMs=holdMs;this.reset();}
  reset(){this.candidate=0;this.since=0;this.locked=false;this.releaseSince=null;}
  update(value,now) {
    if(!Number.isInteger(value)||value<1||value>10){
      if(this.releaseSince===null)this.releaseSince=now;
      if(now-this.releaseSince>=180){this.candidate=0;this.locked=false;}
      return {value:0,progress:0,confirmed:null};
    }
    this.releaseSince=null;
    if(value!==this.candidate){this.candidate=value;this.since=now;this.locked=false;}
    const progress=clamp((now-this.since)/this.holdMs);
    const confirmed=progress===1&&!this.locked?value:null;
    if(confirmed!==null)this.locked=true;
    return {value,progress,confirmed};
  }
}
export class PalmColorLatch {
  constructor(holdMs=700,releaseMs=250){this.holdMs=holdMs;this.releaseMs=releaseMs;this.reset();}
  reset(){this.since=null;this.releaseSince=null;this.locked=false;this.lastTime=null;}
  update(open,now){
    const gap=this.lastTime!==null&&now-this.lastTime>300;this.lastTime=now;
    if(gap&&!this.locked)this.since=null;
    if(!open){
      this.since=null;
      if(this.releaseSince===null)this.releaseSince=now;
      if(now-this.releaseSince>=this.releaseMs)this.locked=false;
      return {progress:0,triggered:false,locked:this.locked};
    }
    this.releaseSince=null;
    if(this.locked)return {progress:1,triggered:false,locked:true};
    if(this.since===null)this.since=now;
    const progress=clamp((now-this.since)/this.holdMs);
    const triggered=progress===1;
    if(triggered)this.locked=true;
    return {progress,triggered,locked:this.locked};
  }
}
export class MoodFilter {
  constructor(){this.baseline={};this.smooth={};this.current='neutral';this.candidate='neutral';this.since=0;}
  calibrate(samples){
    if(!samples.length)return false;
    const keys=new Set(samples.flatMap(x=>Object.keys(x)));
    this.baseline=Object.fromEntries([...keys].map(k=>[k,samples.reduce((sum,s)=>sum+(s[k]||0),0)/samples.length]));
    this.smooth={};this.current='neutral';this.candidate='neutral';return true;
  }
  update(scores,now){
    for(const [k,v] of Object.entries(scores))this.smooth[k]=(this.smooth[k]??v)*.65+v*.35;
    const s=k=>Math.max(0,(this.smooth[k]||0)-(this.baseline[k]||0));
    const avg=(a,b)=>(s(a)+s(b))/2;
    const smile=avg('mouthSmileLeft','mouthSmileRight');
    const frown=avg('mouthFrownLeft','mouthFrownRight');
    const brow=avg('browDownLeft','browDownRight');
    const inner=s('browInnerUp');
    let next='neutral';
    if(smile>.28)next='happy';
    else if(frown>.13&&inner>.10)next='sad';
    else if(brow>.24)next='angry';
    if(next!==this.candidate){this.candidate=next;this.since=now;}
    if(now-this.since>(next==='neutral'?700:350))this.current=next;
    return this.current;
  }
}
