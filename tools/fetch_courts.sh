#!/usr/bin/env bash
# Re-fetch the 12 court-card figures (J/Q/K x 4 suits) used by gen_deck.py.
# Source: notpeter/Vector-Playing-Cards -> Byron Knoll's vector deck, PUBLIC DOMAIN.
# The .svg are rendered to court/<RANK><SUIT>_hi.png (600x872) before gen_deck.py runs;
# committed PNG renders live alongside this script so you only need this if regenerating.
set -euo pipefail
cd "$(dirname "$0")/court"
base="https://raw.githubusercontent.com/notpeter/Vector-Playing-Cards/master/cards-svg"
for r in K Q J; do for s in H D S C; do
  curl -fsSL "$base/${r}${s}.svg" -o "${r}${s}.svg" && echo "got ${r}${s}.svg"
done; done
echo "Now render each *.svg to <name>_hi.png (white bg, ~600px wide) and run ../gen_deck.py"
