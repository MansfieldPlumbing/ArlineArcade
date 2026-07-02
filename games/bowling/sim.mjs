/* ============================================================================
   Bowling — Arline Arcade · headless Node verification.
   Run from the repo root:  node games/bowling/sim.mjs
   Proves the scoring canon, physics sanity, and 2,000 random full games
   with no invariant violations. Exits 0 on PASS, 1 on any failure.
   ========================================================================== */

import { frameState, simulate, mulberry32, THROW } from './engine.js';

let failures = 0;
function check(name, cond, detail = ''){
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  — ' + detail}`);
  if (!cond) failures++;
}
function throws(fn){
  try { fn(); return false; } catch { return true; }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ===========================================================================
   1) SCORING CANON
   ========================================================================== */
console.log('\nScoring canon');

{ // perfect game — twelve strikes = 300
  const st = frameState(Array(12).fill(10));
  check('perfect game totals 300', st.total === 300, `got ${st.total}`);
  check('perfect game cumulative 30,60,…,300',
    eq(st.frames.map(f => f.score), [30,60,90,120,150,180,210,240,270,300]));
  check('perfect game is over', st.isOver === true);
  check('10th-frame marks X X X', eq(st.frames[9].marks, ['X','X','X']));
}

{ // all spares of 5+5 with a final 5 = 150
  const st = frameState(Array(21).fill(5));
  check('all 5-spares totals 150', st.total === 150, `got ${st.total}`);
  check('all 5-spares cumulative 15,30,…,150',
    eq(st.frames.map(f => f.score), [15,30,45,60,75,90,105,120,135,150]));
}

{ // worked example (the classic kata game), asserted frame-by-frame
  const rolls = [1,4, 4,5, 6,4, 5,5, 10, 0,1, 7,3, 6,4, 10, 2,8,6];
  const st = frameState(rolls);
  const want = [5,14,29,49,60,61,77,97,117,133];
  check('worked example totals 133', st.total === 133, `got ${st.total}`);
  want.forEach((w, i) =>
    check(`  frame ${i + 1} cumulative = ${w}`, st.frames[i].score === w, `got ${st.frames[i].score}`));
  check('worked example marks', eq(st.frames.map(f => f.marks.join('')),
    ['14','45','6/','5/','X','-1','7/','6/','X','2/6']));
  check('worked example is over', st.isOver === true);
}

{ // 10th-frame variants
  const base = Array(18).fill(0);          // frames 1–9 all open zeros
  let st = frameState([...base, 10,10,10]);
  check('10th X X X scores 30, over', st.total === 30 && st.isOver);
  st = frameState([...base, 9,1,10]);
  check('10th 9 / X scores 20, over', st.total === 20 && st.isOver);
  check('10th 9 / X marks', eq(st.frames[9].marks, ['9','/','X']));
  st = frameState([...base, 3,4]);
  check('10th open 3,4 scores 7, over after two rolls', st.total === 7 && st.isOver);
  check('no extra roll after an open 10th', throws(() => frameState([...base, 3,4,2])));
  st = frameState([...base, 10, 4]);
  check('10th X then 4: roll 3 pending, 6 standing',
    !st.isOver && st.currentRoll === 3 && st.pinsStanding === 6,
    JSON.stringify({ over: st.isOver, roll: st.currentRoll, standing: st.pinsStanding }));
}

{ // guards — never more pins than standing
  check('frame roll 2 cannot exceed standing (3 then 8)', throws(() => frameState([3, 8])));
  check('10th X,3 then 8 rejected (only 7 stand)', throws(() => frameState([...Array(18).fill(0), 10, 3, 8])));
  check('negative roll rejected', throws(() => frameState([-1])));
  check('11 rejected', throws(() => frameState([11])));
  check('rolling after a perfect game rejected', throws(() => frameState([...Array(12).fill(10), 1])));
}

{ // progression bookkeeping
  let st = frameState([]);
  check('fresh game: frame 1, roll 1, 10 standing',
    st.currentFrame === 1 && st.currentRoll === 1 && st.pinsStanding === 10 && !st.isOver);
  st = frameState([10]);
  check('after a strike: frame 2, roll 1', st.currentFrame === 2 && st.currentRoll === 1);
  check('strike frame unscored until bonuses land', st.frames[0].score === null);
  st = frameState([4]);
  check('after a 4: frame 1, roll 2, 6 standing',
    st.currentFrame === 1 && st.currentRoll === 2 && st.pinsStanding === 6);
  st = frameState([10, 3, 4]);
  check('X,3,4 scores 17 then 24', st.frames[0].score === 17 && st.frames[1].score === 24);
}

/* ===========================================================================
   2) PHYSICS SANITY
   ========================================================================== */
console.log('\nPhysics sanity');

