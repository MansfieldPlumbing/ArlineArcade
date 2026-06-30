/* ============================================================================
   Arline Arcade — cinematic intro (Canvas2D)
   The REAL deck tumbles and flips (face <-> blue rider back) over the felt with
   gold coins; at the sting the logo pops with a flash and a burst of cards.
   Canvas2D — runs on every phone. Once per session, with a skip, a hard safety
   timeout, and a reduced-motion path.
   ============================================================================ */
import sfx from './sfx.js';

const SEEN_KEY = 'arline-intro-v3';   // bumped: new real-card intro
const T_LOGO = 1.5;
const T_END  = 5.0;

const intro = document.getElementById('intro');
const canvas = document.getElementById('introgl');
const logo  = document.getElementById('introLogo');
const skip  = document.getElementById('introSkip');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const force = /[?&]intro(=|&|$)/.test(location.search) || location.hash === '#intro';

// real-card sprite: cells 0-7 are faces, cell 8 is the rider back (3x3, 240x360 each)
const CW = 240, CH = 360, COLS = 3, FACE_CELLS = 8, BACK_CELL = 8;
const sprite = new Image();
sprite.src = new URL('../intro/deck-sprite.png', import.meta.url).href;
const spriteReady = () => sprite.complete && sprite.naturalWidth > 0;

// "Replay intro" lives in the arcade (outside the overlay), so wire it always.
const replayBtn = document.getElementById('introReplay');
if(replayBtn) replayBtn.addEventListener('click', ()=>{ sessionStorage.removeItem(SEEN_KEY); location.reload(); });

if(!intro){ /* not the home page */ }
else if(!force && sessionStorage.getItem(SEEN_KEY)){ removeIntro(true); }
else { start(); }

function removeIntro(instant){
  if(!intro) return;
  sessionStorage.setItem(SEEN_KEY,'1');
  if(instant){ intro.remove(); document.body.classList.remove('intro-lock'); return; }
  intro.classList.add('gone');
  setTimeout(()=>{ intro.remove(); document.body.classList.remove('intro-lock'); }, 650);
}

