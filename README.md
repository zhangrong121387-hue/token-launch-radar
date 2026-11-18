# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zhangrong121387-hue/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zhangrong121387-hue/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of the protocol universe, finds the protocols that record no token yet, prices each one's launch with a peer market-cap/TVL multiple model, and ranks 198 of them on a dashboard that renders with no network. Every row carries its own valuation walk and a step-by-step farm plan, so a reader can see what a launch would be worth and what to do about it before it happens.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=959jz9cv&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## The model (peer-multiple-1)

A launch is priced the way the market already priced the launches that happened, using
only the snapshot's own figures:

- **Candidates.** A protocol is ranked when DefiLlama records no token for it (no market
  cap, no CoinGecko id, no symbol) and it is not a wrapped, staked or bridged product of a
  token that trades — the house's watchlist rule (no Bridge / Canonical Bridge / Liquid
  Staking / Liquid Restaking / Restaked BTC / CEX category, no versioned name, no whole
  word *wrapped/staked/staking*, no exchange-name prefix), applied to the whole snapshot.
  On this snapshot that is **198 protocols**: all 40 watchlist slugs at or above the $50M
  floor, plus 158 early protocols below it.
- **Peers.** The 119 token-bearing protocols (exchanges set aside) are the evidence. Each
  peer's market-cap/TVL ratio is winsorised to [0.01, 10]; the market-wide median is
  **0.246x**.
- **Multiple.** A category's multiple is its peers' median ratio, shrunk toward the
  market-wide median by peer count — `(n × category median + 5 × global median) / (n + 5)` —
  then clamped to [0.05, 2.5]. A category with many peers speaks for itself; a category
  with one peer borrows the market's voice.
- **Implied value.** `implied = round(TVL × multiple × growth × maturity)`, where growth is
  `1 + clamp(change_7d, −60, +120)/100 × 0.5` and maturity is
  `0.6 + min(age_days, 1095)/1095 × 0.4` (age from `listed_at` to the snapshot date; 365
  when unreported). The same function prices every row — no name is special-cased — and
  every row of `board.json` carries its own factors so the number can be checked from the
  figures beside it.
- **Farm plans.** Six steps per protocol, generated from its own record: the category's
  core action (a curated-vault deposit for Risk Curators, liquidity for Dexs, supply for
  Lending, margin for Derivatives, …), a position sized to its TVL, its first two chains,
  a weekly qualifying habit, a hold window set by its age, and an exit rule — each step
  with a cost and a time.
- **Live tokens** are never ranked: the dashboard's Live view shows the top token-bearing
  protocols at the market's own values, the peer book the multiples were learned from.

The model does not predict whether or when any protocol issues a token; an implied value
is this entry's claim from the snapshot's record, stated as such in the dashboard.

## Layout

```
main.ts                  the program: snapshot in, board + dashboard + dossier out
lib/model.ts             the candidate rule, the peer book, the pricing model, farm plans
vendor/makefun-board.ts  make.fun's dossier library, vendored unmodified
dashboard/               index.html, app.css, app.js — static, renders with no network
screenshots/             1-board.png, 2-detail.png, 3-filtered.png (1440×900)
LICENSE                  MIT
```

The dashboard renders entirely from `data.js` written beside it: search, category, chain
and TVL-band filters, a watchlist-only toggle, sortable columns, a per-protocol detail
view (`#p/<slug>`) showing the valuation walk and the farm plan, a filtered view
(`#f/<category>`), the Live view and a Method view that states the model in full.

## Status

Entered in make.fun's token-radar-01 bounty ("Build the best token launch radar") by @rong-zhang.
