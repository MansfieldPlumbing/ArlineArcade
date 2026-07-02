/* ============================================================================
   Ping Pong — Arline Arcade · headless Node verification.
   Run from the repo root:  node games/pingpong/sim.mjs
   Proves the tunnel physics, paddle spin, scoring/deuce canon, AI speed clamp,
   and determinism. Exits 0 on PASS, 1 on any failure.
   ========================================================================== */

import {
  DEFAULTS, clamp, mulberry32, fold,
  serverFor, isDeuce, matchWinner, aiSkill, aiMaxSpeed,
  createState, awardPoint, step,
} from './engine.js';

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  — ' + detail}`);
  if (!cond) failures++;
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const DT = DEFAULTS.dt;

/** Perfect player: paddle glued to the ball, serves instantly. */
const perfect = (state) => ({ px: state.ball.x, py: state.ball.y, serve: true });

/** Shared runner: steps a state, watching invariants along the way. */
function run(state, steps, inputFn, { restart = false } = {}) {
  const stats = {
    steps: 0, maxRally: 0, points: 0, wallBounces: 0, matches: 0,
    boundsBad: 0, aiSpeedBad: 0, wrongPoint: 0, log: [],
  };
  for (let i = 0; i < steps; i++) {
    if (state.phase === 'over') {
      stats.matches++;
      if (!restart) break;
      const fresh = createState(state.rng, state.cfg);
      fresh.events.length = 0;
      Object.assign(state, fresh);
    }
    const ax0 = state.ai.x, ay0 = state.ai.y;
    const ms0 = aiMaxSpeed(state);
    const before = { ...state.score };

    step(state, inputFn(state, i));
    stats.steps++;

    // AI paddle never exceeds its max speed per step
    const ms = Math.max(ms0, aiMaxSpeed(state));
    const moved = Math.hypot(state.ai.x - ax0, state.ai.y - ay0);
    if (moved > ms * DT + 1e-9) stats.aiSpeedBad++;

    // ball stays inside the tunnel
    const b = state.ball;
    if (Math.abs(b.x) > 1 + 1e-9 || Math.abs(b.y) > 1 + 1e-9 ||
        b.z < -1e-9 || b.z > 1 + 1e-9) stats.boundsBad++;

    if (state.rally > stats.maxRally) stats.maxRally = state.rally;

    for (const ev of state.events.splice(0)) {
      if (ev.t === 'wall') stats.wallBounces++;
      if (ev.t === 'point') {
        stats.points++;
        // the score that moved must belong to the reported winner
        const w = ev.winner;
        const l = w === 'player' ? 'ai' : 'player';
        if (state.score[w] !== before[w] + 1 || state.score[l] !== before[l]) stats.wrongPoint++;
      }
      stats.log.push(
        `${state.time.toFixed(4)}|${ev.t}|${ev.winner ?? ev.side ?? ev.server ?? ''}|` +
        `${state.score.player}-${state.score.ai}|r${state.rally}`);
    }
  }
  return stats;
}

/* ===========================================================================
   1) TUNNEL PHYSICS — 100k steps of full play, ball always inside bounds
   ========================================================================== */
console.log('\nTunnel physics (100k steps, perfect player vs AI)');
{
  const st = createState(mulberry32(7));
  st.events.length = 0;
  const stats = run(st, 100000, perfect, { restart: true });
  check('ball stayed inside |x|,|y| <= 1 and z in [0,1] for 100k steps',
    stats.boundsBad === 0, `${stats.boundsBad} violations`);
  check('wall bounces actually happened', stats.wallBounces > 100, `got ${stats.wallBounces}`);
  check('AI paddle never exceeded its max speed per step',
    stats.aiSpeedBad === 0, `${stats.aiSpeedBad} violations`);
  check('every point went to the correct side', stats.wrongPoint === 0,
    `${stats.wrongPoint} wrong`);
}

