# svg_primitive — the deck, decomposed into reusable parts

Vector building blocks sliced out of `English_pattern_playing_cards_deck.svg`
(the public-domain Anglo-American / English pattern deck). Each file is a tight,
origin-cropped SVG that paints with `fill="currentColor"`, so you recolor a piece
just by setting CSS `color` — black, the house crimson, gold, anything.

```
ranks/   A 2 3 4 5 6 7 8 9 10 J Q K   — the corner index glyphs
suits/   spade heart diamond club     — the pip shapes
```

How they were isolated: the deck lays the 52 cards out as 52 top-level `<g>`
groups on a 13×4 grid (columns = rank A→K, rows = spade/heart/diamond/club). For
each card the rank glyph is the far-left top index and the pip is the clean
center symbol; everything is pulled by true rendered position, not by id.

Compose any card from a rank + a pip at whatever size/color/style you want — an
infinite number of stylized decks from one set of primitives. The royal (J/Q/K)
face figures are handled separately.
