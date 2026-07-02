/* ============================================================================
   Arline Arcade — FreeCell headless verification (like Uno's & Solitaire's).
   Run from the repo root:  node games/freecell/sim.mjs
   Seeded mulberry32 rng — every run exercises the identical games.
   ============================================================================ */
import {
  CARDS, deal, maxMovable, foundationFor, isWon,
  legalMove, applyMove, legalMoves, snapshot, restore,
} from './engine.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('  FAIL: ' + msg); throw new Error(msg); }
}
function check(name, fn) {
  fn();
  console.log('  ok — ' + name);
}

const ri = (rng, n) => Math.floor(rng() * n);
const moveKey = m => [
  m.from.zone, m.from.col ?? -1, m.from.idx ?? -1,
  m.to.zone, m.to.col ?? -1, m.to.idx ?? -1,
].join('|');

/** Full-board invariants: 52 conserved & unique, cells hold <=1 (a slot is one
    card or null, never a stack), foundations are exact A..K same-suit runs. */
function checkInvariants(state, tag) {
  assert(state.cells.length === 4, tag + ': 4 cells');
  assert(state.cascades.length === 8, tag + ': 8 cascades');
  assert(state.foundations.length === 4, tag + ': 4 foundations');
  const ids = [];
  for (const c of state.cells) {
    if (c === null) continue;
    assert(!Array.isArray(c) && Number.isInteger(c.id) && c.id >= 0 && c.id < 52,
      tag + ': cell holds a single real card');
    ids.push(c.id);
  }
  for (const pile of state.cascades) for (const c of pile) ids.push(c.id);
  state.foundations.forEach((f, s) => {
    f.forEach((c, i) => {
      assert(c.suit === s && c.rank === i + 1, tag + ': foundation ' + s + ' is an exact A..K suit run');
      ids.push(c.id);
    });
  });
  assert(ids.length === 52, tag + ': 52 cards conserved (' + ids.length + ')');
  assert(new Set(ids).size === 52, tag + ': all 52 unique');
}

/* ---- (a) supermove math --------------------------------------------------- */
console.log('supermove math:');
check('(0 free, 0 empty) = 1', () => {
  const s = { cells: [CARDS[12], CARDS[25], CARDS[38], CARDS[51]],
    cascades: [[CARDS[0]], [CARDS[1]], [CARDS[2]], [CARDS[3]], [CARDS[4]], [CARDS[5]], [CARDS[6]], [CARDS[7]]],
    foundations: [[], [], [], []] };
  assert(maxMovable(s, 0) === 1, 'expected 1, got ' + maxMovable(s, 0));
});
check('(4 free, 0 empty) = 5', () => {
  const s = { cells: [null, null, null, null],
    cascades: [[CARDS[0]], [CARDS[1]], [CARDS[2]], [CARDS[3]], [CARDS[4]], [CARDS[5]], [CARDS[6]], [CARDS[7]]],
    foundations: [[], [], [], []] };
  assert(maxMovable(s, 0) === 5, 'expected 5, got ' + maxMovable(s, 0));
});
check('(1 free, 1 empty) = 4', () => {
  const s = { cells: [CARDS[12], CARDS[25], CARDS[38], null],
    cascades: [[CARDS[0]], [CARDS[1]], [CARDS[2]], [CARDS[3]], [CARDS[4]], [CARDS[5]], [CARDS[6]], []],
    foundations: [[], [], [], []] };
  assert(maxMovable(s, 0) === 4, 'expected 4, got ' + maxMovable(s, 0));
});
check('destination-empty halving: (1 free, 1 empty) to that empty cascade = 2', () => {
  const s = { cells: [CARDS[12], CARDS[25], CARDS[38], null],
    cascades: [[CARDS[0]], [CARDS[1]], [CARDS[2]], [CARDS[3]], [CARDS[4]], [CARDS[5]], [CARDS[6]], []],
    foundations: [[], [], [], []] };
  assert(maxMovable(s, 7) === 2, 'expected 2, got ' + maxMovable(s, 7));
});

/* ---- (b) deal integrity ---------------------------------------------------- */
console.log('deal integrity:');
check('52 unique cards, shape 7/7/7/7/6/6/6/6, empty cells & foundations', () => {
  const s = deal(mulberry32(1));
  const shape = s.cascades.map(p => p.length);
  assert(JSON.stringify(shape) === JSON.stringify([7, 7, 7, 7, 6, 6, 6, 6]), 'shape is ' + shape.join('/'));
  assert(s.cells.every(c => c === null), 'cells start empty');
  assert(s.foundations.every(f => f.length === 0), 'foundations start empty');
  checkInvariants(s, 'deal');
});

