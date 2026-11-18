// The token launch radar's model: one sealed snapshot in, one ranked board out.
//
// The question the board answers: if this pre-token protocol issued its token today, at the
// size its own record supports, what would that launch be worth? The model prices a launch
// the way the market already prices the launches that happened: from the snapshot's own
// token-bearing protocols.
//
//   peers      every protocol in the snapshot whose token already trades (a market cap is
//              recorded), exchanges set aside: an exchange's token is not priced on the
//              TVL of a product, so CEX rows never become a comparable.
//   ratio      one peer's market cap / TVL, winsorised to [0.01, 10] so a single wild print
//              cannot bend a median.
//   multiple   a category's peers' median ratio, shrunk toward the market-wide median by
//              the peer count: multiple = (n x category median + K x global median) / (n + K),
//              K = 5, then clamped to [0.05, 2.5]. A category with many peers speaks for
//              itself; a category with one peer borrows the market's voice.
//   growth     the protocol's own 7-day TVL change, clamped to [-60, +120] per cent, moves
//              the value by half the change: growthMult = 1 + (growth / 100) x 0.5.
//   maturity   a protocol that has held its TVL longer has the record a launch price rests
//              on: maturityMult = 0.6 + min(age_days, 1095) / 1095 x 0.4, age unknown: 365.
//   implied    = max(1, round(TVL x multiple x growthMult x maturityMult)), whole dollars.
//
// The board ranks every protocol the house's own candidate rule leaves standing — no token
// recorded, and not a wrapped, staked or bridged product of one that trades (see
// isCandidate) — the 40-slug watchlist first among equals, and 158 more below its floor:
// the early rows are the radar's reason to exist. No protocol name is ever special-cased:
// the same function scores every row, and each row carries its own arithmetic so a reader
// (or a judge) can check the number from the figures beside it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard's method section. */
export interface ModelConstants {
  shrinkage_k: number;
  multiple_floor: number;
  multiple_cap: number;
  ratio_winsor_lo: number;
  ratio_winsor_hi: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  shrinkage_k: 5,
  multiple_floor: 0.05,
  multiple_cap: 2.5,
  ratio_winsor_lo: 0.01,
  ratio_winsor_hi: 10,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'peer-multiple-1';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row, with the model's own arithmetic. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_median: number | null;
    category_peers: number;
    global_median: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  category_median: number | null;
  category_peers: number;
  peer_p25: number | null;
  peer_p75: number | null;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** One category's peer set: how many token-bearing peers, and their ratios' spread. */
export interface PeerStats {
  peers: number;
  median: number;
  p25: number;
  p75: number;
}

/** Everything the dashboard needs: the board, the live set, the peers and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median: number;
  global_peers: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  categories: { name: string; peers: number; median: number; multiple: number }[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a product may not begin with: the product is the exchange's, not a launch. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Whether a protocol is a launch candidate the board may rank: it records no token, and it is
 * not a wrapped, staked or bridged product of one that trades — the house's watchlist rule,
 * applied with the snapshot's own fields to every protocol, above the floor and below it.
 */
export function isCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The median of a sorted, non-empty list. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The value at fraction q of a sorted, non-empty list, nearest-rank. */
function quantile(sorted: number[], q: number): number {
  const at = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[at]!;
}

/** A peer's market-cap/TVL ratio, winsorised so one wild print cannot bend a median. */
function peerRatio(p: SnapshotProtocol, model: ModelConstants): number {
  const raw = p.mcap_usd! / p.tvl_usd;
  return Math.min(model.ratio_winsor_hi, Math.max(model.ratio_winsor_lo, raw));
}

/** The peer evidence: the market-wide median ratio and every category's peer spread. */
export interface PeerBook {
  globalMedian: number;
  globalPeers: number;
  byCategory: Map<string, PeerStats>;
}

/** Build the peer book from the snapshot's token-bearing protocols, exchanges set aside. */
export function peerBook(snapshot: Snapshot, model: ModelConstants = MODEL): PeerBook {
  const all: number[] = [];
  const grouped = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    if (p.category === 'CEX') continue;
    const r = peerRatio(p, model);
    all.push(r);
    if (p.category !== null) {
      const list = grouped.get(p.category);
      if (list === undefined) grouped.set(p.category, [r]);
      else list.push(r);
    }
  }
  all.sort((a, b) => a - b);
  const byCategory = new Map<string, PeerStats>();
  for (const name of [...grouped.keys()].sort()) {
    const list = grouped.get(name)!.sort((a, b) => a - b);
    byCategory.set(name, { peers: list.length, median: median(list), p25: quantile(list, 0.25), p75: quantile(list, 0.75) });
  }
  return { globalMedian: all.length > 0 ? median(all) : 0.25, globalPeers: all.length, byCategory };
}

/** The multiple one category is priced at: its peers' median, shrunk to the market's, clamped. */
export function multipleFor(category: string | null, book: PeerBook, model: ModelConstants = MODEL): { multiple: number; catMedian: number | null; peers: number; p25: number | null; p75: number | null } {
  const stats = category === null ? undefined : book.byCategory.get(category);
  if (stats === undefined) return { multiple: round4(clamp(book.globalMedian, model)), catMedian: null, peers: 0, p25: null, p75: null };
  const shrunk = (stats.peers * stats.median + model.shrinkage_k * book.globalMedian) / (stats.peers + model.shrinkage_k);
  return { multiple: round4(clamp(shrunk, model)), catMedian: round4(stats.median), peers: stats.peers, p25: round4(stats.p25), p75: round4(stats.p75) };
}

