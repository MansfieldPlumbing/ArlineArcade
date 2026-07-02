/* ============================================================================
   Basketball — Arline Arcade. DOM / canvas / input layer over the pure engine
   (engine.js — see sim.mjs for the headless proof). Portrait pop-a-shot:
   flick up from the racked ball; gravity, gold rim and glass do the rest.
   60 seconds, +2 a basket, three straight lights the fire (+1 a make), and
   every 5 makes the hoop starts drifting. No libraries, no build step.
   ========================================================================== */
import { C, createGame, shoot, step } from './engine.js';
import sfx from '../../assets/js/sfx.js';

const PRM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BEST_KEY = 'arcade-bball-best';

const wrap     = document.getElementById('courtWrap');
const canvas   = document.getElementById('court');
const ctx      = canvas.getContext('2d');
const scoreEl  = document.getElementById('score');
const bestEl   = document.getElementById('best');
const timerEl  = document.getElementById('timer');
const statusEl = document.getElementById('status');
const endPanel = document.getElementById('endPanel');
const finalEl  = document.getElementById('finalScore');
const bestLine = document.getElementById('bestLine');
const againBtn = document.getElementById('again');

/* ---- state ----------------------------------------------------------------- */
let game = createGame(Math.random);
let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
let rackT = 0;              // rack-respawn cooldown (new flicks ignored while > 0)
let rackPop = 0;            // rack ball pop-in animation
let netK = 0;               // net reaction on a make
let rimFlash = 0, boardFlash = 0;
let panelShown = false;
let statusT = 0;            // transient status countdown (s)
let particles = [];
const log = [];             // event log (debug / smoke tests)
window.__bball = { get game(){ return game; }, log };

bestEl.textContent = best;

/* ---- canvas fit ------------------------------------------------------------- */
let W = 0, H = 0;
function fit(){
  const r = wrap.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', fit);
fit();

/* ---- world -> screen (portrait pseudo-3D) ------------------------------------ */
const VP = { persp: 0.45, floorY: 0.90, slope: 0.20, lift: 0.56 };
const sD  = d => 1 / (1 + VP.persp * d);                    // perspective scale
const yF  = d => H * (VP.floorY - d * VP.slope);            // floor line at depth d
const sy  = (d, h) => yF(d) - h * H * VP.lift * sD(d);
const sx  = (x, d) => W / 2 + x * W * sD(d);
const rPx = d => C.BALL_R * W * sD(d);

/* ---- input: flick to shoot ---------------------------------------------------- */
let ptrId = null, samples = [];
canvas.addEventListener('pointerdown', e => {
  ptrId = e.pointerId;
  samples = [[e.clientX, e.clientY, performance.now()]];
  try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== ptrId) return;
  const now = performance.now();
  samples.push([e.clientX, e.clientY, now]);
  while (samples.length > 2 && now - samples[0][2] > 130) samples.shift();
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerId !== ptrId) return;
  ptrId = null;
  samples.push([e.clientX, e.clientY, performance.now()]);
  flick();
});
canvas.addEventListener('pointercancel', () => { ptrId = null; samples = []; });

function flick(){
  if (samples.length < 2 || H === 0) return;
  const a = samples[0], b = samples[samples.length - 1];
  const dt = Math.max(0.016, (b[2] - a[2]) / 1000);
  const up  = (a[1] - b[1]) / dt / H;         // canvas-heights per second, up
  const lat = (b[0] - a[0]) / dt / H;
  samples = [];
  const vy = up * 1.2;                        // -> engine power units
  if (vy < 0.5) return;                       // just a tap / sideways wiggle
  tryShoot(lat * 0.9, vy);
}

canvas.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter'){
    e.preventDefault();
    tryShoot((Math.random() - 0.5) * 0.1, 2.55 + Math.random() * 0.3);
  }
});

function tryShoot(vx, vy){
  if (game.over || rackT > 0) return false;   // same ball still respawning
  const b = shoot(game, vx, vy);              // engine caps at 3 in flight
  if (!b) return false;
  sfx.pickup();
  rackT = 0.26;
  rackPop = 1;
  if (statusT <= 0) statusEl.textContent = baseStatus();   // clear the intro hint
  return true;
}

