# Fantasy Refresh — roadmap

Plain-language plan so each session starts current. Dates are targets, not promises.
Detailed engineering notes live in `CLAUDE.md`; this is the "where are we headed" view.

## Launch milestones (commissioner)

- **Lite launch — 2027 (regular season):** other commissioners run their own leagues.
  Everything that currently assumes `fr_refresh26` / season 2026 must work per league:
  signup, league setup, join codes, rules, dues tracking, scoring settings.
- **Full launch — 2027 playoffs:** playoff formats and the per-league playoff schedule
  solid; yardage bonuses back for the playoff game (see below).
- **Full-full launch — 2028:** real scale — many leagues, real money (if we go there),
  hardened security, monitored load and cost.

## Backlog, by phase

### Now / offseason — make the build faster and safer to work on
- **Testing harness in CI** — the fake-data Playwright harness (contrast, navigation,
  per-page screenshots in light+dark) lives in the scratchpad today and is rebuilt each
  session. Move it into the repo so every PR gets screenshots and a readability/nav check.
- **Routine health checks** (scheduled, report-only): Wed (salaries built, draft open),
  Thu post-kickoff (no locked player in any lineup), Tue (final scores match box scores +
  Last One Standing eliminated the right team), weekly dues (counts only). Decision pending:
  ping the commissioner each run, or only when something's off.
- **Client error reporting** — log page errors (no PII) to the DB so breakage is visible
  without waiting for a screenshot (the My Leagues / lineup bugs were only found that way).
- **Keep `CLAUDE.md` + this file current** — ongoing.

### Before lite launch (2027)
- **Staging environment** — separate test DB + preview site so changes are tried on
  realistic data before real leagues see them (today the only real test is live).
- **Break up `league.html`** (~12.6k lines: standings, playoffs, chat, dues, commissioner
  tools) into pieces, gradually and with tests — the biggest single thing slowing changes.
- **Remove single-league assumptions** — anywhere `fr_refresh26` / 2026 is hard-coded.
- **Commissioner account-recovery, full** — the "fix a member's email" button via the
  Cloudflare Worker (see `CLAUDE.md` open items). #31 (signup typo guard) and #33 (flag +
  send-reset) are the first two parts.

### Before full launch (2027 playoffs → 2028)
- **Security:** replace the legacy all-access DB secret (`FIREBASE_AUTH_TOKEN`) with scoped
  credentials; remove the visible `COMM_PW` soft gate on `preseason.html` / `archive2025.html`;
  review security rules for many leagues; keep the admin service account tightly held.
- **Load & cost:** check Tank01 rate limits, DB usage, and the scoring cadence against many
  leagues before it bites mid-game.
- **Payments (decision):** if real entry fees run through the site, that needs a payment
  provider and a legal review — a commissioner decision; Claude can lay out options.
- **Yardage bonuses** for 2027 and the playoff game (+3 for 300+ pass / 100+ rush / 100+ rec),
  computed from yards in `calcDKPoints`, per league via `settings.scoring.*Bonus`; also update
  `cloudflare/worker.js` and the Tank01 projection request. (Removed for 2026 — never scored.)

## How the commissioner and Claude work best together
- Screenshots with the page + light/dark noted (already happening — saves real time).
- Group related requests so one PR covers them.
- Let the routine checks run instead of asking "can you confirm…" each week.
- Merge in dependency order when Claude flags it.
- Never paste secrets (keys, passwords) into chat — they go into GitHub Secrets by name.