/* ===========================================================================
   2) PADDLE HIT — z reverses, speed ramps (capped), curve from paddle velocity
   ========================================================================== */
console.log('\nPaddle hit mechanics');
{
  const st = createState(mulberry32(1));
  st.events.length = 0;
  st.phase = 'rally';
  Object.assign(st.ball, { x: 0, y: 0, z: 0.012, vx: 0, vy: 0, vz: -DEFAULTS.serveSpeed, cx: 0, cy: 0, speed: DEFAULTS.serveSpeed });
  Object.assign(st.player, { x: 0, y: 0, vx: 0, vy: 0 });
  st.ai.x = 0; st.ai.y = 0;
  // paddle moving: vx=3, vy=-2 at contact (input is position, engine derives v)
  step(st, { px: 0 + 3 * DT, py: 0 - 2 * DT });
  const b = st.ball;
  check('hit reverses z-velocity', b.vz > 0, `vz=${b.vz}`);
  check('speed ramped by the ramp factor',
    approx(b.vz, DEFAULTS.serveSpeed * DEFAULTS.speedRamp, 1e-6), `vz=${b.vz}`);
  check('curve cx = clamp(paddle vx * gain)',
    approx(b.cx, 3 * DEFAULTS.curveGain, 1e-4), `cx=${b.cx}`);
  check('curve cy = clamp(paddle vy * gain)',
    approx(b.cy, -2 * DEFAULTS.curveGain, 1e-4), `cy=${b.cy}`);
  check('rally counter incremented', st.rally === 1, `rally=${st.rally}`);
}
{ // speed cap
  const st = createState(mulberry32(2));
  st.events.length = 0;
  st.phase = 'rally';
  Object.assign(st.ball, { x: 0, y: 0, z: 0.012, vx: 0, vy: 0, vz: -2.75, cx: 0, cy: 0, speed: 2.75 });
  Object.assign(st.player, { x: 0, y: 0 });
  step(st, { px: 0, py: 0 });
  check('speed ramp is capped at maxSpeed',
    st.ball.vz > 0 && approx(st.ball.vz, DEFAULTS.maxSpeed, 1e-6), `vz=${st.ball.vz}`);
}
{ // curve clamp
  const st = createState(mulberry32(3));
  st.events.length = 0;
  st.phase = 'rally';
  Object.assign(st.ball, { x: 0, y: 0, z: 0.012, vx: 0, vy: 0, vz: -1, cx: 0, cy: 0, speed: 1 });
  Object.assign(st.player, { x: 0, y: 0 });
  step(st, { px: 6 * DT, py: 0 });                    // paddle vx = 6 (max)
  check('curve is clamped at curveMax',
    approx(st.ball.cx, DEFAULTS.curveMax, 1e-6), `cx=${st.ball.cx}`);
}
{ // wall bounce reflects and damps spin
  const st = createState(mulberry32(4));
  st.events.length = 0;
  st.phase = 'rally';
  Object.assign(st.ball, { x: 0.995, y: 0, z: 0.5, vx: 1.0, vy: 0, vz: 0.3, cx: 1.5, cy: 0.8, speed: 0.85 });
  step(st, { px: 0, py: 0 });
  const b = st.ball;
  check('x-wall reflects the ball back inside', b.x <= 1 && b.vx < 0, `x=${b.x} vx=${b.vx}`);
  check('wall bounce damps spin slightly',
    Math.abs(b.cx) < 1.5 && Math.abs(b.cx) > 0 && Math.abs(b.cy) < 0.8,
    `cx=${b.cx} cy=${b.cy}`);
}

/* ===========================================================================
   3) MISS DETECTION — the other side gets the point
   ========================================================================== */
