/* ============================================================================
   Arline Arcade — Uno
   Our own implementation: 108-card deck, you + 3 CPU opponents, skip / reverse /
   draw-two / wild / wild-draw-four. CSS-drawn cards, chiptune sfx. Vanilla JS.
   (Game mechanics aren't copyrightable; cards are our own CSS, not Mattel art.)
   ============================================================================ */
import sfx from '../../assets/js/sfx.js';

const COLORS = ['red','yellow','green','blue'];
const NAMES  = ['You','Rosa','Hank','Lou'];
let NP = 4;   // chosen on the setup screen (2–4 players)

const el = document.getElementById('uno');

let deck=[], discard=[], hands=[[],[],[],[]];
let current=0, dir=1, color=null, over=false, drew=false, busy=false, winner=-1, anim=null, started=false;
let picker=null;   // pending wild-color callback

const top = ()=> discard[discard.length-1];

/* ---- deck ---------------------------------------------------------------- */
function buildDeck(){
  const d=[];
  for(const c of COLORS){
    d.push({color:c, type:'number', value:0});
    for(let v=1; v<=9; v++){ d.push({color:c,type:'number',value:v}); d.push({color:c,type:'number',value:v}); }
    for(const t of ['skip','reverse','draw2']){ d.push({color:c,type:t}); d.push({color:c,type:t}); }
  }
  for(let i=0;i<4;i++){ d.push({color:'wild',type:'wild'}); d.push({color:'wild',type:'wild4'}); }
  return d;
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function reshuffle(){ if(deck.length===0 && discard.length>1){ const t=discard.pop(); deck=shuffle(discard); discard=[t]; } }
function draw(n){ const out=[]; for(let k=0;k<n;k++){ reshuffle(); if(deck.length===0) break; out.push(deck.pop()); } return out; }

function deal(){
  deck=shuffle(buildDeck());
  hands=Array.from({length:NP},()=>[]);
  for(let k=0;k<7;k++) for(let p=0;p<NP;p++) hands[p].push(deck.pop());
  let first;                                  // start on a plain number card
  do { first=deck.pop(); if(first.type!=='number') deck.unshift(first); } while(first.type!=='number');
  discard=[first]; color=first.color;
  current=0; dir=1; over=false; drew=false; busy=false; winner=-1; picker=null;
}

/* ---- rules --------------------------------------------------------------- */
function legal(card){
  const t=top();
  if(card.color==='wild') return true;
  if(card.color===color) return true;
  if(card.type==='number' && t.type==='number' && card.value===t.value) return true;
  if(card.type!=='number' && card.type===t.type) return true;
  return false;
}
function step(from,s){ return ((from + dir*s) % NP + NP) % NP; }
function aiColor(p){
  const cnt={red:0,yellow:0,green:0,blue:0};
  for(const c of hands[p]) if(c.color!=='wild') cnt[c.color]++;
  return COLORS.reduce((a,b)=> cnt[b]>cnt[a]?b:a, COLORS[(Math.random()*4)|0]);
}

/* ---- a play -------------------------------------------------------------- */
function doPlay(p, idx, from){
  const card = hands[p].splice(idx,1)[0];
  discard.push(card);
  color = (card.color==='wild') ? (card.chosen || aiColor(p)) : card.color;
  (card.type==='draw2'||card.type==='wild4') ? sfx.foundation() : sfx.place();
  if(from) anim={from, target:'discard'};

  if(hands[p].length===0){ winner=p; over=true; busy=false; if(p===0) sfx.win(); render(); return; }

  let skip=false;
  if(card.type==='reverse'){ dir=-dir; if(NP===2) skip=true; }   // 2-player reverse acts as a skip
  if(card.type==='skip') skip=true;
  if(card.type==='draw2'){ hands[step(p,1)].push(...draw(2)); skip=true; }
  if(card.type==='wild4'){ hands[step(p,1)].push(...draw(4)); skip=true; }

  current = step(p, skip?2:1);
  drew=false;
  render();
  scheduleTurn();
}
function scheduleTurn(){
  if(over) return;
  if(current!==0){ busy=true; setTimeout(aiTurn, 950); }
  else { busy=false; render(); }
}

/* ---- AI ------------------------------------------------------------------ */
function score(c){
  if(c.type==='draw2'||c.type==='skip') return 5;
  if(c.type==='reverse') return 4;
  if(c.type==='wild4') return 3;
  if(c.type==='wild') return 1;          // hold wilds for flexibility
  return (c.color===color) ? 6 : 2;
}
function aiTurn(){
  if(over || current===0) return;
  const p=current;
  const opts = hands[p].map((c,i)=>({c,i})).filter(o=>legal(o.c)).sort((a,b)=>score(b.c)-score(a.c));
  if(opts.length){
    const pick=opts[0];
    if(pick.c.color==='wild') pick.c.chosen=aiColor(p);
    doPlay(p, pick.i, rectOf(`.opp[data-p="${p}"] .stack`));
  } else {
    const dr=draw(1); if(dr.length) hands[p].push(dr[0]);
    sfx.deal(); render();
    setTimeout(()=>{
      if(over || current!==p) return;
      const card=dr[0];
      if(card && legal(card)){
        if(card.color==='wild') card.chosen=aiColor(p);
        doPlay(p, hands[p].indexOf(card), rectOf(`.opp[data-p="${p}"] .stack`));
      } else { current=step(p,1); drew=false; render(); scheduleTurn(); }
    }, 650);
  }
}

/* ---- human --------------------------------------------------------------- */
function humanPlay(idx){
  if(over || current!==0 || busy || picker) return;
  const card=hands[0][idx]; if(!card) return;
  if(!legal(card)){ sfx.invalid(); shake(idx); return; }
  const from=rectOf(`.card-btn[data-idx="${idx}"]`);
  if(card.color==='wild') pickColor(col=>{ card.chosen=col; doPlay(0,idx,from); });
  else doPlay(0, idx, from);
}
function humanDraw(){
  if(over || current!==0 || busy || drew || picker) return;
  const from=rectOf('#drawPile');
  const dr=draw(1); if(dr.length) hands[0].push(dr[0]);
  drew=true; sfx.deal();
  anim={from, target:'handLast'};
  render();
  const card=dr[0];
  if(!(card && legal(card))){            // nothing playable -> auto-pass
    setTimeout(()=>{ if(current===0 && !over){ current=step(0,1); drew=false; render(); scheduleTurn(); } }, 700);
  }
}
function humanPass(){
  if(over || current!==0 || !drew) return;
  current=step(0,1); drew=false; render(); scheduleTurn();
}
function pickColor(cb){ picker=cb; render(); }
function shake(idx){
  const b=el.querySelector(`.card-btn[data-idx="${idx}"]`);
  if(b){ b.classList.add('shake'); setTimeout(()=>b.classList.remove('shake'), 320); }
}

/* ---- render -------------------------------------------------------------- */
const SYM = { skip:'⦸', reverse:'⇄', draw2:'+2', wild:'★', wild4:'+4' };
function sym(c){ return c.type==='number' ? c.value : SYM[c.type]; }
function cardFace(c){
  const cls = c.color==='wild' ? 'c-wild' : 'c-'+c.color;
  const s = sym(c);
  return `<div class="uno-card ${cls}"><span class="corner tl">${s}</span><span class="pip">${s}</span><span class="corner br">${s}</span></div>`;
}
function cardBack(){ return `<div class="uno-card back"><span class="pip">UNO</span></div>`; }

function render(){
  if(!el) return;
  if(!started){
    el.innerHTML = setupOverlay();
    el.querySelectorAll('.np-btn').forEach(b=> b.addEventListener('click', ()=>{ NP=+b.dataset.np; newGame(); }));
    return;
  }
  const opps = Array.from({length:NP-1}, (_,i)=>i+1).map(p=>`
    <div class="opp ${current===p&&!over?'active':''}" data-p="${p}">
      <div class="stack">${cardBack()}<span class="count">${hands[p].length}</span></div>
      <div class="oname">${NAMES[p]}</div>
    </div>`).join('');

  const turn = over ? '' : (current===0 ? 'Your turn' : NAMES[current]+'…');
  const hand = hands[0].map((c,i)=>`
    <button class="card-btn ${current===0&&!over&&!picker&&legal(c)?'legal':''}" data-idx="${i}">${cardFace(c)}</button>`).join('');
  const control = (current===0 && !over && !picker)
    ? (drew ? `<button class="ctl" id="passBtn">Pass</button>` : `<button class="ctl" id="drawBtn">Draw a card</button>`)
    : '';

  el.innerHTML = `
    <div class="opp-row">${opps}</div>
    <div class="play-area">
      <button class="pile draw" id="drawPile" ${current===0&&!over&&!drew&&!picker?'':'disabled'}>${cardBack()}<span class="plabel">Draw</span></button>
      <div class="pile discard">${cardFace(top())}</div>
      <div class="status"><div class="swatch sc-${color||'wild'}"></div><div class="turn">${turn}</div><div class="dir">${dir>0?'↻':'↺'}</div></div>
    </div>
    <div class="hand" id="hand">${hand}</div>
    <div class="controls">${control}</div>
    ${over ? winOverlay() : ''}
    ${picker ? pickerOverlay() : ''}`;

  const handEl=el.querySelector('#hand');
  handEl && handEl.addEventListener('click', e=>{ const b=e.target.closest('.card-btn'); if(b) humanPlay(+b.dataset.idx); });
  bind('#drawBtn','click',humanDraw); bind('#drawPile','click',humanDraw); bind('#passBtn','click',humanPass);
  if(over){ bind('#again','click', newGame); bind('#changeNp','click', ()=>{ started=false; over=false; render(); }); }
  if(picker) el.querySelectorAll('.pick').forEach(b=> b.addEventListener('click', ()=>{ const cb=picker; picker=null; cb(b.dataset.col); }));

  if(anim){
    const sel = anim.target==='discard' ? '.pile.discard .uno-card' : '.hand .card-btn:last-child .uno-card';
    slideIn(el.querySelector(sel), anim.from);
    anim=null;
  }
}
function bind(sel,ev,fn){ const n=el.querySelector(sel); if(n) n.addEventListener(ev,fn); }
function rectOf(sel){ const n=el.querySelector(sel); return n ? n.getBoundingClientRect() : null; }
function slideIn(node, from){
  if(!node || !from) return;
  const r=node.getBoundingClientRect();
  const dx=from.left-r.left, dy=from.top-r.top;
  const sc=(from.width && r.width) ? from.width/r.width : 1;
  node.style.transition='none';
  node.style.transform=`translate(${dx}px,${dy}px) scale(${sc})`;
  node.getBoundingClientRect();                    // force reflow before animating
  requestAnimationFrame(()=>{
    node.style.transition='transform .3s cubic-bezier(.2,.7,.3,1)';
    node.style.transform='none';
  });
}
function pickerOverlay(){
  return `<div class="overlay"><div class="panel"><h3>Pick a color</h3><div class="picks">
    ${COLORS.map(c=>`<button class="pick sc-${c}" data-col="${c}" aria-label="${c}"></button>`).join('')}</div></div></div>`;
}
function setupOverlay(){
  return `<div class="overlay setup"><div class="panel"><div class="big">🎴</div>
    <h3>Arline Arcade Uno</h3><p class="sub">How many players?</p>
    <div class="np-picks">
      <button class="ctl np-btn" data-np="2">2</button>
      <button class="ctl np-btn" data-np="3">3</button>
      <button class="ctl np-btn" data-np="4">4</button>
    </div>
    <p class="sub small">You vs the computer</p></div></div>`;
}
function newGame(){ deal(); started=true; over=false; render(); }
function winOverlay(){
  return `<div class="overlay"><div class="panel"><div class="big">${winner===0?'🎉':'🃏'}</div>
    <h3>${winner===0?'You win!':NAMES[winner]+' wins'}</h3>
    <div class="winbtns"><button class="ctl" id="again">Play again</button>
    <button class="ctl ghost" id="changeNp">Change players</button></div></div></div>`;
}

/* ---- go ------------------------------------------------------------------ */
if(el){ started=false; render(); }
