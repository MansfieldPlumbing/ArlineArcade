/* ============================================================================
   Headless verification for games/solitaire/abilities.js (time powers).
   Run from the repo root:   node games/solitaire/sim.mjs
   Builds realistic random Klondike states, then checks:
     - snapshot -> wild mutation -> restore is a perfect round-trip
     - snapshots are plain data (immune to later card mutation)
     - magicShuffle preserves pile sizes, face-up cards, and the hidden-card
       multiset; actually permutes the arrangement; keeps stock face-down
     - magicShuffle with 0 or 1 hidden cards is a no-op returning 0
   Prints each check, ends with PASS, exits 1 on any failure.
   ============================================================================ */
import { snapshot, restore, magicShuffle } from './abilities.js';

/* ---- tiny seeded rng (mulberry32) ---------------------------------------- */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- realistic Klondike deal (mirrors solitaire.js deal shape) ------------ */
const COLORS = ['black', 'red', 'red', 'black'];
function buildDeck(){
  const cards = []; let id = 0;
  for(let s = 0; s < 4; s++) for(let r = 1; r <= 13; r++)
    cards.push({ id: id++, suit: s, rank: r, color: COLORS[s], up: false });
  return cards;
}
function dealState(rng){
  const cards = buildDeck();
  const d = cards.slice();
  for(let i = d.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  const tableau = [[], [], [], [], [], [], []];
  let i = 0;
  for(let c = 0; c < 7; c++) for(let k = 0; k <= c; k++){ const card = d[i++]; card.up = (k === c); tableau[c].push(card); }
  const stock = d.slice(i); stock.forEach(c => c.up = false);
  return { cards, stock, waste: [], foundations: [[], [], [], []], tableau, moves: 0 };
}
/* Play some plausible random churn so states aren't all fresh deals. */
function churn(state, rng){
  const n = Math.floor(rng() * 30);
  for(let k = 0; k < n; k++){
    if(state.stock.length && rng() < 0.6){                      // draw
      const c = state.stock.pop(); c.up = true; state.waste.push(c); state.moves++;
    } else if(state.waste.length && rng() < 0.5){               // waste -> tableau top (loose, shape-only)
      const c = state.waste.pop(); c.up = true;
      state.tableau[Math.floor(rng() * 7)].push(c); state.moves++;
    } else if(!state.stock.length && state.waste.length){       // recycle
      while(state.waste.length){ const c = state.waste.pop(); c.up = false; state.stock.push(c); }
      state.moves++;
    }
  }
}

/* ---- harness --------------------------------------------------------------- */
let checks = 0, failures = 0;
function check(name, ok, detail = ''){
  checks++;
  if(ok) console.log(`  ok   ${name}`);
  else { failures++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const tag = c => c.id + (c.up ? '+' : '-');
const sig = s => JSON.stringify({
  stock: s.stock.map(tag), waste: s.waste.map(tag),
  foundations: s.foundations.map(p => p.map(tag)),
  tableau: s.tableau.map(p => p.map(tag)), moves: s.moves,
});
const hiddenIds = s => [...s.stock.map(c => c.id),
  ...s.tableau.flatMap(p => p.filter(c => !c.up).map(c => c.id))];
const hiddenArrangement = s => JSON.stringify(
  [s.stock.map(c => c.id), s.tableau.map(p => p.map(c => c.up ? 'U' : c.id))]);

function mutateWildly(state, rng){
  const piles = [state.stock, state.waste, ...state.foundations, ...state.tableau];
  for(let k = 0; k < 120; k++){
    const from = piles[Math.floor(rng() * piles.length)];
    const to = piles[Math.floor(rng() * piles.length)];
    if(from.length) to.push(from.splice(Math.floor(rng() * from.length), 1)[0]);
    const p = piles[Math.floor(rng() * piles.length)];
    if(p.length) p[Math.floor(rng() * p.length)].up = rng() < 0.5;
  }
  state.moves += 1 + Math.floor(rng() * 500);
}

/* ---- 1) snapshot -> mutate wildly -> restore round-trip -------------------- */
{
  const N = 400; let roundtrip = true, plainData = true, identity = true;
  for(let t = 0; t < N; t++){
    const rng = mulberry32(1000 + t);
    const state = dealState(rng); churn(state, rng);
    const byId = new Map(state.cards.map(c => [c.id, c]));
    const before = sig(state);
    const snap = snapshot(state);
    const frozen = JSON.stringify(snap);
    mutateWildly(state, rng);
    if(JSON.stringify(snap) !== frozen){ plainData = false; break; }
    const r = restore(snap, byId);
    const rs = { ...r, foundations: r.foundations, tableau: r.tableau };
    if(sig(rs) !== before){ roundtrip = false; break; }
    if(r.stock.length && r.stock[0] !== byId.get(snap.stock[0].id)) identity = false;
  }
  check(`round-trip: snapshot -> wild mutation -> restore over ${N} random states (pile order + up flags + moves)`, roundtrip);
  check('snapshot is plain data: mutating live cards never alters a stored snapshot', plainData);
  check('restore rebuilds piles out of the SAME card objects (identity via cardsById)', identity);
}

/* ---- 2) magicShuffle invariants with seeded rng ---------------------------- */
{
  const N = 400;
  let sizesOk = true, faceUpOk = true, multisetOk = true, stockDownOk = true, countOk = true, wasteOk = true;
  let permuted = 0;
  for(let t = 0; t < N; t++){
    const rng = mulberry32(5000 + t);
    const state = dealState(rng); churn(state, rng);
    const sizes = JSON.stringify([state.stock.length, ...state.tableau.map(p => p.length)]);
    const faceUp = JSON.stringify(state.tableau.map(p => p.map(c => c.up ? c.id : null)));
    const wasteBefore = JSON.stringify(state.waste.map(tag));
    const idsBefore = hiddenIds(state).slice().sort((a, b) => a - b);
    const arrBefore = hiddenArrangement(state);
    const n = magicShuffle({ stock: state.stock, tableau: state.tableau }, mulberry32(90000 + t));
    if(JSON.stringify([state.stock.length, ...state.tableau.map(p => p.length)]) !== sizes) sizesOk = false;
    if(JSON.stringify(state.tableau.map(p => p.map(c => c.up ? c.id : null))) !== faceUp) faceUpOk = false;
    if(JSON.stringify(state.waste.map(tag)) !== wasteBefore) wasteOk = false;
    if(JSON.stringify(hiddenIds(state).slice().sort((a, b) => a - b)) !== JSON.stringify(idsBefore)) multisetOk = false;
    if(state.stock.some(c => c.up)) stockDownOk = false;
    if(n !== idsBefore.length && !(n === 0 && idsBefore.length < 2)) countOk = false;
    if(hiddenArrangement(state) !== arrBefore) permuted++;
  }
  check(`magicShuffle x${N}: every pile SIZE unchanged`, sizesOk);
  check(`magicShuffle x${N}: every face-up card untouched, in place`, faceUpOk);
  check(`magicShuffle x${N}: waste untouched`, wasteOk);
  check(`magicShuffle x${N}: hidden-card multiset preserved`, multisetOk);
  check(`magicShuffle x${N}: stock stays face-down`, stockDownOk);
  check(`magicShuffle x${N}: returns the hidden-card count`, countOk);

  // A specific seed where the arrangement MUST change (45 hidden cards on a
  // fresh deal — verified deterministic with mulberry32(42) state + rng 7).
  const state = dealState(mulberry32(42));
  const arrBefore = hiddenArrangement(state);
  const n = magicShuffle({ stock: state.stock, tableau: state.tableau }, mulberry32(7));
  check('magicShuffle(seed 42 deal, rng 7): arrangement actually permuted', hiddenArrangement(state) !== arrBefore && n === 45,
    `n=${n}, changed=${hiddenArrangement(state) !== arrBefore}`);
  check(`magicShuffle: arrangement changed in ${permuted}/${N} random runs (statistically ~all)`, permuted >= N - 1);
}

/* ---- 3) magicShuffle no-ops (0 or 1 hidden cards) --------------------------- */
{
  // 0 hidden: empty stock, every tableau card face-up.
  const s0 = dealState(mulberry32(3));
  s0.stock.length = 0;
  s0.tableau.forEach(p => p.forEach(c => c.up = true));
  const before0 = sig(s0);
  const n0 = magicShuffle({ stock: s0.stock, tableau: s0.tableau }, mulberry32(1));
  check('magicShuffle with 0 hidden cards: no-op returning 0', n0 === 0 && sig(s0) === before0, `n=${n0}`);

  // 1 hidden: a single face-down card left in the tableau.
  const s1 = dealState(mulberry32(4));
  s1.stock.length = 0;
  s1.tableau.forEach(p => p.forEach(c => c.up = true));
  if(s1.tableau[6].length) s1.tableau[6][0].up = false;
  const before1 = sig(s1);
  const n1 = magicShuffle({ stock: s1.stock, tableau: s1.tableau }, mulberry32(1));
  check('magicShuffle with 1 hidden card: no-op returning 0', n1 === 0 && sig(s1) === before1, `n=${n1}`);
}

/* ---- verdict ---------------------------------------------------------------- */
console.log(`\n${checks} checks, ${failures} failure${failures === 1 ? '' : 's'}`);
if(failures){ console.error('FAIL'); process.exit(1); }
console.log('PASS');
