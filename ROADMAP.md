# Arline Arcade — Roadmap

The plan, the to-do list, and the house rules — all in one place.
Live site: https://mansfieldplumbing.github.io/ArlineArcade/

---

## ✅ Done & live

- **Solitaire (Klondike)** — tap-to-move *and* drag-and-drop, auto-finish, win screen.
  Logic verified by a 4,000-game Node simulation. Now with **Braid-style time powers**:
  ⟲ Rewind ×3 per game (cards visibly slide back in time) and ✦ Magic Shuffle ×1
  (reshuffles the *hidden* cards — with draw-1 unlimited recycles, shuffling only the
  stock would change nothing). Powers proven by `games/solitaire/sim.mjs`.
- **FreeCell** — all face-up, four free cells, supermove math, ⟲ Rewind ×3.
  Proven by a 2,000-game / 300k-move invariant sim.
- **Roulette** — European single-zero wheel on canvas, ball lands deterministically on
  the solved pocket (the craps-dice trick), chip betting + bankroll, friendly comp on
  bust. Payouts proven by a 20-million-spin Monte Carlo (house edge 2.70% ± 0.35%).
- **Bowling** — drag-to-aim, flick-to-bowl with hook, pseudo-3D lane, classic scorecard.
  Scoring proven against the canon (perfect 300, all-spares 150, kata game 133).
  Flick feel inspired by `iliagrigorevdev/bowling` (GPL-3.0) — gameplay reference only.
- **Basketball** — 60-second pop-a-shot, two-iron rim physics, streaks + ON FIRE,
  drifting hoop. Sim proves no rim tunneling and one-count makes.
- **Ping Pong** — Curveball-style golden tunnel rally vs. the machine, spin/curve from
  paddle movement. Sim-proven physics and deuce scoring.
- **Uno** — 2–4 players, friendly computer opponents, card-slide animations.
  Verified by a 5,000-game Node simulation.
- **Minesweeper** — self-contained applet.
- **Painter** — simplified for Arline: one canvas, ten big swatches, three brush sizes,
  eraser, undo, clear, save. (The 2,300-line pro paint studio is in git history.)
- **UI polish** — Material/Fluent pass: motion & elevation tokens, gold focus rings,
  ≥44px touch targets, acrylic sticky app bar, pressed states, staggered tile entrance.
  Chrome de-cluttered: no floating music button (one quiet pill in the home footer),
  no replay-intro button, no logo repeated on game pages.
- **The deck** — bold legible number cards, classic public-domain court figures,
  gaudy gold frames, and an original crimson-and-gold filigree back.
- **Always-fresh** — a service worker auto-updates the site and clears old cache, so
  Arline never has to. No more "clear your browser" phone calls.
- **House style** — green felt + Luxor gold, one shared theme contract in `app.css`.

---

## 🎲 Next up: **Craps** — "Big Vegas dice"

The headline. Original build, done carefully start-to-finish. Standard craps rules are
free to implement; we use [`skent259/crapssim`](https://github.com/skent259/crapssim)
(MIT) only as a correctness reference for how bets resolve.

### The centerpiece: 3D dice on the felt

The dice are the whole point — they should look **3D, shaded, and physically bounce on
the green felt**, then settle to show the roll.

- **Real 3D, no heavy engine.** Each die is a CSS `preserve-3d` cube — six pip faces,
  rotated in actual 3D space. This runs on Arline's tablet where WebGL stumbled (the
  intro), and needs no build step or libraries.
- **The bounce sells it.** A tumble keyframe spins the cube on all three axes while it
  arcs up and down; a soft **contact shadow** on the felt shrinks and darkens as the die
  rises and falls. That shadow is what makes the eye read "bouncing on a table."
- **Lands on the answer.** The tumble ends on a fixed orientation chosen so each die
  shows its rolled face — random result, deterministic landing.
- **Shaded, gaudy.** Ivory dice with gold-ringed pips (or gold dice for the high-roller
  vibe), beveled edges, a felt that has real texture instead of flat green.

### Game flow (the rules)

1. **Come-out roll.** 7 or 11 = win. 2, 3, 12 = "craps," lose. Anything else becomes
   the **point**.
2. **Point phase.** Roll the point again to win; roll a 7 first ("seven-out") to lose.
3. Repeat. The table tracks the point with a classic ON/OFF puck.

### Bets — MVP first, then expand

- **v1 (most-played core):** Pass Line, Pass Odds, Field, Place 6 & 8. Full come-out →
  point → resolve flow with correct payouts.
- **Later:** Come / Don't Pass / Don't Come, Big 6/8, Hardways, Any Seven, Horn.
- Friendly chip stack to bet with (play money — it's an arcade, not a casino).

### Build checklist

- [x] `games/craps/` scaffold (page + felt table + chrome that matches the arcade)
- [x] 3D dice component: cube, pip faces, tumble + bounce + contact shadow
- [x] Deterministic "land on value" + a real roll button (tap anywhere to roll)
- [x] Rules flow: come-out / point / seven-out with the ON/OFF puck and live status
- [ ] Bet layout + payouts for the v1 bet set
- [ ] Chip stack / bankroll + win/lose feedback
- [ ] **Verify** the bet-resolution with a Node simulation (like Uno & Solitaire)
- [ ] Gaudier Luxor reskin pass (tile is already on the home grid)

**Live now:** the dice + come-out/point flow are deployed — tap *Craps* on the home grid.
Betting is the next slice.

---

## 🛠️ Backlog (queued, roughly in priority order)

1. **Craps betting** — Pass Line, Pass Odds, Field, Place 6 & 8 with chips + bankroll
   (the dice + come-out/point flow are live; this is the next slice).
2. **Double Solitaire** — two independent games stacked to fill the screen, slim top
   bar (trim the "crust"), a single icon-only back button, realistic felt texture.
3. **Real card sounds** — drop in the shuffle/deal MP3s (replacing the chiptune
   "Nintendo peeps") under `assets/sounds/`.
4. **Intro — fix or cut.** It currently shows a green screen + a tiny button and never
   animates on the tablet. Either make the falling-cards animation actually run, or
   replace it with a quick logo flash. Leaning toward **cut/replace** for reliability.
   (The "Replay intro" footer button is already gone.)
5. **Slots** — "Super Slots" to match the logo. Way more gaudy/Luxor than any reference;
   chunky gold reels, big lever, celebratory wins.
6. **Gaudy reskin pass** — push the whole arcade further toward the Luxor / high-roller
   look across every game.
7. **NES applet** — the owner has a single-file `nes.html`; drop it into `games/nes/`
   and add a tile when it's in the repo.

---

## 🧱 Tech & house rules

- **Vanilla HTML/CSS/JS** — no React, no build step, no dependencies. Drops straight onto
  GitHub Pages.
- **Mobile-first** — everything has to feel right on Arline's tablet first.
- **Installable** (PWA) and **offline-capable** via the service worker.
- **IP hygiene** — ship only public-domain, CC0, MIT, or original artwork and code.
  No copyrighted shaders, decks, or branded card backs. Provenance gets written down
  (see `tools/README.md` for the deck).
- **Prove the logic** — game engines get a headless Node simulation run before they ship,
  so the rules are right without needing a browser to test by hand.
