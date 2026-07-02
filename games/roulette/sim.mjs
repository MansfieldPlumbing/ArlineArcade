/* Roulette — Arline Arcade. Headless Node verification (no browser needed).
   Run from the repo root:  node games/roulette/sim.mjs
   Checks: wheel integrity, exact payouts for every bet type (including the
   zero cases), a big Monte Carlo confirming the 2.70% single-zero house edge
   on every bet type, and chip conservation through resolve().              */

import { WHEEL, RED, PAYOUTS, colorOf, wheelIndex, spin, betWins, resolve }
  from './engine.js';

/* --- tiny seeded PRNG (mulberry32) — deterministic runs ------------------- */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
function check(name, ok, detail = ''){
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

/* === (a) wheel integrity =================================================== */
console.log('--- wheel integrity');
check('wheel has 37 pockets', WHEEL.length === 37);
check('pockets are unique 0–36',
  new Set(WHEEL).size === 37 && Math.min(...WHEEL) === 0 && Math.max(...WHEEL) === 36);
check('wheel starts at green zero', WHEEL[0] === 0 && colorOf(0) === 'green');

// The European colouring rule: in 1–10 and 19–28 odd numbers are red;
// in 11–18 and 29–36 even numbers are red. Derive it and compare to RED.
const derivedRed = new Set();
for (let n = 1; n <= 36; n++){
  const lowBand = (n >= 1 && n <= 10) || (n >= 19 && n <= 28);
  if (lowBand ? n % 2 === 1 : n % 2 === 0) derivedRed.add(n);
}
check('18 red / 18 black', RED.size === 18 &&
  [...Array(36)].filter((_, i) => colorOf(i + 1) === 'black').length === 18);
check('red set matches European colouring rule',
  derivedRed.size === RED.size && [...derivedRed].every((n) => RED.has(n)));
check('colors of sample pockets',
  colorOf(32) === 'red' && colorOf(15) === 'black' && colorOf(19) === 'red' &&
  colorOf(26) === 'black' && colorOf(1) === 'red' && colorOf(2) === 'black');
check('wheelIndex round-trips', [...Array(37)].every((_, n) => WHEEL[wheelIndex(n)] === n));

/* === (b) exact payout unit tests =========================================== */
console.log('--- exact payouts (returned per 1 staked; stake included in return)');
const CASES = [
  // [description, bet, pocket, expected returned for amount=1]
  ['straight 17 hits 17 pays 35:1',        { type: 'straight', value: 17 }, 17, 36],
  ['straight 0 hits 0 pays 35:1',          { type: 'straight', value: 0 },   0, 36],
  ['straight 17 misses on 5',              { type: 'straight', value: 17 },  5,  0],
  ['straight 4 misses on 0',               { type: 'straight', value: 4 },   0,  0],
  ['red wins on 32',                       { type: 'red' },                 32,  2],
  ['red loses on 15 (black)',              { type: 'red' },                 15,  0],
  ['red loses on 0',                       { type: 'red' },                  0,  0],
  ['black wins on 15',                     { type: 'black' },               15,  2],
  ['black loses on 19 (red)',              { type: 'black' },               19,  0],
  ['black loses on 0',                     { type: 'black' },                0,  0],
  ['odd wins on 17',                       { type: 'odd' },                 17,  2],
  ['odd loses on 18',                      { type: 'odd' },                 18,  0],
  ['odd loses on 0',                       { type: 'odd' },                  0,  0],
  ['even wins on 18',                      { type: 'even' },                18,  2],
  ['even loses on 17',                     { type: 'even' },                17,  0],
  ['even loses on 0 (zero is not even here)', { type: 'even' },              0,  0],
  ['low wins on 1',                        { type: 'low' },                  1,  2],
  ['low wins on 18',                       { type: 'low' },                 18,  2],
  ['low loses on 19',                      { type: 'low' },                 19,  0],
  ['low loses on 0',                       { type: 'low' },                  0,  0],
  ['high wins on 19',                      { type: 'high' },                19,  2],
  ['high wins on 36',                      { type: 'high' },                36,  2],
  ['high loses on 18',                     { type: 'high' },                18,  0],
  ['high loses on 0',                      { type: 'high' },                 0,  0],
  ['1st dozen wins on 12 pays 2:1',        { type: 'dozen', value: 1 },     12,  3],
  ['2nd dozen wins on 13',                 { type: 'dozen', value: 2 },     13,  3],
  ['3rd dozen wins on 25',                 { type: 'dozen', value: 3 },     25,  3],
  ['1st dozen loses on 13',                { type: 'dozen', value: 1 },     13,  0],
  ['dozen loses on 0',                     { type: 'dozen', value: 1 },      0,  0],
  ['column 1 wins on 34 pays 2:1',         { type: 'column', value: 1 },    34,  3],
  ['column 2 wins on 35',                  { type: 'column', value: 2 },    35,  3],
  ['column 3 wins on 36',                  { type: 'column', value: 3 },    36,  3],
  ['column 1 wins on 1',                   { type: 'column', value: 1 },     1,  3],
  ['column 3 loses on 1',                  { type: 'column', value: 3 },     1,  0],
  ['column loses on 0',                    { type: 'column', value: 2 },     0,  0],
];
for (const [name, bet, pocket, expect] of CASES){
  const r = resolve([{ ...bet, amount: 1 }], pocket);
  check(name, r.results[0].returned === expect,
    `returned ${r.results[0].returned}, expected ${expect}`);
}
// stakes scale linearly
{
  const r = resolve([{ type: 'straight', value: 8, amount: 25 }], 8);
  check('straight scales with stake (25 → 900)', r.totalReturned === 900);
}

/* === (c) Monte Carlo: 2.70% house edge on every bet type =================== */
console.log('--- Monte Carlo house edge');
const N = 20_000_000;                     // spins (>= 2,000,000 required)
const rng = mulberry32(0xA12E);
const counts = new Array(37).fill(0);
for (let i = 0; i < N; i++) counts[spin(rng)]++;

check(`ran ${N.toLocaleString('en-US')} spins, every pocket hit`,
  counts.every((c) => c > 0));
// loose uniformity sanity: every pocket within 1% of the expected count
const expectPer = N / 37;
check('spin() is uniform across pockets (±1%)',
  counts.every((c) => Math.abs(c - expectPer) / expectPer < 0.01));

const MC_BETS = [
  ['straight 17',  { type: 'straight', value: 17, amount: 1 }],
  ['straight 0',   { type: 'straight', value: 0,  amount: 1 }],
  ['red',          { type: 'red',    amount: 1 }],
  ['black',        { type: 'black',  amount: 1 }],
  ['odd',          { type: 'odd',    amount: 1 }],
  ['even',         { type: 'even',   amount: 1 }],
  ['low 1–18',     { type: 'low',    amount: 1 }],
  ['high 19–36',   { type: 'high',   amount: 1 }],
  ['dozen 1',      { type: 'dozen',  value: 1, amount: 1 }],
  ['dozen 2',      { type: 'dozen',  value: 2, amount: 1 }],
  ['dozen 3',      { type: 'dozen',  value: 3, amount: 1 }],
  ['column 1',     { type: 'column', value: 1, amount: 1 }],
  ['column 2',     { type: 'column', value: 2, amount: 1 }],
  ['column 3',     { type: 'column', value: 3, amount: 1 }],
];
const EDGE = 1 / 37;                      // 2.7027%
const TOL = 0.0035;                       // ±0.35%
for (const [name, bet] of MC_BETS){
  // staking 1 unit on this bet for every one of the N spins
  let returned = 0;
  for (let p = 0; p <= 36; p++){
    if (betWins(bet, p)) returned += counts[p] * (PAYOUTS[bet.type] + 1);
  }
  const edge = (N - returned) / N;
  check(`house edge ${name} = ${(edge * 100).toFixed(3)}%`,
    Math.abs(edge - EDGE) <= TOL, `target 2.703% ± 0.35%`);
}

/* === (d) chip conservation through resolve() =============================== */
console.log('--- chip conservation');
{
  const rng2 = mulberry32(1337);
  const TYPES = ['straight', 'red', 'black', 'odd', 'even', 'low', 'high', 'dozen', 'column'];
  let ok = true, rounds = 20000, detail = '';
  for (let i = 0; i < rounds && ok; i++){
    const bets = [];
    const nBets = 1 + Math.floor(rng2() * 6);
    for (let b = 0; b < nBets; b++){
      const type = TYPES[Math.floor(rng2() * TYPES.length)];
      const bet = { type, amount: [1, 5, 25, 100][Math.floor(rng2() * 4)] };
      if (type === 'straight') bet.value = Math.floor(rng2() * 37);
      if (type === 'dozen' || type === 'column') bet.value = 1 + Math.floor(rng2() * 3);
      bets.push(bet);
    }
    const frozen = JSON.stringify(bets);
    const pocket = spin(rng2);
    const r = resolve(bets, pocket);
    const sumStaked = bets.reduce((s, b) => s + b.amount, 0);
    const sumReturned = r.results.reduce((s, x) => s + x.returned, 0);
    const sumProfit = r.results.reduce((s, x) => s + x.profit, 0);
    if (r.totalStaked !== sumStaked) { ok = false; detail = 'totalStaked mismatch'; }
    else if (r.totalReturned !== sumReturned) { ok = false; detail = 'totalReturned mismatch'; }
    else if (sumProfit !== r.totalReturned - r.totalStaked) { ok = false; detail = 'profit mismatch'; }
    else if (r.results.some((x) => x.returned !== 0 &&
             x.returned !== x.bet.amount * (PAYOUTS[x.bet.type] + 1))) { ok = false; detail = 'bad per-bet return'; }
    else if (JSON.stringify(bets) !== frozen) { ok = false; detail = 'resolve mutated bets'; }
  }
  check(`resolve() conserves chips over ${rounds.toLocaleString('en-US')} random rounds`, ok, detail);
}
{ // covering every number at once: return is exactly 36 of 37 staked, always
  const all = [...Array(37)].map((_, n) => ({ type: 'straight', value: n, amount: 1 }));
  const r = resolve(all, 26);
  check('betting all 37 numbers returns exactly 36/37', r.totalStaked === 37 && r.totalReturned === 36);
}
{ // determinism: the same seed replays the same spins
  const a = mulberry32(7), b = mulberry32(7);
  let same = true;
  for (let i = 0; i < 1000; i++) if (spin(a) !== spin(b)) same = false;
  check('spin(rng) is deterministic for a seeded rng', same);
}

/* === verdict ================================================================ */
if (failures){
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nPASS');
process.exit(0);
