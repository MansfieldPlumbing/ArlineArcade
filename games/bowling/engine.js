/* ============================================================================
   Bowling — Arline Arcade · PURE game engine (ES module, no DOM).

   Two halves:
     1) Ten-pin scoring   — rolls -> frames, marks, cumulative, 10th-frame
                            extra-roll logic, guards against impossible rolls.
     2) Top-down physics  — 2D lane in real inches (x lateral, y down-lane),
                            circle-circle ball->pin and pin->pin cascades.

   Regulation proportions: lane 41.5" wide, pins on a 12" triangular rack
   (row gap 12·sin60°), pin 4.75" wide, ball 8.5", foul line to head pin 60 ft.

   rng is injected — the same seed + launch always gives the same result.

   Flick-to-bowl feel inspired by iliagrigorevdev/bowling (GPL-3.0) —
   gameplay reference only, all code here is original.
   ========================================================================== */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- lane geometry (inches) ---------------------------------------- */
export const LANE = {
  width: 41.5,
  halfWidth: 41.5 / 2,
  gutterWidth: 9.25,
  headPinY: 720,                       // foul line -> pin 1 (60 ft)
  rowGap: 12 * Math.sin(Math.PI / 3),  // ≈10.39" between rack rows
  spacing: 12,                         // adjacent pin centers
  pinRadius: 4.75 / 2,
  pinHeight: 15,
  ballRadius: 8.5 / 2,
};
LANE.pitY = LANE.headPinY + 3 * LANE.rowGap + 14;   // back edge of the deck

/** Pin spots, index 0..9 = pins 1..10 (head pin first, 4-3-2-1 triangle). */
export function pinSpots(){
  const H = LANE.headPinY, G = LANE.rowGap;
  return [
    { x: 0,   y: H },
    { x: -6,  y: H + G },     { x: 6,  y: H + G },
    { x: -12, y: H + 2 * G }, { x: 0,  y: H + 2 * G }, { x: 12, y: H + 2 * G },
    { x: -18, y: H + 3 * G }, { x: -6, y: H + 3 * G }, { x: 6,  y: H + 3 * G }, { x: 18, y: H + 3 * G },
  ];
}

/** Sensible clamps for launches (inches / second). */
export const THROW = { minSpeed: 90, maxSpeed: 480, maxSide: 110, maxSpin: 85 };

/** mulberry32 — tiny seedable PRNG (public-domain recipe). */
export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ===========================================================================
   1) TEN-PIN SCORING
   ========================================================================== */

/** Pins standing before the next roll of frame `f` (0-based), given the
    rolls already thrown in that frame. */
function standingFor(frameRolls, f){
  if (frameRolls.length === 0) return 10;
  const [a, b] = frameRolls;
  if (f < 9) return 10 - a;                       // (a===10 already advanced the frame)
  if (frameRolls.length === 1) return a === 10 ? 10 : 10 - a;
  if (a === 10) return b === 10 ? 10 : 10 - b;    // 10th, before the 3rd ball
  return 10;                                      // spare -> fresh rack for the bonus ball
}

const mark = n => (n === 0 ? '-' : String(n));

/**
 * Score a sequence of rolls (pinfall counts).
 * Throws on impossible sequences (more pins than standing, rolls after game end).
 *
 * Returns {
 *   frames: [{ rolls, marks, score }] x10   — score is CUMULATIVE, null until known
 *   total,                                  — last known cumulative (0 at start)
 *   currentFrame (1..10), currentRoll (1..3, 0 when over),
 *   pinsStanding (before the next roll, 0 when over),
 *   isOver
 * }
 */
