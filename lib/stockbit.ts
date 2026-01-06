import type { MarketDetectorResponse, OrderbookResponse, BrokerData, WatchlistResponse } from './types';
import { getSessionValue } from './supabase';

const STOCKBIT_BASE_URL = 'https://exodus.stockbit.com';
const STOCKBIT_AUTH_URL = 'https://stockbit.com';

// Cache token to reduce database calls
let cachedToken: string | null = null;
let tokenLastFetched: number = 0;
const TOKEN_CACHE_DURATION = 60000; // 1 minute

/**
 * Get JWT token from database or environment
 */
async function getAuthToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid
  if (cachedToken && (now - tokenLastFetched) < TOKEN_CACHE_DURATION) {
    return cachedToken;
  }

  // Fetch from database
  const token = await getSessionValue('stockbit_token');

  // Fallback to env if database token not found
  if (!token) {
    const envToken = process.env.STOCKBIT_JWT_TOKEN;
    if (!envToken) {
      throw new Error('STOCKBIT_JWT_TOKEN not found in database or environment');
    }
    return envToken;
  }

  // Update cache
  cachedToken = token;
  tokenLastFetched = now;

  return token;
}

/**
 * Common headers for Stockbit API
 */
async function getHeaders(): Promise<HeadersInit> {
  return {
    'accept': 'application/json',
    'authorization': `Bearer ${await getAuthToken()}`,
    'origin': 'https://stockbit.com',
    'referer': 'https://stockbit.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  };
}

/**
 * Fetch Market Detector data (broker information)
 */
export async function fetchMarketDetector(
  emiten: string,
  fromDate: string,
  toDate: string
): Promise<MarketDetectorResponse> {
  const url = new URL(`${STOCKBIT_BASE_URL}/marketdetectors/${emiten}`);
  url.searchParams.append('from', fromDate);
  url.searchParams.append('to', toDate);
  url.searchParams.append('transaction_type', 'TRANSACTION_TYPE_NET');
  url.searchParams.append('market_board', 'MARKET_BOARD_REGULER');
  url.searchParams.append('investor_type', 'INVESTOR_TYPE_ALL');
  url.searchParams.append('limit', '25');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: await getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Market Detector API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Orderbook data (market data)
 */
export async function fetchOrderbook(emiten: string): Promise<OrderbookResponse> {
  const url = `${STOCKBIT_BASE_URL}/company-price-feed/v2/orderbook/companies/${emiten}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: await getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Orderbook API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch Watchlist data
 */
export async function fetchWatchlist(): Promise<WatchlistResponse> {
  // Step 1: Get Watchlist ID
  const metaUrl = `${STOCKBIT_BASE_URL}/watchlist?page=1&limit=500`;
  const metaResponse = await fetch(metaUrl, {
    method: 'GET',
    headers: await getHeaders(),
  });

  if (!metaResponse.ok) {
    throw new Error(`Watchlist Meta API error: ${metaResponse.status} ${metaResponse.statusText}`);
  }

  const metaJson = await metaResponse.json();
  
  const watchlists = Array.isArray(metaJson.data) ? metaJson.data : [metaJson.data];
  const defaultWatchlist = watchlists.find((w: any) => w.is_default) || watchlists[0];
  const watchlistId = defaultWatchlist?.watchlist_id;

  if (!watchlistId) {
    throw new Error(`No watchlist_id found in response: ${JSON.stringify(metaJson)}`);
  }

  // Step 2: Get Watchlist Details
  const detailUrl = `${STOCKBIT_BASE_URL}/watchlist/${watchlistId}?page=1&limit=500`;
  const detailResponse = await fetch(detailUrl, {
    method: 'GET',
    headers: await getHeaders(),
  });

  if (!detailResponse.ok) {
    throw new Error(`Watchlist Detail API error: ${detailResponse.status} ${detailResponse.statusText}`);
  }

  const detailJson = await detailResponse.json();

  // Map symbol to company_code for compatibility
  if (detailJson.data?.result) {
    detailJson.data.result = detailJson.data.result.map((item: any) => ({
      ...item,
      company_code: item.symbol || item.company_code
    }));
  }

  return detailJson;
}

/**
 * Get top broker by BVAL from Market Detector response
 */
export function getTopBroker(marketDetectorData: MarketDetectorResponse): BrokerData {
  // Debug log to see actual API response structure
  // console.log('Market Detector API Response:', JSON.stringify(marketDetectorData, null, 2));

  // The actual data is wrapped in a 'data' property
  const brokers = marketDetectorData?.data?.broker_summary?.brokers_buy;

  if (!brokers || !Array.isArray(brokers) || brokers.length === 0) {
    throw new Error('No broker data found in data.broker_summary.brokers_buy');
  }

  // Sort by bval descending and get the first one
  // Note: bval is a string in the API response, so we convert to Number
  const topBroker = [...brokers].sort((a, b) => Number(b.bval) - Number(a.bval))[0];

  return {
    bandar: topBroker.netbs_broker_code,
    barangBandar: Math.round(Number(topBroker.blot)),
    rataRataBandar: Math.round(Number(topBroker.netbs_buy_avg_price)),
  };
}

/**
 * Helper to parse lot string (e.g., "25,322,000" -> 25322000)
 */
export function parseLot(lotStr: string): number {
  if (!lotStr) return 0;
  return Number(lotStr.replace(/,/g, ''));
}



