/* ============================================================================
   Ping Pong — Arline Arcade · DOM / canvas / input layer.
   The rules and physics live in engine.js (pure, verified by sim.mjs);
   this file draws the Curveball-style tunnel with plain 2D-canvas
   perspective projection and wires up Pointer Events + sounds.
   ========================================================================== */

import * as E from './engine.js';
import sfx from '../../assets/js/sfx.js';

const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ---- elements ------------------------------------------------------------- */
const canvas    = document.getElementById('court');
const ctx       = canvas.getContext('2d');
const statusEl  = document.getElementById('status');
const scoreYou  = document.getElementById('scoreYou');
const scoreCpu  = document.getElementById('scoreCpu');
const rallyEl   = document.getElementById('rally');
const serveYou  = document.getElementById('serveYou');
const serveCpu  = document.getElementById('serveCpu');
const overlay   = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayLine  = document.getElementById('overlayLine');
const againBtn  = document.getElementById('againBtn');
const bestEl    = document.getElementById('best');

/* ---- saved bests ----------------------------------------------------------- */
const BEST_KEY = 'arcade-pingpong-best';
let best = { rally: 0, wins: 0, matches: 0 };
try { best = { ...best, ...(JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}) }; } catch {}
function saveBest(){
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch {}
  bestEl.textContent = `Best rally ${best.rally} · Match wins ${best.wins} of ${best.matches}`;
}
saveBest();

/* ---- game state ------------------------------------------------------------ */
function newMatch(){
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  return E.createState(E.mulberry32(seed));
}
let state = newMatch();
const input = { px: 0, py: 0, serve: false };
const trail = [];                         // recent ball positions for the tail

/* ---- canvas sizing / projection -------------------------------------------- */
let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, hw = 0, hh = 0;
const MARGIN = 0.90;                      // near rect fills 90% of the canvas
const FOCAL = 1.15, DEPTH = 1.6;          // s(0)=1 -> s(1)≈0.42

function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  W = Math.max(2, Math.round(r.width * DPR));
  H = Math.max(2, Math.round(r.height * DPR));
  if (canvas.width !== W)  canvas.width  = W;
  if (canvas.height !== H) canvas.height = H;
  cx = W / 2; cy = H / 2;
  hw = (W / 2) * MARGIN; hh = (H / 2) * MARGIN;
}
addEventListener('resize', resize);
resize();

function project(x, y, z){
  const s = FOCAL / (FOCAL + z * DEPTH);
  return [cx + x * hw * s, cy + y * hh * s, s];
}

/* ---- input ------------------------------------------------------------------ */
function toTunnel(e){
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const nx = ((e.clientX - r.left) / r.width)  * 2 - 1;
  const ny = ((e.clientY - r.top)  / r.height) * 2 - 1;
  input.px = E.clamp(nx / MARGIN, -1, 1);
  input.py = E.clamp(ny / MARGIN, -1, 1);
}
canvas.addEventListener('pointermove', toTunnel);
canvas.addEventListener('pointerdown', (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  toTunnel(e);
  if (state.phase === 'serve' && state.server === 'player') input.serve = true;
});
canvas.addEventListener('keydown', (e) => {
  const st = 0.1;
  if (e.key === 'ArrowLeft')       { input.px = E.clamp(input.px - st, -1, 1); }
  else if (e.key === 'ArrowRight') { input.px = E.clamp(input.px + st, -1, 1); }
  else if (e.key === 'ArrowUp')    { input.py = E.clamp(input.py - st, -1, 1); }
  else if (e.key === 'ArrowDown')  { input.py = E.clamp(input.py + st, -1, 1); }
  else if (e.key === ' ' || e.key === 'Enter') {
    if (state.phase === 'serve' && state.server === 'player') input.serve = true;
  } else return;
  e.preventDefault();
});