/* ---- round events -------------------------------------------------------------- */
function handle(ev){
  for (const e of ev){
    log.push(e.type);
    if (log.length > 300) log.shift();
    switch (e.type){
      case 'rim':    sfx.place(); rimFlash = 1; break;
      case 'board':  sfx.place(); boardFlash = 1; break;
      case 'score':{
        sfx.foundation();
        netK = 1;
        burst(sx(game.hoopX, C.RIM_D), sy(C.RIM_D, C.RIM_H));
        scoreEl.textContent = game.score;
        scoreEl.classList.add('bump');
        setTimeout(() => scoreEl.classList.remove('bump'), 160);
        setStatus(e.swish ? `Swish! +${e.pts}` : `+${e.pts}!`, 1.1);
        break;
      }
      case 'fire':    sfx.win(); setStatus('ON FIRE! Baskets are +3', 2.2); break;
      case 'fireEnd': setStatus("The fire's out.", 1.4); break;
      case 'level':   setStatus('Heads up — the hoop is on the move!', 2.2); break;
      case 'end':     sfx.win(); break;
      case 'miss':    break;
    }
  }
}

function setStatus(text, secs){
  statusEl.textContent = text;
  statusT = secs;
}
function baseStatus(){
  if (!game.started) return 'Flick the ball up to shoot — 60 seconds on the clock';
  if (game.over)     return 'Buzzer! Nice shooting.';
  if (game.onFire)   return 'ON FIRE! Baskets are +3';
  return '';
}

