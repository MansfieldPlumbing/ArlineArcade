/* Roulette — Arline Arcade.
   PURE game logic: European single-zero wheel, bet resolution, payouts.
   ES module with zero DOM/browser APIs — every drop of randomness is injected
   as an rng() parameter (a function returning a float in [0,1)), so the same
   engine drives the browser game and the headless Node simulation.
   Wheel order and payout table verified against the standard European layout
   (single zero, house edge 1/37 ≈ 2.70%). All code original to this repo. */

/** Physical pocket order around a European wheel, clockwise from zero. */
export const WHEEL = Object.freeze([
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]);

/** The 18 red numbers. Everything else 1–36 is black; 0 is green. */
export const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

/** Winnings per 1 unit staked (stake is returned on top of this). */
export const PAYOUTS = Object.freeze({
  straight: 35,
  red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1,
  dozen: 2, column: 2,
});

/** 'green' | 'red' | 'black' for a pocket number. */
export function colorOf(n){
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

/** Index of a pocket around the physical wheel (0–36), or -1. */
export function wheelIndex(pocket){
  return WHEEL.indexOf(pocket);
}

/** Spin the wheel: rng() -> [0,1) maps uniformly onto the 37 pockets. */
export function spin(rng){
  return WHEEL[Math.floor(rng() * WHEEL.length)];
}

/** Does this bet win when `pocket` hits? Zero loses every outside bet. */
export function betWins(bet, pocket){
  switch (bet.type){
    case 'straight': return pocket === bet.value;
    case 'red':      return pocket !== 0 && RED.has(pocket);
    case 'black':    return pocket !== 0 && !RED.has(pocket);
    case 'odd':      return pocket !== 0 && pocket % 2 === 1;
    case 'even':     return pocket !== 0 && pocket % 2 === 0;
    case 'low':      return pocket >= 1 && pocket <= 18;
    case 'high':     return pocket >= 19 && pocket <= 36;
    case 'dozen':    return pocket !== 0 && Math.ceil(pocket / 12) === bet.value;   // value 1|2|3
    case 'column':   return pocket !== 0 && ((pocket - 1) % 3) + 1 === bet.value;   // value 1|2|3
    default:         return false;
  }
}

/**
 * Settle a list of bets against the pocket that hit.
 * bets: [{ type, value?, amount }]  →
 * { pocket, totalStaked, totalReturned, results:[{ bet, won, returned, profit }] }
 * `returned` includes the original stake on a win (35:1 straight returns 36×).
 * Chips are conserved: totalStaked/totalReturned are exact sums of the parts.
 */
export function resolve(bets, pocket){
  let totalStaked = 0;
  let totalReturned = 0;
  const results = bets.map((bet) => {
    const won = betWins(bet, pocket);
    const returned = won ? bet.amount * (PAYOUTS[bet.type] + 1) : 0;
    totalStaked += bet.amount;
    totalReturned += returned;
    return { bet, won, returned, profit: returned - bet.amount };
  });
  return { pocket, totalStaked, totalReturned, results };
}

export default { WHEEL, RED, PAYOUTS, colorOf, wheelIndex, spin, betWins, resolve };
