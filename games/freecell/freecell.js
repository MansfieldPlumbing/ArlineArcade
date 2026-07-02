/* ============================================================================
   Arline Arcade — FreeCell
   Every card is dealt face-up: 8 cascades, 4 free cells, 4 foundations.
   Same recipe as Klondike: cards are persistent DOM nodes positioned by
   transform, so every move (and every Rewind) slides. Tap auto-routes;
   drag-and-drop works too (a 7px threshold tells them apart).
   Rules live in engine.js (pure, sim-verified by sim.mjs).
   ============================================================================ */
import sfx from '../../assets/js/sfx.js';
import {
  SUIT_NAME, CARDS, top, isRun, foundationFor, legalMove, applyMove,
  isWon, deal as engineDeal, snapshot, restore,
} from './engine.js';

const SUIT_CH = ['♠', '♥', '♦', '♣'];
const DECK_PATH = '../../assets/cards/royal/';
const ASPECT = 1.5;
const REWINDS_PER_GAME = 3;

const board = document.getElementById('board');
let S = null, elMap, slotEl, zc = 1, moves = 0, won = false;
let history = [], rewindsLeft = REWINDS_PER_GAME;
const posMap = new Map(); let geo = null, drag = null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ---- new game ------------------------------------------------------------- */
function newGame(){
  S = engineDeal(Math.random);
  moves = 0; won = false; zc = 1;
  history = []; rewindsLeft = REWINDS_PER_GAME;

  board.innerHTML = ''; slotEl = {};
  const names = ['c0','c1','c2','c3','f0','f1','f2','f3','t0','t1','t2','t3','t4','t5','t6','t7'];
  for(const name of names){
    const s = document.createElement('div');
    s.className = 'slot ' + (name[0]==='c' ? 'cell' : name[0]==='f' ? 'foundation' : 'cascade');
    if(name[0]==='f') s.dataset.suit = SUIT_CH[+name[1]];
    board.appendChild(s); slotEl[name] = s;
  }
  elMap = new Map();
  for(const card of CARDS){
    const e = document.createElement('div');
    e.className = 'card up' + (card.color === 'red' ? ' red' : '');
    e.dataset.id = card.id;
    e.innerHTML = faceHTML(card);
    e.addEventListener('pointerdown', ev => onPointerDown(ev, card));
    board.appendChild(e); elMap.set(card.id, e);
  }
  hideWin(); layout(true); updateBar(); updateRewind();
  sfx.deal();
}
function faceHTML(card){
  const suit = SUIT_NAME[card.suit];
  return `<img class="cf" draggable="false" alt="" src="${DECK_PATH}${suit}_${card.rank}.png">`;
}

/* ---- where is a card? ------------------------------------------------------ */
function locate(card){
  let i = S.cells.indexOf(card);
  if(i >= 0) return { zone:'cell', idx:i };
  for(let c = 0; c < 8; c++){
    i = S.cascades[c].indexOf(card);
    if(i >= 0) return { zone:'cascade', col:c, idx:i };
  }
  for(let f = 0; f < 4; f++)
    if(S.foundations[f].includes(card)) return { zone:'foundation', idx:f };
  return null;
}
const isTop = loc => loc.zone === 'cell' ||
  (loc.zone === 'cascade' && loc.idx === S.cascades[loc.col].length - 1);
function runAt(loc){
  if(loc.zone === 'cell') return [S.cells[loc.idx]];
  const run = S.cascades[loc.col].slice(loc.idx);
  return isRun(run) ? run : null;
}

/* ---- moves (every applied move is snapshotted for Rewind) ------------------ */
function doMove(mv, sound){
  const run = runAt(mv.from) || [];
  history.push({ ...snapshot(S), moves });
  if(history.length > 300) history.shift();
  applyMove(S, mv);
  moves++;
  (sfx[sound] || sfx.place)();
  layout(false); bump(run);
  updateBar(); updateRewind(); checkWin();
}
function bump(run){ run.forEach((c, i) => { elMap.get(c.id).style.zIndex = 1000 + zc + i; }); zc += run.length; }
function checkWin(){ if(isWon(S)){ won = true; updateRewind(); sfx.win(); showWin(); } }
function wiggle(card){
  const e = elMap.get(card.id);
  if(e){ e.classList.add('shake'); setTimeout(() => e.classList.remove('shake'), 320); }
  sfx.invalid();
}

/* ---- tap auto-routing ------------------------------------------------------ */
/* Priority: single card -> foundation; else the longest legal run from the
   tapped card -> a legal cascade (non-empty targets first); else single card
   -> an empty free cell. Anything else wiggles. */
