# Fantasy Refresh — Salary Pricing Methodology
*Last calibrated: July 2026 — recalibrate if the cap, roster size, or scoring rules change*

This document exists so that if a commissioner, a player, or you six months from
now asks "how did you get to this price," there's a real, sourced answer rather
than "the code just did it."

---

## The model

Each player's weekly salary is calculated as:

```
salary = round( projected_points × POSITION_MULTIPLIER[position] , to nearest $100 )
salary = clamp( salary, SAL_MIN, SAL_MAX )
```

`projected_points` comes from Tank01's `/getNFLProjections` endpoint, calculated
using Fantasy Refresh's own scoring weights (not generic PPR) — see
`ARCHITECTURE.md` for the full scoring table. This means the projection itself
already reflects our league's rules (1 PPR, -1 INT, 2pt = 2, etc.) before any
salary math is applied.

## Why per-position multipliers, not one flat number

A single multiplier applied to every position doesn't match how real salary-cap
DFS platforms (DraftKings, FanDuel) price players, and produces a distorted
market: quarterbacks routinely project 18-27 points in a given week, while an
elite wide receiver projecting 20+ points is a monster outlier. A flat
multiplier prices those two players nearly identically — which is not how
either real DFS platform, or real fantasy value, works.

Real DFS platforms price QBs *cheaper relative to their raw point projection*
than skill-position players, because of **roster construction scarcity**: a
lineup needs exactly one QB, but multiple WR/RB/FLEX slots. Rostering one great
QB is a smaller lineup advantage than rostering two or three great skill-position
players, so the market (and DK/FD's proprietary pricing algorithms) discounts QB
pricing relative to points scored. Tight ends get the opposite treatment — priced
lower not due to scarcity, but because even elite TE performances rarely reach
the point ceiling that elite WR/RB performances do.

## Where the numbers came from

We don't have access to DraftKings' or FanDuel's actual pricing algorithm (it's
proprietary and not published). What we have is their **observable output** —
real salary data from actual DK slates — which we used to reverse-engineer
multipliers that produce a similar shape, scaled to our cap.

**Source data** (DraftKings NFL Classic, $50,000 salary cap, 9-player roster —
same roster size as Fantasy Refresh):

| Position | Observed DK ceiling (real slate data) | Source |
|---|---|---|
| QB  | ~$7,300 (Tua Tagovailoa, 2024 Wk1 slate) | ftnfantasy.com Week 1 DK salary coverage |
| RB  | ~$8,500 (historical elite-RB ceiling, e.g. Kamara/Bell tier) | RotoGrinders DK salary analysis |
| WR  | ~$8,900 (CeeDee Lamb, 2024 Wk1 slate — most expensive player on the slate) | ftnfantasy.com Week 1 DK salary coverage |
| TE  | ~$5,900–6,900 (Dalton Kincaid 2024 / historical Gronkowski-tier) | ftnfantasy.com, RotoGrinders |

## Scaling to our cap

Fantasy Refresh uses a **$60,000** cap vs. DraftKings' **$50,000** — a 1.2×
ratio. Every DK reference ceiling above was scaled by 1.2× before deriving our
multiplier, so our top prices sit in the same *relative* position within our
cap that DK's do within theirs.

```
scaled_target = dk_observed_ceiling × 1.2
```

## Deriving the multiplier

For each position, we paired the scaled dollar ceiling with a realistic "elite
weekly projection" for that position (drawn from real Tank01 2026 projection
data — see the Week 1 sample pulled July 2026), then solved for the multiplier
that would produce that ceiling at that projection level:

```
multiplier = scaled_target_ceiling / elite_weekly_projection
```

| Position | Scaled ceiling ($60k cap) | Elite weekly proj (real 2026 data) | Multiplier |
|---|---|---|---|
| QB  | $8,760  | 27 pts (Lamar Jackson / Joe Burrow tier) | **325** |
| RB  | $10,200 | 20 pts (Bijan Robinson tier) | **510** |
| WR  | $10,680 | 22 pts (CeeDee Lamb / elite WR1 tier) | **485** |
| TE  | $7,080  | 14 pts (elite TE ceiling — structurally lower than WR/RB) | **505** |
| DEF | $4,800  | 10 pts | **480** |

These are the `POSITION_MULTIPLIERS` values used in the salary engine. Min/max
clamps stay the same as before ($3,700 floor / $11,300 ceiling) — the
per-position multiplier means most positions will naturally land within that
range at realistic projections, rather than every above-average player
slamming into the ceiling (the bug this recalibration fixes).

## What this deliberately does NOT do

- **It does not attempt to replicate DK/FD's algorithm exactly** — that's not
  possible, since it's proprietary. This reproduces the observable *shape* of
  their pricing (QB discount, TE ceiling suppression, WR/RB parity) using our
  own projection source, not their internal logic.
- **It is not adjusted week-to-week the way DK/FD prices are** — real DFS
  platforms re-price based on recent performance, injury news, and market
  demand multiple times per week. Ours re-prices once, on the Wednesday
  automation, based purely on that week's Tank01 projection.
- **It has not been validated across a full season** — this calibration is
  based on Week 1 2026 projection data and historical DK reference points. If,
  after a few real weeks, prices still feel off at a specific position (e.g.
  TEs still bunching at the floor, or RBs feeling underpriced relative to
  WRs), that's a signal to revisit the multiplier for that position
  specifically — not the whole model.

## How to recalibrate later

1. Pull a real, current DraftKings NFL Classic salary sheet (any week works).
2. Note the top 3-5 salaries at each position.
3. Scale by `(our_cap / 50000)`.
4. Find that week's Tank01 projection for those same players.
5. Solve `multiplier = scaled_salary / projection` for each, average across
   the sample.
6. Update `POSITION_MULTIPLIERS` in all three code locations (see below).

## Where this is implemented in code

The per-position multiplier table lives in three places, kept in sync
manually (no shared salary-engine module exists yet — see the earlier
codebase review's note on `league.html`/`index.html` duplication):

- `.github/workflows/weekly-prep.yml` — the automated Wednesday generator (source of truth for live pricing)
- `league.html` — manual "Generate Salaries" commissioner button
- `index.html` — legacy page, kept in sync pending its retirement decision