/* ---- status / scoreboard ----------------------------------------------------- */
function setStatus(msg, cls){
  statusEl.textContent = msg;
  statusEl.classList.remove('win', 'lose');
  if (cls) statusEl.classList.add(cls);
}
function scoreLine(){ return `${state.score.player}–${state.score.ai}`; }
function updateScoreboard(){
  scoreYou.textContent = state.score.player;
  scoreCpu.textContent = state.score.ai;
  serveYou.classList.toggle('on', state.server === 'player' && state.phase !== 'over');
  serveCpu.classList.toggle('on', state.server === 'ai' && state.phase !== 'over');
}
updateScoreboard();

/* ---- sounds (throttled wall taps) --------------------------------------------- */
let wallCount = 0, lastWallSfx = 0;
function wallSound(){
  wallCount++;
  const now = performance.now();
  if (wallCount % 2 === 0 && now - lastWallSfx > 260){ sfx.foundation(); lastWallSfx = now; }
}

/* ---- event handling ------------------------------------------------------------ */
function handleEvent(ev){
  switch (ev.t){
    case 'ready':
      updateScoreboard();
      setStatus(ev.server === 'player'
        ? 'Your serve — tap the table to send the ball'
        : 'Computer’s serve…');
      break;
    case 'serve':
      sfx.deal();
      setStatus(ev.side === 'player'
        ? 'Good serve — move the paddle as you hit to curve it'
        : 'Return it!');
      break;
    case 'hitP': sfx.place(); break;
    case 'hitA': sfx.flip(); break;
    case 'wall': wallSound(); break;
    case 'point': {
      sfx.invalid();
      updateScoreboard();
      if (state.bestRally > best.rally){ best.rally = state.bestRally; saveBest(); }
      let msg, cls;
      if (ev.deuce){ msg = `Deuce! ${scoreLine()}`; }
      else if (ev.winner === 'player'){ msg = `Point! ${scoreLine()}`; cls = 'win'; }
      else { msg = `Computer’s point — ${scoreLine()}`; cls = 'lose'; }
      const { you, cpu } = ev;
      if (!ev.deuce && Math.max(you, cpu) >= state.cfg.target - 1 && you !== cpu){
        msg += ' · game point';
      }
      setStatus(msg, cls);
      trail.length = 0;
      break;
    }
    case 'win': {
      sfx.win();
      best.matches++;
      if (ev.winner === 'player') best.wins++;
      if (state.bestRally > best.rally) best.rally = state.bestRally;
      saveBest();
      updateScoreboard();
      const won = ev.winner === 'player';
      setStatus(won ? `You win the match ${scoreLine()}! 🎉`
                    : `Computer takes it — ${scoreLine()}.`, won ? 'win' : 'lose');
      overlayTitle.textContent = won ? 'You win!' : 'Computer wins';
      overlayLine.textContent =
        `${scoreLine()} · best rally ${state.bestRally}`;
      overlay.hidden = false;
      againBtn.focus();
      break;
    }
  }
}

againBtn.addEventListener('click', () => {
  overlay.hidden = true;
  state = newMatch();
  trail.length = 0;
  wallCount = 0;
  sfx.shuffle();
  updateScoreboard();
  canvas.focus();
});

/* ---- drawing --------------------------------------------------------------------- */
const RINGS = 7;                                   // 8 receding gold rects
const GOLD = '#e9c34a', GOLD_HI = '#fff0b0', RED = '#d11f33';

function roundRectPath(x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect){ ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ringAt(z, alpha, width){
  const [x0, y0] = project(-1, -1, z);
  const [x1, y1] = project(1, 1, z);
  ctx.strokeStyle = `rgba(233,195,74,${alpha})`;
  ctx.lineWidth = width;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

function drawTunnel(){
  // dark felt down the tunnel
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.72);
  g.addColorStop(0, '#0d5c38');
  g.addColorStop(0.55, '#084226');
  g.addColorStop(1, '#042817');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // receding gold wireframe rects, far to near
  for (let i = RINGS; i >= 0; i--){
    const z = i / RINGS;
    ringAt(z, 0.16 + 0.42 * (1 - z), (0.8 + 1.4 * (1 - z)) * DPR);
  }
  // corner rays
  ctx.strokeStyle = 'rgba(233,195,74,.28)';
  ctx.lineWidth = 1 * DPR;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]){
    const [nx, ny] = project(sx, sy, 0);
    const [fx, fy] = project(sx, sy, 1);
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(fx, fy); ctx.stroke();
  }
}

