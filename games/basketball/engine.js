/* ============================================================================
   Basketball — Arline Arcade · engine.js
   Pure game engine: no DOM, no Date, no Math.random. The only randomness is
   the injected rng (it seeds the hoop-drift phase), so a seeded rng makes a
   whole round fully deterministic — proven headless by sim.mjs.

   The model: a shot lives in a side-view physics plane. `d` marches from the
   rack (d = 0) toward the hoop, `h` is height, gravity pulls `h` down. A
   third, lateral axis `x` carries flick aim and the drifting hoop; the
   renderer folds (x, d, h) into the portrait pseudo-3D view.

   The rim is TWO circle colliders — the front and back iron — in the (d,h)
   plane, plus a one-sided glass plane behind them and the floor. A made
   basket is the ball's center crossing the rim segment BETWEEN the irons
   moving DOWNWARD, latched so each ball counts at most once (and a ball that
   sneaks up through the net from below is disqualified). Physics runs at a
   fixed 1/60 s, substepped 4x near the rim so hot shots can't tunnel
   through the iron.

   Scoring: +2 a basket; 3 consecutive makes lights ON FIRE (+1 bonus per
   make until a miss). After every 5 makes the whole hoop assembly drifts
   side-to-side — sinusoidal, small amplitude, faster with each level.
   ========================================================================== */

export const C = Object.freeze({
  DT: 1 / 60,          // fixed physics step (s)
  ROUND_TIME: 60,      // round length (s)
  MAX_BALLS: 3,        // balls allowed in flight at once

  G: 3.4,              // gravity (units/s^2) — world height is ~2 units
  BALL_R: 0.045,       // ball radius
  RACK_H: 0.18,        // launch height at the rack

  RIM_H: 1.0,          // rim height
  RIM_D: 0.95,         // rim center depth
  RIM_HALF: 0.075,     // half the rim opening (front iron at RIM_D-RIM_HALF)
  RIM_R: 0.014,        // iron (rim tube) collider radius

  BOARD_D: 1.065,      // glass plane depth (just behind the back iron)
  BOARD_BOT: 0.97,     // glass bottom height
  BOARD_TOP: 1.38,     // glass top height — hot shots fly clean over it

  DEPTH_RATIO: 0.346,  // launch: vd = power * ratio (fixed arcade elevation)
  MIN_POW: 0.9,
  MAX_POW: 3.4,
  MAX_VX: 0.6,         // lateral aim clamp

  X_MAX: 0.45,         // soft side walls
  D_MAX: 1.5,          // soft back wall behind the hoop

  LAT_GATE: 0.12,      // |x-hoopX| under this: rim + glass are solid
  LAT_SCORE: 0.055,    // lateral tolerance for a make

  REST_RIM: 0.55,      // restitutions
  REST_BOARD: 0.45,
  REST_FLOOR: 0.45,
  REST_WALL: 0.5,

  PTS: 2,
  PTS_FIRE: 3,
  FIRE_STREAK: 3,      // consecutive makes to light the fire
  MOVE_EVERY: 5,       // hoop starts/steps up drifting every N makes

  SETTLE_T: 0.65,      // resting this long -> ball retired
  BALL_TTL: 7,         // absolute failsafe lifetime (s)
});

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

/** Fresh round. `rng` is injected (seedable) — used once, for the drift phase. */
export function createGame(rng = Math.random){
  return {
    time: 0,
    timeLeft: C.ROUND_TIME,
    started: false,        // clock starts on the first shot
    over: false,
    score: 0,
    streak: 0,
    onFire: false,
    makes: 0,
    shots: 0,
    hoopX: 0,              // lateral hoop position (drifts at level >= 1)
    hoopAmp: 0,
    hoopAng: rng() * Math.PI * 2,   // sinusoid phase — the one rng draw
    balls: [],
    events: [],
  };
}

/** Current drift level: 0 = parked, then +1 per MOVE_EVERY makes. */
export function hoopLevel(g){ return Math.floor(g.makes / C.MOVE_EVERY); }

/** Launch a ball from the rack. vy>0 = flick power (up), vx = lateral aim.
    Returns the ball, or null (round over / three balls already flying). */
