export type Amount = string;
export type Price = number;
export type SPrice = number;
export type Size = number;

export interface BlockTimestamp {
  b?: number;
  t?: number;
}

export interface BlockTxTimestamp extends BlockTimestamp {
  tx?: number;
  txid?: string;
}

export interface BlockTxLogTimestamp extends BlockTxTimestamp {
  l?: number;
}

export interface GasPrice {
  at: BlockTimestamp;
  h: number;
  max: Amount;
  p95: Amount;
  p50: Amount;
  min: Amount;
  base: Amount;
}

export interface Chain {
  ver: number;
  chain_id: number;
  name?: string;
  icons?: string[];
  native_token?: Token;
  rpc_urls?: string[];
  block_explorer_urls?: string[];
  gas: GasPrice;
}

export interface Token {
  ver: number;
  id?: number;
  address?: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
  display_precision: number;
  usd_index?: string;
}

export interface ProtocolInstance {
  ver: number;
  id: number;
  address: string;
  collateral_token_id: number;
  min_account_open_amount: Amount;
  min_deposit_amount: Amount;
  min_withdraw_amount: Amount;
  max_account_equity?: Amount;
  max_account_trigger_orders: number;
}

export interface MarketConfig {
  at: BlockTimestamp;
  is_open: boolean;
  price_decimals: number;
  size_decimals: number;
  min_posting_amount: Amount;
  min_settle_amount: Amount;
  initial_margin: number;
  maintenance_margin: number;
  maker_fee: number;
  taker_fee: number;
  maker_fees?: number[];
  taker_fees?: number[];
  recycle_fee: Amount;
  funding_sum_scaling_exp: number;
}

export interface MarketState {
  at: BlockTimestamp;
  orl: Price;
  mrk: Price;
  lst: Price;
  mid: Price;
  bid: Price;
  ask: Price;
  prv: Price;
  dv: Size;
  dva: Amount;
  oi: Size;
  tvl: Amount;
}

export interface FundingEvent {
  at: BlockTimestamp;
  feb: number;
  rate: number;
  idx: Price;
  ppl: SPrice;
  sum: SPrice;
  div: number;
}

export interface Market {
  ver: number;
  id: number;
  instance_id: number;
  perpetual_id: number;
  symbol: string;
  name: string;
  size_units: string;
  icon: string;
  funding_interval_sec: number;
  funding_interval_blocks: number;
  order_ttl_blocks: number;
  order_retry_blocks: number;
  order_max_market_slippage_bps: number;
  order_max_neg_pnl_collat_bps: number;
  config: MarketConfig;
  state: MarketState;
  funding: FundingEvent;
  points_boost_bps: number;
}

export interface Context {
  chain: Chain;
  instances: ProtocolInstance[];
  tokens: Token[];
  markets: Market[];
}

export interface AccountEvent {
  at: BlockTxLogTimestamp;
  in: number;
  id: number;
  et: number;
  m?: number;
  r?: number;
  o?: number;
  p?: number;
  a: Amount;
  b: Amount;
  lb: Amount;
  f: Amount;
  bfa?: Amount;
}

export interface Account {
  mt: number;
  in: number;
  id: number;
  fr: boolean;
  fw: boolean;
  ft: number;
  lfr: number;
  b: Amount;
  lb: Amount;
  h?: AccountEvent[];
}

export interface AccountStats {
  mt: number;
  in: number;
  id: number;
  td: Amount;
  tw: Amount;
  tv: Amount;
  tf: Amount;
  tbf?: Amount;
  trp: Amount;
  wr: number;
  tt: number;
}

export interface Wallet {
  mt: number;
  sn?: number;
  at: BlockTimestamp;
  addr: string;
  n: number;
  fl: number;
  as?: Account[];
  sts?: AccountStats[];
}

export interface Order {
  at: BlockTxLogTimestamp;
  c: BlockTxTimestamp;
  rq: number;
  mkt: number;
  acc: number;
  oid: number;
  scid: number;
  st: number;
  sr: number;
  fr?: number;
  t: number;
  r?: boolean;
  p?: Price;
  os: Size;
  fp: Price;
  fs: Size;
  f: Amount;
  bfa?: Amount;
  tif?: number;
  fl: number;
  tp?: Price;
  tpc?: number;
  lp?: number;
  mm: number;
  lv: number;
}

export interface Position {
  at: BlockTxLogTimestamp;
  mkt: number;
  acc: number;
  pid: number;
  rq: number;
  oid: number;
  st: number;
  sr: number;
  sd: number;
  c: Amount;
  ep: Price;
  epr?: number;
  s: Size;
  fee: Amount;
  cfee?: Amount;
  efs: SPrice;
  lv: number;
  dpnl?: Amount;
  fnd?: Amount;
  xp?: Price;
  xfs: SPrice;
  ots: BlockTxTimestamp;
  e?: Position[];
}

