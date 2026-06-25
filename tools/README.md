# Deck build tools

Regenerates the playing-card images in `assets/cards/royal/` (52 faces + `back.png`).

```bash
python3 tools/gen_deck.py            # writes assets/cards/royal/*.png + a preview
```

## What it makes

- **Number cards A–10** — original bold faces: big rank top-left, a small suit pip
  under it (so the suit reads when cards overlap in a Solitaire fan), one big center
  suit, all inside a gaudy gold frame.
- **Court cards J/Q/K** — the classic English-pattern figures, framed in the same
  gold so they sit cohesively with the numbers.
- **Back** — an original crimson-and-gold filigree (lattice rosettes + corner
  fleurons + an "A" medallion for Arline). Not a copy of any branded back.

## Provenance / license

The court figures are **Byron Knoll's vector playing cards — public domain**,
mirrored at [`notpeter/Vector-Playing-Cards`](https://github.com/notpeter/Vector-Playing-Cards).
`court/<RANK><SUIT>_hi.png` are PNG renders of those public-domain SVGs; re-fetch with
`./fetch_courts.sh`. Everything else (number faces, frame, back) is original to this repo.