{ // full-speed center hit — big pinfall, at least one strike over 200 seeds
  let sum = 0, strikes = 0, bad = 0;
  for (let s = 1; s <= 200; s++){
    const r = simulate({ x0: 0, vx: 0, vy: 420, spin: 0 }, mulberry32(s));
    sum += r.knocked.length;
    if (r.knocked.length === 10) strikes++;
    if (r.knocked.length > 10 || new Set(r.knocked).size !== r.knocked.length) bad++;
  }
  const avg = sum / 200;
  check(`full-speed center hit averages >= 7 pins (avg ${avg.toFixed(2)})`, avg >= 7);
  check(`full-speed center hit produces strikes (${strikes}/200)`, strikes >= 1);
  check('knocked sets are valid (unique, <= 10)', bad === 0);
}

{ // gutter launches always score zero
  let clean = true;
  for (let s = 1; s <= 50; s++){
    const a = simulate({ x0: 16, vx: 80, vy: 300, spin: 0 }, mulberry32(s));
    const b = simulate({ x0: -16, vx: -80, vy: 300, spin: 0 }, mulberry32(s + 999));
    const c = simulate({ x0: 0, vx: 0, vy: 200, spin: 85 }, mulberry32(s + 5555));
    if (a.knocked.length || b.knocked.length || c.knocked.length) clean = false;
    if (!a.gutter || !b.gutter || !c.gutter) clean = false;
  }
  check('gutter launches always knock 0 (and flag gutter)', clean);
}

{ // determinism — same seed + launch => identical result
  const launch = { x0: -3, vx: 22, vy: 350, spin: -30 };
  const a = simulate(launch, mulberry32(42));
  const b = simulate(launch, mulberry32(42));
  check('same seed + launch -> identical knocked set', eq(a.knocked, b.knocked));
  check('same seed + launch -> identical path & duration',
    a.duration === b.duration && eq(a.ballPath, b.ballPath));
}

{ // second-ball racks only contain the standing pins
  let ok = true;
  for (let s = 1; s <= 40; s++){
    const r = simulate({ x0: 0, vx: 0, vy: 380, spin: 0 }, mulberry32(s), { standing: [6, 9] });
    if (!r.knocked.every(i => i === 6 || i === 9)) ok = false;
  }
  check('knocked is always a subset of the racked pins', ok);
}

/* ===========================================================================
   3) 2,000 RANDOM FULL GAMES — invariants
   ========================================================================== */
console.log('\n2,000 random-launch full games');

{
  const rand = mulberry32(0xA11CE);
  const ALL = [0,1,2,3,4,5,6,7,8,9];
  let games = 0, violations = [], lo = Infinity, hi = -Infinity, sumScore = 0, strikes = 0, seed = 1;

  outer:
  for (let g = 0; g < 2000; g++){
    const rolls = [];
    let standing = ALL.slice();
    for (let guard = 0; guard < 25; guard++){
      const before = frameState(rolls);
      if (before.isOver) break;
      if (before.pinsStanding !== standing.length){
        violations.push(`game ${g}: pinsStanding ${before.pinsStanding} != rack ${standing.length}`);
        break outer;
      }
      const launch = {
        x0: (rand() - 0.5) * 32,
        vx: (rand() - 0.5) * 160,
        vy: 140 + rand() * 320,
        spin: (rand() - 0.5) * 150,
      };
      const res = simulate(launch, mulberry32(seed++), { standing });
      if (!res.knocked.every(i => standing.includes(i))){
        violations.push(`game ${g}: knocked pin not in rack`); break outer;
      }
      if (res.knocked.length === standing.length && standing.length === 10) strikes++;
      rolls.push(res.knocked.length);

      let st;
      try { st = frameState(rolls); }
      catch (err){ violations.push(`game ${g}: scoring threw — ${err.message}`); break outer; }

      const scores = st.frames.map(f => f.score).filter(s => s != null);
      for (let i = 1; i < scores.length; i++)
        if (scores[i] < scores[i - 1]){ violations.push(`game ${g}: cumulative not monotone`); break outer; }
      if (st.total < 0 || st.total > 300){ violations.push(`game ${g}: total ${st.total}`); break outer; }

      if (st.isOver) break;
      standing = st.pinsStanding === 10 ? ALL.slice() : standing.filter(i => !res.knocked.includes(i));
    }
    const fin = frameState(rolls);
    if (!fin.isOver){ violations.push(`game ${g}: never finished (${rolls.length} rolls)`); break; }
    if (rolls.length > 21){ violations.push(`game ${g}: ${rolls.length} rolls`); break; }
    games++;
    lo = Math.min(lo, fin.total); hi = Math.max(hi, fin.total); sumScore += fin.total;
  }

  check(`completed ${games}/2000 games with no invariant violations`,
    games === 2000 && violations.length === 0, violations[0] ?? '');
  check(`scores stayed in 0..300 (saw ${lo}..${hi})`, lo >= 0 && hi <= 300);
  console.log(`    avg score ${(sumScore / Math.max(games, 1)).toFixed(1)}, ` +
              `${strikes} strikes across all games`);
}

/* =========================================================================== */
console.log('');
if (failures){
  console.log(`FAIL — ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log('PASS — scoring canon, physics sanity, and 2,000-game invariants all hold.');
  process.exit(0);
}
