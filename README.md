# Arline Arcade

A cozy, **ad-free** game arcade — built for Arline, who loves Solitaire and Uno.
No ads, no sign-ups, no tracking. Just open it and play.

🔗 **Live:** https://mansfieldplumbing.github.io/ArlineArcade/

## Games

| Game | Status | Notes |
|------|--------|-------|
| ♠ Solitaire (Klondike) | ✅ Playable | Tap-to-move + drag-and-drop, auto-finish, gold deck, ⟲ Rewind ×3 + ✦ Magic Shuffle ×1 |
| 🃏 FreeCell | ✅ Playable | All cards face-up, supermoves, ⟲ Rewind ×3 |
| ♥ Uno | ✅ Playable | 2–4 players vs. friendly computer opponents |
| ♦ Minesweeper | ✅ Playable | Self-contained applet |
| ♣ Painter | ✅ Playable | Simple finger painting — big swatches, undo, save |
| 🎲 Craps | ✅ Playable | 3D dice, come-out/point flow (betting on the roadmap) |
| 🎡 Roulette | ✅ Playable | European wheel, chips & bankroll, payouts sim-proven |
| 🎳 Bowling | ✅ Playable | Flick-to-bowl, ten frames, real scoring (sim-proven 300) |
| 🏀 Basketball | ✅ Playable | 60-second pop-a-shot, streaks, ON FIRE |
| 🏓 Ping Pong | ✅ Playable | Curveball-style golden tunnel, spin the ball past the machine |

Every game engine is proven by a headless Node simulation (`node games/<name>/sim.mjs`)
before it ships. More games on the way — the plan lives in [`ROADMAP.md`](ROADMAP.md).

## How it's built

Vanilla **HTML / CSS / JS** — no React, no build step, no dependencies.
Drop it on any static host (it runs straight on GitHub Pages) and it works.

The home page is a **shell**: a card grid that launches each game as a standalone
**cell** under `games/`. Every cell is its own self-contained page, so games can be
added or updated without touching the others.

```
/
├── index.html              ← the arcade (shell / launcher)
├── styles/app.css          ← shared theme (one CSS-variable contract)
├── assets/
│   ├── fonts/              ← Cascadia Code NF + Selawik (local, no CDN)
│   └── favicon.svg
├── manifest.webmanifest    ← installable as a PWA
└── games/
    ├── solitaire/         ← coming soon
    ├── uno/               ← coming soon
    ├── minesweeper/       ← playable
    └── painter/           ← playable (flickpaint)
```

## Run it locally

No tooling required — just a static server so module imports resolve:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Credits & recipes

The look and structure follow the same recipes as the sibling projects
[`art4quinn`](https://github.com/MansfieldPlumbing/art4quinn) and
[`MansfieldTeachesTyping`](https://github.com/MansfieldPlumbing/MansfieldTeachesTyping):
dark palette, warm-gold accent, Selawik display type, responsive card grid.

- **Fonts** — Cascadia Code (Nerd Font) and Selawik, both open-source from Microsoft.
- **Sound & music** — real sampled instrument hits (overdriven guitar, electric bass, tinkle bell)
  from the **FluidR3_GM** soundfont via [`gleitz/midi-js-soundfonts`](https://github.com/gleitz/midi-js-soundfonts)
  (**CC-BY 3.0**), a small set of per-note samples vendored under `assets/audio/` so the arcade stays
  fully offline — layered with original synthesized drums. The three background grooves (Rock / Reggae /
  Bossa) are original arrangements. No CDN, no streaming, no GPL audio libraries.
- **Painter** — the `flickpaint` canvas app, simplified into a big-buttons finger-painting page.
- **Minesweeper** — a self-contained HTML applet.
- **Playing cards** — number faces, gold frame, and the filigree back are original to
  this repo. The J/Q/K court figures are Byron Knoll's vector deck (**public domain**,
  via [`notpeter/Vector-Playing-Cards`](https://github.com/notpeter/Vector-Playing-Cards)).
  Regenerate the deck with `python3 tools/gen_deck.py` (see [`tools/`](tools/)).
- **Craps** — rules cross-checked against [`skent259/crapssim`](https://github.com/skent259/crapssim) (MIT), correctness reference only.
- **Bowling** — flick-to-bowl feel inspired by [`iliagrigorevdev/bowling`](https://github.com/iliagrigorevdev/bowling) (GPL-3.0), **gameplay reference only** — all code original.
- **Basketball** — gravity-arc technique reference [`lamesjim/Canvas-Basketball-Game`](https://github.com/lamesjim/Canvas-Basketball-Game) (MIT); all code original.
- **Roulette** — wheel order, colors, and the 2.70% house edge verified against public references; all code original.
- **Ping Pong** — the classic *Curveball* concept as mechanics reference; spin/speed feel cross-checked against [`jakesgordon/javascript-pong`](https://github.com/jakesgordon/javascript-pong) (MIT). All code original.