/* ---- (c) random legal play + illegal probes -------------------------------- */
const GAMES = 2000, MAX_MOVES = 300, PROBES = 20;
console.log('random play: ' + GAMES + ' seeded games, up to ' + MAX_MOVES + ' legal moves each…');
let totalMoves = 0, totalProbes = 0, wins = 0, deadEnds = 0;
function randomMove(rng) {
  const from = rng() < 0.3
    ? { zone: 'cell', idx: ri(rng, 4) }
    : { zone: 'cascade', col: ri(rng, 8), idx: ri(rng, 9) };
  const r = rng();
  const to = r < 0.34 ? { zone: 'foundation' }
    : r < 0.67 ? { zone: 'cell', idx: ri(rng, 4) }
    : { zone: 'cascade', col: ri(rng, 8) };
  return { from, to };
}
for (let g = 0; g < GAMES; g++) {
  const rng = mulberry32(1000 + g);
  const state = deal(rng);
  checkInvariants(state, 'game ' + g + ' deal');
  for (let m = 0; m < MAX_MOVES; m++) {
    const legal = legalMoves(state);
    if (!legal.length) { deadEnds++; break; }
    const mv = legal[ri(rng, legal.length)];
    assert(applyMove(state, mv) === true, 'game ' + g + ': enumerated legal move applies');
    totalMoves++;
    checkInvariants(state, 'game ' + g + ' move ' + m);
    if (isWon(state)) { wins++; break; }
  }
  // probe random ILLEGAL moves: must be rejected and leave the state untouched
  const legalSet = new Set(legalMoves(state).map(moveKey));
  const before = JSON.stringify(snapshot(state));
  let probed = 0, guard = 0;
  while (probed < PROBES && guard++ < 400) {
    const mv = randomMove(rng);
    const inSet = legalSet.has(moveKey(mv));
    assert(legalMove(state, mv) === inSet, 'game ' + g + ': legalMove agrees with legalMoves enumeration');
    if (inSet) continue;                      // rare: rolled a legal one, reroll
    assert(applyMove(state, mv) === false, 'game ' + g + ': illegal move rejected (' + moveKey(mv) + ')');
    assert(JSON.stringify(snapshot(state)) === before, 'game ' + g + ': state untouched by illegal move');
    probed++; totalProbes++;
  }
  assert(probed === PROBES, 'game ' + g + ': found ' + PROBES + ' illegal probes');
}
console.log('  ok — ' + GAMES + ' games, ' + totalMoves + ' legal moves applied, ' +
  totalProbes + ' illegal probes rejected (' + wins + ' random wins, ' + deadEnds + ' dead ends)');

/* ---- (d) snapshot / restore round-trip ------------------------------------- */
console.log('snapshot/restore:');
check('round-trip identity after 40 random moves', () => {
  const rng = mulberry32(77);
  const state = deal(rng);
  for (let m = 0; m < 40; m++) {
    const legal = legalMoves(state);
    if (!legal.length) break;
    applyMove(state, legal[ri(rng, legal.length)]);
  }
  const snap = snapshot(state);
  const copy = restore(snap);
  assert(JSON.stringify(snapshot(copy)) === JSON.stringify(snap), 'restore(snapshot(s)) round-trips');
  checkInvariants(copy, 'restored');
  // restored state is live: mutating it must not disturb the stored snapshot
  const frozen = JSON.stringify(snap);
  const legal = legalMoves(copy);
  if (legal.length) applyMove(copy, legal[0]);
  assert(JSON.stringify(snap) === frozen, 'stored snapshot is independent of the live state');
});

/* ---- (e) isWon ------------------------------------------------------------- */
console.log('isWon:');
check('true on a constructed full-foundation state, false on a fresh deal', () => {
  const done = {
    cells: [null, null, null, null],
    cascades: [[], [], [], [], [], [], [], []],
    foundations: [0, 1, 2, 3].map(s => CARDS.slice(s * 13, s * 13 + 13)),
  };
  checkInvariants(done, 'won-state');
  assert(isWon(done) === true, 'full foundations => won');
  assert(isWon(deal(mulberry32(5))) === false, 'fresh deal => not won');
  assert(foundationFor(done, CARDS[0]) === -1, 'ace cannot re-enter a full foundation');
});

if (failures === 0) { console.log('PASS'); process.exit(0); }
console.error('FAILED: ' + failures + ' assertion(s)');
process.exit(1);
