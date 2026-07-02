/* ============================================================================
   Bowling — Arline Arcade · DOM / canvas / input layer.
   Pseudo-3D lane on a 2D canvas: perspective trapezoid, warm wood boards,
   vector pins with red neck stripes, flick-to-bowl input. All game logic and
   physics live in engine.js (pure, tested by sim.mjs).

   Flick-to-bowl feel inspired by iliagrigorevdev/bowling (GPL-3.0) —
   gameplay reference only, all code here is original.
   ========================================================================== */

import sfx from '../../assets/js/sfx.js';
import { LANE, pinSpots, frameState, simulate, mulberry32, THROW } from './engine.js';

const canvas   = document.getElementById('lane');
const ctx      = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const stripEl  = document.getElementById('scoreStrip');
const newBtn   = document.getElementById('newGame');
const bestEl   = document.getElementById('best');
const panelEl  = document.getElementById('finalPanel');
const finalScoreEl = document.getElementById('finalScore');
const finalNoteEl  = document.getElementById('finalNote');
const againBtn = document.getElementById('againBtn');

const reduceMQ  = matchMedia('(prefers-reduced-motion: reduce)');
const BEST_KEY  = 'arcade-bowling-best';
const ALL       = [0,1,2,3,4,5,6,7,8,9];
const SPOTS     = pinSpots();
const AIM_MAX   = LANE.halfWidth - LANE.ballRadius;   // ±16.5" along the foul line
const clamp     = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- game state ------------------------------------------------------ */
let rolls    = [];
let standing = ALL.slice();
let state    = 'aim';            // 'aim' | 'rolling' | 'sweep' | 'over'
let aimX     = 0;
let rng      = mulberry32((Math.random() * 0xffffffff) >>> 0);
let replay   = null;             // active throw animation
let sweep    = null;             // sweep-bar animation
let drag     = null;

/* ---------- score strip ------------------------------------------------------ */
const frameCells = [];
for (let f = 0; f < 10; f++){
  const cell  = document.createElement('div');
  cell.className = 'frame';
  const num   = document.createElement('span');
  num.className = 'f-n'; num.textContent = f + 1;
  const marks = document.createElement('span');
  marks.className = 'f-marks';
  const slots = [];
  for (let i = 0, n = (f === 9 ? 3 : 2); i < n; i++){
    const m = document.createElement('i');
    marks.appendChild(m); slots.push(m);
  }
  const cum = document.createElement('span');
  cum.className = 'f-cum';
  cell.append(num, marks, cum);
  stripEl.appendChild(cell);
  frameCells.push({ cell, slots, cum });
}

function paintStrip(st){
  st.frames.forEach((fr, f) => {
    const c = frameCells[f];
    c.slots.forEach((s, i) => { s.textContent = (fr.marks[i] ?? '').replace('-', '–'); });
    c.cum.textContent = fr.score ?? '';
    c.cell.classList.toggle('cur', !st.isOver && st.currentFrame === f + 1);
  });
}

function say(msg){ statusEl.textContent = msg; }

/* ---------- projection: lane inches -> screen px ----------------------------- */
/* Perspective-correct scale along a remapped depth: the 60 ft of lane gets 78%
   of the depth range, the 46" pin deck gets a readable 22%. */
const view = { w: 0, h: 0, dpr: 1, cx: 0, ppi: 6, yF: 0, yH: 0, sFar: 0.34 };
const DECK_D = 0.78;

function depthOf(yIn){
  return yIn <= LANE.headPinY
    ? DECK_D * (yIn / LANE.headPinY)
    : DECK_D + (1 - DECK_D) * ((yIn - LANE.headPinY) / (LANE.pitY - LANE.headPinY));
}
const scaleAt = d => 1 / (1 + (1 / view.sFar - 1) * d);
const sx = (xIn, d) => view.cx + xIn * view.ppi * scaleAt(d);
const sy = d => view.yH + (view.yF - view.yH) * scaleAt(d);

