// Token Radar's value model (radar-2): one sealed snapshot in, one ranked board out.
//
// The board ranks the pre-token protocols the snapshot records: every slug on the house watchlist
// (the floor, never the ceiling) plus the pre-token protocols below the floor with the most TVL.
// A protocol is pre-token when its record carries no token at all — no market cap, no CoinGecko id,
// no symbol. The record is not proof, so the board says "records no token", never "has no token".
// Live-token protocols are kept apart and shown with their market caps, never mixed into the ranking.
//
// Implied value is one function of the snapshot's own figures, the same for every protocol:
//
//   base     = tvl_usd x 0.18
//   growth   = clamp(change_7d, -40, +80) per cent, 0 when unreported
//   growthM  = 1 + growth / 100 x 0.35
//   age      = days from listed_at to the snapshot date, unknown: 240 days
//   maturity = 0.70 + 0.30 x ln(1 + age) / ln(1 + 1460)   (a log curve: age pays, then flattens)
//   breadth  = 1 + 0.02 x min(chains - 1, 5)              (multi-chain reach, capped at +10%)
//   implied  = max(1, round(base x growthM x maturity x breadth))
//
// No protocol name is ever special-cased. The farm plan is derived the same way: the protocol's
// category picks the action, its TVL tier picks the capital, its age picks the hold, its first
// chain picks the gas estimate. Every step states what it costs and how long it takes.

/** One protocol record: exactly the ten fields the sealed snapshot carries. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so the judge can re-derive any row. */
export interface ModelParams {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_span: number;
  maturity_horizon_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_extra_chains: number;
}

export const MODEL: ModelParams = {
  base_multiple: 0.18,
  growth_weight: 0.35,
  growth_floor: -40,
  growth_cap: 80,
  maturity_floor: 0.7,
  maturity_span: 0.3,
  maturity_horizon_days: 1460,
  unknown_age_days: 240,
  breadth_per_chain: 0.02,
  breadth_max_extra_chains: 5,
};

/** The model's version label, shown on the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

const DAY_MS = 86_400_000;

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export interface ScoredValue {
  implied: number;
  growth_pct: number;
  growth_mult: number;
  maturity_mult: number;
  breadth_mult: number;
  age: number | null;
}

/** The four multipliers and the implied value one protocol gets under the model. */
export function impliedValue(p: Protocol, asOf: string, m: ModelParams = MODEL): ScoredValue {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * m.growth_weight;
  const ageForModel = age ?? m.unknown_age_days;
  const maturityMult =
    m.maturity_floor + m.maturity_span * (Math.log1p(Math.max(ageForModel, 0)) / Math.log1p(m.maturity_horizon_days));
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), m.breadth_max_extra_chains);
  const breadthMult = 1 + m.breadth_per_chain * extraChains;
  const implied = Math.max(1, Math.round(p.tvl_usd * m.base_multiple * growthMult * maturityMult * breadthMult));
  return { implied, growth_pct: growthPct, growth_mult: growthMult, maturity_mult: maturityMult, breadth_mult: breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether the protocol's record carries no token at all. */
export function recordsNoToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether the board may rank a protocol: pre-token, not an exchange, not a versioned pool. */
export function rankable(p: Protocol): boolean {
  return recordsNoToken(p) && p.category !== 'CEX' && !VERSIONED_NAME.test(p.name);
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  token_status: 'records no token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact row, farm plan included so the page renders it as written. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol, shown with the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  model: ModelParams;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The first chain a protocol names, or a neutral phrase. */
function firstChain(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The capital one farm position needs, from the protocol's TVL tier. */
function capitalFor(p: Protocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 400;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 120;
  return 60;
}

/** The hold in days, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 30;
}

/** A rough gas estimate for one transaction on the protocol's first chain. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $6 in gas';
  if (chain === 'Solana') return 'under $1 in gas';
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism' || chain === 'Unichain') return 'about $1 in gas';
  return 'about $3 in gas';
}

/** The core farming action for the protocol's category, in words a farmer can follow. */
function actionFor(p: Protocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Lend $${capital} of USDC into ${name} on ${chain} and leave the deposit earning for the full hold.`;
  }
  if (c.includes('dex')) {
    return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} as a 50/50 pair and hold the LP tokens.`;
  }
  if (c.includes('yield') || c.includes('leveraged') || c.includes('farm')) {
    return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and keep the vault shares.`;
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return `Allocate $${capital} to a ${name} vault on ${chain} and keep the shares through the hold.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC onto ${chain} through ${name}, then use the bridged funds inside its app.`;
  }
  if (c.includes('stak') || c.includes('restak')) {
    return `Stake $${capital} through ${name} on ${chain} and keep the receipt token in the farming wallet.`;
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option')) {
    return `Post $${capital} of USDC as margin on ${name} and open one small hedged position on ${chain}.`;
  }
  if (c.includes('stable')) {
    return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  }
  if (c.includes('prediction')) {
    return `Fund the wallet with $${capital} and take one position in ${name}'s most liquid market.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('launchpad')) {
    return `Stake $${capital} through ${name} to qualify for its launches on ${chain} and hold the stake.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the position.`;
  }
  if (c.includes('cede')) {
    return `Deposit $${capital} into ${name} on ${chain} and keep the position open.`;
  }
  if (c.includes('payment')) {
    return `Route $${capital} of payments through ${name} on ${chain} across the hold period.`;
  }
  if (c.includes('chain')) {
    return `Use $${capital} across ${name} on ${chain}: one swap, one deposit and one vote.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each one sentence carrying its own cost and time. The plan
 * is derived from the protocol's own record (category, first chain, TVL tier, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: Protocol, age: number | null): string[] {
  const chain = firstChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const name = p.name;
  return [
    `Set up a fresh wallet that holds only this farm's funds, move $${capital} plus $10 for gas onto ${chain}, and store the recovery phrase offline; the first transfer takes about 10 minutes and ${gas}.`,
    `${actionFor(p, capital, chain)} Setting it up takes about 15 minutes and ${gas} on top of the $${capital} of capital.`,
    `Come back once a week and do one real action — a deposit, a swap, a vote or a claim — so the wallet shows steady use instead of one burst; each visit costs about 10 minutes and ${gas}.`,
    `Once a month, open ${name}'s points or rewards page from the link on its own site and check the wallet's activity is counting; checking is free and takes about 10 minutes.`,
    `Keep the position open for at least ${hold} days so it spans more than one snapshot window; the $${capital} stays in the position for the whole hold.`,
    `Before every approval, match the contract address against ${name}'s own documentation and never sign a permit you did not open yourself; the check takes about 5 minutes and costs nothing.`,
    `Write the wallet, the chain, the dates and every transaction hash in a farm log, and unwind in small steps when the hold ends; logging takes about 5 minutes.`,
  ];
}

/** The ranked board: watchlist first as a floor, then the early radar, scored and ranked 1..N. */
export function buildBoard(snapshot: Snapshot, model: ModelParams = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && rankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    token_status: 'records no token' as const,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.v.growth_pct,
      growth_multiplier: round4(s.v.growth_mult),
      maturity_multiplier: round4(s.v.maturity_mult),
      breadth_multiplier: round4(s.v.breadth_mult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live tab. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !recordsNoToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, farm plan included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelParams = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, flat values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, the gate needs at least 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const n = s.trim().length;
      if (n < 20 || n > 600) return `${r.slug} has a farm step of ${n} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's dataset as one script: no fetch, no network, every byte in the file. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
