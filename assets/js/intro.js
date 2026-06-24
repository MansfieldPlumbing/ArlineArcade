/* ============================================================================
   Arline Arcade — cinematic intro (compatible Canvas2D build)
   Playing cards (real ♠♥♦♣) and gold coins tumble over the green felt, then the
   logo pops with a chiptune sting and the arcade fades in.
   Canvas2D — runs on every phone, no WebGL required. Once per session, with a
   skip, a hard safety timeout, and a reduced-motion path.
   ============================================================================ */
import sfx from './sfx.js';

const SEEN_KEY = 'arline-intro-v2';   // bumped: replays once after the casino redesign
const T_LOGO = 1.5;
const T_END  = 5.0;

const intro = document.getElementById('intro');
const canvas = document.getElementById('introgl');
const logo  = document.getElementById('introLogo');
const skip  = document.getElementById('introSkip');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const force = /[?&]intro(=|&|$)/.test(location.search) || location.hash === '#intro';

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

const SUITS = [['♠',false],['♥',true],['♦',true],['♣',false]];
const RANKS = ['A','K','Q','J','10','7'];

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

  let popped = false;
  const popLogo = ()=>{ if(popped) return; popped = true; logo && logo.classList.add('pop'); sfx.win(); };

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
    cw = Math.max(46, Math.min(96, W*0.082));
  };
  resize(); window.addEventListener('resize', resize);

  // deck of falling cards + coins, seeded in lanes so they don't clump
  const rnd = (a,b)=>a+Math.random()*(b-a);
  const COLS = 6;
  const cards = Array.from({length:18}, (_,i)=>{
    const s = SUITS[(Math.random()*4)|0];
    return { lane:i%COLS, x:0, y:rnd(-1.2,1.0), rot:rnd(0,Math.PI*2),
      vr:rnd(-1.6,1.6), vy:rnd(0.10,0.20), suit:s[0], red:s[1],
      rank:RANKS[(Math.random()*RANKS.length)|0], face:Math.random()<0.78, depth:rnd(.7,1.15) };
  });
  const coins = Array.from({length:12}, (_,i)=>({
    lane:i%5, x:0, y:rnd(-1.2,1.0), spin:rnd(0,Math.PI*2), vs:rnd(2.0,3.4), vy:rnd(0.13,0.22), depth:rnd(.7,1.1)
  }));

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
    for(const c of cards){
      c.y += c.vy*dt; c.rot += c.vr*dt;
      if(c.y > 1.2){ c.y = -0.25; c.lane=(Math.random()*COLS)|0; }
      drawCard(c);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  function laneX(lane, depth){
    const m = W*0.10;
    const span = W - m*2;
    return m + (lane+0.5)/COLS*span + Math.sin((lane*1.7))*8;
  }
  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function drawCard(c){
    const w = cw*c.depth, h = w*1.4;
    const x = laneX(c.lane,c.depth), y = c.y*(H+h*2) - h;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(c.rot);
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = w*0.18; ctx.shadowOffsetY = h*0.04;
    roundRect(-w/2,-h/2,w,h,w*0.1);
    if(c.face){
      ctx.fillStyle = '#f7f3ea'; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = Math.max(1,w*0.045); ctx.strokeStyle = '#caa24a';
      roundRect(-w/2+w*0.06,-h/2+w*0.06,w-w*0.12,h-w*0.12,w*0.08); ctx.stroke();
      ctx.fillStyle = c.red ? '#d11f33' : '#1d2129';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font = `${Math.floor(h*0.46)}px "Cascadia Code NF","Segoe UI Symbol",serif`;
      ctx.fillText(c.suit, 0, h*0.02);
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.font = `bold ${Math.floor(h*0.15)}px "Segoe UI",sans-serif`;
      ctx.fillText(c.rank, -w/2+w*0.1, -h/2+h*0.05);
      ctx.font = `${Math.floor(h*0.13)}px "Cascadia Code NF","Segoe UI Symbol",serif`;
      ctx.fillText(c.suit, -w/2+w*0.1, -h/2+h*0.05+h*0.15);
    } else {
      ctx.fillStyle = '#16213c'; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = Math.max(1,w*0.045); ctx.strokeStyle = '#caa24a';
      roundRect(-w/2+w*0.08,-h/2+w*0.08,w-w*0.16,h-w*0.16,w*0.07); ctx.stroke();
      ctx.fillStyle = 'rgba(202,162,74,.5)';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font = `${Math.floor(h*0.32)}px "Cascadia Code NF","Segoe UI Symbol",serif`;
      ctx.fillText('♦', 0, 0);
    }
    ctx.restore();
  }
  function drawCoin(o){
    const r = cw*o.depth*0.42;
    const x = laneX(o.lane,o.depth), y = o.y*(H+r*4) - r*2;
    const sx = Math.max(0.12, Math.abs(Math.cos(o.spin)));   // edge-on flip
    ctx.save();
    ctx.translate(x, y); ctx.scale(sx, 1);
    ctx.shadowColor='rgba(0,0,0,.4)'; ctx.shadowBlur=r*0.5; ctx.shadowOffsetY=r*0.3;
    const g = ctx.createRadialGradient(-r*0.3,-r*0.3,r*0.1, 0,0,r);
    g.addColorStop(0,'#fff0b0'); g.addColorStop(.55,'#e8b73a'); g.addColorStop(1,'#a9791a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.fill();
    ctx.shadowColor='transparent';
    ctx.lineWidth=r*0.14; ctx.strokeStyle='#fff0b0'; ctx.beginPath(); ctx.arc(0,0,r*0.66,0,7); ctx.stroke();
    ctx.fillStyle='#a9791a'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`bold ${Math.floor(r*0.9)}px "Segoe UI",sans-serif`; ctx.fillText('$',0,r*0.04);
    ctx.restore();
  }
}