function drawPaddle(p, z, rim, fill){
  const [X, Y, s] = project(p.x, p.y, z);
  const w = state.cfg.paddleW * 2 * hw * s;
  const h = state.cfg.paddleH * 2 * hh * s;
  roundRectPath(X - w / 2, Y - h / 2, w, h, 14 * s * DPR);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3 * DPR * (0.55 + 0.45 * s);
  ctx.stroke();
  // inner highlight line
  const inset = 4 * DPR * s;
  roundRectPath(X - w / 2 + inset, Y - h / 2 + inset, w - inset * 2, h - inset * 2, 10 * s * DPR);
  ctx.strokeStyle = 'rgba(255,240,176,.35)';
  ctx.lineWidth = 1 * DPR;
  ctx.stroke();
}

function drawBall(){
  const b = state.ball;
  const active = state.phase === 'rally' || state.phase === 'serve' || state.phase === 'point';
  if (!active) return;

  // depth marker: a brighter ring on the ball's current z-plane
  if (state.phase === 'rally'){
    ringAt(b.z, 0.5, 1.6 * DPR);
  }

  // soft contact shadow on the bottom wall at the ball's depth
  const [sx, sy, ss] = project(b.x, 1, b.z);
  const r0 = state.cfg.ballR * hw;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(sx, sy, r0 * ss * 1.1, r0 * ss * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // motion trail (skipped under reduced motion)
  if (!reduceMotion && state.phase === 'rally'){
    for (let i = trail.length - 1; i >= 0; i--){
      const t = trail[i];
      const [tx, ty, ts] = project(t.x, t.y, t.z);
      const a = 0.20 * (1 - i / trail.length);
      ctx.fillStyle = `rgba(255,247,226,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(tx, ty, r0 * ts * (0.8 - 0.4 * (i / trail.length)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // the ball — shaded ivory sphere
  const [X, Y, s] = project(b.x, b.y, b.z);
  const R = r0 * s;
  const g = ctx.createRadialGradient(X - R * 0.35, Y - R * 0.4, R * 0.15, X, Y, R);
  g.addColorStop(0, '#fffdf4');
  g.addColorStop(0.55, '#f6ecd0');
  g.addColorStop(1, '#c9a94e');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,0,.35)';
  ctx.lineWidth = 1 * DPR;
  ctx.stroke();
}

function draw(){
  drawTunnel();
  drawPaddle(state.ai, 1, RED, 'rgba(209,31,51,.16)');
  drawBall();
  drawPaddle(state.player, 0, GOLD, 'rgba(233,195,74,.14)');
  // player paddle center tick
  const [px, py] = project(state.player.x, state.player.y, 0);
  ctx.fillStyle = GOLD_HI;
  ctx.beginPath(); ctx.arc(px, py, 2.2 * DPR, 0, Math.PI * 2); ctx.fill();
}

/* ---- main loop --------------------------------------------------------------------- */
let last = performance.now(), acc = 0;
function frame(now){
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  let stepped = false;
  while (acc >= state.cfg.dt){
    E.step(state, input);
    acc -= state.cfg.dt;
    stepped = true;
    for (const ev of state.events.splice(0)) handleEvent(ev);
  }
  if (stepped){
    input.serve = false;
    rallyEl.textContent = state.rally;
    if (state.phase === 'rally'){
      trail.unshift({ x: state.ball.x, y: state.ball.y, z: state.ball.z });
      if (trail.length > 10) trail.length = 10;
    }
  }
  resizeIfNeeded();
  draw();
  requestAnimationFrame(frame);
}

let lastCssW = 0, lastCssH = 0;
function resizeIfNeeded(){
  const r = canvas.getBoundingClientRect();
  if (r.width !== lastCssW || r.height !== lastCssH){
    lastCssW = r.width; lastCssH = r.height;
    resize();
  }
}

document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; });

// the initial 'ready' event is already queued by createState()
for (const ev of state.events.splice(0)) handleEvent(ev);
requestAnimationFrame(frame);