export function shoot(g, vx, vy){
  if (g.over || g.balls.length >= C.MAX_BALLS) return null;
  const pow = clamp(vy, C.MIN_POW, C.MAX_POW);
  const b = {
    x: 0, d: 0, h: C.RACK_H,
    vx: clamp(vx, -C.MAX_VX, C.MAX_VX),
    vd: pow * C.DEPTH_RATIO,
    vh: pow,
    r: C.BALL_R,
    age: 0, restT: 0, contactCd: 0,
    touched: false,        // hit iron or glass (a make without it = swish)
    scored: false, missed: false, noScore: false, done: false,
  };
  g.shots++;
  g.started = true;
  g.balls.push(b);
  return b;
}

/** Advance one fixed step. Returns this step's events:
    {type:'end'|'score'|'miss'|'rim'|'board'|'fire'|'fireEnd'|'level', ...} */
export function step(g, dt = C.DT){
  const ev = g.events = [];
  g.time += dt;

  if (!g.over && g.started){
    g.timeLeft -= dt;
    if (g.timeLeft <= 0){
      g.timeLeft = 0;
      g.over = true;                 // balls already in the air still count
      ev.push({ type: 'end' });
    }
  }

  // Hoop drift — amplitude eases toward the level target; the angle
  // integrates so speed changes never make the hoop jump.
  const lvl = hoopLevel(g);
  const targetAmp = lvl <= 0 ? 0 : Math.min(0.05 + 0.03 * lvl, 0.16);
  const omega = lvl <= 0 ? 1.4 : Math.min(1.4 + 0.25 * (lvl - 1), 2.4);
  g.hoopAmp += (targetAmp - g.hoopAmp) * Math.min(1, dt * 1.5);
  g.hoopAng += omega * dt;
  g.hoopX = g.hoopAmp * Math.sin(g.hoopAng);

  for (const b of g.balls) stepBall(g, b, dt, ev);
  for (let i = g.balls.length - 1; i >= 0; i--){
    if (g.balls[i].done) g.balls.splice(i, 1);
  }
  return ev;
}

/* --- internals ------------------------------------------------------------ */

function stepBall(g, b, dt, ev){
  b.age += dt;
  // Substep 4x near the rim (anti-tunneling): max speed ~3.8 u/s means at
  // most ~0.016 u per 1/240 s substep, well under the 0.059 u contact radius.
  const near = b.d > C.RIM_D - 0.5 && b.h > C.RIM_H - 0.5;
  const n = near ? 4 : 1;
  const sdt = dt / n;
  for (let i = 0; i < n && !b.done; i++) substep(g, b, sdt, ev);

  if (b.done) return;

  // Retire once it has sat still on the floor for a beat.
  const resting = b.h <= b.r + 0.002 &&
    Math.abs(b.vh) < 0.05 && Math.abs(b.vd) < 0.05 && Math.abs(b.vx) < 0.05;
  b.restT = resting ? b.restT + dt : 0;
  if (b.restT >= C.SETTLE_T || b.age >= C.BALL_TTL) finishBall(g, b, ev);
}

