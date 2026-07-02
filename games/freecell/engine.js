/* ============================================================================
   Arline Arcade — FreeCell engine (pure logic, no DOM).
   Plain state: { cells:[4 × card|null], cascades:[8 × card[]], foundations:[4 × card[]] }
   holding references into the canonical frozen CARDS deck, so snapshots are
   just id arrays and restore() is a table lookup. The rng is injected into
   deal() so games/freecell/sim.mjs can verify everything headless & seeded.
   ============================================================================ */

export const SUIT_NAME = ['spade', 'heart', 'diamond', 'club'];
export const COLORS    = ['black', 'red', 'red', 'black'];
export const RANKS     = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Canonical immutable deck; id = suit*13 + rank-1, so ids encode identity. */
export const CARDS = Object.freeze((() => {
  const a = [];
  for (let s = 0; s < 4; s++)
    for (let r = 1; r <= 13; r++)
      a.push(Object.freeze({ id: s * 13 + r - 1, suit: s, rank: r, color: COLORS[s] }));
  return a;
})());

export const top = pile => (pile.length ? pile[pile.length - 1] : null);

/** Shuffle with the injected rng, then deal round-robin across the 8 cascades:
    columns 0–3 receive 7 cards, columns 4–7 receive 6. Everything face-up. */
export function deal(rng) {
  const d = CARDS.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  const cascades = [[], [], [], [], [], [], [], []];
  d.forEach((c, i) => cascades[i % 8].push(c));
  return { cells: [null, null, null, null], cascades, foundations: [[], [], [], []] };
}

/** May `card` sit on `onto` in a cascade? Descending rank, alternating colour. */
export function canStack(card, onto) {
  return onto.color !== card.color && onto.rank === card.rank + 1;
}

/** Is this array of cards a valid movable run (each stacks on the previous)? */
export function isRun(cards) {
  for (let i = 1; i < cards.length; i++)
    if (!canStack(cards[i], cards[i - 1])) return false;
  return true;
}

/** Supermove capacity: (1 + empty free cells) * 2^(empty cascades).
    The destination cascade, if empty, does NOT count as an empty cascade
    (you can't relay through the column you're landing on). Pass destCol = -1
    when the destination is not a cascade. */
export function maxMovable(state, destCol = -1) {
  const free = state.cells.reduce((n, c) => n + (c ? 0 : 1), 0);
  let empty = 0;
  for (let i = 0; i < 8; i++)
    if (state.cascades[i].length === 0 && i !== destCol) empty++;
  return (1 + free) * Math.pow(2, empty);
}

/** Can the run starting at cascades[fromCol][startIdx] move onto cascade toCol? */
export function canMoveRun(state, fromCol, startIdx, toCol) {
  if (fromCol === toCol) return false;
  if (fromCol < 0 || fromCol > 7 || toCol < 0 || toCol > 7) return false;
  const src = state.cascades[fromCol];
  if (startIdx < 0 || startIdx >= src.length) return false;
  const run = src.slice(startIdx);
  if (!isRun(run)) return false;
  if (run.length > maxMovable(state, toCol)) return false;
  const t = top(state.cascades[toCol]);
  return !t || canStack(run[0], t);      // any card may start an empty cascade
}

/** Foundation index (== card.suit) if the card may go up right now, else -1. */
export function foundationFor(state, card) {
  return card.rank === state.foundations[card.suit].length + 1 ? card.suit : -1;
}

export function isWon(state) {
  return state.foundations.every(f => f.length === 13);
}

/* ---- moves ----------------------------------------------------------------
   move = { from: {zone:'cell', idx} | {zone:'cascade', col, idx},
            to:   {zone:'foundation'} | {zone:'cell', idx} | {zone:'cascade', col} }
   Foundation moves auto-route by suit (solitaire-style: any foundation slot
   accepts, the card lands on its own suit pile). */

