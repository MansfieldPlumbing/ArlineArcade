/* ============================================================================
   Ping Pong — Arline Arcade · PURE game engine (ES module, no DOM).

   Curveball-style 3D table tennis in a depth tunnel, all in normalized
   coordinates: x,y ∈ [-1,1] across the tunnel, z ∈ [0,1] near -> far.
   The player guards the z=0 plane, the computer guards z=1.

   - Fixed-dt physics (1/60 s, 2 substeps) — deterministic given the injected rng.
   - Tunnel walls reflect the ball and slightly damp its spin.
   - A paddle hit reflects z, ramps the ball speed (capped) and hands the ball
     a curve force proportional to the paddle's velocity at contact — the spin.
   - Miss a plane and the other side scores. First to 11, win by 2; the serve
     changes hands every two points (every point at deuce), like table tennis.
   - The computer tracks a predicted intercept with a max-speed clamp and
     rng-jittered reaction; it sharpens as the rally grows and the score climbs.

   Mechanics reference: the classic 2000s "Curveball" web game (public game
   concept — depth tunnel, paddle spin, speed ramp). Paddle-spin / speed-up
   feel cross-checked against jakesgordon/javascript-pong (MIT).
   All code here is original.
   ========================================================================== */

export const DEFAULTS = {
  dt: 1 / 60,        // fixed step
  substeps: 2,       // physics substeps per step

  ballR: 0.075,      // ball radius (render + serve offset), tunnel units
  paddleW: 0.30,     // paddle half-width
  paddleH: 0.30,     // paddle half-height
  hitGrace: 0.05,    // extra reach so edge grazes still count

  serveSpeed: 0.85,  // z units/sec — a gentle ~1.2 s first crossing
  speedRamp: 1.045,  // speed multiplier per paddle hit ...
  maxSpeed: 2.8,     // ... capped here
  latMax: 1.9,       // |vx|,|vy| cap
  curveGain: 0.42,   // paddle velocity -> curve force
  curveMax: 2.0,     // |cx|,|cy| clamp
  wallSpinDamp: 0.75,// spin kept after a wall bounce
  playerVelMax: 6,   // sane cap on measured pointer velocity

  aiBaseSpeed: 1.15, // computer paddle speed (tunnel units/sec) ...
  aiSpeedRamp: 2.4,  // ... plus this much at full skill
  aiJitter: 0.26,    // reaction wobble at zero skill (shrinks to 0)

  target: 11,        // first to 11 ...
  winBy: 2,          // ... win by 2
  pointDelay: 1.1,   // pause after a point, seconds
  aiServeDelay: 1.0, // computer thinks before serving
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Seeded rng — same recipe as the other arcade sims. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold a coordinate back into [-1,1] as if reflected off the walls. */
export function fold(x) {
  x = (x + 1) % 4;
  if (x < 0) x += 4;
  return x <= 2 ? x - 1 : 3 - x;
}

/* ---------------------------------------------------------------------------
   Match bookkeeping
   ------------------------------------------------------------------------- */

/** Table-tennis service rotation: 2 serves each, 1 each once both reach 10. */
export function serverFor(score, first = 'player') {
  const other = first === 'player' ? 'ai' : 'player';
  const total = score.player + score.ai;
  const idx = (Math.min(score.player, score.ai) >= 10)
    ? 10 + (total - 20)          // deuce: alternate every point
    : Math.floor(total / 2);     // blocks of two serves
  return idx % 2 === 0 ? first : other;
}

export function isDeuce(score, cfg = DEFAULTS) {
  return score.player === score.ai && score.player >= cfg.target - 1;
}

export function matchWinner(score, cfg = DEFAULTS) {
  const { player: p, ai: a } = score;
  if ((p >= cfg.target || a >= cfg.target) && Math.abs(p - a) >= cfg.winBy) {
    return p > a ? 'player' : 'ai';
  }
  return null;
}

/** Computer skill 0..1 — ramps with rally length and the score. */
export function aiSkill(state) {
  const s = state.score;
  return Math.min(1, state.rally * 0.07 + (s.player + s.ai) * 0.035 + s.player * 0.02);
}

/** Max distance/sec the computer paddle may move right now. */
export function aiMaxSpeed(state) {
  const c = state.cfg;
  return c.aiBaseSpeed + c.aiSpeedRamp * aiSkill(state);
}

/* ---------------------------------------------------------------------------
   State
   ------------------------------------------------------------------------- */

export function createState(rng = Math.random, overrides = {}) {
  const cfg = { ...DEFAULTS, ...overrides };
  const state = {
    cfg, rng,
    phase: 'serve',            // 'serve' | 'rally' | 'point' | 'over'
    server: 'player',
    firstServer: 'player',
    winner: null,
    score: { player: 0, ai: 0 },
    rally: 0,                  // paddle hits in the current rally
    bestRally: 0,
    hits: 0,                   // paddle hits, whole match
    wallBounces: 0,
    timer: 0,                  // phase countdown (point pause / ai serve)
    time: 0,
    ball:   { x: 0, y: 0, z: 0.02, vx: 0, vy: 0, vz: 0, cx: 0, cy: 0, speed: cfg.serveSpeed },
    player: { x: 0, y: 0, vx: 0, vy: 0 },
    ai:     { x: 0, y: 0, vx: 0, vy: 0, jx: 0, jy: 0, jt: 0 },
    events: [],                // drained by the caller
  };
  state.events.push({ t: 'ready', server: state.server });
  return state;
}

/** Score a point, rotate service, detect deuce/match end. Pure bookkeeping. */
export function awardPoint(state, side) {
  const c = state.cfg;
  state.score[side]++;
  state.events.push({
    t: 'point', winner: side,
    you: state.score.player, cpu: state.score.ai,
    deuce: isDeuce(state.score, c),
  });
  const w = matchWinner(state.score, c);
  if (w) {
    state.phase = 'over';
    state.winner = w;
    state.events.push({ t: 'win', winner: w, you: state.score.player, cpu: state.score.ai });
  } else {
    state.phase = 'point';
    state.timer = c.pointDelay;
  }
  state.server = serverFor(state.score, state.firstServer);
  return state;
}

/* ---------------------------------------------------------------------------
   The step — deterministic given seed + inputs
   input: { px, py (pointer in [-1,1]), serve (bool) }
   ------------------------------------------------------------------------- */

export function step(state, input = {}, dt = state.cfg.dt) {
  const c = state.cfg;
  state.time += dt;

  // player paddle follows the pointer 1:1; velocity is what puts spin on
  const px = clamp(input.px ?? state.player.x, -1, 1);
  const py = clamp(input.py ?? state.player.y, -1, 1);
  state.player.vx = clamp((px - state.player.x) / dt, -c.playerVelMax, c.playerVelMax);
  state.player.vy = clamp((py - state.player.y) / dt, -c.playerVelMax, c.playerVelMax);
  state.player.x = px;
  state.player.y = py;

  if (state.phase === 'over') return state;

  if (state.phase === 'point') {
    state.timer -= dt;
    if (state.timer <= 0) setupServe(state);
    return state;
  }

  let aiMoved = false;
  if (state.phase === 'serve') {
    const b = state.ball;
    if (state.server === 'player') {
      aiMove(state, dt);                       // computer drifts back to center
      aiMoved = true;
      b.x = state.player.x; b.y = state.player.y; b.z = 0.02;
      if (!input.serve) return state;
      launch(state, 'player');
    } else {
      state.timer -= dt;                       // computer holds the ball a beat
      b.x = state.ai.x; b.y = state.ai.y; b.z = 0.98;
      if (state.timer > 0) return state;
      launch(state, 'ai');
      aiMoved = true;                          // no sprint on its own serve step
    }
  }

  // rally physics
  if (!aiMoved) aiMove(state, dt);
  const n = c.substeps, h = dt / n;
  for (let i = 0; i < n && state.phase === 'rally'; i++) substep(state, h);
  return state;
}

/* ---------------------------------------------------------------------------
   Internals
   ------------------------------------------------------------------------- */

function setupServe(state) {
  const c = state.cfg, b = state.ball;
  state.phase = 'serve';
  state.rally = 0;
  b.vx = b.vy = b.vz = 0;
  b.cx = b.cy = 0;
  b.speed = c.serveSpeed;
  if (state.server === 'ai') {
    state.timer = c.aiServeDelay;
    b.x = state.ai.x; b.y = state.ai.y; b.z = 0.98;
  } else {
    state.timer = 0;
    b.x = state.player.x; b.y = state.player.y; b.z = 0.02;
  }
  state.events.push({ t: 'ready', server: state.server });
}

function launch(state, side) {
  const b = state.ball, r = state.rng;
  b.speed = state.cfg.serveSpeed;
  b.cx = b.cy = 0;
  if (side === 'player') {
    b.z = 0.02; b.vz = b.speed;
    b.vx = clamp(state.player.vx * 0.2 + (r() - 0.5) * 0.3, -0.8, 0.8);
    b.vy = clamp(state.player.vy * 0.2 + (r() - 0.5) * 0.3, -0.8, 0.8);
  } else {
    b.z = 0.98; b.vz = -b.speed;
    b.vx = clamp((0 - state.ai.x) * 0.5 + (r() - 0.5) * 0.5, -0.8, 0.8);
    b.vy = clamp((0 - state.ai.y) * 0.5 + (r() - 0.5) * 0.5, -0.8, 0.8);
  }
  state.rally = 0;
  state.phase = 'rally';
  state.events.push({ t: 'serve', side });
}

function bounceSpin(state) {
  const b = state.ball, d = state.cfg.wallSpinDamp;
  b.cx *= d; b.cy *= d;
  state.wallBounces++;
  state.events.push({ t: 'wall' });
}

function substep(state, h) {
  const b = state.ball, c = state.cfg;

  // curve force bends the flight
  b.vx = clamp(b.vx + b.cx * h, -c.latMax, c.latMax);
  b.vy = clamp(b.vy + b.cy * h, -c.latMax, c.latMax);
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h;

  // tunnel walls
  let guard = 0;
  while ((Math.abs(b.x) > 1 || Math.abs(b.y) > 1) && guard++ < 4) {
    if (b.x > 1)       { b.x =  2 - b.x; b.vx = -Math.abs(b.vx); bounceSpin(state); }
    else if (b.x < -1) { b.x = -2 - b.x; b.vx =  Math.abs(b.vx); bounceSpin(state); }
    if (b.y > 1)       { b.y =  2 - b.y; b.vy = -Math.abs(b.vy); bounceSpin(state); }
    else if (b.y < -1) { b.y = -2 - b.y; b.vy =  Math.abs(b.vy); bounceSpin(state); }
  }

  // paddle planes
  if (b.vz < 0 && b.z <= 0) {
    const tPast = b.z / b.vz;                       // time since crossing (>= 0)
    const xc = b.x - b.vx * tPast, yc = b.y - b.vy * tPast;
    if (within(xc, yc, state.player, c)) hit(state, 'player', xc, yc);
    else miss(state, 'ai');                         // computer scores
  } else if (b.vz > 0 && b.z >= 1) {
    const tPast = (b.z - 1) / b.vz;
    const xc = b.x - b.vx * tPast, yc = b.y - b.vy * tPast;
    if (within(xc, yc, state.ai, c)) hit(state, 'ai', xc, yc);
    else miss(state, 'player');                     // player scores
  }
}

function within(xc, yc, paddle, c) {
  return Math.abs(xc - paddle.x) <= c.paddleW + c.hitGrace &&
         Math.abs(yc - paddle.y) <= c.paddleH + c.hitGrace;
}

function hit(state, side, xc, yc) {
  const b = state.ball, c = state.cfg, r = state.rng;
  b.speed = Math.min(b.speed * c.speedRamp, c.maxSpeed);

  if (side === 'player') {
    const p = state.player;
    b.z = Math.max(1e-4, -b.z);                     // reflect back inside
    b.vz = b.speed;
    const ox = clamp((xc - p.x) / c.paddleW, -1, 1);
    const oy = clamp((yc - p.y) / c.paddleH, -1, 1);
    b.vx = clamp(b.vx * 0.25 + ox * 0.85 + p.vx * 0.10, -c.latMax, c.latMax);
    b.vy = clamp(b.vy * 0.25 + oy * 0.85 + p.vy * 0.10, -c.latMax, c.latMax);
    b.cx = clamp(p.vx * c.curveGain, -c.curveMax, c.curveMax);
    b.cy = clamp(p.vy * c.curveGain, -c.curveMax, c.curveMax);
    state.events.push({ t: 'hitP' });
  } else {
    const a = state.ai, s = aiSkill(state);
    b.z = Math.min(1 - 1e-4, 2 - b.z);
    b.vz = -b.speed;
    const ox = clamp((xc - a.x) / c.paddleW, -1, 1);
    const oy = clamp((yc - a.y) / c.paddleH, -1, 1);
    b.vx = clamp(b.vx * 0.25 + ox * 0.85 + a.vx * 0.10, -c.latMax, c.latMax);
    b.vy = clamp(b.vy * 0.25 + oy * 0.85 + a.vy * 0.10, -c.latMax, c.latMax);
    // spin from the computer's own movement, plus a deliberate curve shot
    // once it warms up
    b.cx = clamp(a.vx * c.curveGain * 0.8 + (r() * 2 - 1) * 0.9 * s, -c.curveMax, c.curveMax);
    b.cy = clamp(a.vy * c.curveGain * 0.8 + (r() * 2 - 1) * 0.9 * s, -c.curveMax, c.curveMax);
    state.events.push({ t: 'hitA' });
  }

  state.rally++;
  state.hits++;
  if (state.rally > state.bestRally) state.bestRally = state.rally;
}

function miss(state, winner) {
  const b = state.ball;
  b.vx = b.vy = b.vz = 0;
  b.cx = b.cy = 0;
  b.z = clamp(b.z, 0, 1);
  b.x = clamp(b.x, -1, 1);
  b.y = clamp(b.y, -1, 1);
  awardPoint(state, winner);
}

function aiMove(state, dt) {
  const a = state.ai, b = state.ball, c = state.cfg, r = state.rng;
  const s = aiSkill(state);

  // rng-jittered reaction: the aim point wobbles, less so as skill grows
  a.jt -= dt;
  if (a.jt <= 0) {
    a.jt = 0.10 + r() * 0.22;
    const m = c.aiJitter * (1 - s);
    a.jx = (r() * 2 - 1) * m;
    a.jy = (r() * 2 - 1) * m;
  }

  let tx = 0, ty = 0;                                // default: recenter
  if (state.phase === 'rally' && b.vz > 0) {
    const t = (1 - b.z) / b.vz;                      // time to the far plane
    tx = fold(b.x + b.vx * t + 0.5 * b.cx * t * t);  // predicted intercept
    ty = fold(b.y + b.vy * t + 0.5 * b.cy * t * t);
  } else if (state.phase === 'rally') {
    tx = b.x * 0.5; ty = b.y * 0.5;                  // shadow the ball loosely
  }
  tx = clamp(tx + a.jx, -1, 1);
  ty = clamp(ty + a.jy, -1, 1);

  // move toward the target, clamped to the current max speed
  const ms = aiMaxSpeed(state);
  const dx = tx - a.x, dy = ty - a.y;
  const dist = Math.hypot(dx, dy);
  const maxD = ms * dt;
  const f = dist > maxD ? maxD / dist : 1;
  a.vx = (dx * f) / dt;
  a.vy = (dy * f) / dt;
  a.x += dx * f;
  a.y += dy * f;
}

export default {
  DEFAULTS, clamp, mulberry32, fold,
  serverFor, isDeuce, matchWinner, aiSkill, aiMaxSpeed,
  createState, awardPoint, step,
};