/* ---- particles (cheap canvas dots; skipped under reduced motion) ---------------- */
function burst(x, y){
  if (PRM) return;
  for (let i = 0; i < 14; i++){
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 140;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
                     ttl: 0.55, life: 0.55, r: 1.5 + Math.random() * 2.5, kind: 'spark' });
  }
}
function trail(b){
  if (PRM) return;
  const x = sx(b.x, b.d), y = sy(b.d, b.h), r = rPx(b.d);
  for (let i = 0; i < 2; i++){
    particles.push({ x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r,
                     vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 40,
                     ttl: 0.4, life: 0.4, r: r * (0.25 + Math.random() * 0.3), kind: 'fire' });
  }
}
function stepParticles(dt){
  for (const p of particles){
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'spark') p.vy += 260 * dt;
  }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles(){
  for (const p of particles){
    const t = p.life / p.ttl;
    ctx.globalAlpha = t * 0.9;
    ctx.fillStyle = p.kind === 'fire'
      ? (t > 0.5 ? '#ffd257' : '#ff7a1f')
      : '#ffe9a0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.r * (0.4 + 0.6 * t)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---- drawing --------------------------------------------------------------------- */
/** roundRect path with a fallback for older tablets. */
function rrect(x, y, w, h, r){
  ctx.beginPath();
  if (ctx.roundRect){ ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCourt(){
  const hz = yF(C.D_MAX);
  // floor shading below the horizon
  const g = ctx.createLinearGradient(0, hz, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.26)');
  ctx.fillStyle = g;
  ctx.fillRect(0, hz, W, H - hz);
  ctx.strokeStyle = 'rgba(0,0,0,.20)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();

  // the lane, converging on the hoop
  const LW = 0.24, dNear = -0.5, dFar = C.BOARD_D;
  ctx.beginPath();
  ctx.moveTo(sx(-LW, dNear), yF(dNear));
  ctx.lineTo(sx( LW, dNear), yF(dNear));
  ctx.lineTo(sx( LW, dFar), yF(dFar));
  ctx.lineTo(sx(-LW, dFar), yF(dFar));
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,176,.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // free-throw circle
  const fr = 0.16 * W * sD(0.3);
  ctx.beginPath();
  ctx.ellipse(sx(0, 0.3), yF(0.3), fr, fr * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawShadow(b){
  const r = rPx(b.d);
  const a = 0.30 / (1 + b.h * 2.2);
  ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(sx(b.x, b.d), yF(b.d), r * 1.05 / (1 + b.h * 0.5), r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawStand(){
  const s = sD(C.BOARD_D);
  const bx = sx(game.hoopX, C.BOARD_D);
  const topY = sy(C.BOARD_D, C.BOARD_BOT);
  const botY = yF(C.BOARD_D + 0.02);
  const w = Math.max(4, 0.016 * W * s);
  const g = ctx.createLinearGradient(bx - w, 0, bx + w, 0);
  g.addColorStop(0, '#3c2c10'); g.addColorStop(0.5, '#7a5c22'); g.addColorStop(1, '#2c1f0a');
  ctx.fillStyle = g;
  ctx.fillRect(bx - w / 2, topY, w, botY - topY);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(bx, botY, w * 2.4, w * 0.8, 0, 0, Math.PI * 2); ctx.fill();
}

function drawBoard(){
  const s = sD(C.BOARD_D);
  const bx = sx(game.hoopX, C.BOARD_D);
  const half = 0.17 * W * s;
  const topY = sy(C.BOARD_D, C.BOARD_TOP), botY = sy(C.BOARD_D, C.BOARD_BOT);
  // glass
  ctx.fillStyle = `rgba(235,248,255,${(0.13 + boardFlash * 0.22).toFixed(3)})`;
  rrect(bx - half, topY, half * 2, botY - topY, 5);
  ctx.fill();
  // sheen
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.beginPath();
  ctx.moveTo(bx - half * 0.7, topY); ctx.lineTo(bx - half * 0.25, topY);
  ctx.lineTo(bx - half * 0.55, botY); ctx.lineTo(bx - half, botY);
  ctx.closePath(); ctx.fill();
  // gold frame
  ctx.lineWidth = Math.max(2.5, half * 0.05);
  ctx.strokeStyle = '#c9942c';
  rrect(bx - half, topY, half * 2, botY - topY, 5); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,240,176,.5)';
  rrect(bx - half + 2, topY + 2, half * 2 - 4, botY - topY - 4, 4); ctx.stroke();
  // shooter's square
  const ht = 0.05 * W * s;
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx - ht, sy(C.BOARD_D, 1.17), ht * 2, sy(C.BOARD_D, 1.01) - sy(C.BOARD_D, 1.17));
}

function rimGeo(){
  const rx = C.RIM_HALF * W * sD(C.RIM_D);
  return { cx: sx(game.hoopX, C.RIM_D), cy: sy(C.RIM_D, C.RIM_H), rx, ry: rx * 0.42, lw: Math.max(3.5, rx * 0.17) };
}

function drawRimBack(){
  const { cx, cy, rx, ry, lw } = rimGeo();
  ctx.lineWidth = lw * 0.8;
  ctx.strokeStyle = '#8a5f14';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = lw * 0.4;
  ctx.strokeStyle = '#c9942c';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2); ctx.stroke();
}

function drawRimFront(){
  const { cx, cy, rx, ry, lw } = rimGeo();
  ctx.lineCap = 'round';
  ctx.lineWidth = lw + 2;
  ctx.strokeStyle = '#6d4a0c';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); ctx.stroke();
  ctx.lineWidth = lw;
  ctx.strokeStyle = rimFlash > 0.02 ? `rgba(255,240,176,1)` : '#e9c34a';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); ctx.stroke();
  ctx.lineWidth = lw * 0.35;
  ctx.strokeStyle = 'rgba(255,240,176,.85)';
  ctx.beginPath(); ctx.ellipse(cx, cy - lw * 0.18, rx * 0.97, ry * 0.9, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawNet(){
  const { cx, cy, rx, ry } = rimGeo();
  const kick = PRM ? netK * 0.08 : netK * 0.22;
  const len = rx * 1.35 * (1 + kick);
  const brx = rx * (0.52 + netK * 0.1), by = cy + len;
  const N = 7;
  ctx.strokeStyle = 'rgba(255,250,235,.55)';
  ctx.lineWidth = Math.max(1, rx * 0.05);
  ctx.beginPath();
  for (let i = 0; i < N; i++){
    const a  = (i / N) * Math.PI * 2;
    const a2 = ((i + 0.5) / N) * Math.PI * 2;
    const a3 = ((i - 0.5) / N) * Math.PI * 2;
    const tx = cx + rx * Math.cos(a),  ty = cy + ry * Math.sin(a);
    ctx.moveTo(tx, ty); ctx.lineTo(cx + brx * Math.cos(a2), by + ry * 0.4 * Math.sin(a2));
    ctx.moveTo(tx, ty); ctx.lineTo(cx + brx * Math.cos(a3), by + ry * 0.4 * Math.sin(a3));
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, by, brx, ry * 0.4, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBasketball(x, y, r, rot, glow){
  if (glow && !PRM){
    ctx.shadowColor = 'rgba(255,140,30,.85)';
    ctx.shadowBlur = r * 1.1;
  }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  g.addColorStop(0, '#ffb066'); g.addColorStop(0.45, '#ef8a2b');
  g.addColorStop(0.8, '#c65d15'); g.addColorStop(1, '#8f3c0a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(80,30,5,.55)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  // seams
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r * 0.985, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(90,35,8,.6)';
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.98, r * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.38, r * 0.98, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawBall(b){
  drawBasketball(sx(b.x, b.d), sy(b.d, b.h), rPx(b.d), b._rot || 0, game.onFire && !b.missed);
}

function drawRack(dt){
  const rackFree = game.balls.length < C.MAX_BALLS && !game.over;
  if (!rackFree) return;
  rackPop = Math.max(0, rackPop - dt / 0.26);
  const pop = 1 - rackPop;
  const scale = PRM ? 1 : 0.3 + 0.7 * (1 - (1 - pop) * (1 - pop));   // decelerate ease
  drawBasketball(sx(0, 0), sy(0, C.RACK_H), rPx(0) * scale, 0, false);
  if (!game.started){
    // "flick up" chevrons
    const x = sx(0, 0), y0 = sy(0, C.RACK_H) - rPx(0) - 12;
    const wob = PRM ? 0 : Math.sin(performance.now() / 300) * 4;
    ctx.strokeStyle = 'rgba(255,240,176,.85)';
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++){
      const y = y0 - i * 14 + wob;
      ctx.beginPath();
      ctx.moveTo(x - 10, y); ctx.lineTo(x, y - 9); ctx.lineTo(x + 10, y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
}

function draw(dt){
  ctx.clearRect(0, 0, W, H);
  drawCourt();
  for (const b of game.balls) drawShadow(b);
  drawStand();
  drawBoard();
  drawRimBack();
  const behind = game.balls.filter(b => b.d > C.RIM_D).sort((a, b) => b.d - a.d);
  const front  = game.balls.filter(b => b.d <= C.RIM_D).sort((a, b) => b.d - a.d);
  for (const b of behind) drawBall(b);
  drawNet();
  drawParticles();
  drawRimFront();
  for (const b of front) drawBall(b);
  drawRack(dt);
}

/* ---- HUD / round flow -------------------------------------------------------------- */
function hud(dt){
  const t = game.started ? Math.max(0, Math.ceil(game.timeLeft)) : C.ROUND_TIME;
  if (timerEl.textContent !== String(t)) timerEl.textContent = t;
  timerEl.classList.toggle('low', game.started && !game.over && game.timeLeft <= 10);
  if (scoreEl.textContent !== String(game.score)) scoreEl.textContent = game.score;
  statusEl.classList.toggle('fire', game.onFire);
  if (statusT > 0){
    statusT -= dt;
    if (statusT <= 0) statusEl.textContent = baseStatus();
  } else if (statusEl.textContent === '' && baseStatus() !== ''){
    statusEl.textContent = baseStatus();
  }
  if (game.over && game.balls.length === 0 && !panelShown) showPanel();
}

function showPanel(){
  panelShown = true;
  finalEl.textContent = game.score;
  if (game.score > best){
    best = game.score;
    try{ localStorage.setItem(BEST_KEY, String(best)); }catch(_){}
    bestLine.textContent = `New best — ${best}!`;
    bestLine.classList.add('record');
  } else {
    bestLine.textContent = `Best: ${best}`;
    bestLine.classList.remove('record');
  }
  bestEl.textContent = best;
  endPanel.hidden = false;
  statusEl.textContent = baseStatus();
  againBtn.focus({ preventScroll: true });
}

againBtn.addEventListener('click', () => {
  game = createGame(Math.random);
  panelShown = false;
  endPanel.hidden = true;
  particles = [];
  netK = rimFlash = boardFlash = 0;
  rackT = 0; rackPop = 0; statusT = 0;
  scoreEl.textContent = '0';
  timerEl.textContent = C.ROUND_TIME;
  statusEl.textContent = baseStatus();
  canvas.focus({ preventScroll: true });
});

/* ---- main loop ------------------------------------------------------------------------ */
let last = performance.now(), acc = 0;
function frame(now){
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= C.DT){
    handle(step(game));
    for (const b of game.balls){
      b._rot = (b._rot || 0) + (b.vd + Math.abs(b.vx) + 0.6) * C.DT * 4;
      if (game.onFire && !b.missed && b.h > b.r + 0.01) trail(b);
    }
    acc -= C.DT;
  }
  rackT = Math.max(0, rackT - dt);
  netK = Math.max(0, netK - dt * 1.8);
  rimFlash = Math.max(0, rimFlash - dt * 5);
  boardFlash = Math.max(0, boardFlash - dt * 5);
  stepParticles(dt);
  if (W > 0) draw(dt);
  hud(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

statusEl.textContent = baseStatus();