console.log('\nMiss detection');
{
  const st = createState(mulberry32(5));
  st.events.length = 0;
  st.phase = 'rally';
  Object.assign(st.ball, { x: 0.9, y: 0.9, z: 0.012, vx: 0, vy: 0, vz: -0.85, cx: 0, cy: 0, speed: 0.85 });
  Object.assign(st.player, { x: -0.9, y: -0.9 });
  step(st, { px: -0.9, py: -0.9 });
  check('ball past the player plane outside the paddle -> computer scores',
    st.score.ai === 1 && st.score.player === 0 && st.phase === 'point',
    `score ${st.score.player}-${st.score.ai} phase=${st.phase}`);
  check('point event names the computer as winner',
    st.events.some(e => e.t === 'point' && e.winner === 'ai'));
}
{
  const st = createState(mulberry32(6));
  st.events.length = 0;
  st.phase = 'rally';
  Object.assign(st.ball, { x: 0.95, y: 0.95, z: 0.995, vx: 0, vy: 0, vz: 2.0, cx: 0, cy: 0, speed: 2.0 });
  Object.assign(st.ai, { x: -0.95, y: -0.95 });
  step(st, { px: 0, py: 0 });
  check('ball past the computer plane outside its paddle -> player scores',
    st.score.player === 1 && st.score.ai === 0 && st.phase === 'point',
    `score ${st.score.player}-${st.score.ai} phase=${st.phase}`);
  check('point event names the player as winner',
    st.events.some(e => e.t === 'point' && e.winner === 'player'));
}
{
  const st = createState(mulberry32(6));
  st.events.length = 0;
  st.phase = 'rally';
  Object.assign(st.ball, { x: 0.5, y: -0.2, z: 0.012, vx: 0, vy: 0, vz: -0.85, cx: 0, cy: 0, speed: 0.85 });
  Object.assign(st.player, { x: 0.5, y: -0.2 });
  step(st, { px: 0.5, py: -0.2 });
  check('ball inside the paddle rect is returned, not a miss',
    st.score.ai === 0 && st.phase === 'rally' && st.ball.vz > 0);
}

/* ===========================================================================
   4) MATCH & DEUCE CANON — first to 11, win by 2, serve rotation
   ========================================================================== */
console.log('\nMatch & deuce canon');
{
  const st = createState(mulberry32(8));
  st.score = { player: 10, ai: 10 };
  awardPoint(st, 'player');                              // 11-10
  check('11-10 is NOT game over (win by 2)', st.phase === 'point' && !st.winner,
    `phase=${st.phase}`);
  awardPoint(st, 'player');                              // 12-10
  check('12-10 IS game over, player wins', st.phase === 'over' && st.winner === 'player',
    `phase=${st.phase} winner=${st.winner}`);
}
{
  const st = createState(mulberry32(9));
  st.score = { player: 10, ai: 10 };
  awardPoint(st, 'ai'); awardPoint(st, 'ai');            // 10-12
  check('10-12 is game over, computer wins', st.phase === 'over' && st.winner === 'ai');
}
{
  const st = createState(mulberry32(10));
  st.score = { player: 10, ai: 5 };
  awardPoint(st, 'player');                              // 11-5
  check('11-5 is a straight win', st.phase === 'over' && st.winner === 'player');
}
{
  const st = createState(mulberry32(11));
  st.score = { player: 10, ai: 10 };
  awardPoint(st, 'player'); awardPoint(st, 'ai');        // 11-11
  check('11-11 keeps playing', st.phase !== 'over');
  check('11-11 reads as deuce', isDeuce(st.score) === true);
  check('10-10 reads as deuce too', isDeuce({ player: 10, ai: 10 }) === true);
  check('9-9 is not deuce', isDeuce({ player: 9, ai: 9 }) === false);
  check('matchWinner null mid-game', matchWinner({ player: 8, ai: 6 }) === null);
}
{ // serve rotation: two each, then one each at deuce
  const seq = [
    [{ player: 0, ai: 0 }, 'player'], [{ player: 1, ai: 0 }, 'player'],
    [{ player: 1, ai: 1 }, 'ai'],     [{ player: 2, ai: 1 }, 'ai'],
    [{ player: 2, ai: 2 }, 'player'],
    [{ player: 10, ai: 10 }, 'player'], [{ player: 11, ai: 10 }, 'ai'],
    [{ player: 11, ai: 11 }, 'player'], [{ player: 12, ai: 11 }, 'ai'],
  ];
  check('serve alternates in blocks of 2, then every point at deuce',
    seq.every(([s, who]) => serverFor(s, 'player') === who),
    seq.map(([s, w]) => `${s.player}-${s.ai}:${serverFor(s, 'player')}!=${w}`).join(' '));
}