export function frameState(rolls){
  const frames = Array.from({ length: 10 }, () => ({ rolls: [], marks: [], score: null }));
  let f = 0, over = false;

  for (const r of rolls){
    if (over) throw new Error('Game is over — no more rolls.');
    if (!Number.isInteger(r) || r < 0 || r > 10) throw new Error(`Bad roll: ${r}`);
    const standing = standingFor(frames[f].rolls, f);
    if (r > standing) throw new Error(`Rolled ${r} with only ${standing} pins standing.`);
    frames[f].rolls.push(r);
    if (f < 9){
      if (r === 10 || frames[f].rolls.length === 2) f++;
    } else {
      const fr = frames[9].rolls;
      if ((fr.length === 2 && fr[0] !== 10 && fr[0] + fr[1] < 10) || fr.length === 3) over = true;
    }
  }

  /* marks — frames 1..9 */
  for (let k = 0; k < 9; k++){
    const fr = frames[k];
    if (fr.rolls.length === 0) continue;
    if (fr.rolls[0] === 10){ fr.marks = ['X']; continue; }
    fr.marks = [mark(fr.rolls[0])];
    if (fr.rolls.length === 2)
      fr.marks.push(fr.rolls[0] + fr.rolls[1] === 10 ? '/' : mark(fr.rolls[1]));
  }
  /* marks — 10th frame */
  {
    const fr = frames[9], [a, b, c] = fr.rolls, m = [];
    if (fr.rolls.length >= 1) m.push(a === 10 ? 'X' : mark(a));
    if (fr.rolls.length >= 2) m.push(a === 10 ? (b === 10 ? 'X' : mark(b))
                                              : (a + b === 10 ? '/' : mark(b)));
    if (fr.rolls.length >= 3) m.push((a === 10 && b < 10) ? (b + c === 10 ? '/' : mark(c))
                                                          : (c === 10 ? 'X' : mark(c)));
    fr.marks = m;
  }

  /* cumulative scores — a frame only scores once its bonuses are known */
  let i = 0, cum = 0;
  for (let k = 0; k < 10; k++){
    const fr = frames[k];
    if (k < 9){
      const a = rolls[i];
      if (a === undefined) break;
      if (a === 10){
        const b = rolls[i + 1], c = rolls[i + 2];
        if (b === undefined || c === undefined) break;
        cum += 10 + b + c; fr.score = cum; i += 1;
      } else {
        const b = rolls[i + 1];
        if (b === undefined) break;
        if (a + b === 10){
          const c = rolls[i + 2];
          if (c === undefined) break;
          cum += 10 + c; fr.score = cum;
        } else {
          cum += a + b; fr.score = cum;
        }
        i += 2;
      }
    } else if (over){
      cum += fr.rolls.reduce((s, n) => s + n, 0);
      fr.score = cum;
    }
  }

  let total = 0;
  for (const fr of frames) if (fr.score != null) total = fr.score;

  return {
    frames, total, isOver: over,
    currentFrame: over ? 10 : f + 1,
    currentRoll: over ? 0 : frames[f].rolls.length + 1,
    pinsStanding: over ? 0 : standingFor(frames[f].rolls, f),
  };
}

/* ===========================================================================
   2) TOP-DOWN LANE PHYSICS
   ========================================================================== */

/**
 * Simulate one throw.
 *   launch: { x0, vx, vy, spin }  — inches, in/s, spin = lateral accel in/s²
 *   rng:    () => [0,1)           — injected; only source of randomness
 *   opts:   { standing: [pin indices racked], maxTime, sampleEvery }
 *
 * Returns {
 *   knocked: sorted pin indices toppled this roll,
 *   gutter:  true if the ball dropped in before the deck,
 *   ballPath: [{t, x, y}] sampled while the ball is live,
 *   events:  [{t, pin, vx, vy}] the moment each pin topples,
 *   duration: total simulated seconds
 * }
 */
