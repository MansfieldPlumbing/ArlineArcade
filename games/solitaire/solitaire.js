/* ============================================================================
   Arline Arcade — Klondike Solitaire
   Tap-to-move (taps auto-route: foundation first, else a legal tableau). Cards
   are persistent DOM nodes positioned by transform, so every move slides.
   CSS-drawn cards for now; the LGPL Svg-cards-2.0.svg deck is an easy art swap.
   ============================================================================ */
import sfx from '../../assets/js/sfx.js';
import { FACE_SVG } from '../../assets/js/deck-faces.js';   // A-10 composed as inline SVG; courts stay images

const SUITS = [{ch:'♠',color:'black'},{ch:'♥',color:'red'},{ch:'♦',color:'red'},{ch:'♣',color:'black'}];
const RANKS = ['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUIT_NAME = ['spade','heart','diamond','club'];      // matches assets/cards/rawpixel/<suit>_<rank>.png
const DECK_PATH = '../../assets/cards/royal/';
const ASPECT = 1.5;                                        // taller cards, better use of phone height

const board = document.getElementById('board');
let cards, stock, waste, foundations, tableau, elMap, slotEl, zc=1, moves=0, won=false;
const posMap = new Map(); let geo=null, drag=null;

const topOf = a => a[a.length-1];

function buildCards(){ cards=[]; let id=0; for(let s=0;s<4;s++) for(let r=1;r<=13;r++) cards.push({id:id++,suit:s,rank:r,color:SUITS[s].color,up:false}); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function deal(){
  buildCards();
  const d = shuffle(cards.slice());
  tableau=[[],[],[],[],[],[],[]];
  let i=0;
  for(let c=0;c<7;c++) for(let k=0;k<=c;k++){ const card=d[i++]; card.up=(k===c); tableau[c].push(card); }
  stock=d.slice(i); stock.forEach(c=>c.up=false);
  waste=[]; foundations=[[],[],[],[]]; moves=0; won=false; zc=1;

  board.innerHTML=''; slotEl={};
  const names=['t0','t1','t2','t3','t4','t5','t6','stock','waste','f0','f1','f2','f3'];
  for(const name of names){
    const s=document.createElement('div');
    s.className = 'slot ' + (name==='stock'?'stock':name==='waste'?'waste':name[0]==='f'?'foundation':'tableau');
    if(name[0]==='f') s.dataset.suit = SUITS[+name[1]].ch;
    board.appendChild(s); slotEl[name]=s;
  }
  elMap=new Map();
  for(const card of cards){
    const e=document.createElement('div'); e.className='card down'; e._s='d'; e.dataset.id=card.id;
    e.addEventListener('pointerdown', ev=>onPointerDown(ev, card));
    board.appendChild(e); elMap.set(card.id,e);
  }
  slotEl.stock.addEventListener('click', drawStock);
  hideWin(); layout(true); updateBar();
}

/* ---- rules --------------------------------------------------------------- */
function foundationFor(card){
  const f=foundations[card.suit], t=topOf(f);
  if(!t) return card.rank===1 ? card.suit : -1;
  return t.rank===card.rank-1 ? card.suit : -1;
}
function canTableau(card, col){
  const t=topOf(tableau[col]);
  if(!t) return card.rank===13;
  return t.color!==card.color && t.rank===card.rank+1;
}
function runValid(run){
  for(let i=0;i<run.length;i++){
    if(!run[i].up) return false;
    if(i>0 && !(run[i-1].rank===run[i].rank+1 && run[i-1].color!==run[i].color)) return false;
  }
  return true;
}
function locate(card){
  let i=stock.indexOf(card); if(i>=0) return {type:'stock',idx:i};
  i=waste.indexOf(card); if(i>=0) return {type:'waste',idx:i};
  for(let f=0;f<4;f++){ i=foundations[f].indexOf(card); if(i>=0) return {type:'foundation',col:f,idx:i}; }
  for(let c=0;c<7;c++){ i=tableau[c].indexOf(card); if(i>=0) return {type:'tableau',col:c,idx:i}; }
  return null;
}

/* ---- interaction --------------------------------------------------------- */
function onClick(card){
  if(won) return;
  const loc=locate(card); if(!loc) return;
  if(loc.type==='stock'){ drawStock(); return; }
  if(loc.type==='foundation' || !card.up) return;

  let run;
  if(loc.type==='waste'){ if(card!==topOf(waste)) return; run=[card]; }
  else { run=tableau[loc.col].slice(loc.idx); if(!runValid(run)){ wiggle(card); return; } }

  if(run.length===1 && foundationFor(card)>=0){ doFoundation(card, loc); return; }
  for(let c=0;c<7;c++){
    if(loc.type==='tableau' && c===loc.col) continue;
    if(canTableau(run[0], c)){ doTableau(run, loc, c); return; }
  }
  wiggle(card);
}
function removeRun(loc, n){
  if(loc.type==='waste') return waste.splice(waste.length-n, n);
  return tableau[loc.col].splice(loc.idx);
}
function flipSource(loc){
  if(loc.type!=='tableau') return;
  const t=topOf(tableau[loc.col]);
  if(t && !t.up){ t.up=true; sfx.flip(); }
}
function bump(run){ for(const c of run) elMap.get(c.id).style.zIndex = 1000 + (zc++); }
function doFoundation(card, loc){
  removeRun(loc, 1);
  foundations[card.suit].push(card);
  bump([card]); flipSource(loc); moves++; sfx.foundation();
  layout(false); updateBar(); checkWin();
}
function doTableau(run, loc, col){
  removeRun(loc, run.length);
  for(const c of run) tableau[col].push(c);
  bump(run); flipSource(loc); moves++; sfx.place();
  layout(false); updateBar();
}
function drawStock(){
  if(won) return;
  if(stock.length){ const c=stock.pop(); c.up=true; waste.push(c); bump([c]); sfx.deal(); }
  else if(waste.length){ while(waste.length){ const c=waste.pop(); c.up=false; stock.push(c); } sfx.shuffle(); }
  moves++; layout(false); updateBar();
}
function autoFinish(){
  const iv=setInterval(()=>{ if(won || !autoStep()) clearInterval(iv); }, 170);
}
function autoStep(){
  const cand=[];
  if(waste.length) cand.push([topOf(waste), {type:'waste'}]);
  for(let c=0;c<7;c++){ const p=tableau[c]; if(p.length && topOf(p).up) cand.push([topOf(p), {type:'tableau',col:c,idx:p.length-1}]); }
  for(const [card,loc] of cand){ if(foundationFor(card)>=0){ doFoundation(card,loc); return true; } }
  return false;
}
function checkWin(){ if(foundations.every(f=>f.length===13)){ won=true; sfx.win(); showWin(); } }
function wiggle(card){ const e=elMap.get(card.id); if(e){ e.classList.add('shake'); setTimeout(()=>e.classList.remove('shake'),320); } sfx.invalid(); }

/* ---- pointer: tap OR drag (both work) ------------------------------------ */
function onPointerDown(ev, card){
  if(won) return;
  const loc=locate(card); if(!loc) return;
  drag={card, loc, sx:ev.clientX, sy:ev.clientY, moved:false, run:null, base:null};
  if((loc.type==='waste' && card===topOf(waste)) || (loc.type==='tableau' && card.up)){
    let run = loc.type==='waste' ? [card] : tableau[loc.col].slice(loc.idx);
    if(loc.type==='tableau' && !runValid(run)) run=null;
    if(run){ drag.run=run; drag.base=run.map(c=>({...posMap.get(c.id)})); }
  }
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerUp, {once:true});
  addEventListener('pointercancel', onPointerUp, {once:true});
}
function onPointerMove(ev){
  if(!drag) return;
  const dx=ev.clientX-drag.sx, dy=ev.clientY-drag.sy;
  if(!drag.moved && Math.hypot(dx,dy)>7) drag.moved=true;
  if(drag.moved && drag.run) drag.run.forEach((c,i)=>{
    const e=elMap.get(c.id); e.classList.add('dragging'); e.style.zIndex=3000+i;
    e.style.transform=`translate(${drag.base[i].x+dx}px,${drag.base[i].y+dy}px)`;
  });
}
function onPointerUp(ev){
  removeEventListener('pointermove', onPointerMove);
  const d=drag; drag=null; if(!d) return;
  if(d.run) d.run.forEach(c=> elMap.get(c.id).classList.remove('dragging'));
  if(!d.moved){ if(d.loc.type==='stock') drawStock(); else onClick(d.card); return; }   // a tap
  if(!d.run){ layout(false); return; }
  const hit=hitTest(ev.clientX, ev.clientY);                                            // a drag-drop
  if(hit && hit.type==='foundation' && d.run.length===1 && foundationFor(d.card)>=0){ doFoundation(d.card, d.loc); return; }
  if(hit && hit.type==='tableau' && !(d.loc.type==='tableau' && hit.col===d.loc.col) && canTableau(d.run[0], hit.col)){ doTableau(d.run, d.loc, hit.col); return; }
  layout(false);   // illegal drop → slide back
}
function hitTest(cx, cy){
  if(!geo) return null;
  const r=board.getBoundingClientRect(); const x=cx-r.left, y=cy-r.top;
  const {gap,CW,CH,topY,tabY,colX}=geo;
  if(y>=topY-CH*0.4 && y<=topY+CH*1.2) for(let f=0;f<4;f++){ const fx=colX(3+f); if(x>=fx-gap && x<=fx+CW+gap) return {type:'foundation',idx:f}; }
  if(y>=tabY-CH*0.4) for(let c=0;c<7;c++){ const cx2=colX(c); if(x>=cx2-gap && x<=cx2+CW+gap) return {type:'tableau',col:c}; }
  return null;
}

/* ---- layout (positions everything; transforms animate) ------------------- */
function layout(instant){
  if(instant) board.classList.add('no-anim');
  const W = board.clientWidth || 360;
  const pad = Math.max(6, Math.round(W*0.012));
  const gap = Math.max(4, Math.round(W*0.012));
  const CW = Math.max(38, Math.min(96, Math.floor((W - 2*pad - 6*gap) / 7)));
  const CH = Math.round(CW*ASPECT);
  board.style.setProperty('--cw', CW+'px'); board.style.setProperty('--ch', CH+'px');
  const colX = c => pad + c*(CW+gap);
  const topY = pad;
  const tabY = pad + CH + Math.round(gap*1.6);
  const dyDown = Math.round(CH*0.17), dyUp = Math.round(CH*0.36);   // fan reveals the full big index
  geo = {gap, CW, CH, topY, tabY, colX};

  setSlot('stock', colX(0), topY); setSlot('waste', colX(1), topY);
  for(let f=0;f<4;f++) setSlot('f'+f, colX(3+f), topY);
  for(let c=0;c<7;c++) setSlot('t'+c, colX(c), tabY);

  let maxY = tabY + CH;
  stock.forEach((card,i)=> put(card, colX(0), topY, i));
  const ws = Math.max(0, waste.length-3);
  waste.forEach((card,i)=> put(card, colX(1) + Math.max(0,i-ws)*Math.round(CW*0.24), topY, i));
  for(let f=0;f<4;f++) foundations[f].forEach((card,i)=> put(card, colX(3+f), topY, i));
  for(let c=0;c<7;c++){
    let y=tabY, lastY=tabY; const p=tableau[c];
    p.forEach((card,i)=>{ put(card, colX(c), y, i); lastY=y; y += card.up?dyUp:dyDown; });
    maxY = Math.max(maxY, lastY + CH);
  }
  board.style.height = (maxY + pad) + 'px';
  if(instant){ void board.offsetWidth; board.classList.remove('no-anim'); }
}
function setSlot(name,x,y){ const e=slotEl[name]; if(e) e.style.transform=`translate(${x}px,${y}px)`; }
function put(card,x,y,zi){ const e=elMap.get(card.id); e.style.transform=`translate(${x}px,${y}px)`; e.style.zIndex=zi+1; posMap.set(card.id,{x,y}); face(e,card); }
function face(e,card){
  if(card.up){
    if(e._s!=='u'){ e.classList.remove('down'); e.classList.add('up'); e._s='u'; }
    e.classList.toggle('red', card.color==='red');
    if(e._f!==card.id){ e.innerHTML=faceHTML(card); e._f=card.id; }
  } else if(e._s!=='d'){
    e.classList.add('down'); e.classList.remove('up','red'); e.innerHTML=''; e._s='d'; e._f=null;
  }
}
function faceHTML(card){
  const suit = SUIT_NAME[card.suit];
  if(card.rank <= 10){ const svg = FACE_SVG[`${suit}_${card.rank}`]; if(svg) return svg; }   // composed number card
  return `<img class="cf" draggable="false" alt="" src="${DECK_PATH}${suit}_${card.rank}.png">`;   // court figure (J/Q/K)
}

/* ---- win ----------------------------------------------------------------- */
function showWin(){ const w=document.getElementById('win'); if(w){ w.classList.add('show'); const m=document.getElementById('winMoves'); if(m) m.textContent=moves; } confetti(); }
function hideWin(){ const w=document.getElementById('win'); if(w) w.classList.remove('show'); }
function confetti(){
  const cols=['#e9c34a','#d11f33','#39a14a','#1f6fd0','#fff0b0'];
  for(let i=0;i<90;i++){ const d=document.createElement('div'); d.className='confetti';
    d.style.left=Math.random()*100+'vw'; d.style.background=cols[i%cols.length];
    d.style.animation=`drop ${1+Math.random()*1.6}s ${Math.random()*0.6}s ease-in forwards`;
    document.body.appendChild(d); setTimeout(()=>d.remove(),3200); }
}
function updateBar(){ const m=document.getElementById('moves'); if(m) m.textContent = moves + (moves===1?' move':' moves'); }

/* ---- go ------------------------------------------------------------------ */
if(board){
  document.getElementById('newGame')?.addEventListener('click', deal);
  document.getElementById('autoBtn')?.addEventListener('click', autoFinish);
  document.getElementById('winNew')?.addEventListener('click', ()=>{ hideWin(); deal(); });
  let rt; addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(()=>layout(true), 120); });
  deal();
}
