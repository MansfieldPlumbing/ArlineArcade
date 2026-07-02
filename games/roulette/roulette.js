/* Roulette — Arline Arcade.
   DOM, input, and animation. All game logic lives in engine.js (pure, tested
   by games/roulette/sim.mjs). The wheel is a 2D canvas: the wheel head spins
   clockwise while the ball orbits counter-clockwise and spirals inward,
   decelerating to land DETERMINISTICALLY on the pre-chosen pocket — random
   result, deterministic landing (same trick as the craps dice). */

import { WHEEL, colorOf, wheelIndex, spin, resolve } from './engine.js';
import sfx from '../../assets/js/sfx.js';

const TAU = Math.PI * 2;
const STEP = TAU / 37;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BANK_KEY = 'arcade-roulette-bank';
const START_BANK = 500;

/* --- elements --------------------------------------------------------------- */
const canvas   = document.getElementById('wheel');
const ctx      = canvas.getContext('2d');
const wrap     = document.getElementById('wheelWrap');
const statusEl = document.getElementById('status');
const historyEl= document.getElementById('history');
const bankEl   = document.getElementById('bank');
const stakedEl = document.getElementById('staked');
const bankBox  = bankEl.closest('.bank-box');
const spinBtn  = document.getElementById('spinBtn');
const clearBtn = document.getElementById('clearBtn');
const boardEl  = document.getElementById('board');
const outsideEl= document.getElementById('outside');
const toastEl  = document.getElementById('toast');
const chipBtns = [...document.querySelectorAll('.chip-btn')];

/* --- state ------------------------------------------------------------------ */
let bank = START_BANK;
try {
  const v = parseInt(localStorage.getItem(BANK_KEY), 10);
  if (Number.isFinite(v) && v >= 1) bank = v;
} catch (_) {}

let denom = 5;                    // selected chip
const betsMap = new Map();        // key -> { bet, chips:[denoms] }
const cells = new Map();          // key -> cell element
let spinning = false;
let wheelA = 0;                   // wheel head angle (radians, clockwise from top)
let ballIdx = null;               // wheel index the ball rests in (null = no ball yet)
let lastHl = null;                // highlighted winning index
const hist = [];                  // last pockets, newest first

const keyFor = (bet) => bet.type + (bet.value != null ? ':' + bet.value : '');
const stakedTotal = () =>
  [...betsMap.values()].reduce((s, e) => s + e.chips.reduce((a, d) => a + d, 0), 0);
const norm = (x) => ((x % TAU) + TAU) % TAU;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function labelFor(bet){
  switch (bet.type){
    case 'straight': return String(bet.value);
    case 'red': return 'red';       case 'black': return 'black';
    case 'odd': return 'odd';       case 'even': return 'even';
    case 'low': return '1–18';      case 'high': return '19–36';
    case 'dozen':  return ['1st', '2nd', '3rd'][bet.value - 1] + ' 12';
    case 'column': return 'column ' + bet.value;
    default: return bet.type;
  }
}

function saveBank(){
  try { localStorage.setItem(BANK_KEY, String(bank + stakedTotal())); } catch (_) {}
}
function updateMoney(){
  bankEl.textContent = bank;
  stakedEl.textContent = stakedTotal();
}
function say(msg, cls){
  statusEl.classList.remove('win', 'lose');
  if (cls) statusEl.classList.add(cls);
  statusEl.textContent = msg;
}

/* --- the wheel (canvas 2D, dpr-scaled) --------------------------------------- */
const view = { css: 0 };
function fit(){
  const s = canvas.clientWidth || 300;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const px = Math.max(1, Math.round(s * dpr));
  if (canvas.width !== px){ canvas.width = px; canvas.height = px; }
  view.css = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawIdle(lastHl);
}

const POCKET_FILL = { green: '#0c7a3f', red: '#c22433', black: '#15181d' };