function resize(){
  const r = canvas.parentElement.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width  = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  view.dpr = dpr; view.w = r.width; view.h = r.height;
  view.cx  = r.width / 2;
  view.ppi = (r.width * 0.94) / (LANE.width + 2 * LANE.gutterWidth);
  view.yF  = r.height * 0.84;
  view.yH  = r.height * 0.02;
  draw(performance.now());
}
new ResizeObserver(resize).observe(canvas.parentElement);

/* ---------- scene: where is everything right now? ---------------------------- */
function sceneAt(now){
  const scene = { ball: null, topples: new Map() };
  if (state === 'aim'){
    scene.ball = { x: aimX, y: 0, guide: true };
  } else if (state === 'rolling' && replay){
    const p = (now - replay.start) / replay.wall;
    const tSim = clamp(p, 0, 1) * replay.simDur;
    const path = replay.result.ballPath;
    if (tSim <= path[path.length - 1].t){
      while (replay.pathIdx < path.length - 2 && path[replay.pathIdx + 1].t < tSim) replay.pathIdx++;
      const a = path[replay.pathIdx], b = path[Math.min(replay.pathIdx + 1, path.length - 1)];
      const f = b.t > a.t ? (tSim - a.t) / (b.t - a.t) : 1;
      scene.ball = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, guide: false };
    }
    for (const e of replay.events){
      const prog = (now - (replay.start + e.at)) / replay.toppleMs;
      if (prog > 0) scene.topples.set(e.pin, { prog: Math.min(prog, 1), dir: e.vx >= 0 ? 1 : -1 });
    }
  }
  return scene;
}

/* ---------- painting ---------------------------------------------------------- */
const WOOD_NEAR = '#c99a5b', WOOD_MID = '#a97c3f', WOOD_FAR = '#8a6231';

function draw(now){
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.w, view.h);
  drawBackdrop();
  drawLane();
  const scene = sceneAt(now);
  drawPins(scene);
  if (sweep) drawSweep(now);
  if (scene.ball) drawBall(scene.ball);
}