export function simulate(launch, rng = Math.random, opts = {}){
  const standingIdx = opts.standing ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const spots = pinSpots();
  const rB = LANE.ballRadius, rP = LANE.pinRadius;
  const rDown = 3.9;                 // a toppled pin lies long — wider footprint
  const DT = 1 / 240;
  const M_BALL = 4.2, M_PIN = 1;     // ~15 lb ball vs ~3.5 lb pin
  const REST = 0.7, WALL_REST = 0.6;
  const MU_BALL = 12, MU_PIN = 210;  // in/s² decel: oiled roll vs tumbling slide
  const KNOCK = 14;                  // pin speed (in/s) that counts as toppled
  const STOP = 3;
  const END_Y = LANE.pitY;
  const maxT = opts.maxTime ?? 10;
  const sampleEvery = opts.sampleEvery ?? 4;

  let x = clamp(launch.x0 ?? 0, -(LANE.halfWidth - rB), LANE.halfWidth - rB);
  let y = 0;
  let vx = clamp(launch.vx ?? 0, -THROW.maxSide, THROW.maxSide) + (rng() - 0.5) * 3;
  let vy = clamp(launch.vy ?? 0, 40, THROW.maxSpeed) * (1 + (rng() - 0.5) * 0.01);
  let spin = clamp(launch.spin ?? 0, -THROW.maxSpin, THROW.maxSpin) + (rng() - 0.5) * 2;

  const pins = standingIdx.map(i => ({ i, x: spots[i].x, y: spots[i].y, vx: 0, vy: 0, up: true, gone: false }));
  const knocked = [], events = [];
  const ballPath = [{ t: 0, x, y }];
  let gutter = false, ballLive = true;

  const topple = (p, nvx, nvy, tNow) => {
    p.up = false; p.vx = nvx; p.vy = nvy;
    knocked.push(p.i);
    events.push({ t: tNow, pin: p.i, vx: nvx, vy: nvy });
  };

  let t = 0, step = 0;
  while (t < maxT){
    t += DT; step++;
    let acted = false;

    /* -- ball -- */
    if (ballLive){
      if (!gutter){
        vx += spin * DT;
        const sp = Math.hypot(vx, vy);
        if (sp > 0){ const k = Math.max(0, sp - MU_BALL * DT) / sp; vx *= k; vy *= k; }
      }
      x += vx * DT; y += vy * DT;
      if (!gutter && Math.abs(x) > LANE.halfWidth){
        gutter = true;                                  // dropped in — done aiming
        x = Math.sign(x) * (LANE.halfWidth + rB + 0.4);
        vx = 0; spin = 0; vy = Math.max(vy, 90);        // gutter carries it out
      }
      if (y > END_Y + rB || (!gutter && Math.hypot(vx, vy) < STOP)) ballLive = false;
    }

    /* -- ball vs pins -- */
    if (ballLive && !gutter){
      for (const p of pins){
        if (p.gone) continue;
        const rr = rB + (p.up ? rP : rDown);
        const dx = p.x - x, dy = p.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 >= rr * rr) continue;
        const dist = Math.sqrt(d2);
        let nx = dx / dist, ny = dy / dist;
        const a = (rng() - 0.5) * 0.06;                 // tiny wobble on the contact
        const ca = Math.cos(a), sa = Math.sin(a);
        const tx = nx * ca - ny * sa; ny = nx * sa + ny * ca; nx = tx;
        const rel = (vx - p.vx) * nx + (vy - p.vy) * ny;
        if (rel > 0){
          acted = true;
          const j = (1 + REST) * rel / (1 / M_BALL + 1 / M_PIN);
          const pvx = p.vx + j * nx / M_PIN, pvy = p.vy + j * ny / M_PIN;
          if (p.up && Math.hypot(pvx, pvy) < KNOCK){
            vx -= (1 + REST) * rel * nx;                // pin shrugs it off
            vy -= (1 + REST) * rel * ny;
          } else {
            if (p.up) topple(p, pvx, pvy, t);
            else { p.vx = pvx; p.vy = pvy; }
            vx -= j * nx / M_BALL; vy -= j * ny / M_BALL;
          }
        }
        const over = rr - dist + 0.05;
        if (p.up){ x -= nx * over; y -= ny * over; }
        else { x -= nx * over * 0.2; y -= ny * over * 0.2; p.x += nx * over * 0.8; p.y += ny * over * 0.8; }
      }
    }

    /* -- pins slide, bounce off the kickbacks, cascade into each other -- */
    let moving = false;
    for (const p of pins){
      if (p.gone || p.up) continue;
      const sp0 = Math.hypot(p.vx, p.vy);
      if (sp0 <= STOP){ p.vx = 0; p.vy = 0; continue; }
      const k = Math.max(0, sp0 - MU_PIN * DT) / sp0;
      p.vx *= k; p.vy *= k;
      p.x += p.vx * DT; p.y += p.vy * DT;
      if (p.y > LANE.headPinY - 16){                    // kickback walls flank the deck
        const wall = LANE.halfWidth - rP * 0.5;
        if (p.x < -wall && p.vx < 0){ p.x = -wall; p.vx = -p.vx * WALL_REST; }
        else if (p.x > wall && p.vx > 0){ p.x = wall; p.vx = -p.vx * WALL_REST; }
      }
      if (p.y > END_Y + 5 || p.y < LANE.headPinY - 70 || Math.abs(p.x) > LANE.halfWidth + 8){
        p.gone = true; continue;                        // off into the pit
      }
      if (Math.hypot(p.vx, p.vy) > STOP) moving = true;

      for (const q of pins){
        if (q === p || q.gone) continue;
        const rr = rDown + (q.up ? rP : rDown);
        const dx = q.x - p.x, dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 >= rr * rr) continue;
        const dist = Math.sqrt(d2);
        const nx = dx / dist, ny = dy / dist;
        const rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
        if (rel > 0){
          moving = true;
          const j = (1 + REST) * rel / 2;               // equal pin masses
          const qvx = q.vx + j * nx, qvy = q.vy + j * ny;
          if (q.up && Math.hypot(qvx, qvy) < KNOCK){
            p.vx -= (1 + REST) * rel * nx; p.vy -= (1 + REST) * rel * ny;
          } else {
            if (q.up) topple(q, qvx, qvy, t);
            else { q.vx = qvx; q.vy = qvy; }
            p.vx -= j * nx; p.vy -= j * ny;
          }
        }
        const over = rr - dist + 0.05;
        if (q.up){ p.x -= nx * over; p.y -= ny * over; }
        else { p.x -= nx * over * 0.5; p.y -= ny * over * 0.5; q.x += nx * over * 0.5; q.y += ny * over * 0.5; }
      }
    }

    if (ballLive && step % sampleEvery === 0) ballPath.push({ t, x, y });
    if (!ballLive && !moving && !acted) break;
  }

  ballPath.push({ t, x, y });
  knocked.sort((a, b) => a - b);
  return { knocked, gutter, ballPath, events, duration: t };
}