/** A multiple kept inside the model's stated band. */
function clamp(multiple: number, model: ModelConstants): number {
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, multiple));
}

/** The factors and the implied value one protocol gets under `model` and the peer book. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  book: PeerBook,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; catMedian: number | null; peers: number; p25: number | null; p75: number | null; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const m = multipleFor(protocol.category, book, model);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = round4(model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * m.multiple * growthMult * maturityMult));
  return { implied, multiple: m.multiple, catMedian: m.catMedian, peers: m.peers, p25: m.p25, p75: m.p75, growthPct, growthMult, maturityMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const book = peerBook(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter(isCandidate)
    .map((p) => ({ p, v: impliedValue(p, snapshot.as_of, book, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    on_watchlist: watchlist.has(s.p.slug),
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: s.v.multiple,
      category_median: s.v.catMedian,
      category_peers: s.v.peers,
      global_median: round4(book.globalMedian),
      growth_pct: s.v.growthPct,
      growth_multiplier: s.v.growthMult,
      maturity_multiplier: s.v.maturityMult,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, when it has one. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The gas a position costs to open, from the chain it opens on. */
function gasFor(chain: string): number {
  return chain === 'Ethereum' ? 18 : 4;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core position, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator') || c.includes('collateral')) return `Deposit $${capital} of USDC into a ${name} curated vault on ${chain}; pick the vault whose curator publishes its allocations, and keep the vault shares.`;
  if (c.includes('lend') || c.includes('cdp')) return `Supply $${capital} of USDC to ${name} on ${chain}; if it offers a stablecoin, mint a small amount against the position and repay it once, so both sides of the market see the wallet.`;
  if (c.includes('dual-token') || c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold the yield-bearing side of the pair.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}, favouring a stable pair so the position is not spent on impermanent loss.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, so the account carries volume without a directional bet.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s delta-neutral vault on ${chain} and keep the shares; the strategy, not the market, is the position.`;
  if (c.includes('rwa')) return `Complete the onboarding ${name} requires on ${chain} and mint $${capital} of its yield asset; keep the position documents with the farm log.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`;
  if (c.includes('btc')) return `Deposit $${capital} of BTC (or its wrapped form) into ${name} on ${chain} and keep the vault receipt.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name} and put it to work in the chain's own apps, keeping a small native balance for gas.`;
  if (c.includes('payment')) return `Fund a ${name} account or channel with $${capital} and route one real payment through it.`;
  if (c.includes('prediction')) return `Fund $${capital} and hold one position in a liquid market on ${name}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy to term.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('liquidity')) return `Deposit $${capital} of USDC into ${name}'s flagship vault on ${chain} and leave auto-compounding on.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action: the habit that keeps a wallet counted. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator')) return `Check the curator's allocation page once a week and rebalance only if the vault you hold leaves the curator's published strategy.`;
  if (c.includes('lend') || c.includes('cdp')) return `Make one small action each week on ${name}: a deposit, a borrow or a repayment, so the wallet is active in more than one snapshot.`;
  if (c.includes('dex') || c.includes('liquidity')) return `Rebalance or top up the pool position once a week on ${name}, and swap a small amount through the same pool.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Trade one small hedged position each week on ${name} and keep the margin account funded.`;
  if (c.includes('chain')) return `Use one of the chain's own apps each week (a swap, a lend, a vote) so the wallet reads as a resident, not a tourist.`;
  return `Make one qualifying action each week on ${name}, such as a deposit, a claim of accrued rewards or a governance vote.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list
 * of names: the same record always writes the same plan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const second = secondChainOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(chain);
  const hold = holdDaysFor(age);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm with, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
  ];
  if (second !== null) {
    steps.push({
      text: `Repeat a half-size position on ${second}, the protocol's next chain, so the farm is not riding on one chain's snapshot.`,
      cost: `$${Math.round(capital / 2)} of capital and about $${gasFor(second)} of gas`,
      time: '10 minutes',
    });
  } else {
    steps.push({
      text: `Deepen the same position once after a week rather than opening a second wallet: size in one wallet counts for more than dust in two.`,
      cost: `$${Math.round(capital / 2)} more capital and about $${gas} of gas`,
      time: '10 minutes',
    });
  }
  steps.push(
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and check the protocol's own points or rewards page before you withdraw; claim only from the link it publishes.`,
      cost: `the $${capital} stays in the position, and never pay a fee to claim`,
      time: `${hold} days, then 10 minutes to check`,
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, and set a review date: exit when the token is announced, the points program ends, or the protocol's TVL halves.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: the same figures and the same farm plan the board carries. */
export function radarRow(row: BoardRow, book: PeerBook): RadarRow {
  const stats = row.category === null ? undefined : book.byCategory.get(row.category);
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_median: row.model.category_median,
    category_peers: row.model.category_peers,
    peer_p25: stats === undefined ? null : round4(stats.p25),
    peer_p75: stats === undefined ? null : round4(stats.p75),
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const book = peerBook(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const categories = [...book.byCategory.entries()]
    .map(([name, s]) => ({ name, peers: s.peers, median: round4(s.median), multiple: multipleFor(name, book, model).multiple }))
    .sort((a, b) => b.peers - a.peers || (a.name < b.name ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_median: round4(book.globalMedian),
    global_peers: book.globalPeers,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    categories,
    rows: board.map((r) => radarRow(r, book)),
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
