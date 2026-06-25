# Arline Arcade

A cozy, **ad-free** game arcade — built for Arline, who loves Solitaire and Uno.
No ads, no sign-ups, no tracking. Just open it and play.

🔗 **Live:** https://mansfieldplumbing.github.io/ArlineArcade/

## Games

| Game | Status | Notes |
|------|--------|-------|
| ♠ Solitaire (Klondike) | ✅ Playable | Tap-to-move + drag-and-drop, auto-finish, gold deck |
| ♥ Uno | ✅ Playable | 2–4 players vs. friendly computer opponents |
| ♦ Minesweeper | ✅ Playable | Self-contained applet |
| ♣ Painter | ✅ Playable | "flickpaint" — layered canvas |
| 🎲 Craps | 🚧 Planned | 3D dice on the felt — see [`ROADMAP.md`](ROADMAP.md) |

More games on the way — the plan lives in [`ROADMAP.md`](ROADMAP.md).

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
- **Painter** — the `flickpaint` canvas app, brought over and made standalone.
- **Minesweeper** — a self-contained HTML applet.
- **Playing cards** — number faces, gold frame, and the filigree back are original to
  this repo. The J/Q/K court figures are Byron Knoll's vector deck (**public domain**,
  via [`notpeter/Vector-Playing-Cards`](https://github.com/notpeter/Vector-Playing-Cards)).
  Regenerate the deck with `python3 tools/gen_deck.py` (see [`tools/`](tools/)).