function substep(g, b, sdt, ev){
  if (b.contactCd > 0) b.contactCd -= sdt;
  const pd = b.d, ph = b.h;

  // integrate
  b.vh -= C.G * sdt;
  b.x += b.vx * sdt;
  b.d += b.vd * sdt;
  b.h += b.vh * sdt;

  // soft walls keep everything on the court
  if (b.x < -C.X_MAX + b.r){ b.x = -C.X_MAX + b.r; b.vx = Math.abs(b.vx) * C.REST_WALL; }
  else if (b.x > C.X_MAX - b.r){ b.x = C.X_MAX - b.r; b.vx = -Math.abs(b.vx) * C.REST_WALL; }
  if (b.d > C.D_MAX - b.r){ b.d = C.D_MAX - b.r; b.vd = -Math.abs(b.vd) * 0.35; }
  if (b.d < -0.05){ b.d = -0.05; b.vd = Math.abs(b.vd) * C.REST_WALL; }

  // hoop hardware is only solid when the ball lines up with it laterally
  const engaged = Math.abs(b.x - g.hoopX) < C.LAT_GATE;
  if (engaged){
    collideIron(b, C.RIM_D - C.RIM_HALF, ev);
    collideIron(b, C.RIM_D + C.RIM_HALF, ev);
    // glass: one-sided plane facing the player
    if (pd + b.r <= C.BOARD_D && b.d + b.r > C.BOARD_D && b.vd > 0 &&
        b.h > C.BOARD_BOT - b.r && b.h < C.BOARD_TOP + b.r){
      b.d = C.BOARD_D - b.r;
      b.vd = -b.vd * C.REST_BOARD;
      b.touched = true;
      contact(b, ev, 'board');
    }
  }

  // rim-plane crossings (checked after collision resolution)
  if (ph >= C.RIM_H && b.h < C.RIM_H){          // moving DOWN through the plane
    const t = (ph - C.RIM_H) / (ph - b.h);
    const dc = pd + (b.d - pd) * t;
    const inWindow = dc > C.RIM_D - C.RIM_HALF + C.RIM_R &&
                     dc < C.RIM_D + C.RIM_HALF - C.RIM_R;
    if (inWindow && !b.scored && !b.noScore &&
        Math.abs(b.x - g.hoopX) < C.LAT_SCORE){
      b.scored = true;
      ev.push({ type: 'score',
                pts: g.onFire ? C.PTS_FIRE : C.PTS,
                swish: !b.touched, vh: b.vh, x: b.x });
      registerMake(g, ev);
      b.vd *= 0.25; b.vx *= 0.3; b.vh *= 0.55;   // the net grabs it
    } else if (inWindow && engaged && !b.scored){
      // lined up in depth but off-center laterally: clanks the ring edge
      b.vh = Math.abs(b.vh) * 0.4;
      b.vd *= 0.6;
      b.vx += (b.x >= g.hoopX ? 1 : -1) * 0.25;
      b.touched = true;
      contact(b, ev, 'rim');
    }
  } else if (ph < C.RIM_H && b.h >= C.RIM_H && !b.scored){
    // came UP through the hoop mouth (net fiction): this ball can't count
    const t = (C.RIM_H - ph) / (b.h - ph);
    const dc = pd + (b.d - pd) * t;
    if (dc > C.RIM_D - C.RIM_HALF && dc < C.RIM_D + C.RIM_HALF &&
        Math.abs(b.x - g.hoopX) < C.LAT_GATE){
      b.noScore = true;
    }
  }

  // floor
  if (b.h < b.r){
    b.h = b.r;
    if (!b.scored && !b.missed){                 // it can never score after this
      b.missed = true;
      ev.push({ type: 'miss' });
      breakStreak(g, ev);
    }
    if (b.vh < -0.3){
      b.vh = -b.vh * C.REST_FLOOR;
      b.vd *= 0.72; b.vx *= 0.72;
    } else {
      b.vh = 0;
      b.vd *= 0.86; b.vx *= 0.86;
    }
  }
}

function collideIron(b, id, ev){
  const dx = b.d - id, dy = b.h - C.RIM_H;
  const rr = b.r + C.RIM_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return;
  const dist = Math.sqrt(d2);
  const nx = dx / dist, ny = dy / dist;
  b.d = id + nx * rr;                            // push out of the iron
  b.h = C.RIM_H + ny * rr;
  const vn = b.vd * nx + b.vh * ny;
  if (vn < 0){                                   // reflect if approaching
    const tx = -ny, ty = nx;
    const vt = b.vd * tx + b.vh * ty;
    const rn = -vn * C.REST_RIM, rt = vt * 0.82;
    b.vd = nx * rn + tx * rt;
    b.vh = ny * rn + ty * rt;
  }
  b.touched = true;
  contact(b, ev, 'rim');
}

function contact(b, ev, type){                   // debounced contact event
  if (b.contactCd > 0) return;
  b.contactCd = 0.09;
  ev.push({ type });
}

function registerMake(g, ev){
  g.makes++;
  g.streak++;
  g.score += g.onFire ? C.PTS_FIRE : C.PTS;
  if (!g.onFire && g.streak >= C.FIRE_STREAK){
    g.onFire = true;
    ev.push({ type: 'fire' });
  }
  if (g.makes % C.MOVE_EVERY === 0){
    ev.push({ type: 'level', level: hoopLevel(g) });
  }
}

function breakStreak(g, ev){
  g.streak = 0;
  if (g.onFire){
    g.onFire = false;
    ev.push({ type: 'fireEnd' });
  }
}

function finishBall(g, b, ev){
  if (!b.scored && !b.missed){                   // e.g. wedged on the iron
    b.missed = true;
    ev.push({ type: 'miss' });
    breakStreak(g, ev);
  }
  b.done = true;
}

export default { C, createGame, shoot, step, hoopLevel };
