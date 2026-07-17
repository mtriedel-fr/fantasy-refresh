# Fantasy Refresh — Salary Pricing Methodology
*Last calibrated: July 2026 — recalibrate if the cap, roster size, or scoring rules change*

This document exists so that if a commissioner, a player, or you six months from
now asks "how did you get to this price," there's a real, sourced answer rather
than "the code just did it."

---

## The model

Each player's weekly salary is calculated as:

```
salary = round_up( projected_points × POSITION_MULTIPLIER[position] , to next $100 )
salary = clamp( salary, SAL_MIN, SAL_MAX )
```

`projected_points` comes from Tank01's `/getNFLProjections` endpoint, calculated
using Fantasy Refresh's own scoring weights (not generic PPR) — see
`ARCHITECTURE.md` for the full scoring table. This means the projection itself
already reflects our league's rules (1 PPR, -1 INT, 2pt = 2, etc.) before any
salary math is applied.

## Why per-position multipliers, not one flat number

A single multiplier applied to every position produces a distorted market:
quarterbacks routinely project 18-27 points in a given week, while an elite
wide receiver projecting 20+ points is a monster outlier. A flat multiplier
prices those two players nearly identically — which doesn't match real
fantasy value.

QBs are priced *cheaper relative to their raw point projection* than
skill-position players, because of **roster construction scarcity**: a
lineup needs exactly one QB, but multiple WR/RB/FLEX slots. Rostering one
great QB is a smaller lineup advantage than rostering two or three great
skill-position players, so QB pricing is discounted relative to points
scored on purpose. Tight ends get the opposite treatment — priced lower not
due to scarcity, but because even elite TE performances rarely reach the
point ceiling that elite WR/RB performances do.

## Where the numbers came from

The multipliers were set by choosing a target dollar ceiling for an elite
weekly performance at each position, then solving for the multiplier that
produces that ceiling at a realistic elite-tier weekly projection (drawn
from real Tank01 2026 projection data):

```
multiplier = target_ceiling / elite_weekly_projection
```

| Position | Target ceiling | Elite weekly proj (real 2026 data) | Multiplier |
|---|---|---|---|
| QB  | ~$9,400  | 27 pts (Lamar Jackson / Joe Burrow tier) | **350** |
| RB  | ~$10,700 | 20 pts (Bijan Robinson tier) | **525** |
| WR  | ~$11,300 | 22 pts (CeeDee Lamb / elite WR1 tier) | **505** |
| TE  | ~$7,400  | 14 pts (elite TE ceiling — structurally lower than WR/RB) | **510** |
| DEF | ~$5,000  | 10 pts | **500** |

These are the `POSITION_MULTIPLIERS` values used in the salary engine.

## What this deliberately does NOT do

- **It doesn't chase real-time market pricing.** This re-prices once, on
  the Wednesday automation, based purely on that week's Tank01 projection —
  not adjusted multiple times a week for injury news or shifting demand.
- **It hasn't been validated across a full season.** This calibration is
  based on Week 1 2026 projection data and two rounds of internal
  stud-affordability testing (see below). If, after a few real weeks,
  prices still feel off at a specific position (e.g. TEs still bunching at
  the floor, or RBs feeling underpriced relative to WRs), that's a signal
  to revisit the multiplier for that position specifically — not the whole
  model.

## How to recalibrate later

1. Pick a target elite-tier ceiling for each position (what should the
   single most expensive player at that position cost, roughly, against
   the $60,000 cap).
2. Find that week's real Tank01 projection for a genuinely elite player at
   that position.
3. Solve `multiplier = target_ceiling / elite_projection`.
4. Run the stud-affordability test below (pick N real elite players, price
   them, fill the rest of the roster at the salary floor, check the total
   against the cap) to confirm the resulting multiplier actually produces
   the roster-construction ceiling you want.
5. Update `POSITION_MULTIPLIERS` in all three code locations (see below).

## Floor recalibration (added after initial launch testing)

**The problem found:** the original $3,700 floor was cheap enough that a
roster could "punt" 5 of 9 slots to bare-floor players and still afford 4
genuine studs — an elite QB, two workhorse RBs, and a true WR1 — with real
cap room to spare:

```
4 studs (Lamar Jackson, Saquon Barkley, Bijan Robinson, CeeDee Lamb) = $38,600
5 floor-priced punts (5 x $3,700)                                    = $18,500
Total: $57,100 vs $60,000 cap — $2,900 left over
```

That's a genuinely "loaded" team, comfortably affordable — not the edge
case a salary cap is supposed to prevent, but the *easy* path.

**Why the ceiling wasn't the problem.** A literal "best player at every
position" roster (9 true elites) already fails to fit — it totals ~$77,400
against the $60,000 cap, a $17,400 overage. The exploit wasn't at the top
of the market; it was that punting the *bottom* of the roster was too
cheap, effectively subsidizing stacking at the top.

**The fix:** raised `SAL_MIN` from $3,700 to $4,500 — the break-even point
for the exact 4-stud-plus-5-punt pattern above is $4,300; $4,500 adds a
small real margin rather than leaving it razor-thin. The same math applies
to any similar N-stud-plus-(9-N)-punt pattern — raising the floor tightens
all of them together, not just the specific 4-stud case used to find it.

**The honest tradeoff:** this compresses price differentiation among
cheap/bench players — a wider range of low-projection players now cluster
at the same $4,500 floor than did at $3,700. That's a real cost, but a
smaller one than leaving the stud-stacking pattern open. If floor
compression becomes its own complaint later, the lever to revisit is here,
not the position multipliers above.

