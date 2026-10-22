/* A compact CPU stable-fluid renderer for browsers without WebGL.
 * Semi-Lagrangian advection + pressure projection + vorticity confinement.
 * Written for Chroma Flow; exposes the same input API as the WebGL renderer. */
if(!window.Fluid)(function(){
  let canvas=document.getElementById('fluid');
  // A failed GPU initialization may already have claimed the canvas context.
  const replacement=canvas.cloneNode();canvas.replaceWith(replacement);canvas=replacement;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
  const buffer=document.createElement('canvas'),bctx=buffer.getContext('2d');
  let w,h,n,u,v,u0,v0,red,green,blue,r0,g0,b0,pressure,p0,div,curl,image;
  let quality='medium',paused=false,queue=[],clear=false;
  let config={SPLAT_RADIUS:.4,CURL:18,DENSITY_DISSIPATION:.38};
  function allocate(){
    w=quality==='low'?88:quality==='high'?160:120;
    h=Math.max(48,Math.min(210,Math.round(w*canvas.clientHeight/Math.max(canvas.clientWidth,1))));n=w*h;
    buffer.width=w;buffer.height=h;image=bctx.createImageData(w,h);
    [u,v,u0,v0,red,green,blue,r0,g0,b0,pressure,p0,div,curl]=Array.from({length:14},()=>new Float32Array(n));
  }
  function zero(){for(const a of [u,v,u0,v0,red,green,blue,r0,g0,b0,pressure,p0,div,curl])a.fill(0);}
  const cap=(x,a,b)=>Math.max(a,Math.min(b,x));
  function inject(q){
    const cx=q.x*(w-1),cy=q.y*(h-1),radius=Math.max(1.1,Math.sqrt(config.SPLAT_RADIUS/100)*Math.min(w,h)*.85);
    const loX=Math.max(1,Math.floor(cx-radius*3)),hiX=Math.min(w-2,Math.ceil(cx+radius*3));
    const loY=Math.max(1,Math.floor(cy-radius*3)),hiY=Math.min(h-2,Math.ceil(cy+radius*3));
    for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
      const k=x+y*w,weight=Math.exp(-((x-cx)**2+(y-cy)**2)/(radius*radius));
      u[k]+=q.dx*.16*weight;v[k]+=q.dy*.16*weight;
      red[k]+=q.color.r*.6*weight;green[k]+=q.color.g*.6*weight;blue[k]+=q.color.b*.6*weight;
    }
  }
  function sample(a,x,y){
    x=cap(x,.5,w-1.5);y=cap(y,.5,h-1.5);const x0=x|0,y0=y|0,fx=x-x0,fy=y-y0,k=x0+y0*w;
    return a[k]*(1-fx)*(1-fy)+a[k+1]*fx*(1-fy)+a[k+w]*(1-fx)*fy+a[k+w+1]*fx*fy;
  }
  function advect(out,input,velx,vely,dt,decay){
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const k=x+y*w;out[k]=sample(input,x-velx[k]*dt,y-vely[k]*dt)*decay;}
  }
  function project(){
    pressure.fill(0);p0.fill(0);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const k=x+y*w;div[k]=-.5*(u[k+1]-u[k-1]+v[k+w]-v[k-w]);}
    for(let j=0;j<12;j++){
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const k=x+y*w;p0[k]=(div[k]+pressure[k-1]+pressure[k+1]+pressure[k-w]+pressure[k+w])*.25;}
      [pressure,p0]=[p0,pressure];
    }
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const k=x+y*w;u[k]-=.5*(pressure[k+1]-pressure[k-1]);v[k]-=.5*(pressure[k+w]-pressure[k-w]);}
    for(let x=0;x<w;x++){v[x]=0;v[x+(h-1)*w]=0;}
    for(let y=0;y<h;y++){u[y*w]=0;u[y*w+w-1]=0;}
  }
  function step(dt){
    for(const q of queue.splice(0,100))inject(q);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const k=x+y*w;curl[k]=.5*(v[k+1]-v[k-1]-u[k+w]+u[k-w]);}
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
      const k=x+y*w,nx=Math.abs(curl[k+1])-Math.abs(curl[k-1]),ny=Math.abs(curl[k+w])-Math.abs(curl[k-w]);const len=Math.hypot(nx,ny)+1e-5;
      u[k]=cap(u[k]+ny/len*curl[k]*config.CURL*.16*dt,-170,170);v[k]=cap(v[k]-nx/len*curl[k]*config.CURL*.16*dt,-170,170);
    }
    advect(u0,u,u,v,dt,Math.exp(-.15*dt));advect(v0,v,u,v,dt,Math.exp(-.15*dt));[u,u0]=[u0,u];[v,v0]=[v0,v];project();
    const decay=Math.exp(-config.DENSITY_DISSIPATION*dt);
    advect(r0,red,u,v,dt,decay);advect(g0,green,u,v,dt,decay);advect(b0,blue,u,v,dt,decay);
    [red,r0]=[r0,red];[green,g0]=[g0,green];[blue,b0]=[b0,blue];
  }
  function render(){
    const pixels=image.data;
    for(let i=0;i<n;i++){
      const k=i*4;
      pixels[k]=5+250*(1-Math.exp(-red[i]*1.9));pixels[k+1]=12+243*(1-Math.exp(-green[i]*1.9));pixels[k+2]=16+239*(1-Math.exp(-blue[i]*1.9));pixels[k+3]=255;
    }
    bctx.putImageData(image,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(buffer,0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='screen';ctx.globalAlpha=.10;ctx.filter='blur(16px)';ctx.drawImage(buffer,0,0,canvas.width,canvas.height);ctx.globalAlpha=1;ctx.filter='none';ctx.globalCompositeOperation='source-over';
  }
  window.Fluid={backend:'cpu',inject(x,y,dx,dy,color){if(queue.length<160&&!paused)queue.push({x,y,dx,dy,color});},configure(values){Object.assign(config,values);},clear(){clear=true;queue=[];},pause(value){paused=value;},quality(value){quality=value;allocate();}};
  let last=performance.now(),lastSize='',nextFrame=0;
  function frame(now){
    requestAnimationFrame(frame);if(now-nextFrame<25)return;
    nextFrame=now;const size=canvas.clientWidth+'x'+canvas.clientHeight;
    if(lastSize!==size){lastSize=size;canvas.width=Math.round(canvas.clientWidth*Math.min(devicePixelRatio,1.5));canvas.height=Math.round(canvas.clientHeight*Math.min(devicePixelRatio,1.5));allocate();}
    const dt=Math.min((now-last)/1000,.04);last=now;
    if(clear){zero();clear=false;}
    if(!paused)step(dt);render();
  }
  allocate();requestAnimationFrame(frame);
})();