/* ===========================================================================
   5) DETERMINISM — same seed + same scripted inputs -> identical match log
   ========================================================================== */
console.log('\nDeterminism');
{
  // a wandering, imperfect player script (pure function of step index)
  const script = (state, i) => ({
    px: Math.sin(i * 0.013) * 0.8,
    py: Math.cos(i * 0.007) * 0.6,
    serve: true,
  });
  const play = () => {
    const st = createState(mulberry32(99));
    st.events.length = 0;
    const stats = run(st, 60000, script);
    const b = st.ball;
    stats.log.push(`final|${st.phase}|${st.winner}|${st.score.player}-${st.score.ai}|` +
      `${b.x.toFixed(12)},${b.y.toFixed(12)},${b.z.toFixed(12)}`);
    return stats;
  };
  const a = play(), b = play();
  check('two runs, same seed + script -> identical event logs',
    a.log.join('\n') === b.log.join('\n'),
    `lengths ${a.log.length} vs ${b.log.length}`);
  check('the scripted match actually completed', a.log[a.log.length - 1].includes('over'),
    a.log[a.log.length - 1]);
  const c = (() => { const st = createState(mulberry32(100)); st.events.length = 0; return run(st, 60000, script); })();
  check('a different seed gives a different log', a.log.join() !== c.log.join());
}

/* ===========================================================================
   6) LONG RALLY — perfect player vs AI sustains a 50+ hit rally cleanly
   ========================================================================== */
console.log('\nLong rally (perfect player)');
{
  const st = createState(mulberry32(2024));
  st.events.length = 0;
  let maxRally = 0, bad = 0, steps = 0;
  while (steps < 40000 && maxRally < 60) {
    step(st, perfect(st));
    steps++;
    const b = st.ball;
    if (Math.abs(b.x) > 1 + 1e-9 || Math.abs(b.y) > 1 + 1e-9 ||
        b.z < -1e-9 || b.z > 1 + 1e-9) bad++;
    if (st.rally > maxRally) maxRally = st.rally;
    st.events.length = 0;
    if (st.phase === 'over') break;
  }
  check('a perfect player sustains a rally of >= 50 hits', maxRally >= 50,
    `max rally ${maxRally} in ${steps} steps`);
  check('no invariant violations during the long rally', bad === 0, `${bad} violations`);
  check('ball speed stayed capped', st.ball.speed <= DEFAULTS.maxSpeed + 1e-9,
    `speed=${st.ball.speed}`);
}

/* ===========================================================================
   7) HELPERS
   ========================================================================== */
console.log('\nHelpers');
{
  check('fold() reflects like the walls do',
    approx(fold(1.5), 0.5) && approx(fold(-1.2), -0.8) && approx(fold(3.5), -0.5) &&
    approx(fold(0.3), 0.3));
  check('clamp() clamps', clamp(5, -1, 1) === 1 && clamp(-5, -1, 1) === -1 && clamp(0.5, -1, 1) === 0.5);
  const st = createState(mulberry32(1));
  check('aiSkill starts gentle and is bounded', aiSkill(st) === 0 && aiSkill({ ...st, rally: 999 }) === 1);
  check('aiMaxSpeed grows with skill',
    aiMaxSpeed({ ...st, rally: 999 }) > aiMaxSpeed(st));
}

/* ========================================================================== */
console.log(failures === 0 ? '\nPASS — all checks green.' : `\nFAIL — ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
