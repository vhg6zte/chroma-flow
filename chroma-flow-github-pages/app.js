import {analyzeHand,NumberLatch,PalmColorLatch,MoodFilter,clamp} from './recognition.js';
const $=id=>document.getElementById(id);
const palettes=[
  {name:'流光彩虹',colors:['#49d7bb','#4c68e8','#e16ba7','#f7be73']},
  {name:'深海漫游',colors:['#148cba','#3dcbdc','#3862d7','#83e1d2']},
  {name:'落日火焰',colors:['#ff6235','#ffb352','#e84973','#fada7d']},
  {name:'北境极光',colors:['#a5e8a5','#37b9ab','#5366e9','#af8ed9']},
  {name:'银河来信',colors:['#824ed0','#d08aea','#465ac5','#ec9dc1']},
  {name:'水墨之间',colors:['#aac1bc','#758a8a','#dee6d7','#485e66']},
  {name:'午夜荧光',colors:['#bdeb4c','#29d1ac','#ac6ee8','#f577b5']},
  {name:'糖果气泡',colors:['#f6a4ba','#f1d787','#b2a5f0','#a3dfdf']},
  {name:'熔岩之心',colors:['#dc3936','#f56e2f','#c04d7c','#f3b646']},
  {name:'薄荷梦境',colors:['#72d3b4','#b3e6c9','#56a8b7','#9cb7e8']},
];
const moodInfo={neutral:{label:'平静',color:null,curl:18,force:1},happy:{label:'笑脸',color:'#ffcd83',curl:24,force:1.12},sad:{label:'哭脸',color:'#6f9fe9',curl:10,force:.75},angry:{label:'皱眉',color:'#ed5c42',curl:38,force:1.4}};
const state={palette:0,mode:'paint',force:50,radius:40,expressions:true,paused:false,interacted:false,camera:'off',hands:0,facePresent:false,mood:'neutral',faceAvailable:true,quality:'medium',autoColor:false};
const fluid=window.Fluid;
const hex=c=>({r:parseInt(c.slice(1,3),16)/255,g:parseInt(c.slice(3,5),16)/255,b:parseInt(c.slice(5,7),16)/255});
const mix=(a,b,t)=>({r:a.r+(b.r-a.r)*t,g:a.g+(b.g-a.g)*t,b:a.b+(b.b-a.b)*t});
let toastTimer;
let worker=null,stream=null,generation=0,cameraRaf=0,workerWatchdog=0,frameBusy=false,lastFrameTime=0,lastResultTime=0;
const handTracks=new Map(),latch=new NumberLatch(500),palmLatch=new PalmColorLatch(),moodFilter=new MoodFilter();
let lastColorChange=performance.now(),colorBlendFrom=null,colorBlendTime=0;
let calibration=null,faceLastSeen=0,expressionSmooth=0,frameCount=0,fpsTime=performance.now(),artTime=0;
const video=$('video'),skeleton=$('landmarks'),skeletonCtx=skeleton.getContext('2d');
let faceWarning=false;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function interact(){state.interacted=true;$('stage-center').classList.add('dismissed');}
function selectedColors(){return palettes[state.palette].colors;}
function dyeColor(index=0,strength=.6){
  let color=hex(selectedColors()[index%selectedColors().length]);
  if(colorBlendFrom){const t=clamp((performance.now()-colorBlendTime)/900);color=mix(hex(colorBlendFrom[index%colorBlendFrom.length]),color,t);}
  if(state.expressions&&state.facePresent&&moodInfo[state.mood].color)color=mix(color,hex(moodInfo[state.mood].color),expressionSmooth*.7);
  return {r:color.r*strength,g:color.g*strength,b:color.b*strength};
}
function setPalette(index,notify=false){
  if(index!==state.palette){colorBlendFrom=[...selectedColors()];colorBlendTime=performance.now();}
  state.palette=index;lastColorChange=performance.now();
  document.querySelectorAll('.palette').forEach((button,i)=>{button.classList.toggle('active',i===index);button.setAttribute('aria-pressed',String(i===index));});
  $('palette-name').textContent=`${String(index+1).padStart(2,'0')} / ${palettes[index].name}`;
  if(notify)toast(`已选择 ${index+1} · ${palettes[index].name}`);
}
palettes.forEach((p,i)=>{
  const b=document.createElement('button');b.className='palette';b.title=`${i+1} · ${p.name}`;b.setAttribute('aria-label',`${i+1} ${p.name}`);b.setAttribute('aria-pressed','false');
  const c=document.createElement('span');c.style.background=`conic-gradient(from 30deg,${[...p.colors,p.colors[0]].join(',')})`;
  const n=document.createElement('span');n.className='palette-number';n.textContent=i+1;b.append(c,n);
  b.onclick=()=>{setPalette(i);burst(6);};$('palettes').append(b);
});setPalette(0);
function inject(x,y,dx,dy,index=0,strength=.6){
  if(!fluid||state.paused)return;
  fluid.inject(clamp(x),clamp(y),clamp(dx,-1100,1100),clamp(dy,-1100,1100),dyeColor(index,strength));
}
function burst(amount=20){
  if(!fluid)return;
  if(state.paused)setPaused(false);
  for(let i=0;i<amount;i++){
    const theta=Math.random()*Math.PI*2,r=.10+Math.random()*.24;
    inject(.5+Math.cos(theta)*r,.51+Math.sin(theta)*r,Math.cos(theta)*400,Math.sin(theta)*400,i,1.8);
  }
}
function setMode(mode){
  state.mode=mode;latch.reset();palmLatch.reset();handTracks.clear();$('color-hint').hidden=mode!=='paint';resetColorHint();
  for(const k of ['paint','number']){const active=mode===k;$(k+'-mode').classList.toggle('active',active);$(k+'-mode').setAttribute('aria-pressed',String(active));}
  $('count-overlay').hidden=mode!=='number';$('stage-state').textContent=mode==='paint'?'自由探索':'数字选色';
  if(mode==='number'){interact();$('count-value').textContent='—';$('count-caption').textContent=state.camera==='on'?'伸出手指，选择 1–10':'开启摄像头，开始数字选色';$('count-progress').style.strokeDashoffset=321;}
  for(const side of ['left','right'])$('tip-'+side).hidden=true;
}
$('paint-mode').onclick=()=>setMode('paint');$('number-mode').onclick=()=>setMode('number');
$('random').onclick=()=>{setPalette((state.palette+1+Math.floor(Math.random()*9))%10,true);burst(10);};
$('demo-button').onclick=()=>{interact();burst(25);};
function setPaused(value){state.paused=value;fluid?.pause(value);$('pause').classList.toggle('paused',value);$('pause').innerHTML=value?'<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>':'<svg><use href="#i-pause"/></svg>';$('pause').setAttribute('aria-label',value?'继续流体':'暂停流体');$('pause').title=value?'继续流体':'暂停流体';}
$('pause').onclick=()=>setPaused(!state.paused);
$('clear').onclick=()=>{interact();fluid?.clear();toast('画布已清空，下一笔交给你。');};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch{toast('当前浏览器不支持全屏，可使用浏览器全屏功能。');}};
function updateRange(id){state[id]=Number($(id).value);$(id+'-value').textContent=state[id]+'%';$(id).style.setProperty('--fill',((state[id]-10)/90*100)+'%');}
for(const id of ['force','radius']){$(id).oninput=()=>updateRange(id);updateRange(id);}
$('quality').onchange=()=>{state.quality=$('quality').value;fluid?.quality(state.quality);toast(`画质已切换为${$('quality').selectedOptions[0].textContent}`);};
function setExpressions(value){state.expressions=value;$('expression').classList.toggle('on',value);$('expression').setAttribute('aria-checked',String(value));if(!value){state.mood='neutral';state.facePresent=false;$('face-status').textContent='已关闭';$('mood-text').textContent='表情联动已关闭';if(calibration)finishCalibration(false);}else{$('face-status').textContent=state.camera==='on'?'寻找面部':'等待识别';$('mood-text').textContent='让表情为色彩加点情绪';}updateCalibrate();}
$('expression').onclick=()=>setExpressions(!state.expressions);
function setAutoColor(value){state.autoColor=value;lastColorChange=performance.now();$('auto-color').classList.toggle('on',value);$('auto-color').setAttribute('aria-checked',String(value));}
$('auto-color').onclick=()=>{setAutoColor(!state.autoColor);toast(state.autoColor?'自动换色已开启，每 10 秒流转一套配色。':'自动换色已关闭，仍可张开五指换色。');};
function resetColorHint(){ $('color-hint-text').textContent='五指张开 0.7 秒 · 换色';$('palm-progress').style.width='0%'; }
$('reset-settings').onclick=()=>{$('force').value=50;$('radius').value=40;updateRange('force');updateRange('radius');setExpressions(true);setAutoColor(false);$('quality').value='medium';state.quality='medium';fluid?.quality('medium');toast('互动设置已恢复。');};
const dialog=$('guide');$('help').onclick=()=>dialog.showModal();$('close-guide').onclick=$('start-playing').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}};
window.addEventListener('keydown',e=>{
  if(dialog.open||['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName))return;
  if(e.code==='Space'){e.preventDefault();interact();burst(24);}
  if(e.code==='KeyP'){e.preventDefault();setPaused(!state.paused);}
  if(e.code==='KeyC'){interact();fluid?.clear();}
  if(e.key>='1'&&e.key<='9'){setPalette(Number(e.key)-1,true);burst(7);}
  if(e.key==='0'){setPalette(9,true);burst(7);}
});
const pointerHistory=new Map();
function pointerSample(e,first=false){
  if(state.mode!=='paint'||state.paused)return;
  const bounds=$('fluid').getBoundingClientRect(),now=performance.now();
  const x=(e.clientX-bounds.left)/bounds.width,y=(e.clientY-bounds.top)/bounds.height;
  const previous=pointerHistory.get(e.pointerId),index=e.pointerId%4;
  if(!first&&previous){const dt=Math.max((now-previous.t)/1000,.008);const speed=state.force/50*125;inject(x,y,(x-previous.x)/dt*speed,(y-previous.y)/dt*speed,index,.5);}
  else inject(x,y,0,-20,index,.8);
  pointerHistory.set(e.pointerId,{x,y,t:now});
}
$('fluid').addEventListener('pointerdown',e=>{if(state.mode==='number'){toast('当前是数字选色模式，切回「自由搅动」即可绘画。');return;}interact();$('fluid').setPointerCapture(e.pointerId);pointerSample(e,true);});
$('fluid').addEventListener('pointermove',e=>{if(!pointerHistory.has(e.pointerId))return;pointerSample(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('fluid').addEventListener(event,e=>pointerHistory.delete(e.pointerId));
function updateCalibrate(){$('calibrate').disabled=state.camera!=='on'||!state.expressions||!state.faceAvailable||!!calibration;}
function cameraMessage(message,error=false){$('camera-message').textContent=message;$('camera-message').classList.toggle('error',error);}
function cameraUI(){
  const active=state.camera!=='off';$('camera-button').classList.toggle('stop',active);$('camera-button').querySelector('span').textContent=state.camera==='loading'?'正在准备 · 点击取消':state.camera==='on'?'关闭摄像头':'开启摄像头互动';
  $('camera-tag').textContent=state.camera==='on'?'本机识别中':state.camera==='loading'?'正在准备':'摄像头未开启';
  $('camera-placeholder').hidden=state.camera==='on';$('preview-badge').style.display=state.camera==='on'?'block':'none';updateCalibrate();
}
function finishCalibration(success){
  if(!calibration)return;
  const samples=calibration.samples;calibration=null;
  if(success&&samples.length>=8){moodFilter.calibrate(samples);state.mood='neutral';toast('校准完成，现在试着做个表情。');}
  else toast('校准未完成，请让整张脸留在画面中，再试一次。');
  $('calibrate').innerHTML='校准自然表情 <span>保持放松 2 秒</span>';updateCalibrate();
}
$('calibrate').onclick=()=>{if(!state.facePresent){toast('请先让整张脸出现在摄像头画面中。');return;}calibration={started:performance.now(),samples:[]};$('calibrate').textContent='请放松面部，正在校准…';updateCalibrate();};
function stopCamera(message='摄像头已关闭，仍可用鼠标或触屏玩。',error=false){
  generation++;cancelAnimationFrame(cameraRaf);clearTimeout(workerWatchdog);worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;frameBusy=false;lastFrameTime=0;lastResultTime=0;handTracks.clear();latch.reset();palmLatch.reset();resetColorHint();state.camera='off';state.hands=0;state.facePresent=false;state.mood='neutral';moodFilter.current='neutral';moodFilter.smooth={};faceLastSeen=0;
  if(calibration)finishCalibration(false);
  skeletonCtx.clearRect(0,0,skeleton.width,skeleton.height);$('hand-status').innerHTML='0 <small>/ 2</small>';$('face-status').textContent=state.expressions?'等待识别':'已关闭';$('mood-text').textContent=state.expressions?'让表情为色彩加点情绪':'表情联动已关闭';
  for(const side of ['left','right'])$('tip-'+side).hidden=true;
  cameraUI();cameraMessage(message,error);
  if(state.mode==='number'){$('count-value').textContent='—';$('count-caption').textContent='开启摄像头，开始数字选色';$('count-progress').style.strokeDashoffset=321;}
}
async function startCamera(){
  if(state.camera!=='off'){stopCamera();return;}
  if(!navigator.mediaDevices?.getUserMedia){cameraMessage('此浏览器无法访问摄像头，请在 HTTPS 页面用 Chrome 或 Edge 打开。',true);return;}
  const myGeneration=++generation;state.camera='loading';state.faceAvailable=true;faceWarning=false;cameraUI();cameraMessage('请允许摄像头访问，首次加载识别模型需要片刻。');
  try{
    const media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    if(myGeneration!==generation){media.getTracks().forEach(t=>t.stop());return;}
    stream=media;video.srcObject=media;await video.play();if(myGeneration!==generation)return;
    const readyWorker=new Worker(new URL('./vision-worker.js',import.meta.url));worker=readyWorker;
    workerWatchdog=setTimeout(()=>{if(myGeneration===generation)stopCamera('识别模型加载超时，请刷新网页后重试。',true);},90000);
    readyWorker.onerror=()=>{if(myGeneration===generation)stopCamera('识别启动失败，请更新浏览器后重试；也可继续用鼠标玩。',true);};
    readyWorker.onmessage=({data})=>{
      if(myGeneration!==generation)return;
      if(data.type==='face-warning'){faceWarning=true;state.faceAvailable=false;}
      if(data.type==='ready'){
        clearTimeout(workerWatchdog);state.camera='on';state.faceAvailable=data.faceAvailable;cameraUI();cameraMessage(faceWarning?'双手识别已就绪，表情模型暂不可用。':'食指搅动，捏合暂停。试着把双手放进画面。',faceWarning);
        $('face-status').textContent=state.expressions?(data.faceAvailable?'寻找面部':'暂不可用'):'已关闭';
        if(state.mode==='number')$('count-caption').textContent='伸出手指，选择 1–10';
        interact();lastResultTime=performance.now();cameraLoop(myGeneration);
      }else if(data.type==='result'){
        frameBusy=false;lastResultTime=performance.now();processRecognition(data);
      }else if(data.type==='error'){stopCamera(data.needsWebGL?'摄像头识别需要 WebGL，请开启浏览器硬件加速后刷新。鼠标互动仍可使用。':'摄像头识别中断，请重新开启。鼠标互动仍可使用。',true);}
    };
    media.getVideoTracks()[0].addEventListener('ended',()=>{if(myGeneration===generation)stopCamera('摄像头已断开，请连接后重新开启。',true);});
    readyWorker.postMessage({type:'init'});
  }catch(error){
    if(myGeneration!==generation)return;
    const messages={NotAllowedError:'摄像头权限未允许。请在浏览器地址栏的权限设置中允许后重试。',NotFoundError:'没有找到摄像头，请连接摄像头后重试。',NotReadableError:'摄像头可能正被其他软件占用，请关闭后重试。',SecurityError:'此页面暂时无法访问摄像头，请在独立浏览器标签页打开。'};
    stopCamera(messages[error.name]||'摄像头启动失败，请检查设备与浏览器权限后重试。',true);
  }
}
$('camera-button').onclick=startCamera;
async function cameraLoop(myGeneration){
  if(myGeneration!==generation||state.camera!=='on')return;
  const now=performance.now();
  if(now-lastResultTime>12000){stopCamera('识别响应超时，请重新开启摄像头。',true);return;}
  if(!frameBusy&&video.readyState>=2&&now-lastFrameTime>45){
    frameBusy=true;lastFrameTime=now;
    try{
      const bitmap=await createImageBitmap(video,{resizeWidth:640,resizeHeight:Math.round(640*video.videoHeight/video.videoWidth)});
      if(myGeneration!==generation){bitmap.close();return;}
      worker.postMessage({type:'frame',bitmap,timestamp:now,expressions:state.expressions||!!calibration},[bitmap]);
    }catch{frameBusy=false;if(myGeneration===generation){stopCamera('此浏览器暂不支持摄像头图像处理，请使用新版 Chrome 或 Edge。',true);return;}}
  }
  cameraRaf=requestAnimationFrame(()=>cameraLoop(myGeneration));
}
const handConnections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function drawSkeleton(hands){
  const w=video.videoWidth||640,h=video.videoHeight||480;
  if(skeleton.width!==w||skeleton.height!==h){skeleton.width=w;skeleton.height=h;}
  skeletonCtx.clearRect(0,0,w,h);
  hands.landmarks.forEach((p,i)=>{
    skeletonCtx.strokeStyle=i===0?'#c5ef97':'#c0b4ff';skeletonCtx.fillStyle=skeletonCtx.strokeStyle;skeletonCtx.lineWidth=2;
    skeletonCtx.beginPath();for(const [a,b] of handConnections){skeletonCtx.moveTo(p[a].x*w,p[a].y*h);skeletonCtx.lineTo(p[b].x*w,p[b].y*h);}skeletonCtx.stroke();
    for(const v of p){skeletonCtx.beginPath();skeletonCtx.arc(v.x*w,v.y*h,2.6,0,Math.PI*2);skeletonCtx.fill();}
  });
}
function processRecognition(data){
  const now=performance.now(),hands=data.hands;drawSkeleton(hands);
  const assigned=new Set();let total=0;let reliable=hands.landmarks.length>0,openPalm=false;
  hands.landmarks.forEach((points,i)=>{
    const hand=analyzeHand(points);if(!hand)return;
    const confidence=hands.handedness[i]?.[0]?.score||0;
    const palmOpen=hand.count===5&&hand.pinch>.45&&confidence>.8;
    openPalm ||= palmOpen;
    // MediaPipe receives unmirrored pixels; swap handedness for a selfie preview.
    let side=hands.handedness[i]?.[0]?.categoryName==='Left'?'right':'left';
    if(assigned.has(side))side=side==='left'?'right':'left';assigned.add(side);
    let track=handTracks.get(side);
    if(track&&now-track.time<250&&Math.hypot(track.x-hand.tip.x,track.y-hand.tip.y)<.3){
      const a=.58,dt=clamp((now-track.time)/1000,.015,.2);
      const x=track.x+(hand.tip.x-track.x)*a,y=track.y+(hand.tip.y-track.y)*a;
      const pinched=hand.pinch<(track.pinched?.38:.25);
      track={x,y,vx:(x-track.x)/dt,vy:(y-track.y)/dt,time:now,pinched,drawing:hand.extended[1]&&!pinched&&!palmOpen&&confidence>.65};
    }else track={x:hand.tip.x,y:hand.tip.y,vx:0,vy:0,time:now,pinched:hand.pinch<.25,drawing:false};
    track.openPalm=palmOpen;handTracks.set(side,track);total+=hand.count;
    if(confidence<.65||track.pinched)reliable=false;
  });
  for(const side of ['left','right'])if(!assigned.has(side)){handTracks.delete(side);$('tip-'+side).hidden=true;}
  state.hands=hands.landmarks.length;$('hand-status').innerHTML=`${state.hands} <small>/ 2</small>`;
  if(state.mode==='paint'){
    const action=palmLatch.update(openPalm,now);
    $('palm-progress').style.width=(action.progress*100)+'%';
    $('color-hint-text').textContent=action.locked?'已换色 · 收起五指后可再次换色':action.progress>0?'保持五指张开 · '+Math.round(action.progress*100)+'%':'五指张开 0.7 秒 · 换色';
    if(action.triggered)setPalette((state.palette+1)%palettes.length,true);
  }
  if(state.mode==='number'){
    const n=latch.update(reliable?total:0,now);$('count-value').textContent=n.value||'—';$('count-progress').style.strokeDashoffset=321*(1-n.progress);
    $('count-caption').textContent=n.value?(n.progress===1?`${palettes[n.value-1].name} · 已选定`:'保持手势，正在确认…'):'伸出手指，选择 1–10';
    if(n.confirmed!==null){setPalette(n.confirmed-1,true);burst(12);}
  }
  if(data.freshFace&&state.expressions&&state.faceAvailable){
    const scores=data.face?.faceBlendshapes?.[0]?.categories;
    if(scores?.length){
      state.facePresent=true;faceLastSeen=now;
      const values=Object.fromEntries(scores.map(s=>[s.categoryName,s.score]));
      if(calibration){calibration.samples.push(values);if(now-calibration.started>=2000)finishCalibration(true);}
      state.mood=moodFilter.update(values,now);$('face-status').textContent=moodInfo[state.mood].label;
      $('mood-text').textContent=calibration?'放松面部，正在校准…':state.mood==='neutral'?'平静 · 色彩自在流动':state.mood==='happy'?'笑脸 · 让色彩暖一点':state.mood==='sad'?'哭脸 · 一点蓝色的涟漪':'皱眉 · 点燃色彩的能量';
    }else if(now-faceLastSeen>700){state.facePresent=false;state.mood='neutral';moodFilter.current='neutral';moodFilter.smooth={};$('face-status').textContent='寻找面部';$('mood-text').textContent='让整张脸进入画面';}
  }
  if(calibration&&now-calibration.started>6000)finishCalibration(false);
}
let previousAnimation=performance.now();
function animate(now){
  const dt=Math.min((now-previousAnimation)/1000,.05);previousAnimation=now;frameCount++;
  if(now-fpsTime>1000){$('fps').textContent=Math.round(frameCount*1000/(now-fpsTime));frameCount=0;fpsTime=now;}
  if(state.autoColor&&now-lastColorChange>=10000)setPalette((state.palette+1)%palettes.length);
  const mood=state.expressions&&state.facePresent?moodInfo[state.mood]:moodInfo.neutral;
  expressionSmooth+=(state.mood==='neutral'?0:1-expressionSmooth)*dt*2;
  if(state.mood==='neutral')expressionSmooth*=Math.exp(-dt*3);
  fluid?.configure({SPLAT_RADIUS:.08+state.radius*.008,CURL:18+(mood.curl-18)*expressionSmooth,BLOOM_INTENSITY:.6+(state.mood==='happy'&&state.facePresent?.2*expressionSmooth:0),BACK_COLOR:{r:5,g:12,b:16}});
  if(!state.interacted&&!state.paused){
    artTime+=dt;const t=artTime;
    for(let j=0;j<3;j++){
      const phase=t*.25+j*2.09;
      const x=.50+Math.sin(phase)*.25+Math.cos(phase*2.3)*.045,y=.54+Math.cos(phase*1.1)*.24;
      const dx=(Math.cos(phase)*.25-Math.sin(phase*2.3)*.1035)*100,dy=-Math.sin(phase*1.1)*.264*100;
      inject(x,y,dx,dy,j,.10+Math.min(t/12,.35));
    }
  }
  if(state.camera==='on'){
    if(now-lastResultTime>350){
      for(const side of ['left','right'])$('tip-'+side).hidden=true;
      skeletonCtx.clearRect(0,0,skeleton.width,skeleton.height);
    }
    for(const [side,track] of handTracks){
      const cursor=$('tip-'+side);const valid=state.mode==='paint'&&now-track.time<220;
      cursor.hidden=!valid;
      if(!valid)continue;
      cursor.style.left=track.x*100+'%';cursor.style.top=track.y*100+'%';cursor.classList.toggle('pinched',track.pinched);cursor.querySelector('small').textContent=track.openPalm?'换色手势':track.pinched?'已捏合':side==='left'?'左手':'右手';
      if(track.drawing&&!state.paused){
        const gain=state.force/50*155*mood.force;
        const strength=(.25+Math.min(Math.hypot(track.vx,track.vy),1)*.55)*dt*30;
        const down=mood===moodInfo.sad?22*expressionSmooth:0;
        inject(track.x,track.y,track.vx*gain,track.vy*gain+down,side==='left'?0:2,strength);
      }
    }
  }
  requestAnimationFrame(animate);
}
if(fluid){
  if(fluid.backend==='cpu')$('engine-state').textContent='FLUID · 兼容模式';
  // A composed first frame; subsequent ribbons are real fluid injections.
  for(let j=0;j<3;j++)for(let i=0;i<28;i++){
    const a=i/27*Math.PI*1.15+j*1.9;
    inject(.50+Math.sin(a)*.27,.54+Math.cos(a)*.24,Math.cos(a)*90,-Math.sin(a)*90,j,.11);
  }
}else{
  $('canvas-error').hidden=false;$('canvas-error').textContent='当前浏览器未能启动 WebGL 流体。请开启浏览器硬件加速，或换用新版 Chrome / Edge 后刷新。';
  $('engine-state').textContent='WEBGL 未就绪';
  for(const id of ['demo-button','pause','clear'])$(id).disabled=true;
}
requestAnimationFrame(animate);
document.addEventListener('visibilitychange',()=>{if(document.hidden){handTracks.clear();palmLatch.reset();resetColorHint();pointerHistory.clear();if(calibration)finishCalibration(false);}else if(state.camera==='on')lastResultTime=performance.now();});
window.addEventListener('pagehide',()=>stopCamera());
