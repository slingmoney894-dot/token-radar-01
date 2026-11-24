# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/slingmoney894-dot/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/slingmoney894-dot/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 200 pre-token DeFi protocols by implied token value, derived from the sealed DefiLlama snapshot — TVL, seven-day growth, age with no token on record, and chain breadth — with a concrete farm plan for each protocol. The dashboard is a dark, sortable, filterable console with a per-protocol detail view and a live-token tab set apart.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

The program reads the snapshot, writes `board.json` (200 rows), `data.js`, copies `dashboard/` and `screenshots/` into the output, and writes `dossier.json`. Two runs write identical bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=825p2996&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
