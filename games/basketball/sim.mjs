#!/usr/bin/env node
/* ============================================================================
   Basketball — Arline Arcade · sim.mjs
   Headless proof of the engine, house-style (like Solitaire's and Uno's).

     node games/basketball/sim.mjs

   Checks:
     1. a known-good launch (found by parameter search) scores exactly once
     2. a clearly-short and a clearly-long shot never score, and settle
     3. anti-tunneling — 500 random hard shots: the ball never passes through
        (or is left overlapping) a rim iron, and never scores moving upward
     4. streak math — 2, 2, 2 lights the fire, fire makes are worth 3,
        a miss puts the fire out
     5. the 60 s timer ends the round and locks the rack
     6. determinism — same seed + same shot script twice -> identical round
   ========================================================================== */

import { C, createGame, shoot, step } from './engine.js';

/* --- seeded PRNG (mulberry32) --------------------------------------------- */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --- tiny harness ---------------------------------------------------------- */
let failures = 0;
function check(name, ok, detail = ''){
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

const RR = C.BALL_R + C.RIM_R;
const IRONS = [C.RIM_D - C.RIM_HALF, C.RIM_D + C.RIM_HALF];

/** Assert rim integrity for every ball at an observed step:
    never left overlapping an iron, center never inside the iron tube. */
function rimIntegrity(g){
  for (const b of g.balls){
    if (!Number.isFinite(b.d) || !Number.isFinite(b.h) || !Number.isFinite(b.x)) return 'NaN position';
    for (const id of IRONS){
      const dx = b.d - id, dy = b.h - C.RIM_H;
      const dist = Math.hypot(dx, dy);
      if (dist < C.RIM_R) return `center inside the iron (dist=${dist.toFixed(4)})`;
      if (dist < RR - 1e-6) return `unresolved penetration (dist=${dist.toFixed(4)} < ${RR})`;
    }
  }
  return null;
}

/** Step until all balls are gone (or maxT). Collects events + integrity. */
function drain(g, maxT = 12){
  const events = [];
  let t = 0, integrity = null;
  while (g.balls.length && t < maxT){
    events.push(...step(g));
    t += C.DT;
    const bad = rimIntegrity(g);
    if (bad && !integrity) integrity = bad;
  }
  return { events, t, drained: g.balls.length === 0, integrity };
}

const scoresOf = evs => evs.filter(e => e.type === 'score');

console.log('Basketball engine sim');
console.log('=====================');

/* --- 1. parameter search: a known-good launch ------------------------------ */
console.log('\n[1] known-good launch (parameter search, straight flicks)');
const goodPowers = [];
let sweepSettled = true;
for (let vy = 1.6; vy <= C.MAX_POW + 1e-9; vy += 0.02){
  const g = createGame(mulberry32(1));
  shoot(g, 0, vy);
  const r = drain(g);
  if (!r.drained) sweepSettled = false;
  if (scoresOf(r.events).length === 1) goodPowers.push(+vy.toFixed(2));
}
check('some straight power window scores', goodPowers.length > 0);
check('every swept shot settled (drained)', sweepSettled);
const vyGood = goodPowers[Math.floor(goodPowers.length / 2)];
console.log(`      scoring window: ${goodPowers[0]}..${goodPowers[goodPowers.length - 1]} — using vy=${vyGood}`);
{
  const g = createGame(mulberry32(1));
  shoot(g, 0, vyGood);
  const r = drain(g);
  const s = scoresOf(r.events);
  check('known-good launch scores exactly once', s.length === 1, `scored ${s.length}x`);
  check('that make is worth 2 points', g.score === 2 && s[0] && s[0].pts === 2);
  check('ball settled and left the court', r.drained);
}

/* --- 2. clearly short / clearly long never score, and settle --------------- */
console.log('\n[2] airballs');
{
  const g = createGame(mulberry32(2));
  shoot(g, 0, 1.2);                          // clearly short
  const r = drain(g);
  check('clearly-short shot never scores', scoresOf(r.events).length === 0);
  check('clearly-short shot settles', r.drained && r.events.some(e => e.type === 'miss'));
}
{
  const g = createGame(mulberry32(2));
  shoot(g, 0, C.MAX_POW);                    // clearly long — over the glass
  const r = drain(g);
  check('clearly-long shot never scores', scoresOf(r.events).length === 0);
  check('clearly-long shot settles', r.drained && r.events.some(e => e.type === 'miss'));
}

/* --- 3. anti-tunneling: 500 random hard shots ------------------------------- */
console.log('\n[3] anti-tunneling — 500 random hard shots');
{
  const rnd = mulberry32(99);
  let integrity = null, upScore = null, latchBroken = 0, unsettled = 0;
  for (let i = 0; i < 500; i++){
    const g = createGame(mulberry32(1000 + i));
    shoot(g, (rnd() - 0.5) * 1.2, 2.6 + rnd() * 0.8);
    const r = drain(g);
    if (r.integrity && !integrity) integrity = `shot ${i}: ${r.integrity}`;
    if (!r.drained) unsettled++;
    const s = scoresOf(r.events);
    if (s.length > 1) latchBroken++;
    for (const e of s) if (e.vh > 1e-6 && !upScore) upScore = `shot ${i}: vh=${e.vh}`;
  }
  check('never passes through / rests inside a rim iron', integrity === null, integrity || '');
  check('never scores while moving upward', upScore === null, upScore || '');
  check('one-count latch holds (never scores twice)', latchBroken === 0, `${latchBroken} broke`);
  check('all 500 settled', unsettled === 0, `${unsettled} unsettled`);
}

/* --- 4. streak math ---------------------------------------------------------- */
console.log('\n[4] streak math — 2, 2, 2 then fire; a miss ends it');
{
  const g = createGame(mulberry32(4));
  const log = [];
  const play = (vx, vy) => { shoot(g, vx, vy); log.push(...drain(g).events); };

  play(0, vyGood); check('make #1 = 2 pts', g.score === 2);
  play(0, vyGood); check('make #2 = 2 pts (total 4)', g.score === 4);
  play(0, vyGood);
  check('make #3 = 2 pts (total 6) and lights the fire',
        g.score === 6 && g.onFire && log.some(e => e.type === 'fire'));
  play(0, vyGood); check('make #4 on fire = 3 pts (total 9)', g.score === 9);
  const before = log.length;
  play(0, 1.2);                              // brick
  check('miss puts the fire out', !g.onFire && g.streak === 0 &&
        log.slice(before).some(e => e.type === 'fireEnd'));
  play(0, vyGood); check('next make back to 2 pts (total 11)', g.score === 11);
}

/* --- 5. timer ends the round -------------------------------------------------- */
console.log('\n[5] round timer');
{
  const g = createGame(mulberry32(5));
  shoot(g, 0, 2.0);                          // clock starts on the first shot
  let ends = 0;
  const steps = Math.ceil(61 / C.DT);
  for (let i = 0; i < steps; i++) ends += step(g).filter(e => e.type === 'end').length;
  check('round is over after 60 s', g.over && g.timeLeft === 0);
  check("'end' fires exactly once", ends === 1, `fired ${ends}x`);
  check('rack is locked after the buzzer', shoot(g, 0, 2.5) === null);
}
{
  const g = createGame(mulberry32(5));
  check('at most 3 balls in flight',
        !!(shoot(g, 0, 3) && shoot(g, 0, 3) && shoot(g, 0, 3)) && shoot(g, 0, 3) === null);
}

/* --- 6. determinism ------------------------------------------------------------ */
console.log('\n[6] determinism — same seed + same shots, twice');
{
  const script = [];                          // [stepIndex, vx, vy] — a busy round
  for (let i = 0; i < 26; i++){
    script.push([Math.round(i * 2.2 / C.DT),
                 [0, 0.12, -0.15, 0.3, -0.05][i % 5],
                 [vyGood, 3.2, vyGood, 2.1, vyGood + 0.04][i % 5]]);
  }
  const run = () => {
    const g = createGame(mulberry32(7));
    const trace = [];
    let si = 0;
    for (let i = 0; i < Math.ceil(75 / C.DT); i++){
      while (si < script.length && script[si][0] === i){
        shoot(g, script[si][1], script[si][2]); si++;
      }
      for (const e of step(g)) trace.push(e.type + (e.pts || ''));
      if (g.over && g.balls.length === 0 && si >= script.length) break;
    }
    return { score: g.score, makes: g.makes, shots: g.shots, trace: trace.join(',') };
  };
  const a = run(), b = run();
  check('final score identical', a.score === b.score, `${a.score} vs ${b.score}`);
  check('full event trace identical', a.trace === b.trace);
  check('round produced a sensible score', a.makes > 0 && a.score >= 2 * a.makes,
        `makes=${a.makes} score=${a.score}`);
  console.log(`      scripted round: ${a.shots} shots, ${a.makes} makes, ${a.score} points`);
}

/* --------------------------------------------------------------------------- */
console.log('');
if (failures){
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('PASS — all checks green');
process.exit(0);
