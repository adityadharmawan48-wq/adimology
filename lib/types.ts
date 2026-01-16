export interface StockInput {
  emiten: string;
  fromDate: string;
  toDate: string;
}

export interface MarketDetectorBroker {
  netbs_broker_code: string;
  bval: string;
  blot: string;
  netbs_buy_avg_price: string;
}

// Broker Summary Types
export interface BrokerTopStat {
  vol: number;
  percent: number;
  amount: number;
  accdist: string;
}

export interface BrokerDetector {
  top1: BrokerTopStat;
  top3: BrokerTopStat;
  top5: BrokerTopStat;
  avg: BrokerTopStat;
  total_buyer: number;
  total_seller: number;
  number_broker_buysell: number;
  broker_accdist: string;
  volume: number;
  value: number;
  average: number;
}

export interface BrokerBuyItem {
  netbs_broker_code: string;
  bval: string;
  blot: string;
  netbs_buy_avg_price: string;
  type: string;
}

export interface BrokerSellItem {
  netbs_broker_code: string;
  sval: string;
  slot: string;
  netbs_sell_avg_price: string;
  type: string;
}

export interface BrokerSummaryData {
  detector: BrokerDetector;
  topBuyers: BrokerBuyItem[];
  topSellers: BrokerSellItem[];
}

export interface MarketDetectorResponse {
  data: {
    broker_summary: {
      brokers_buy: BrokerBuyItem[];
      brokers_sell: BrokerSellItem[];
    };
    bandar_detector: BrokerDetector;
  };
}

export interface OrderbookData {
  close: number;
  high: number;
  ara: { value: string };
  arb: { value: string };
  offer: { price: string; que_num: string; volume: string; change_percentage: string }[];
  bid: { price: string; que_num: string; volume: string; change_percentage: string }[];
  total_bid_offer: {
    bid: { lot: string };
    offer: { lot: string };
  };
}

export interface OrderbookResponse {
  data: OrderbookData;
}


export interface BrokerData {
  bandar: string;
  barangBandar: number;
  rataRataBandar: number;
}

export interface MarketData {
  harga: number;
  offerTeratas: number;
  bidTerbawah: number;
  fraksi: number;
  totalBid: number;
  totalOffer: number;
}

export interface CalculatedData {
  totalPapan: number;
  rataRataBidOfer: number;
  a: number;
  p: number;
  targetRealistis1: number;
  targetMax: number;
}

export interface StockAnalysisResult {
  input: StockInput;
  stockbitData: BrokerData;
  marketData: MarketData;
  calculated: CalculatedData;
  brokerSummary?: BrokerSummaryData;
  isFromHistory?: boolean;
  historyDate?: string;
  sector?: string;
}

export interface ApiResponse {
  success: boolean;
  data?: StockAnalysisResult;
  error?: string;
}

export interface WatchlistItem {
  company_id: number;
  company_code: string; // Keeping for compatibility, might be mapped from symbol
  symbol: string;       // New field from API
  company_name: string;
  last_price: number;
  change_point: number;
  change_percentage: number;
  percent: string;      // Percentage from API (e.g., "-1.23")
  volume: number;
  frequency: number;
  sector?: string;      // Sector information from emiten info API
  formatted_price?: string;
  formatted_change_point?: string;
  formatted_change_percentage?: string;
}

export interface WatchlistMetaResponse {
  message: string;
  data: {
    watchlist_id: number;
  };
}

export interface WatchlistDetailResponse {
  message: string;
  data: {
    watchlist_id: number;
    result: WatchlistItem[];
  };
}

export type WatchlistResponse = WatchlistDetailResponse; // Alias for backward compatibility if needed, or just use WatchlistDetailResponse

export interface EmitenInfoResponse {
  data: {
    sector: string;
    sub_sector: string;
    symbol: string;
    name: string;
    price: string;
    change: string;
    percentage: number;
  };
  message: string;
}

// KeyStats types
export interface KeyStatsItem {
  id: string;
  name: string;
  value: string;
}

export interface KeyStatsCategory {
  keystats_name: string;
  fin_name_results: {
    fitem: KeyStatsItem;
    hidden_graph_ico: boolean;
    is_new_update: boolean;
  }[];
}

export interface KeyStatsResponse {
  data: {
    closure_fin_items_results: KeyStatsCategory[];
  };
  message: string;
}

// Processed KeyStats data for UI
export interface KeyStatsData {
  currentValuation: KeyStatsItem[];
  incomeStatement: KeyStatsItem[];
  balanceSheet: KeyStatsItem[];
  profitability: KeyStatsItem[];
  growth: KeyStatsItem[];
}

// Agent Story Types
export interface MatriksStoryItem {
  kategori_story: string;
  deskripsi_katalis: string;
  logika_ekonomi_pasar: string;
  potensi_dampak_harga: string;
}

export interface SwotAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface ChecklistKatalis {
  item: string;
  dampak_instan: string;
}

export interface StrategiTrading {
  tipe_saham: string;
  target_entry: string;
  exit_strategy: {
    take_profit: string;
    stop_loss: string;
  };
}

export interface AgentStoryResult {
  id?: number;
  emiten: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  matriks_story?: MatriksStoryItem[];
  swot_analysis?: SwotAnalysis;
  checklist_katalis?: ChecklistKatalis[];
  keystat_signal?: string;
  strategi_trading?: StrategiTrading;
  kesimpulan?: string;
  error_message?: string;
  created_at?: string;
}