**How to re-test this if the multipliers ever change:** rerun the
4-stud-plus-5-punt calculation (or whatever punt count matches the current
roster size) against the current `SAL_MIN` and confirm it no longer fits
under the cap with room to spare. If it does, the floor needs raising
again, proportional to how much room was found.

## Round-up + multiplier recalibration (targeting a 3-stud ceiling)

**The ask:** even after the floor fix above, 4 real studs (elite QB + 2
workhorse RBs + a true WR1) still fit comfortably with room to spare. The
goal was to bring that down to a hard ceiling of 3 studs, and to give
mid-tier players (a real WR2, a committee-lead RB) more separation from
the salary floor instead of everything below "elite" collapsing toward
the same price.

**Two changes together:**

1. **Rounding changed from nearest-$100 to next-$100 up.** Every
   calculated salary now rounds up, never down — a small, compounding tax
   on every single player, elite or not, rather than a one-time policy
   change at the top of the market.
2. **Every position multiplier raised**: QB 325→350, RB 510→525,
   WR 485→505, TE 505→510, DEF 480→500.

**Verified result**, re-running the same stud-plus-punt test used to find
the original floor problem:

```
3 studs (elite QB + 2 elite RB) + 6 floor punts = $56,100 — FITS, $3,900 to spare
4 studs (+ 1 elite WR)          + 5 floor punts = $62,900 — OVER by $2,900
5 studs                          + 4 floor punts = $68,600 — OVER by $8,600
```

3 fits, 4 doesn't, 5 is far out of reach — matches the requested ceiling.

**Mid-tier separation, checked against real players:**

| Player | Real proj | New price | Above floor |
|---|---|---|---|
| DJ Moore (solid WR2) | 16.55 | $8,400 | +$3,900 |
| Chase Brown (RB2) | 17.53 | $9,300 | +$4,800 |
| Michael Pittman Jr. (WR2) | 12.49 | $6,400 | +$1,900 |
| Josh Downs (WR3/slot) | 11.76 | $6,000 | +$1,500 |
| Kareem Hunt (committee RB) | 6.64 | $4,500 | floor |
| Cedrick Wilson Jr. (deep bench) | 0.23 | $4,500 | floor |

Real WR2/RB2-tier contributors now sit meaningfully above the floor,
distinct from genuine bench/committee players — the "lift the middle
tier" goal from the original ask.

**If this needs another pass:** the same stud-plus-punt test is the right
tool — pick the current week's real elite players at each position, price
them, add floor-priced punts for the remaining slots, and check against
the cap. If 3 studs stops fitting, multipliers went too far; if 4 fits
again, they need to go further.

## QB and TE recalibration (raised — elite QB/TE were too cheap)

**The ask:** elite QBs and TEs should cost more than they did. At the
previous multipliers (QB 350, TE 510), an elite QB (27pt proj) priced at
$9,500 and an elite TE (14pt proj) priced at $7,200 — both well under the
$11,300 ceiling, with room to spare.

**The change:** QB 350→400, TE 510→630. RB, WR, and DEF unchanged.

| | Old price | New price |
|---|---|---|
| Elite QB (27pt) | $9,500 | $10,800 |
| Elite TE (14pt) | $7,200 | $8,900 |
| Mid QB (20pt) | $7,000 | $8,000 |
| Mid TE (9pt, replacement-tier) | $4,600 | $5,700 |

**Re-verified the 3-stud ceiling still holds** — this recalibration made it
slightly *tighter*, not looser, since a stud QB now costs more:

```
3 studs + 6 punts = $57,500 — FITS, $2,500 to spare
4 studs + 5 punts = $64,300 — OVER by $4,300
```

**Quick follow-up tick-down:** QB 400→380, TE 630→575 — the QB raise had
gone slightly too far, pricing an elite QB ($10,800) above elite RB
($10,700), which wasn't the intent. At 380, elite QB ($10,300) sits below
elite WR (hits the $11,300 ceiling) and just above elite RB ($10,000) —
QB no longer leads the pack. TE ticked down proportionally to $8,100
(from $8,900), still a real increase from the original 510/$7,200, just
not as steep as the first pass. 3-stud ceiling re-verified and still
holds ($3,100 to spare at 3 studs, $3,700 over at 4).

**Final TE calibration:** TE 575→525. The issue: at 575, a mid-tier TE
(10 projected points) priced at $5,800 — more than an equally productive
mid-tier RB ($5,300) or WR ($5,100) scoring the identical 10 points. TE's
elite ceiling being lower than RB/WR is appropriate (14pt elite TE vs
19-22pt elite RB/WR), but a *mediocre* TE shouldn't cost more than an
equally productive RB or WR. At 525 — identical to RB's own multiplier —
that mid-tier TE now prices at exactly $5,300, matching RB precisely at
the same point total. Elite TE comes down to $7,400 (from $8,900).

## Where this is implemented in code

The per-position multiplier table lives in three places, kept in sync
manually (no shared salary-engine module exists yet — see the earlier
codebase review's note on `league.html`/`index.html` duplication):

- `.github/workflows/weekly-prep.yml` — the automated Wednesday generator (source of truth for live pricing)
- `league.html` — manual "Generate Salaries" commissioner button
- `index.html` — legacy page, kept in sync pending its retirement decision