function drawBackdrop(){
  // dark pit behind the deck + a little gold marquee
  ctx.fillStyle = '#0b0704';
  ctx.fillRect(0, 0, view.w, view.h);
  const deckTop = sy(1);
  const g = ctx.createLinearGradient(0, 0, 0, deckTop);
  g.addColorStop(0, '#160e07'); g.addColorStop(1, '#050302');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, deckTop);
  ctx.fillStyle = 'rgba(233,195,74,.75)';
  ctx.font = `700 ${Math.max(10, view.w * 0.032)}px "Cascadia Code NF", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('★ ARLINE LANES ★', view.cx, deckTop * 0.5);
  ctx.strokeStyle = 'rgba(233,195,74,.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx(-LANE.halfWidth - LANE.gutterWidth, 1), deckTop);
  ctx.lineTo(sx(LANE.halfWidth + LANE.gutterWidth, 1), deckTop); ctx.stroke();
}

function trapezoid(x0, x1, d0, d1){
  ctx.beginPath();
  ctx.moveTo(sx(x0, d0), sy(d0)); ctx.lineTo(sx(x1, d0), sy(d0));
  ctx.lineTo(sx(x1, d1), sy(d1)); ctx.lineTo(sx(x0, d1), sy(d1));
  ctx.closePath();
}

function drawLane(){
  const hw = LANE.halfWidth, gw = LANE.gutterWidth;

  // gutters (dark channels either side)
  const gg = ctx.createLinearGradient(0, sy(1), 0, view.yF);
  gg.addColorStop(0, '#17100a'); gg.addColorStop(1, '#241609');
  ctx.fillStyle = gg;
  trapezoid(-hw - gw, hw + gw, 0, 1); ctx.fill();
  // gutter inner shading
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  trapezoid(-hw - gw * 0.72, -hw - gw * 0.2, 0, 1); ctx.fill();
  trapezoid(hw + gw * 0.2, hw + gw * 0.72, 0, 1); ctx.fill();

  // lane wood
  const wg = ctx.createLinearGradient(0, view.yF, 0, sy(1));
  wg.addColorStop(0, WOOD_NEAR); wg.addColorStop(0.62, WOOD_MID); wg.addColorStop(1, WOOD_FAR);
  ctx.fillStyle = wg;
  trapezoid(-hw, hw, 0, 1); ctx.fill();

  // board seams (13 of the 39 boards, converging on the deck)
  ctx.strokeStyle = 'rgba(60,35,12,.22)'; ctx.lineWidth = 1;
  for (let k = 1; k < 13; k++){
    const xIn = -hw + (k * LANE.width) / 13;
    ctx.beginPath(); ctx.moveTo(sx(xIn, 0), sy(0)); ctx.lineTo(sx(xIn, 1), sy(1)); ctx.stroke();
  }
  // soft sheen down the middle
  const sheen = ctx.createLinearGradient(sx(-hw, 0), 0, sx(hw, 0), 0);
  sheen.addColorStop(0, 'rgba(255,235,190,0)'); sheen.addColorStop(0.5, 'rgba(255,235,190,.10)');
  sheen.addColorStop(1, 'rgba(255,235,190,0)');
  ctx.fillStyle = sheen;
  trapezoid(-hw, hw, 0, 1); ctx.fill();

  // pin-deck maple (lighter wood)
  const dDeck = depthOf(LANE.headPinY - 10);
  const mg = ctx.createLinearGradient(0, sy(dDeck), 0, sy(1));
  mg.addColorStop(0, '#c4a066'); mg.addColorStop(1, '#a5834c');
  ctx.fillStyle = mg;
  trapezoid(-hw, hw, dDeck, 1); ctx.fill();

  // approach dots (7 ft) and aiming arrows (12–16 ft)
  ctx.fillStyle = 'rgba(94,21,32,.8)';
  for (let k = -2; k <= 2; k++){
    const d = depthOf(84), s = scaleAt(d);
    ctx.beginPath();
    ctx.ellipse(sx(k * 5.32, d), sy(d), 1.2 * view.ppi * s, 0.7 * view.ppi * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let k = -3; k <= 3; k++){
    const yIn = 192 - Math.abs(k) * 12;
    const d = depthOf(yIn), s = view.ppi * scaleAt(d);
    const ax = sx(k * 5.32, d), ay = sy(d);
    ctx.beginPath();
    ctx.moveTo(ax, ay - 4.6 * s);
    ctx.lineTo(ax - 1.7 * s, ay);
    ctx.lineTo(ax + 1.7 * s, ay);
    ctx.closePath();
    ctx.fill();
  }

  // pin spots
  ctx.fillStyle = 'rgba(60,30,10,.35)';
  for (const p of SPOTS){
    const d = depthOf(p.y), s = view.ppi * scaleAt(d);
    ctx.beginPath();
    ctx.ellipse(sx(p.x, d), sy(d), 1.1 * s, 0.45 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // foul line + approach strip
  ctx.fillStyle = '#8d5f33';
  ctx.fillRect(0, view.yF, view.w, view.h - view.yF);
  ctx.strokeStyle = 'rgba(140,30,40,.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx(-hw - gw, 0), view.yF); ctx.lineTo(sx(hw + gw, 0), view.yF); ctx.stroke();
}

/* one vector pin: white body, red neck stripes, drawn at its base point */
function drawPin(bx, by, s, topple){
  ctx.save();
  ctx.translate(bx, by);
  if (topple){
    const a = topple.dir * topple.prog * 1.75;          // tip over ~100°
    ctx.globalAlpha = 1 - Math.max(0, topple.prog - 0.55) / 0.45;
    ctx.rotate(a);
    ctx.scale(1, 1 - topple.prog * 0.22);               // sinks a touch as it falls
  }
  ctx.scale(view.ppi * s, view.ppi * s);
  ctx.lineWidth = 0.14;

  // body silhouette (inches, y up = negative)
  ctx.beginPath();
  ctx.moveTo(-1.0, 0);
  ctx.bezierCurveTo(-2.65, -1.3, -2.6, -5.6, -1.35, -8.2);
  ctx.bezierCurveTo(-0.85, -9.3, -0.92, -10.6, -0.95, -11.4);
  ctx.bezierCurveTo(-1.5, -12.2, -1.42, -14.2, 0, -14.9);
  ctx.bezierCurveTo(1.42, -14.2, 1.5, -12.2, 0.95, -11.4);
  ctx.bezierCurveTo(0.92, -10.6, 0.85, -9.3, 1.35, -8.2);
  ctx.bezierCurveTo(2.6, -5.6, 2.65, -1.3, 1.0, 0);
  ctx.closePath();

  const g = ctx.createLinearGradient(-2.4, 0, 2.4, 0);
  g.addColorStop(0, '#fffef8'); g.addColorStop(0.45, '#f6efdf'); g.addColorStop(1, '#c9bca4');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,45,20,.35)';
  ctx.stroke();

  // red neck stripes, clipped to the body
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#c8202f';
  ctx.fillRect(-1.6, -11.15, 3.2, 0.55);
  ctx.fillRect(-1.6, -10.25, 3.2, 0.55);
  ctx.restore();

  ctx.restore();
}

function drawPins(scene){
  const order = standing.slice().sort((a, b) => SPOTS[b].y - SPOTS[a].y);   // far first
  for (const i of order){
    const t = scene.topples.get(i);
    if (t && t.prog >= 1) continue;                     // swept away
    const p = SPOTS[i];
    const d = depthOf(p.y), s = scaleAt(d);
    const bx = sx(p.x, d), by = sy(d);
    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath();
    ctx.ellipse(bx, by + 1, 2.6 * view.ppi * s, 1.0 * view.ppi * s, 0, 0, Math.PI * 2);
    ctx.fill();
    drawPin(bx, by, s, t);
  }
}

function drawBall(ball){
  const d = depthOf(ball.y), s = scaleAt(d);
  const r = LANE.ballRadius * view.ppi * s;
  const bx = sx(ball.x, d), by = sy(d);

  if (ball.guide){
    // faint aim guide + nudge arrows
    ctx.strokeStyle = 'rgba(233,195,74,.22)'; ctx.lineWidth = 2;
    ctx.setLineDash([6, 9]);
    ctx.beginPath(); ctx.moveTo(bx, by - r); ctx.lineTo(sx(ball.x, 0.5), sy(0.5)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,240,176,.5)';
    for (const dir of [-1, 1]){
      const ax = bx + dir * (r + 14);
      ctx.beginPath();
      ctx.moveTo(ax + dir * 6, by); ctx.lineTo(ax, by - 6); ctx.lineTo(ax, by + 6);
      ctx.closePath(); ctx.fill();
    }
  }

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(bx, by + r * 0.28, r * 0.95, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();

  // the ball — deep crimson with a gold-kissed highlight
  const g = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.45, r * 0.1, bx, by, r);
  g.addColorStop(0, '#f0796b'); g.addColorStop(0.35, '#b81f2c');
  g.addColorStop(0.8, '#6b0d16'); g.addColorStop(1, '#3f060c');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(233,195,74,.35)'; ctx.lineWidth = 1;
  ctx.stroke();
  if (r > 14){
    ctx.fillStyle = 'rgba(20,3,6,.55)';
    for (const [fx, fy] of [[-0.18, -0.32], [0.12, -0.38], [-0.02, -0.12]]){
      ctx.beginPath(); ctx.arc(bx + fx * r, by + fy * r, r * 0.07, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawSweep(now){
  const p = clamp((now - sweep.start) / sweep.dur, 0, 1);
  const reach = p < 0.5 ? p * 2 : (1 - p) * 2;          // down across the deck, then back
  const d = 1 + (depthOf(LANE.headPinY - 6) - 1) * reach;
  const yBar = sy(d), s = scaleAt(d);
  const x0 = sx(-LANE.halfWidth, d), x1 = sx(LANE.halfWidth, d);
  const hBar = Math.max(10, 26 * s);
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(x0, yBar - hBar, x1 - x0, hBar);
  ctx.fillStyle = 'rgba(233,195,74,.85)';
  ctx.fillRect(x0, yBar - hBar, x1 - x0, Math.max(2, hBar * 0.14));
}

/* ---------- animation loop ----------------------------------------------------- */
let looping = false;
function startLoop(){
  if (!looping){ looping = true; requestAnimationFrame(loop); }
}
function loop(now){
  if (replay){
    let played = 0;
    for (const e of replay.events){
      if (!e.fired && now >= replay.start + e.at){
        e.fired = true;
        if (replay.sfxCount < 6 && played < 2){ sfx.place(); replay.sfxCount++; played++; }
      }
    }
    if (now >= replay.start + replay.wall + replay.tail){
      const result = replay.result;
      replay = null;
      resolve(result);
    }
  }
  if (sweep && now >= sweep.start + sweep.dur){
    const done = sweep.done; sweep = null;
    done && done();
  }
  draw(now);
  if (replay || sweep || drag || state === 'rolling'){
    requestAnimationFrame(loop);
  } else {
    looping = false;
    draw(performance.now());
  }
}

/* ---------- the throw ---------------------------------------------------------- */
function throwBall(launch){
  if (state !== 'aim') return;
  state = 'rolling';
  canvas.classList.add('rolling');
  sfx.deal();
  const result = simulate(launch, rng, { standing });
  const rm = reduceMQ.matches;
  const wall = rm ? 300 : 1600;
  const simDur = Math.max(result.duration, 0.001);
  replay = {
    result, wall, simDur,
    tail: rm ? 140 : 430,
    toppleMs: rm ? 120 : 380,
    start: performance.now(),
    pathIdx: 0,
    sfxCount: 0,
    events: result.events.map(e => ({ ...e, at: (e.t / simDur) * wall, fired: false })),
  };
  say('Rolling…');
  startLoop();
}

function resolve(result){
  const before = standing.length;
  rolls.push(result.knocked.length);
  const st = frameState(rolls);
  standing = standing.filter(i => !result.knocked.includes(i));
  paintStrip(st);

  const n = result.knocked.length;
  let msg;
  if (n === 10 && before === 10){ msg = 'STRIKE!'; sfx.win(); }
  else if (n === before && before < 10){ msg = 'Spare!'; sfx.foundation(); }
  else if (result.gutter && n === 0) msg = 'Gutter ball…';
  else if (n === 0) msg = 'None down.';
  else msg = `${n} pin${n > 1 ? 's' : ''} down`;
  say(msg);

  if (st.isOver){ finish(st); return; }

  const rerack = st.pinsStanding === 10;
  state = 'sweep';
  beginSweep(() => {
    if (rerack) standing = ALL.slice();
    state = 'aim';
    canvas.classList.remove('rolling');
    say(`${msg} — Frame ${st.currentFrame} · Roll ${st.currentRoll}`);
    draw(performance.now());
  });
}

function beginSweep(done){
  if (reduceMQ.matches){ done(); return; }
  sweep = { start: performance.now(), dur: 520, done };
  startLoop();
}

function finish(st){
  state = 'over';
  const total = st.total;
  const prev = Number(localStorage.getItem(BEST_KEY) || 0);
  const isBest = total > prev;
  if (isBest) localStorage.setItem(BEST_KEY, String(total));
  paintBest();
  finalScoreEl.textContent = total;
  finalNoteEl.textContent = isBest ? 'A new best score!' : (prev ? `Best so far: ${prev}` : 'Nicely bowled!');
  beginSweep(() => {
    sfx.win();
    panelEl.hidden = false;
    say(`Game over — ${total}${isBest ? ', a new best!' : ''}`);
    againBtn.focus();
  });
}

function paintBest(){
  const b = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = b ? `Best: ${b}` : 'Best: —';
}

function newGame(){
  rolls = [];
  standing = ALL.slice();
  state = 'aim';
  aimX = 0;
  replay = null; sweep = null; drag = null;
  rng = mulberry32((Math.random() * 0xffffffff) >>> 0);
  panelEl.hidden = true;
  canvas.classList.remove('rolling');
  paintStrip(frameState(rolls));
  say('Frame 1 · Roll 1 — drag the ball, flick up to bowl');
  draw(performance.now());
}

/* ---------- input: drag to aim, flick to bowl ----------------------------------- */
function localPoint(e){
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', e => {
  if (state !== 'aim') return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p = localPoint(e);
  drag = { id: e.pointerId, samples: [{ t: e.timeStamp, x: p.x, y: p.y }] };
  aimX = clamp((p.x - view.cx) / view.ppi, -AIM_MAX, AIM_MAX);
  sfx.pickup();
  startLoop();
});

canvas.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  e.preventDefault();
  const p = localPoint(e);
  drag.samples.push({ t: e.timeStamp, x: p.x, y: p.y });
  if (drag.samples.length > 48) drag.samples.shift();
  aimX = clamp((p.x - view.cx) / view.ppi, -AIM_MAX, AIM_MAX);
});

function endDrag(e){
  if (!drag || e.pointerId !== drag.id) return;
  const s = drag.samples;
  drag = null;
  if (state !== 'aim' || s.length < 2) return;

  const last = s[s.length - 1];
  let k = s.length - 1;
  while (k > 0 && last.t - s[k - 1].t < 160) k--;      // ~160ms flick window
  const a = s[k];
  const dt = Math.max(last.t - a.t, 8);
  const upPx = a.y - last.y;                            // + = flicked upward
  const sidePx = last.x - a.x;
  const speed = upPx / dt;                              // px per ms
  const totalUp = s[0].y - last.y;
  const totalDt = Math.max(last.t - s[0].t, 16);

  const isFlick = (speed > 0.25 && upPx > 24) ||
                  (totalUp > 90 && totalDt < 700 && totalUp / totalDt > 0.12);
  if (!isFlick) return;                                 // just repositioning

  const v = Math.max(speed, totalUp / totalDt);
  const vy = clamp(150 + v * 150, 160, THROW.maxSpeed);
  const vx = clamp((sidePx / dt) * 42, -THROW.maxSide, THROW.maxSide);

  // curvature of the flick -> spin (hook)
  let spin = 0;
  if (last.t - a.t > 40 && s.length - k >= 3){
    const m = s[k + Math.floor((s.length - 1 - k) / 2)];
    const a1 = Math.atan2(m.x - a.x, Math.max(a.y - m.y, 1));
    const a2 = Math.atan2(last.x - m.x, Math.max(m.y - last.y, 1));
    let dAng = a2 - a1;
    if (dAng > Math.PI) dAng -= 2 * Math.PI;
    if (dAng < -Math.PI) dAng += 2 * Math.PI;
    spin = clamp(dAng * 130, -THROW.maxSpin, THROW.maxSpin);
  }

  throwBall({ x0: aimX, vx, vy, spin });
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', e => {
  if (drag && e.pointerId === drag.id) drag = null;
});

/* keyboard: arrows aim, space/enter bowls a straight medium ball */
canvas.addEventListener('keydown', e => {
  if (state !== 'aim') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
    const step = (e.shiftKey ? 3 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
    aimX = clamp(aimX + step, -AIM_MAX, AIM_MAX);
    draw(performance.now());
    e.preventDefault();
  } else if (e.key === ' ' || e.key === 'Enter'){
    throwBall({ x0: aimX, vx: 0, vy: 330, spin: 0 });
    e.preventDefault();
  }
});

newBtn.addEventListener('click', newGame);
againBtn.addEventListener('click', newGame);

/* ---------- go ------------------------------------------------------------------- */
paintBest();
paintStrip(frameState(rolls));
resize();