function onTap(card){
  if(won) return;
  const loc = locate(card); if(!loc || loc.zone === 'foundation') return;

  if(isTop(loc) && foundationFor(S, card) >= 0){
    doMove({ from: loc, to: { zone:'foundation' } }, 'foundation'); return;
  }
  const run = runAt(loc);
  if(!run){ wiggle(card); return; }
  const targets = [];
  for(const wantFilled of [true, false])
    for(let c = 0; c < 8; c++){
      if(loc.zone === 'cascade' && c === loc.col) continue;
      if(!!S.cascades[c].length === wantFilled) targets.push(c);
    }
  for(const c of targets){
    const mv = { from: loc, to: { zone:'cascade', col: c } };
    if(legalMove(S, mv)){ doMove(mv, 'place'); return; }
  }
  if(loc.zone === 'cascade' && isTop(loc)){
    const i = S.cells.findIndex(c => !c);
    if(i >= 0){ doMove({ from: loc, to: { zone:'cell', idx: i } }, 'pickup'); return; }
  }
  wiggle(card);
}

/* ---- pointer: tap OR drag (both work) -------------------------------------- */
function onPointerDown(ev, card){
  if(won) return;
  const loc = locate(card); if(!loc) return;
  drag = { card, loc, sx: ev.clientX, sy: ev.clientY, moved:false, run:null, base:null };
  if(loc.zone !== 'foundation'){
    const run = runAt(loc);
    if(run){ drag.run = run; drag.base = run.map(c => ({ ...posMap.get(c.id) })); }
  }
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerUp, { once:true });
  addEventListener('pointercancel', onPointerUp, { once:true });
}
function onPointerMove(ev){
  if(!drag) return;
  const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
  if(!drag.moved && Math.hypot(dx, dy) > 7) drag.moved = true;
  if(drag.moved && drag.run) drag.run.forEach((c, i) => {
    const e = elMap.get(c.id); e.classList.add('dragging'); e.style.zIndex = 3000 + i;
    e.style.transform = `translate(${drag.base[i].x + dx}px,${drag.base[i].y + dy}px)`;
  });
}
function onPointerUp(ev){
  removeEventListener('pointermove', onPointerMove);
  const d = drag; drag = null; if(!d) return;
  if(d.run) d.run.forEach(c => elMap.get(c.id).classList.remove('dragging'));
  if(!d.moved){ onTap(d.card); return; }                       // a tap
  if(!d.run){ layout(false); return; }
  const hit = hitTest(ev.clientX, ev.clientY);                 // a drag-drop
  if(!hit){ layout(false); return; }                           // dropped on felt → slide back
  if(hit.zone === 'cascade' && d.loc.zone === 'cascade' && hit.col === d.loc.col){
    layout(false); return;                                     // dropped back home → no fuss
  }
  const mv = { from: d.loc, to: hit };
  if(legalMove(S, mv)){
    doMove(mv, hit.zone === 'foundation' ? 'foundation' : hit.zone === 'cell' ? 'pickup' : 'place');
    return;
  }
  layout(false); wiggle(d.card);                               // illegal → slide back + wiggle
}
function hitTest(cx, cy){
  if(!geo) return null;
  const r = board.getBoundingClientRect(); const x = cx - r.left, y = cy - r.top;
  const { gap, CW, CH, topY, tabY, colX } = geo;
  if(y >= topY - CH*0.4 && y <= topY + CH*1.2){
    for(let i = 0; i < 4; i++){ const fx = colX(i);   if(x >= fx-gap && x <= fx+CW+gap) return { zone:'cell', idx:i }; }
    for(let f = 0; f < 4; f++){ const fx = colX(4+f); if(x >= fx-gap && x <= fx+CW+gap) return { zone:'foundation' }; }
  }
  if(y >= tabY - CH*0.4)
    for(let c = 0; c < 8; c++){ const cx2 = colX(c); if(x >= cx2-gap && x <= cx2+CW+gap) return { zone:'cascade', col:c }; }
  return null;
}

/* ---- Rewind (Braid ability): pop a snapshot, cards slide back in time ------ */
function rewind(){
  if(won || rewindsLeft <= 0 || !history.length) return;
  const snap = history.pop();
  S = restore(snap);
  moves = snap.moves;
  rewindsLeft--;
  sfx.shuffle();
  const wash = document.getElementById('rewindWash');
  if(wash && !reduceMotion.matches){
    wash.classList.add('on');
    setTimeout(() => wash.classList.remove('on'), 500);
  }
  layout(false);                    // transforms animate → the board visibly rewinds
  updateBar(); updateRewind();
}
function updateRewind(){
  const b = document.getElementById('rewindBtn'), chip = document.getElementById('rewindChip');
  if(chip) chip.textContent = 'x' + rewindsLeft;
  if(b){
    b.disabled = won || rewindsLeft <= 0 || history.length === 0;
    b.setAttribute('aria-label', 'Rewind last move, ' + rewindsLeft + ' left');
  }
}