export interface Fill {
  at: BlockTxLogTimestamp;
  mkt: number;
  acc: number;
  oid: number;
  t: number;
  l: number;
  p?: Price;
  s: Size;
  f: Amount;
  bfa?: Amount;
}

export interface HistoryPage<T> {
  d: T[];
  np: string;
}

export interface WalletOrders {
  mt: 23;
  sn: number;
  at: BlockTimestamp;
  d: Order[];
}

export interface WalletPositions {
  mt: 26;
  sn: number;
  at: BlockTimestamp;
  d: Position[];
}

export interface MarketStateUpdate {
  mt: 9;
  sn: number;
  d: Record<string, MarketState>;
}

export interface Candle {
  t: number;
  o: Price;
  c: Price;
  h: Price;
  l: Price;
  v: Amount;
  n: number;
}

export interface CandleSeries {
  mt: number;
  at: BlockTimestamp;
  r: number;
  d: Candle[];
}

export interface FundingSeries {
  mt: number;
  at: BlockTimestamp;
  m: number;
  d: FundingEvent[];
}

export interface MarketFundingSeries {
  mt: number;
  at: BlockTimestamp;
  d: Record<string, FundingEvent[]>;
}

export interface L2PriceLevel {
  p: Price;
  s: Size;
  o: number;
}

export interface L2Book {
  mt: 15;
  sn?: number;
  at: BlockTimestamp;
  bid: L2PriceLevel[];
  ask: L2PriceLevel[];
}

export interface ChartPoint {
  t: number;
  v: Amount;
}

export interface Portfolio {
  at: BlockTimestamp;
  chart: ChartPoint[];
}

export interface PerplMetadata {
  source: "perpl";
  network: "monad-testnet";
  fetchedAt: string;
}

export interface PerplContext extends PerplMetadata {
  chain: Chain;
  instances: ProtocolInstance[];
  tokens: Token[];
  markets: PerplMarket[];
}

export interface PerplMarket extends PerplMetadata {
  id: number;
  symbol: string;
  name: string;
  sizeUnits: string;
  priceDecimals: number;
  sizeDecimals: number;
  isOpen: boolean;
  oraclePrice: string | null;
  markPrice: string | null;
  lastPrice: string | null;
  midPrice: string | null;
  bestBid: string | null;
  bestAsk: string | null;
  dailyVolumeSize: string | null;
  dailyVolumeAmount: string | null;
  openInterest: string | null;
  totalValueLocked: string | null;
  fundingRateMicros: number | null;
  fundingIndexPrice: string | null;
}

export interface PerplWalletSummary extends PerplMetadata {
  address: string | null;
  nonce: number | null;
  feeLevel: number | null;
  accounts: Array<{
    instanceId: number;
    accountId: number;
    isFrozen: boolean;
    allowsForwarding: boolean;
    feeTier: number;
    lastForwardedRequestId: string;
    balance: string;
    lockedBalance: string;
  }>;
  stats: PerplAccountStats[];
}

export interface PerplAccountStats {
  instanceId: number;
  accountId: number;
  totalDeposits: string;
  totalWithdrawals: string;
  totalVolume: string;
  totalFees: string;
  totalBuilderFees: string | null;
  totalRealizedPnl: string;
  winRateBps: number;
  tradeCount: number;
}

export interface PerplPosition extends PerplMetadata {
  marketId: number;
  marketSymbol: string | null;
  accountId: number;
  positionId: string;
  side: "long" | "short" | null;
  status: number;
  statusReason: number;
  collateral: string;
  entryPrice: string | null;
  size: string | null;
  fee: string;
  closeFee: string | null;
  leverage: string;
  realizedDeltaPnl: string | null;
  realizedFundingPnl: string | null;
  exitPrice: string | null;
  openedAt: BlockTxTimestamp;
  updatedAt: BlockTxLogTimestamp;
}

export interface PerplOrder extends PerplMetadata {
  marketId: number;
  marketSymbol: string | null;
  accountId: number;
  orderId: string;
  requestId: string;
  smartContractOrderId: string;
  type: number;
  status: number;
  statusReason: number;
  failureReason: number | null;
  limitPrice: string | null;
  originalSize: string | null;
  fillPrice: string | null;
  filledSize: string | null;
  fee: string;
  builderFee: string | null;
  flags: number;
  leverage: string;
  createdAt: BlockTxTimestamp;
  updatedAt: BlockTxLogTimestamp;
}

export interface PerplFill extends PerplMetadata {
  marketId: number;
  marketSymbol: string | null;
  accountId: number;
  orderId: string;
  orderType: number;
  liquiditySide: "maker" | "taker" | null;
  price: string | null;
  size: string | null;
  fee: string;
  builderFee: string | null;
  timestamp: BlockTxLogTimestamp;
}
