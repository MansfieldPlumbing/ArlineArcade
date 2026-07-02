/* ============================================================================
   Arline Arcade — Solitaire "time powers" (Braid-style), pure logic.
   No DOM in here: snapshot / restore / magicShuffle work on plain pile arrays
   of card objects ({id,suit,rank,color,up}) so they can be verified headless
   by sim.mjs and wired to the board by solitaire.js.
   ============================================================================ */

/** Freeze the table into a plain, JSON-safe snapshot: each pile becomes an
    array of {id, up}, plus the move counter. Nothing here references the live
    card objects, so later mutations can't bleed into a stored snapshot. */
export function snapshot({ stock, waste, foundations, tableau, moves }){
  const pile = p => p.map(c => ({ id: c.id, up: !!c.up }));
  return {
    stock: pile(stock),
    waste: pile(waste),
    foundations: foundations.map(pile),
    tableau: tableau.map(pile),
    moves,
  };
}

/** Rebuild live piles from a snapshot. `cardsById` is a Map of id -> card
    object; each card's .up flag is reset from the snapshot and fresh pile
    arrays are returned (the caller reassigns its pile variables). */
export function restore(snap, cardsById){
  const pile = p => p.map(({ id, up }) => { const c = cardsById.get(id); c.up = up; return c; });
  return {
    stock: pile(snap.stock),
    waste: pile(snap.waste),
    foundations: snap.foundations.map(pile),
    tableau: snap.tableau.map(pile),
    moves: snap.moves,
  };
}

/** Arline's magic shuffle: collect ALL hidden cards — the entire stock plus
    every face-down tableau card — Fisher-Yates the pool with `rng`, and deal
    them back into the SAME slots (same counts, same positions). Face-up cards
    are untouched and stock cards stay face-down. Returns how many cards were
    shuffled (0 = no-op when fewer than 2 hidden cards exist).

    WHY hidden cards rather than just the stock: this Klondike is draw-1 with
    unlimited recycles, so every stock card is always reachable — reshuffling
    only the stock changes nothing. Shuffling the hidden pool is what can
    unstick a buried king. The waste stays put: those cards are known
    information the player has already seen. */
export function magicShuffle({ stock, tableau }, rng = Math.random){
  const slots = [];                                   // [pile, index] of every hidden card
  for(let i = 0; i < stock.length; i++) slots.push([stock, i]);
  for(const col of tableau)
    for(let i = 0; i < col.length; i++)
      if(!col[i].up) slots.push([col, i]);
  if(slots.length < 2) return 0;

  const pool = slots.map(([p, i]) => p[i]);
  for(let i = pool.length - 1; i > 0; i--){           // Fisher-Yates
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  slots.forEach(([p, i], k) => { p[i] = pool[k]; pool[k].up = false; });
  return slots.length;
}

export default { snapshot, restore, magicShuffle };