/* ---- auto-finish: safe cards up, one every 170ms ---------------------------- */
function safeToFoundation(card){
  if(card.rank <= 2) return true;
  const opp = card.color === 'red' ? [0, 3] : [1, 2];          // spade+club vs heart+diamond
  return opp.every(s => S.foundations[s].length >= card.rank - 1);
}
function autoStep(){
  const cand = [];
  for(let i = 0; i < 4; i++) if(S.cells[i]) cand.push([S.cells[i], { zone:'cell', idx:i }]);
  for(let c = 0; c < 8; c++){
    const p = S.cascades[c];
    if(p.length) cand.push([top(p), { zone:'cascade', col:c, idx:p.length-1 }]);
  }
  for(const [card, from] of cand)
    if(foundationFor(S, card) >= 0 && safeToFoundation(card)){
      doMove({ from, to: { zone:'foundation' } }, 'foundation'); return true;
    }
  return false;
}
function autoFinish(){
  const iv = setInterval(() => { if(won || !autoStep()) clearInterval(iv); }, 170);
}

/* ---- layout (positions everything; transforms animate) --------------------- */
function layout(instant){
  if(instant) board.classList.add('no-anim');
  const W = board.clientWidth || 360;
  const pad = Math.max(5, Math.round(W*0.010));
  const gap = Math.max(3, Math.round(W*0.010));
  const CW = Math.max(34, Math.min(88, Math.floor((W - 2*pad - 7*gap) / 8)));
  const CH = Math.round(CW*ASPECT);
  board.style.setProperty('--cw', CW+'px'); board.style.setProperty('--ch', CH+'px');
  const colX = c => pad + c*(CW+gap);
  const topY = pad;
  const tabY = pad + CH + Math.round(gap*2.4);
  const dy = Math.max(17, Math.round(CH*0.32));   // face-up fan shows the full index
  geo = { gap, CW, CH, topY, tabY, colX };

  for(let i = 0; i < 4; i++) setSlot('c'+i, colX(i), topY);
  for(let f = 0; f < 4; f++) setSlot('f'+f, colX(4+f), topY);
  for(let c = 0; c < 8; c++) setSlot('t'+c, colX(c), tabY);

  let maxY = tabY + CH;
  S.cells.forEach((card, i) => { if(card) put(card, colX(i), topY, 1); });
  for(let f = 0; f < 4; f++) S.foundations[f].forEach((card, i) => put(card, colX(4+f), topY, i));
  for(let c = 0; c < 8; c++){
    const p = S.cascades[c];
    p.forEach((card, i) => put(card, colX(c), tabY + i*dy, i));
    if(p.length) maxY = Math.max(maxY, tabY + (p.length-1)*dy + CH);
  }
  board.style.height = (maxY + pad) + 'px';
  if(instant){ void board.offsetWidth; board.classList.remove('no-anim'); }
}
function setSlot(name, x, y){ const e = slotEl[name]; if(e) e.style.transform = `translate(${x}px,${y}px)`; }
function put(card, x, y, zi){
  const e = elMap.get(card.id);
  e.style.transform = `translate(${x}px,${y}px)`; e.style.zIndex = zi + 1;
  posMap.set(card.id, { x, y });
}

/* ---- win -------------------------------------------------------------------- */
function showWin(){
  const w = document.getElementById('win');
  if(w){ w.classList.add('show'); const m = document.getElementById('winMoves'); if(m) m.textContent = moves; }
  confetti();
}
function hideWin(){ const w = document.getElementById('win'); if(w) w.classList.remove('show'); }
function confetti(){
  if(reduceMotion.matches) return;
  const cols = ['#e9c34a','#d11f33','#39a14a','#1f6fd0','#fff0b0'];
  for(let i = 0; i < 90; i++){
    const d = document.createElement('div'); d.className = 'confetti';
    d.style.left = Math.random()*100 + 'vw'; d.style.background = cols[i % cols.length];
    d.style.animation = `drop ${1 + Math.random()*1.6}s ${Math.random()*0.6}s ease-in forwards`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 3200);
  }
}
function updateBar(){ const m = document.getElementById('moves'); if(m) m.textContent = moves + (moves === 1 ? ' move' : ' moves'); }

/* ---- load screen (deck preload, same recipe as solitaire) -------------------- */
function preloadDeck(){
  const urls = [];
  for(const s of SUIT_NAME) for(let r = 1; r <= 13; r++) urls.push(`${DECK_PATH}${s}_${r}.png`);
  return Promise.all(urls.map(u => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = u; })));
}
function hideLoader(){
  const el = document.getElementById('fcLoad');
  if(el && !el.classList.contains('gone')){ el.classList.add('gone'); setTimeout(() => el.remove(), 600); }
}

/* ---- go ----------------------------------------------------------------------- */
if(board){
  document.getElementById('newGame')?.addEventListener('click', newGame);
  document.getElementById('autoBtn')?.addEventListener('click', autoFinish);
  document.getElementById('rewindBtn')?.addEventListener('click', rewind);
  document.getElementById('winNew')?.addEventListener('click', () => { hideWin(); newGame(); });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => layout(true), 120); });
  newGame();
  Promise.race([ preloadDeck(), new Promise(r => setTimeout(r, 3500)) ]).then(hideLoader);
  window.__freecell = {                                    // tiny debug handle
    get moves(){ return moves; },
    get rewindsLeft(){ return rewindsLeft; },
    get cascadeCounts(){ return S.cascades.map(p => p.length); },
  };
}