export function legalMove(state, move) {
  if (!move || !move.from || !move.to) return false;
  const { from, to } = move;
  let run;
  if (from.zone === 'cell') {
    if (!(from.idx >= 0 && from.idx < 4)) return false;
    const c = state.cells[from.idx];
    if (!c) return false;
    run = [c];
  } else if (from.zone === 'cascade') {
    if (!(from.col >= 0 && from.col < 8)) return false;
    const src = state.cascades[from.col];
    if (!(from.idx >= 0 && from.idx < src.length)) return false;
    run = src.slice(from.idx);
  } else return false;

  if (to.zone === 'foundation')
    return run.length === 1 && foundationFor(state, run[0]) >= 0;
  if (to.zone === 'cell')
    return to.idx >= 0 && to.idx < 4 && run.length === 1 && !state.cells[to.idx];
  if (to.zone === 'cascade') {
    if (!(to.col >= 0 && to.col < 8)) return false;
    if (from.zone === 'cell') {                       // single card off a cell
      const t = top(state.cascades[to.col]);
      return !t || canStack(run[0], t);
    }
    return canMoveRun(state, from.col, from.idx, to.col);
  }
  return false;
}

/** Validate then apply in place. Returns true if applied, false (untouched) if not. */
export function applyMove(state, move) {
  if (!legalMove(state, move)) return false;
  const { from, to } = move;
  let run;
  if (from.zone === 'cell') { run = [state.cells[from.idx]]; state.cells[from.idx] = null; }
  else run = state.cascades[from.col].splice(from.idx);
  if (to.zone === 'foundation') state.foundations[run[0].suit].push(run[0]);
  else if (to.zone === 'cell') state.cells[to.idx] = run[0];
  else state.cascades[to.col].push(...run);
  return true;
}

/** Every legal move from this position (used by the sim's random play). */
export function legalMoves(state) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const c = state.cells[i];
    if (!c) continue;
    if (foundationFor(state, c) >= 0) out.push({ from: { zone: 'cell', idx: i }, to: { zone: 'foundation' } });
    for (let col = 0; col < 8; col++) {
      const t = top(state.cascades[col]);
      if (!t || canStack(c, t)) out.push({ from: { zone: 'cell', idx: i }, to: { zone: 'cascade', col } });
    }
    for (let j = 0; j < 4; j++)
      if (j !== i && !state.cells[j]) out.push({ from: { zone: 'cell', idx: i }, to: { zone: 'cell', idx: j } });
  }
  for (let col = 0; col < 8; col++) {
    const pile = state.cascades[col];
    if (!pile.length) continue;
    const last = pile.length - 1;
    if (foundationFor(state, pile[last]) >= 0) out.push({ from: { zone: 'cascade', col, idx: last }, to: { zone: 'foundation' } });
    for (let j = 0; j < 4; j++)
      if (!state.cells[j]) out.push({ from: { zone: 'cascade', col, idx: last }, to: { zone: 'cell', idx: j } });
    let start = last;
    while (start > 0 && canStack(pile[start], pile[start - 1])) start--;
    for (let idx = start; idx <= last; idx++)
      for (let to = 0; to < 8; to++)
        if (canMoveRun(state, col, idx, to)) out.push({ from: { zone: 'cascade', col, idx }, to: { zone: 'cascade', col: to } });
  }
  return out;
}

/* ---- snapshots (JSON-safe id arrays; the Rewind ability lives on these) --- */

export function snapshot(state) {
  return {
    cells: state.cells.map(c => (c ? c.id : -1)),
    cascades: state.cascades.map(p => p.map(c => c.id)),
    foundations: state.foundations.map(p => p.map(c => c.id)),
  };
}

export function restore(snap) {
  return {
    cells: snap.cells.map(id => (id < 0 ? null : CARDS[id])),
    cascades: snap.cascades.map(a => a.map(id => CARDS[id])),
    foundations: snap.foundations.map(a => a.map(id => CARDS[id])),
  };
}

export default {
  SUIT_NAME, COLORS, RANKS, CARDS, top, deal, canStack, isRun, maxMovable,
  canMoveRun, foundationFor, isWon, legalMove, applyMove, legalMoves, snapshot, restore,
};