function start(){
  document.body.classList.add('intro-lock');
  let finished = false;
  const finish = ()=>{ if(finished) return; finished = true; removeIntro(false); };
  setTimeout(finish, (T_END + 1.5) * 1000);   // hard safety: never strand the user

  const arm = ()=>{ sfx.unlock(); sfx.shuffle(); window.removeEventListener('pointerdown', arm); };
  sfx.unlock(); sfx.shuffle();
  window.addEventListener('pointerdown', arm, {once:true});
  skip && skip.addEventListener('click', (e)=>{ e.stopPropagation(); finish(); });
  intro.addEventListener('click', finish);

  let flash = 0;
  let popped = false;
  const popLogo = ()=>{
    if(popped) return; popped = true;
    logo && logo.classList.add('pop'); sfx.win();
    flash = 1; spawnBurst();
  };

  const ctx = (!reduce && canvas) ? canvas.getContext('2d') : null;
  if(!ctx){
    canvas && (canvas.style.display='none');
    setTimeout(popLogo, reduce?150:500);
    setTimeout(finish, reduce?1600:3200);
    return;
  }

  let W=0, H=0, dpr=1, cw=80;
  const resize = ()=>{
    dpr = Math.min(window.devicePixelRatio||1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    cw = Math.max(54, Math.min(110, W*0.092));
  };
  resize(); window.addEventListener('resize', resize);

  const rnd = (a,b)=>a+Math.random()*(b-a);
  const COLW = 6;
  const cards = Array.from({length:20}, (_,i)=>({
    lane:i%COLW, y:rnd(-1.3,1.0), rot:rnd(0,Math.PI*2), vr:rnd(-1.3,1.3),
    vy:rnd(0.10,0.19), face:(Math.random()*FACE_CELLS)|0, fl:rnd(0,Math.PI*2),
    vfl:rnd(1.2,2.6)*(Math.random()<.5?-1:1), depth:rnd(.72,1.18)
  }));
  const coins = Array.from({length:14}, (_,i)=>({
    lane:i%5, y:rnd(-1.3,1.0), spin:rnd(0,Math.PI*2), vs:rnd(2.0,3.4), vy:rnd(0.13,0.22), depth:rnd(.7,1.1)
  }));
  const burst = [];   // radial cards spawned on the logo pop
  function spawnBurst(){
    for(let i=0;i<9;i++){
      const a = (i/9)*Math.PI*2 + rnd(-.2,.2);
      burst.push({ x:W/2, y:H*0.42, vx:Math.cos(a)*rnd(180,340), vy:Math.sin(a)*rnd(180,340)-60,
        rot:rnd(0,6), vr:rnd(-5,5), face:(Math.random()*FACE_CELLS)|0, life:1, depth:rnd(.6,.95) });
    }
  }

  const t0 = performance.now(); let last = t0; let raf = 0;
  const frame = ()=>{
    const now = performance.now();
    const t = (now - t0)/1000;
    const dt = Math.min(0.05, (now - last)/1000); last = now;
    if(t >= T_LOGO) popLogo();
    if(t >= T_END){ cancelAnimationFrame(raf); window.removeEventListener('resize',resize); finish(); return; }

    ctx.clearRect(0,0,W,H);
    for(const o of coins){
      o.y += o.vy*dt; o.spin += o.vs*dt;
      if(o.y > 1.18){ o.y = -0.2; o.lane=(Math.random()*5)|0; }
      drawCoin(o);
    }
    if(spriteReady()){
      for(const c of cards){
        c.y += c.vy*dt; c.rot += c.vr*dt; c.fl += c.vfl*dt;
        if(c.y > 1.2){ c.y = -0.28; c.lane=(Math.random()*COLW)|0; c.face=(Math.random()*FACE_CELLS)|0; }
        drawCard(c);
      }
      for(let i=burst.length-1;i>=0;i--){
        const o = burst[i];
        o.vy += 520*dt;                       // gravity
        o.x += o.vx*dt; o.y += o.vy*dt; o.rot += o.vr*dt; o.life -= dt*0.55;
        if(o.life<=0 || o.y>H+120){ burst.splice(i,1); continue; }
        drawBurst(o);
      }
    }
    if(flash > 0){
      ctx.fillStyle = `rgba(255,248,228,${flash*0.55})`;
      ctx.fillRect(0,0,W,H); flash = Math.max(0, flash - dt*1.7);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  function laneX(lane){
    const m = W*0.10, span = W - m*2;
    return m + (lane+0.5)/COLW*span + Math.sin(lane*1.7)*8;
  }
  function roundRectPath(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function cellAt(idx,dx,dy,dw,dh){
    const sx=(idx%COLS)*CW, sy=((idx/COLS)|0)*CH;
    ctx.drawImage(sprite, sx,sy,CW,CH, dx,dy,dw,dh);
  }
  function paintCard(w,h,cellIdx,sx){
    ctx.scale(Math.max(0.06, Math.abs(sx)), 1);
    ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=w*0.16; ctx.shadowOffsetY=h*0.04;
    roundRectPath(-w/2,-h/2,w,h,w*0.08);
    ctx.fillStyle='#fff'; ctx.fill();           // backing so shadow + white border read
    ctx.shadowColor='transparent';
    ctx.save(); roundRectPath(-w/2,-h/2,w,h,w*0.08); ctx.clip();
    cellAt(cellIdx, -w/2,-h/2,w,h);
    ctx.restore();
    ctx.lineWidth=Math.max(1,w*0.03); ctx.strokeStyle='rgba(202,162,74,.85)';
    roundRectPath(-w/2,-h/2,w,h,w*0.08); ctx.stroke();
  }
  function drawCard(c){
    const w = cw*c.depth, h = w*1.4;
    const x = laneX(c.lane), y = c.y*(H+h*2) - h;
    const sx = Math.cos(c.fl);                  // 3D flip around Y
    const cell = sx >= 0 ? c.face : BACK_CELL;  // front shows face, back shows rider back
    ctx.save(); ctx.translate(x,y); ctx.rotate(c.rot);
    paintCard(w,h,cell,sx); ctx.restore();
  }
  function drawBurst(o){
    const w = cw*o.depth, h = w*1.4;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1,o.life));
    ctx.translate(o.x,o.y); ctx.rotate(o.rot);
    paintCard(w,h,o.face,1); ctx.restore(); ctx.globalAlpha=1;
  }
  function drawCoin(o){
    const r = cw*o.depth*0.4;
    const x = laneX(o.lane), y = o.y*(H+r*4) - r*2;
    const sx = Math.max(0.12, Math.abs(Math.cos(o.spin)));
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
    ctx.shadowColor='rgba(0,0,0,.4)'; ctx.shadowBlur=r*0.5; ctx.shadowOffsetY=r*0.3;
    const g = ctx.createRadialGradient(-r*0.3,-r*0.3,r*0.1, 0,0,r);
    g.addColorStop(0,'#fff4c0'); g.addColorStop(.55,'#e8b73a'); g.addColorStop(1,'#a9791a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.fill();
    ctx.shadowColor='transparent';
    ctx.lineWidth=r*0.14; ctx.strokeStyle='#fff4c0'; ctx.beginPath(); ctx.arc(0,0,r*0.66,0,7); ctx.stroke();
    ctx.fillStyle='#a9791a'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`bold ${Math.floor(r*0.9)}px "Segoe UI",sans-serif`; ctx.fillText('$',0,r*0.04);
    ctx.restore();
  }
}