function draw(a, ball, hl = null){
  const S = view.css; if (!S) return;
  const c = S / 2;
  ctx.clearRect(0, 0, S, S);

  // outer gold rim
  let g = ctx.createRadialGradient(c - S * 0.14, c - S * 0.17, S * 0.06, c, c, S * 0.5);
  g.addColorStop(0, '#f8e39a'); g.addColorStop(0.45, '#e9c34a');
  g.addColorStop(0.8, '#b98a24'); g.addColorStop(1, '#8a6414');
  ctx.beginPath(); ctx.arc(c, c, S * 0.492, 0, TAU);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#6e4f10'; ctx.lineWidth = 1.5; ctx.stroke();

  // ball track (dark ring the ball orbits in)
  g = ctx.createRadialGradient(c, c, S * 0.2, c, c, S * 0.44);
  g.addColorStop(0, '#123f27'); g.addColorStop(0.85, '#0d3520'); g.addColorStop(1, '#071f12');
  ctx.beginPath(); ctx.arc(c, c, S * 0.44, 0, TAU);
  ctx.fillStyle = g; ctx.fill();

  // pocket wedges
  const R1 = S * 0.405, R0 = S * 0.245;
  for (let i = 0; i < 37; i++){
    const a0 = a + i * STEP - STEP / 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(c, c, R1, a0, a0 + STEP);
    ctx.arc(c, c, R0, a0 + STEP, a0, true);
    ctx.closePath();
    ctx.fillStyle = POCKET_FILL[colorOf(WHEEL[i])];
    ctx.fill();
  }
  // gold separators (the frets)
  ctx.strokeStyle = 'rgba(233,195,74,.85)';
  ctx.lineWidth = Math.max(1, S * 0.004);
  for (let i = 0; i < 37; i++){
    const t = a + (i + 0.5) * STEP;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(t) * R0, c - Math.cos(t) * R0);
    ctx.lineTo(c + Math.sin(t) * R1, c - Math.cos(t) * R1);
    ctx.stroke();
  }
  // band rings
  ctx.strokeStyle = 'rgba(233,195,74,.9)';
  ctx.lineWidth = Math.max(1.2, S * 0.006);
  ctx.beginPath(); ctx.arc(c, c, R1, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c, R0, 0, TAU); ctx.stroke();

  // winning-pocket highlight
  if (hl != null){
    const a0 = a + hl * STEP - STEP / 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(c, c, R1, a0, a0 + STEP);
    ctx.arc(c, c, R0, a0 + STEP, a0, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,240,176,.22)'; ctx.fill();
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2; ctx.stroke();
  }

  // numbers
  ctx.fillStyle = '#fff3d4';
  ctx.font = `700 ${Math.max(9, Math.round(S * 0.047))}px "Cascadia Code NF", ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 37; i++){
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a + i * STEP);
    ctx.fillText(String(WHEEL[i]), 0, -S * 0.352);
    ctx.restore();
  }

  // inner cone + spokes + turret
  g = ctx.createRadialGradient(c - S * 0.05, c - S * 0.06, S * 0.02, c, c, R0);
  g.addColorStop(0, '#0f6d40'); g.addColorStop(1, '#06301b');
  ctx.beginPath(); ctx.arc(c, c, R0 - Math.max(1, S * 0.004), 0, TAU);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#d9b23e'; ctx.lineWidth = S * 0.02; ctx.lineCap = 'round';
  for (let j = 0; j < 8; j++){
    const t = a + j * TAU / 8;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(t) * S * 0.075, c - Math.cos(t) * S * 0.075);
    ctx.lineTo(c + Math.sin(t) * S * 0.222, c - Math.cos(t) * S * 0.222);
    ctx.stroke();
  }
  g = ctx.createRadialGradient(c - S * 0.02, c - S * 0.03, S * 0.005, c, c, S * 0.07);
  g.addColorStop(0, '#f8e39a'); g.addColorStop(0.7, '#e9c34a'); g.addColorStop(1, '#9a7218');
  ctx.beginPath(); ctx.arc(c, c, S * 0.07, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#8a6414'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c, S * 0.024, 0, TAU); ctx.fillStyle = '#fff0b0'; ctx.fill();

  // the ball
  if (ball){
    const x = c + Math.sin(ball.ang) * ball.r;
    const y = c - Math.cos(ball.ang) * ball.r;
    const r = S * 0.028;
    ctx.beginPath(); ctx.arc(x + r * 0.18, y + r * 0.3, r, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#efe9dc'); g.addColorStop(1, '#b8b2a4');
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
  }
}

function drawIdle(hl = null){
  lastHl = hl;
  const ball = ballIdx != null
    ? { ang: wheelA + ballIdx * STEP, r: view.css * 0.315 }
    : null;
  draw(wheelA, ball, hl);
}

/* Deterministic landing: pick the pocket first, then solve the final angles so
   the counter-rotating, in-spiralling ball ends exactly in that pocket. */
function animateTo(pocket){
  const idx = wheelIndex(pocket);

  if (reduce){
    // reduced motion: a short fade, then the finished wheel — no spin
    return new Promise((done) => {
      wrap.classList.add('dim');
      setTimeout(() => {
        wheelA = norm(wheelA + 2.4);
        ballIdx = idx;
        drawIdle(idx);
        wrap.classList.remove('dim');
        setTimeout(done, 200);
      }, 220);
    });
  }

  return new Promise((done) => {
    const T  = 4900 + Math.random() * 600;                 // ~5s spin
    const w0 = wheelA;
    const w1 = w0 + TAU * (3 + Math.random());             // wheel: 3–4 turns clockwise
    const bTarget = w1 + idx * STEP;                       // ball must end on the pocket
    const b0 = wheelA + (ballIdx ?? 0) * STEP;
    const k  = Math.ceil((bTarget - b0) / TAU + 5);        // ball: 5–6 turns counter
    const b1 = bTarget - k * TAU;
    const rTrack = 0.42, rPocket = 0.315;
    let dropPlayed = false;
    const t0 = performance.now();

    function frame(now){
      const u = Math.min(1, (now - t0) / T);
      const ew = 1 - Math.pow(1 - u, 3);                   // wheel decelerates
      const eb = 1 - Math.pow(1 - u, 4);                   // ball decelerates harder
      const a  = w0 + (w1 - w0) * ew;
      const ba = b0 + (b1 - b0) * eb;
      let s = clamp01((u - 0.45) / 0.43);                  // spiral inward 45%→88%
      s = s * s * (3 - 2 * s);
      let rr = rTrack + (rPocket - rTrack) * s;
      if (u > 0.55 && u < 0.92)                            // little hops down the cone
        rr += Math.sin(u * 60) * 0.008 * ((0.92 - u) / 0.37);
      if (u >= 0.86 && !dropPlayed){ dropPlayed = true; sfx.flip(); }
      wheelA = a;
      draw(a, { ang: ba, r: rr * view.css });
      if (u < 1){ requestAnimationFrame(frame); }
      else {
        wheelA = norm(w1);
        ballIdx = idx;
        drawIdle(idx);
        done();
      }
    }
    requestAnimationFrame(frame);
  });
}

/* --- betting felt ------------------------------------------------------------ */
function makeCell(bet, label, aria, cls){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cell' + (cls ? ' ' + cls : '');
  b.dataset.bet = keyFor(bet);
  b.dataset.aria = aria;
  b.innerHTML = `<span>${label}</span>`;
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', (e) => {
    if (spinning) return;
    if (e.target.closest('.stack')) removeChip(keyFor(bet));
    else placeChip(bet);
  });
  cells.set(keyFor(bet), b);
  return b;
}

function buildBoard(){
  const zero = makeCell({ type: 'straight', value: 0 }, '0', 'Bet on 0, green', 'zero');
  zero.style.gridColumn = '1 / 5'; zero.style.gridRow = '1';
  boardEl.appendChild(zero);

  for (let n = 1; n <= 36; n++){
    const col = colorOf(n);
    const cell = makeCell({ type: 'straight', value: n }, String(n),
      `Bet on ${n}, ${col}`, col === 'red' ? 'red' : 'blk');
    cell.style.gridColumn = String(2 + (n - 1) % 3);
    cell.style.gridRow = String(2 + Math.floor((n - 1) / 3));
    boardEl.appendChild(cell);
  }
  const DOZ = [['1st 12', 1, '2 / 6', '1 to 12'], ['2nd 12', 2, '6 / 10', '13 to 24'], ['3rd 12', 3, '10 / 14', '25 to 36']];
  for (const [label, v, rows, span] of DOZ){
    const cell = makeCell({ type: 'dozen', value: v }, label,
      `Bet on the ${label.toLowerCase()}, numbers ${span}, pays 2 to 1`, 'doz');
    cell.style.gridColumn = '1'; cell.style.gridRow = rows;
    boardEl.appendChild(cell);
  }
  for (let v = 1; v <= 3; v++){
    const cell = makeCell({ type: 'column', value: v }, '2:1',
      `Bet on column ${v}, pays 2 to 1`, 'colbet');
    cell.style.gridColumn = String(1 + v); cell.style.gridRow = '14';
    boardEl.appendChild(cell);
  }
  const OUT = [
    [{ type: 'low' },   '1–18',  'Bet on low, 1 to 18',    ''],
    [{ type: 'red' },   'RED',   'Bet on red',             'red-lbl'],
    [{ type: 'even' },  'EVEN',  'Bet on even',            ''],
    [{ type: 'high' },  '19–36', 'Bet on high, 19 to 36',  ''],
    [{ type: 'black' }, 'BLACK', 'Bet on black',           'blk-lbl'],
    [{ type: 'odd' },   'ODD',   'Bet on odd',             ''],
  ];
  for (const [bet, label, aria, cls] of OUT) outsideEl.appendChild(makeCell(bet, label, aria, cls));
}

function renderStack(k){
  const cell = cells.get(k); if (!cell) return;
  const old = cell.querySelector('.stack'); if (old) old.remove();
  const e = betsMap.get(k);
  if (!e || !e.chips.length){
    cell.setAttribute('aria-label', cell.dataset.aria);
    return;
  }
  const total = e.chips.reduce((s, d) => s + d, 0);
  const top = e.chips[e.chips.length - 1];
  const stack = document.createElement('span');
  stack.className = 'stack';
  stack.innerHTML = `<span class="disc d${top}">${total}</span>`;
  cell.appendChild(stack);
  cell.setAttribute('aria-label',
    `${cell.dataset.aria}. ${total} staked — tap the chips to take one back`);
}

function placeChip(bet){
  if (bank < denom){
    sfx.invalid();
    say('Not enough in the bank — try a smaller chip.');
    bankBox.classList.remove('shake'); void bankBox.offsetWidth;
    bankBox.classList.add('shake');
    return;
  }
  const k = keyFor(bet);
  let e = betsMap.get(k);
  if (!e){ e = { bet: { ...bet }, chips: [] }; betsMap.set(k, e); }
  e.chips.push(denom);
  bank -= denom;
  sfx.place();
  renderStack(k); updateMoney(); saveBank();
  say(`${denom} on ${labelFor(bet)} — total bet ${stakedTotal()}.`);
}

function removeChip(k){
  const e = betsMap.get(k); if (!e || !e.chips.length) return;
  const d = e.chips.pop();
  if (!e.chips.length) betsMap.delete(k);
  bank += d;
  sfx.pickup();
  renderStack(k); updateMoney(); saveBank();
  say(`Took ${d} back — total bet ${stakedTotal()}.`);
}

function clearStacks(){
  for (const cell of cells.values()){
    const s = cell.querySelector('.stack'); if (s) s.remove();
    cell.classList.remove('won');
    cell.setAttribute('aria-label', cell.dataset.aria);
  }
}

function clearBets(){
  if (spinning || !betsMap.size) return;
  bank += stakedTotal();
  betsMap.clear();
  clearStacks();
  sfx.pickup();
  updateMoney(); saveBank();
  say('Bets cleared — the chips are back in your bank.');
}

/* --- history strip ------------------------------------------------------------ */
function pushHistory(p){
  hist.unshift(p);
  if (hist.length > 12) hist.pop();
  historyEl.innerHTML = hist
    .map((n) => `<span class="dot ${colorOf(n)}" aria-hidden="true">${n}</span>`)
    .join('');
  historyEl.setAttribute('aria-label', 'Last numbers: ' + hist.join(', '));
}

/* --- toast + payout flourish ---------------------------------------------------- */
let toastTimer = 0;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => { toastEl.hidden = true; }, 300);
  }, 3400);
}
function popPayout(n){
  const pop = document.createElement('span');
  pop.className = 'pop';
  pop.textContent = '+' + n;
  bankBox.appendChild(pop);
  setTimeout(() => pop.remove(), 1000);
}

/* --- the spin ------------------------------------------------------------------- */
function setControls(on){
  spinBtn.disabled = !on;
  clearBtn.disabled = !on;
  chipBtns.forEach((b) => { b.disabled = !on; });
  cells.forEach((c) => { c.disabled = !on; });
}

async function doSpin(){
  if (spinning) return;
  spinning = true;
  setControls(false);
  say(betsMap.size ? 'No more bets — the ball is rolling…' : 'Just watching — the ball is rolling…');
  if (!reduce) sfx.shuffle();
  const pocket = spin(Math.random);
  await animateTo(pocket);
  settle(pocket);
}

function settle(pocket){
  const bets = [...betsMap.values()]
    .map((e) => ({ ...e.bet, amount: e.chips.reduce((s, d) => s + d, 0) }));
  const res = resolve(bets, pocket);
  betsMap.clear();                       // settled — stacks on the felt are visuals now
  bank += res.totalReturned;
  pushHistory(pocket);

  const name = `${pocket} ${colorOf(pocket).toUpperCase()}`;
  const net = res.totalReturned - res.totalStaked;
  if (!bets.length){
    say(`${name}. Place a bet and give it a spin!`);
  } else if (net > 0){
    say(`${name} — you won ${net}! 🎉`, 'win');
    sfx.win();
    popPayout(net);
  } else if (res.totalReturned > 0){
    say(`${name} — a push. Chips back.`);
    sfx.place();
  } else {
    say(`${name} — the house takes this one.`, 'lose');
    sfx.invalid();
  }
  for (const r of res.results){
    if (r.won) cells.get(keyFor(r.bet))?.classList.add('won');
  }
  updateMoney(); saveBank();

  setTimeout(() => {
    clearStacks();
    setControls(true);
    spinning = false;
    if (bank < 1){
      bank = START_BANK;
      updateMoney(); saveBank();
      sfx.foundation();
      toast('Out of chips? On the house — here’s 500 more. ♥');
      say('The house comped you back to 500 chips. Bet away!');
    }
  }, 1200);
}

/* --- wire up ---------------------------------------------------------------------- */
buildBoard();
updateMoney();

chipBtns.forEach((b) => {
  b.addEventListener('click', () => {
    denom = parseInt(b.dataset.denom, 10);
    chipBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    sfx.pickup();
    say(`Chip value: ${denom}. Tap the felt to place it.`);
  });
});
spinBtn.addEventListener('click', doSpin);
clearBtn.addEventListener('click', clearBets);

new ResizeObserver(fit).observe(canvas);
fit();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawIdle(lastHl));
