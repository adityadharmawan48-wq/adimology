"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/analyze-watchlist-background.ts
var analyze_watchlist_background_exports = {};
__export(analyze_watchlist_background_exports, {
  default: () => analyze_watchlist_background_default
});
module.exports = __toCommonJS(analyze_watchlist_background_exports);

// lib/supabase.ts
var import_supabase_js = require("@supabase/supabase-js");
var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
var supabase = (0, import_supabase_js.createClient)(supabaseUrl, supabaseAnonKey);
async function getSessionValue(key) {
  const { data, error } = await supabase.from("session").select("value").eq("key", key).single();
  if (error || !data) return null;
  return data.value;
}
async function updateTokenLastUsed() {
  const { error } = await supabase.from("session").update({ last_used_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("key", "stockbit_token");
  if (error) {
    console.error("Error updating token last_used_at:", error);
  }
}
async function invalidateToken() {
  const { error } = await supabase.from("session").update({ is_valid: false }).eq("key", "stockbit_token");
  if (error) {
    console.error("Error invalidating token:", error);
  }
}
async function saveWatchlistAnalysis(data) {
  const { data: result, error } = await supabase.from("stock_queries").upsert([data], { onConflict: "from_date,emiten" }).select();
  if (error) {
    console.error("Error saving watchlist analysis:", error);
    throw error;
  }
  return result;
}
async function updatePreviousDayRealPrice(emiten, currentDate, price) {
  const { data: record, error: findError } = await supabase.from("stock_queries").select("id, from_date").eq("emiten", emiten).eq("status", "success").lt("from_date", currentDate).order("from_date", { ascending: false }).limit(1).single();
  if (findError || !record) {
    if (findError && findError.code !== "PGRST116") {
      console.error(`Error finding previous record for ${emiten} before ${currentDate}:`, findError);
    }
    return null;
  }
  const { data, error: updateError } = await supabase.from("stock_queries").update({ real_harga: price }).eq("id", record.id).select();
  if (updateError) {
    console.error(`Error updating real_harga for ${emiten} on ${record.from_date}:`, updateError);
  }
  return data;
}

// lib/stockbit.ts
var STOCKBIT_BASE_URL = "https://exodus.stockbit.com";
var TokenExpiredError = class extends Error {
  constructor(message = "Token has expired or is invalid. Please login to Stockbit again.") {
    super(message);
    this.name = "TokenExpiredError";
  }
};
var cachedToken = null;
var tokenLastFetched = 0;
var TOKEN_CACHE_DURATION = 6e4;
var sectorCache = /* @__PURE__ */ new Map();
var SECTOR_CACHE_DURATION = 36e5;
async function getAuthToken() {
  const now = Date.now();
  if (cachedToken && now - tokenLastFetched < TOKEN_CACHE_DURATION) {
    return cachedToken;
  }
  const token = await getSessionValue("stockbit_token");
  if (!token) {
    const envToken = process.env.STOCKBIT_JWT_TOKEN;
    if (!envToken) {
      throw new Error("STOCKBIT_JWT_TOKEN not found in database or environment");
    }
    return envToken;
  }
  cachedToken = token;
  tokenLastFetched = now;
  return token;
}
async function getHeaders() {
  return {
    "accept": "application/json",
    "authorization": `Bearer ${await getAuthToken()}`,
    "origin": "https://stockbit.com",
    "referer": "https://stockbit.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
  };
}
async function handleApiResponse(response, apiName) {
  if (response.status === 401) {
    await invalidateToken();
    cachedToken = null;
    throw new TokenExpiredError(`${apiName}: Token expired or invalid (401)`);
  }
  if (!response.ok) {
    throw new Error(`${apiName} error: ${response.status} ${response.statusText}`);
  }
  updateTokenLastUsed().catch(() => {
  });
}
async function fetchMarketDetector(emiten, fromDate, toDate) {
  const url = new URL(`${STOCKBIT_BASE_URL}/marketdetectors/${emiten}`);
  url.searchParams.append("from", fromDate);
  url.searchParams.append("to", toDate);
  url.searchParams.append("transaction_type", "TRANSACTION_TYPE_NET");
  url.searchParams.append("market_board", "MARKET_BOARD_REGULER");
  url.searchParams.append("investor_type", "INVESTOR_TYPE_ALL");
  url.searchParams.append("limit", "25");
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: await getHeaders()
  });
  await handleApiResponse(response, "Market Detector API");
  return response.json();
}
async function fetchOrderbook(emiten) {
  const url = `${STOCKBIT_BASE_URL}/company-price-feed/v2/orderbook/companies/${emiten}`;
  const response = await fetch(url, {
    method: "GET",
    headers: await getHeaders()
  });
  await handleApiResponse(response, "Orderbook API");
  return response.json();
}
async function fetchEmitenInfo(emiten) {
  const cached = sectorCache.get(emiten.toUpperCase());
  const now = Date.now();
  if (cached && now - cached.timestamp < SECTOR_CACHE_DURATION) {
    return {
      data: {
        sector: cached.sector,
        sub_sector: "",
        symbol: emiten,
        name: "",
        price: "0",
        change: "0",
        percentage: 0
      },
      message: "Successfully retrieved company data (cached)"
    };
  }
  const url = `${STOCKBIT_BASE_URL}/emitten/${emiten}/info`;
  const response = await fetch(url, {
    method: "GET",
    headers: await getHeaders()
  });
  await handleApiResponse(response, "Emiten Info API");
  const data = await response.json();
  if (data.data?.sector) {
    sectorCache.set(emiten.toUpperCase(), {
      sector: data.data.sector,
      timestamp: now
    });
  }
  return data;
}
async function fetchWatchlist() {
  const metaUrl = `${STOCKBIT_BASE_URL}/watchlist?page=1&limit=500`;
  const metaResponse = await fetch(metaUrl, {
    method: "GET",
    headers: await getHeaders()
  });
  await handleApiResponse(metaResponse, "Watchlist Meta API");
  const metaJson = await metaResponse.json();
  const watchlists = Array.isArray(metaJson.data) ? metaJson.data : [metaJson.data];
  const defaultWatchlist = watchlists.find((w) => w.is_default) || watchlists[0];
  const watchlistId = defaultWatchlist?.watchlist_id;
  if (!watchlistId) {
    throw new Error(`No watchlist_id found in response: ${JSON.stringify(metaJson)}`);
  }
  const detailUrl = `${STOCKBIT_BASE_URL}/watchlist/${watchlistId}?page=1&limit=500`;
  const detailResponse = await fetch(detailUrl, {
    method: "GET",
    headers: await getHeaders()
  });
  await handleApiResponse(detailResponse, "Watchlist Detail API");
  const detailJson = await detailResponse.json();
  if (detailJson.data?.result) {
    detailJson.data.result = detailJson.data.result.map((item) => ({
      ...item,
      company_code: item.symbol || item.company_code
    }));
  }
  return detailJson;
}
function getTopBroker(marketDetectorData) {
  const brokers = marketDetectorData?.data?.broker_summary?.brokers_buy;
  if (!brokers || !Array.isArray(brokers) || brokers.length === 0) {
    return null;
  }
  const topBroker = [...brokers].sort((a, b) => Number(b.bval) - Number(a.bval))[0];
  return {
    bandar: topBroker.netbs_broker_code,
    barangBandar: Math.round(Number(topBroker.blot)),
    rataRataBandar: Math.round(Number(topBroker.netbs_buy_avg_price))
  };
}

// lib/calculations.ts
function getFraksi(harga) {
  if (harga < 200) return 1;
  if (harga >= 200 && harga < 500) return 2;
  if (harga >= 500 && harga < 2e3) return 5;
  if (harga >= 2e3 && harga < 5e3) return 10;
  return 25;
}
function calculateTargets(rataRataBandar, barangBandar, ara, arb, totalBid, totalOffer, harga) {
  const fraksi = getFraksi(harga);
  const totalPapan = (ara - arb) / fraksi;
  const rataRataBidOfer = (totalBid + totalOffer) / totalPapan;
  const a = rataRataBandar * 0.05;
  const p = barangBandar / rataRataBidOfer;
  const targetRealistis1 = rataRataBandar + a + p / 2 * fraksi;
  const targetMax = rataRataBandar + a + p * fraksi;
  return {
    fraksi,
    totalPapan: Math.round(totalPapan),
    rataRataBidOfer: Math.round(rataRataBidOfer),
    a: Math.round(a),
    p: Math.round(p),
    targetRealistis1: Math.round(targetRealistis1),
    targetMax: Math.round(targetMax)
  };
}

// netlify/functions/analyze-watchlist-background.ts
var analyze_watchlist_background_default = async (req) => {
  const startTime = Date.now();
  console.log("[Background] Starting analysis job...");
  try {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const watchlistResponse = await fetchWatchlist();
    const watchlistItems = watchlistResponse.data?.result || [];
    if (watchlistItems.length === 0) {
      console.log("[Background] No watchlist items to analyze");
      return new Response(JSON.stringify({ success: true, message: "No items" }), { status: 200 });
    }
    const results = [];
    const errors = [];
    for (const item of watchlistItems) {
      const emiten = item.symbol || item.company_code;
      console.log(`[Background] Analyzing ${emiten}...`);
      try {
        const [marketDetectorData, orderbookData, emitenInfoData] = await Promise.all([
          fetchMarketDetector(emiten, today, today),
          fetchOrderbook(emiten),
          fetchEmitenInfo(emiten).catch(() => null)
        ]);
        const brokerData = getTopBroker(marketDetectorData);
        if (!brokerData) {
          errors.push({ emiten, error: "No broker data" });
          continue;
        }
        const sector = emitenInfoData?.data?.sector || void 0;
        const obData = orderbookData.data || orderbookData;
        const offerPrices = (obData.offer || []).map((o) => Number(o.price));
        const bidPrices = (obData.bid || []).map((b) => Number(b.price));
        const marketData = {
          harga: Number(obData.close),
          offerTeratas: offerPrices.length > 0 ? Math.max(...offerPrices) : Number(obData.high || 0),
          bidTerbawah: bidPrices.length > 0 ? Math.min(...bidPrices) : 0,
          totalBid: Number(obData.total_bid_offer.bid.lot.replace(/,/g, "")),
          totalOffer: Number(obData.total_bid_offer.offer.lot.replace(/,/g, ""))
        };
        const calculated = calculateTargets(
          brokerData.rataRataBandar,
          brokerData.barangBandar,
          marketData.offerTeratas,
          marketData.bidTerbawah,
          marketData.totalBid / 100,
          marketData.totalOffer / 100,
          marketData.harga
        );
        await saveWatchlistAnalysis({
          from_date: today,
          to_date: today,
          emiten,
          sector,
          bandar: brokerData.bandar,
          barang_bandar: brokerData.barangBandar,
          rata_rata_bandar: brokerData.rataRataBandar,
          harga: marketData.harga,
          ara: marketData.offerTeratas,
          arb: marketData.bidTerbawah,
          fraksi: calculated.fraksi,
          total_bid: marketData.totalBid,
          total_offer: marketData.totalOffer,
          total_papan: calculated.totalPapan,
          rata_rata_bid_ofer: calculated.rataRataBidOfer,
          a: calculated.a,
          p: calculated.p,
          target_realistis: calculated.targetRealistis1,
          target_max: calculated.targetMax,
          status: "success"
        });
        try {
          await updatePreviousDayRealPrice(emiten, today, marketData.harga);
        } catch (updateError) {
          console.error(`[Background] Failed to update price for ${emiten}`, updateError);
        }
        results.push({ emiten, status: "success" });
      } catch (error) {
        console.error(`[Background] Error analyzing ${emiten}:`, error);
        errors.push({ emiten, error: String(error) });
      }
    }
    const duration = (Date.now() - startTime) / 1e3;
    console.log(`[Background] Job completed in ${duration}s. Success: ${results.length}, Errors: ${errors.length}`);
    return new Response(JSON.stringify({ success: true, results: results.length, errors: errors.length }), { status: 200 });
  } catch (error) {
    console.error("[Background] Critical error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), { status: 500 });
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibmV0bGlmeS9mdW5jdGlvbnMvYW5hbHl6ZS13YXRjaGxpc3QtYmFja2dyb3VuZC50cyIsICJsaWIvc3VwYWJhc2UudHMiLCAibGliL3N0b2NrYml0LnRzIiwgImxpYi9jYWxjdWxhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGZldGNoV2F0Y2hsaXN0LCBmZXRjaE1hcmtldERldGVjdG9yLCBmZXRjaE9yZGVyYm9vaywgZ2V0VG9wQnJva2VyLCBmZXRjaEVtaXRlbkluZm8gfSBmcm9tICcuLi8uLi9saWIvc3RvY2tiaXQnO1xyXG5pbXBvcnQgeyBjYWxjdWxhdGVUYXJnZXRzIH0gZnJvbSAnLi4vLi4vbGliL2NhbGN1bGF0aW9ucyc7XHJcbmltcG9ydCB7IHNhdmVXYXRjaGxpc3RBbmFseXNpcywgdXBkYXRlUHJldmlvdXNEYXlSZWFsUHJpY2UgfSBmcm9tICcuLi8uLi9saWIvc3VwYWJhc2UnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKHJlcTogUmVxdWVzdCkgPT4ge1xyXG4gIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgY29uc29sZS5sb2coJ1tCYWNrZ3JvdW5kXSBTdGFydGluZyBhbmFseXNpcyBqb2IuLi4nKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIEdldCBjdXJyZW50IGRhdGUgZm9yIGFuYWx5c2lzXHJcbiAgICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdO1xyXG5cclxuICAgIC8vIEZldGNoIHdhdGNobGlzdFxyXG4gICAgY29uc3Qgd2F0Y2hsaXN0UmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdhdGNobGlzdCgpO1xyXG4gICAgY29uc3Qgd2F0Y2hsaXN0SXRlbXMgPSB3YXRjaGxpc3RSZXNwb25zZS5kYXRhPy5yZXN1bHQgfHwgW107XHJcblxyXG4gICAgaWYgKHdhdGNobGlzdEl0ZW1zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBjb25zb2xlLmxvZygnW0JhY2tncm91bmRdIE5vIHdhdGNobGlzdCBpdGVtcyB0byBhbmFseXplJyk7XHJcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnTm8gaXRlbXMnIH0pLCB7IHN0YXR1czogMjAwIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJlc3VsdHMgPSBbXTtcclxuICAgIGNvbnN0IGVycm9ycyA9IFtdO1xyXG5cclxuICAgIC8vIEFuYWx5emUgZWFjaCB3YXRjaGxpc3QgaXRlbVxyXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHdhdGNobGlzdEl0ZW1zKSB7XHJcbiAgICAgIGNvbnN0IGVtaXRlbiA9IGl0ZW0uc3ltYm9sIHx8IGl0ZW0uY29tcGFueV9jb2RlO1xyXG4gICAgICBjb25zb2xlLmxvZyhgW0JhY2tncm91bmRdIEFuYWx5emluZyAke2VtaXRlbn0uLi5gKTtcclxuXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgW21hcmtldERldGVjdG9yRGF0YSwgb3JkZXJib29rRGF0YSwgZW1pdGVuSW5mb0RhdGFdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xyXG4gICAgICAgICAgZmV0Y2hNYXJrZXREZXRlY3RvcihlbWl0ZW4sIHRvZGF5LCB0b2RheSksXHJcbiAgICAgICAgICBmZXRjaE9yZGVyYm9vayhlbWl0ZW4pLFxyXG4gICAgICAgICAgZmV0Y2hFbWl0ZW5JbmZvKGVtaXRlbikuY2F0Y2goKCkgPT4gbnVsbCksXHJcbiAgICAgICAgXSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJyb2tlckRhdGEgPSBnZXRUb3BCcm9rZXIobWFya2V0RGV0ZWN0b3JEYXRhKTtcclxuICAgICAgICBpZiAoIWJyb2tlckRhdGEpIHtcclxuICAgICAgICAgIGVycm9ycy5wdXNoKHsgZW1pdGVuLCBlcnJvcjogJ05vIGJyb2tlciBkYXRhJyB9KTtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc2VjdG9yID0gZW1pdGVuSW5mb0RhdGE/LmRhdGE/LnNlY3RvciB8fCB1bmRlZmluZWQ7XHJcbiAgICAgICAgY29uc3Qgb2JEYXRhID0gb3JkZXJib29rRGF0YS5kYXRhIHx8IChvcmRlcmJvb2tEYXRhIGFzIGFueSk7XHJcbiAgICAgICAgY29uc3Qgb2ZmZXJQcmljZXMgPSAob2JEYXRhLm9mZmVyIHx8IFtdKS5tYXAoKG86IGFueSkgPT4gTnVtYmVyKG8ucHJpY2UpKTtcclxuICAgICAgICBjb25zdCBiaWRQcmljZXMgPSAob2JEYXRhLmJpZCB8fCBbXSkubWFwKChiOiBhbnkpID0+IE51bWJlcihiLnByaWNlKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hcmtldERhdGEgPSB7XHJcbiAgICAgICAgICBoYXJnYTogTnVtYmVyKG9iRGF0YS5jbG9zZSksXHJcbiAgICAgICAgICBvZmZlclRlcmF0YXM6IG9mZmVyUHJpY2VzLmxlbmd0aCA+IDAgPyBNYXRoLm1heCguLi5vZmZlclByaWNlcykgOiBOdW1iZXIob2JEYXRhLmhpZ2ggfHwgMCksXHJcbiAgICAgICAgICBiaWRUZXJiYXdhaDogYmlkUHJpY2VzLmxlbmd0aCA+IDAgPyBNYXRoLm1pbiguLi5iaWRQcmljZXMpIDogMCxcclxuICAgICAgICAgIHRvdGFsQmlkOiBOdW1iZXIob2JEYXRhLnRvdGFsX2JpZF9vZmZlci5iaWQubG90LnJlcGxhY2UoLywvZywgJycpKSxcclxuICAgICAgICAgIHRvdGFsT2ZmZXI6IE51bWJlcihvYkRhdGEudG90YWxfYmlkX29mZmVyLm9mZmVyLmxvdC5yZXBsYWNlKC8sL2csICcnKSksXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FsY3VsYXRlZCA9IGNhbGN1bGF0ZVRhcmdldHMoXHJcbiAgICAgICAgICBicm9rZXJEYXRhLnJhdGFSYXRhQmFuZGFyLFxyXG4gICAgICAgICAgYnJva2VyRGF0YS5iYXJhbmdCYW5kYXIsXHJcbiAgICAgICAgICBtYXJrZXREYXRhLm9mZmVyVGVyYXRhcyxcclxuICAgICAgICAgIG1hcmtldERhdGEuYmlkVGVyYmF3YWgsXHJcbiAgICAgICAgICBtYXJrZXREYXRhLnRvdGFsQmlkIC8gMTAwLFxyXG4gICAgICAgICAgbWFya2V0RGF0YS50b3RhbE9mZmVyIC8gMTAwLFxyXG4gICAgICAgICAgbWFya2V0RGF0YS5oYXJnYVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGF3YWl0IHNhdmVXYXRjaGxpc3RBbmFseXNpcyh7XHJcbiAgICAgICAgICBmcm9tX2RhdGU6IHRvZGF5LFxyXG4gICAgICAgICAgdG9fZGF0ZTogdG9kYXksXHJcbiAgICAgICAgICBlbWl0ZW4sXHJcbiAgICAgICAgICBzZWN0b3IsXHJcbiAgICAgICAgICBiYW5kYXI6IGJyb2tlckRhdGEuYmFuZGFyLFxyXG4gICAgICAgICAgYmFyYW5nX2JhbmRhcjogYnJva2VyRGF0YS5iYXJhbmdCYW5kYXIsXHJcbiAgICAgICAgICByYXRhX3JhdGFfYmFuZGFyOiBicm9rZXJEYXRhLnJhdGFSYXRhQmFuZGFyLFxyXG4gICAgICAgICAgaGFyZ2E6IG1hcmtldERhdGEuaGFyZ2EsXHJcbiAgICAgICAgICBhcmE6IG1hcmtldERhdGEub2ZmZXJUZXJhdGFzLFxyXG4gICAgICAgICAgYXJiOiBtYXJrZXREYXRhLmJpZFRlcmJhd2FoLFxyXG4gICAgICAgICAgZnJha3NpOiBjYWxjdWxhdGVkLmZyYWtzaSxcclxuICAgICAgICAgIHRvdGFsX2JpZDogbWFya2V0RGF0YS50b3RhbEJpZCxcclxuICAgICAgICAgIHRvdGFsX29mZmVyOiBtYXJrZXREYXRhLnRvdGFsT2ZmZXIsXHJcbiAgICAgICAgICB0b3RhbF9wYXBhbjogY2FsY3VsYXRlZC50b3RhbFBhcGFuLFxyXG4gICAgICAgICAgcmF0YV9yYXRhX2JpZF9vZmVyOiBjYWxjdWxhdGVkLnJhdGFSYXRhQmlkT2ZlcixcclxuICAgICAgICAgIGE6IGNhbGN1bGF0ZWQuYSxcclxuICAgICAgICAgIHA6IGNhbGN1bGF0ZWQucCxcclxuICAgICAgICAgIHRhcmdldF9yZWFsaXN0aXM6IGNhbGN1bGF0ZWQudGFyZ2V0UmVhbGlzdGlzMSxcclxuICAgICAgICAgIHRhcmdldF9tYXg6IGNhbGN1bGF0ZWQudGFyZ2V0TWF4LFxyXG4gICAgICAgICAgc3RhdHVzOiAnc3VjY2VzcydcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGF3YWl0IHVwZGF0ZVByZXZpb3VzRGF5UmVhbFByaWNlKGVtaXRlbiwgdG9kYXksIG1hcmtldERhdGEuaGFyZ2EpO1xyXG4gICAgICAgIH0gY2F0Y2ggKHVwZGF0ZUVycm9yKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGBbQmFja2dyb3VuZF0gRmFpbGVkIHRvIHVwZGF0ZSBwcmljZSBmb3IgJHtlbWl0ZW59YCwgdXBkYXRlRXJyb3IpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKHsgZW1pdGVuLCBzdGF0dXM6ICdzdWNjZXNzJyB9KTtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGBbQmFja2dyb3VuZF0gRXJyb3IgYW5hbHl6aW5nICR7ZW1pdGVufTpgLCBlcnJvcik7XHJcbiAgICAgICAgZXJyb3JzLnB1c2goeyBlbWl0ZW4sIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZHVyYXRpb24gPSAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSkgLyAxMDAwO1xyXG4gICAgY29uc29sZS5sb2coYFtCYWNrZ3JvdW5kXSBKb2IgY29tcGxldGVkIGluICR7ZHVyYXRpb259cy4gU3VjY2VzczogJHtyZXN1bHRzLmxlbmd0aH0sIEVycm9yczogJHtlcnJvcnMubGVuZ3RofWApO1xyXG5cclxuICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0cnVlLCByZXN1bHRzOiByZXN1bHRzLmxlbmd0aCwgZXJyb3JzOiBlcnJvcnMubGVuZ3RoIH0pLCB7IHN0YXR1czogMjAwIH0pO1xyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignW0JhY2tncm91bmRdIENyaXRpY2FsIGVycm9yOicsIGVycm9yKTtcclxuICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSksIHsgc3RhdHVzOiA1MDAgfSk7XHJcbiAgfVxyXG59O1xyXG4iLCAiaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAnQHN1cGFiYXNlL3N1cGFiYXNlLWpzJztcclxuXHJcbmNvbnN0IHN1cGFiYXNlVXJsID0gcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1VQQUJBU0VfVVJMITtcclxuY29uc3Qgc3VwYWJhc2VBbm9uS2V5ID0gcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1VQQUJBU0VfQU5PTl9LRVkhO1xyXG5cclxuZXhwb3J0IGNvbnN0IHN1cGFiYXNlID0gY3JlYXRlQ2xpZW50KHN1cGFiYXNlVXJsLCBzdXBhYmFzZUFub25LZXkpO1xyXG5cclxuLyoqXHJcbiAqIFNhdmUgc3RvY2sgcXVlcnkgdG8gZGF0YWJhc2VcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlU3RvY2tRdWVyeShkYXRhOiB7XHJcbiAgZW1pdGVuOiBzdHJpbmc7XHJcbiAgc2VjdG9yPzogc3RyaW5nO1xyXG4gIGZyb21fZGF0ZT86IHN0cmluZztcclxuICB0b19kYXRlPzogc3RyaW5nO1xyXG4gIGJhbmRhcj86IHN0cmluZztcclxuICBiYXJhbmdfYmFuZGFyPzogbnVtYmVyO1xyXG4gIHJhdGFfcmF0YV9iYW5kYXI/OiBudW1iZXI7XHJcbiAgaGFyZ2E/OiBudW1iZXI7XHJcbiAgYXJhPzogbnVtYmVyO1xyXG4gIGFyYj86IG51bWJlcjtcclxuICBmcmFrc2k/OiBudW1iZXI7XHJcbiAgdG90YWxfYmlkPzogbnVtYmVyO1xyXG4gIHRvdGFsX29mZmVyPzogbnVtYmVyO1xyXG4gIHRvdGFsX3BhcGFuPzogbnVtYmVyO1xyXG4gIHJhdGFfcmF0YV9iaWRfb2Zlcj86IG51bWJlcjtcclxuICBhPzogbnVtYmVyO1xyXG4gIHA/OiBudW1iZXI7XHJcbiAgdGFyZ2V0X3JlYWxpc3Rpcz86IG51bWJlcjtcclxuICB0YXJnZXRfbWF4PzogbnVtYmVyO1xyXG59KSB7XHJcbiAgY29uc3QgeyBkYXRhOiByZXN1bHQsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxyXG4gICAgLmZyb20oJ3N0b2NrX3F1ZXJpZXMnKVxyXG4gICAgLnVwc2VydChbZGF0YV0sIHsgb25Db25mbGljdDogJ2Zyb21fZGF0ZSxlbWl0ZW4nIH0pXHJcbiAgICAuc2VsZWN0KCk7XHJcblxyXG4gIGlmIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHRvIFN1cGFiYXNlOicsIGVycm9yKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBzZXNzaW9uIHZhbHVlIGJ5IGtleVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNlc3Npb25WYWx1ZShrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xyXG4gIGNvbnN0IHsgZGF0YSwgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlXHJcbiAgICAuZnJvbSgnc2Vzc2lvbicpXHJcbiAgICAuc2VsZWN0KCd2YWx1ZScpXHJcbiAgICAuZXEoJ2tleScsIGtleSlcclxuICAgIC5zaW5nbGUoKTtcclxuXHJcbiAgaWYgKGVycm9yIHx8ICFkYXRhKSByZXR1cm4gbnVsbDtcclxuICByZXR1cm4gZGF0YS52YWx1ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFRva2VuIHN0YXR1cyBpbnRlcmZhY2VcclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgVG9rZW5TdGF0dXMge1xyXG4gIGV4aXN0czogYm9vbGVhbjtcclxuICBpc1ZhbGlkOiBib29sZWFuO1xyXG4gIHRva2VuPzogc3RyaW5nO1xyXG4gIGV4cGlyZXNBdD86IHN0cmluZztcclxuICBsYXN0VXNlZEF0Pzogc3RyaW5nO1xyXG4gIHVwZGF0ZWRBdD86IHN0cmluZztcclxuICBpc0V4cGlyaW5nU29vbjogYm9vbGVhbjsgIC8vIFdpdGhpbiAxIGhvdXIgb2YgZXhwaXJ5XHJcbiAgaXNFeHBpcmVkOiBib29sZWFuO1xyXG4gIGhvdXJzVW50aWxFeHBpcnk/OiBudW1iZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgZnVsbCB0b2tlbiBzdGF0dXMgaW5jbHVkaW5nIGV4cGlyeSBpbmZvcm1hdGlvblxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFRva2VuU3RhdHVzKCk6IFByb21pc2U8VG9rZW5TdGF0dXM+IHtcclxuICBjb25zdCB7IGRhdGEsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxyXG4gICAgLmZyb20oJ3Nlc3Npb24nKVxyXG4gICAgLnNlbGVjdCgndmFsdWUsIGV4cGlyZXNfYXQsIGxhc3RfdXNlZF9hdCwgaXNfdmFsaWQsIHVwZGF0ZWRfYXQnKVxyXG4gICAgLmVxKCdrZXknLCAnc3RvY2tiaXRfdG9rZW4nKVxyXG4gICAgLnNpbmdsZSgpO1xyXG5cclxuICBpZiAoZXJyb3IgfHwgIWRhdGEpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGV4aXN0czogZmFsc2UsXHJcbiAgICAgIGlzVmFsaWQ6IGZhbHNlLFxyXG4gICAgICBpc0V4cGlyaW5nU29vbjogZmFsc2UsXHJcbiAgICAgIGlzRXhwaXJlZDogdHJ1ZSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gIGNvbnN0IGV4cGlyZXNBdCA9IGRhdGEuZXhwaXJlc19hdCA/IG5ldyBEYXRlKGRhdGEuZXhwaXJlc19hdCkgOiBudWxsO1xyXG4gIGNvbnN0IGlzRXhwaXJlZCA9IGV4cGlyZXNBdCA/IGV4cGlyZXNBdCA8IG5vdyA6IGZhbHNlO1xyXG4gIGNvbnN0IGhvdXJzVW50aWxFeHBpcnkgPSBleHBpcmVzQXQgXHJcbiAgICA/IChleHBpcmVzQXQuZ2V0VGltZSgpIC0gbm93LmdldFRpbWUoKSkgLyAoMTAwMCAqIDYwICogNjApIFxyXG4gICAgOiB1bmRlZmluZWQ7XHJcbiAgY29uc3QgaXNFeHBpcmluZ1Nvb24gPSBob3Vyc1VudGlsRXhwaXJ5ICE9PSB1bmRlZmluZWQgJiYgaG91cnNVbnRpbEV4cGlyeSA8PSAxICYmIGhvdXJzVW50aWxFeHBpcnkgPiAwO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgZXhpc3RzOiB0cnVlLFxyXG4gICAgaXNWYWxpZDogZGF0YS5pc192YWxpZCAhPT0gZmFsc2UgJiYgIWlzRXhwaXJlZCxcclxuICAgIHRva2VuOiBkYXRhLnZhbHVlLFxyXG4gICAgZXhwaXJlc0F0OiBkYXRhLmV4cGlyZXNfYXQsXHJcbiAgICBsYXN0VXNlZEF0OiBkYXRhLmxhc3RfdXNlZF9hdCxcclxuICAgIHVwZGF0ZWRBdDogZGF0YS51cGRhdGVkX2F0LFxyXG4gICAgaXNFeHBpcmluZ1Nvb24sXHJcbiAgICBpc0V4cGlyZWQsXHJcbiAgICBob3Vyc1VudGlsRXhwaXJ5LFxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVcHNlcnQgc2Vzc2lvbiB2YWx1ZSB3aXRoIG9wdGlvbmFsIGV4cGlyeVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwc2VydFNlc3Npb24oXHJcbiAga2V5OiBzdHJpbmcsIFxyXG4gIHZhbHVlOiBzdHJpbmcsIFxyXG4gIGV4cGlyZXNBdD86IERhdGVcclxuKSB7XHJcbiAgY29uc3QgeyBkYXRhLCBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2VcclxuICAgIC5mcm9tKCdzZXNzaW9uJylcclxuICAgIC51cHNlcnQoXHJcbiAgICAgIHsgXHJcbiAgICAgICAga2V5LCBcclxuICAgICAgICB2YWx1ZSwgXHJcbiAgICAgICAgdXBkYXRlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIGV4cGlyZXNfYXQ6IGV4cGlyZXNBdD8udG9JU09TdHJpbmcoKSB8fCBudWxsLFxyXG4gICAgICAgIGlzX3ZhbGlkOiB0cnVlLFxyXG4gICAgICAgIGxhc3RfdXNlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB9LFxyXG4gICAgICB7IG9uQ29uZmxpY3Q6ICdrZXknIH1cclxuICAgIClcclxuICAgIC5zZWxlY3QoKTtcclxuXHJcbiAgaWYgKGVycm9yKSB0aHJvdyBlcnJvcjtcclxuICByZXR1cm4gZGF0YTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFVwZGF0ZSB0b2tlbiBsYXN0IHVzZWQgdGltZXN0YW1wIChjYWxsIGFmdGVyIHN1Y2Nlc3NmdWwgQVBJIHJlcXVlc3QpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlVG9rZW5MYXN0VXNlZCgpIHtcclxuICBjb25zdCB7IGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxyXG4gICAgLmZyb20oJ3Nlc3Npb24nKVxyXG4gICAgLnVwZGF0ZSh7IGxhc3RfdXNlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0pXHJcbiAgICAuZXEoJ2tleScsICdzdG9ja2JpdF90b2tlbicpO1xyXG5cclxuICBpZiAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHVwZGF0aW5nIHRva2VuIGxhc3RfdXNlZF9hdDonLCBlcnJvcik7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogTWFyayB0b2tlbiBhcyBpbnZhbGlkIChjYWxsIHdoZW4gcmVjZWl2aW5nIDQwMSBmcm9tIFN0b2NrYml0IEFQSSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbnZhbGlkYXRlVG9rZW4oKSB7XHJcbiAgY29uc3QgeyBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2VcclxuICAgIC5mcm9tKCdzZXNzaW9uJylcclxuICAgIC51cGRhdGUoeyBpc192YWxpZDogZmFsc2UgfSlcclxuICAgIC5lcSgna2V5JywgJ3N0b2NrYml0X3Rva2VuJyk7XHJcblxyXG4gIGlmIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW52YWxpZGF0aW5nIHRva2VuOicsIGVycm9yKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXQgdG9rZW4gZXhwaXJ5IHRpbWUgKHR5cGljYWxseSAyNCBob3VycyBmcm9tIGxvZ2luKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldFRva2VuRXhwaXJ5KGhvdXJzRnJvbU5vdzogbnVtYmVyID0gMjQpIHtcclxuICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZSgpO1xyXG4gIGV4cGlyZXNBdC5zZXRIb3VycyhleHBpcmVzQXQuZ2V0SG91cnMoKSArIGhvdXJzRnJvbU5vdyk7XHJcbiAgXHJcbiAgY29uc3QgeyBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2VcclxuICAgIC5mcm9tKCdzZXNzaW9uJylcclxuICAgIC51cGRhdGUoeyBleHBpcmVzX2F0OiBleHBpcmVzQXQudG9JU09TdHJpbmcoKSB9KVxyXG4gICAgLmVxKCdrZXknLCAnc3RvY2tiaXRfdG9rZW4nKTtcclxuXHJcbiAgaWYgKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzZXR0aW5nIHRva2VuIGV4cGlyeTonLCBlcnJvcik7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogU2F2ZSB3YXRjaGxpc3QgYW5hbHlzaXMgdG8gZGF0YWJhc2UgKHJldXNpbmcgc3RvY2tfcXVlcmllcyB0YWJsZSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlV2F0Y2hsaXN0QW5hbHlzaXMoZGF0YToge1xyXG4gIGZyb21fZGF0ZTogc3RyaW5nOyAgLy8gYW5hbHlzaXMgZGF0ZVxyXG4gIHRvX2RhdGU6IHN0cmluZzsgICAgLy8gc2FtZSBhcyBmcm9tX2RhdGUgZm9yIGRhaWx5IGFuYWx5c2lzXHJcbiAgZW1pdGVuOiBzdHJpbmc7XHJcbiAgc2VjdG9yPzogc3RyaW5nO1xyXG4gIGJhbmRhcj86IHN0cmluZztcclxuICBiYXJhbmdfYmFuZGFyPzogbnVtYmVyO1xyXG4gIHJhdGFfcmF0YV9iYW5kYXI/OiBudW1iZXI7XHJcbiAgaGFyZ2E/OiBudW1iZXI7XHJcbiAgYXJhPzogbnVtYmVyOyAgICAgICAvLyBvZmZlcl90ZXJhdGFzXHJcbiAgYXJiPzogbnVtYmVyOyAgICAgICAvLyBiaWRfdGVyYmF3YWhcclxuICBmcmFrc2k/OiBudW1iZXI7XHJcbiAgdG90YWxfYmlkPzogbnVtYmVyO1xyXG4gIHRvdGFsX29mZmVyPzogbnVtYmVyO1xyXG4gIHRvdGFsX3BhcGFuPzogbnVtYmVyO1xyXG4gIHJhdGFfcmF0YV9iaWRfb2Zlcj86IG51bWJlcjtcclxuICBhPzogbnVtYmVyO1xyXG4gIHA/OiBudW1iZXI7XHJcbiAgdGFyZ2V0X3JlYWxpc3Rpcz86IG51bWJlcjtcclxuICB0YXJnZXRfbWF4PzogbnVtYmVyO1xyXG4gIHN0YXR1cz86IHN0cmluZztcclxuICBlcnJvcl9tZXNzYWdlPzogc3RyaW5nO1xyXG59KSB7XHJcbiAgY29uc3QgeyBkYXRhOiByZXN1bHQsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxyXG4gICAgLmZyb20oJ3N0b2NrX3F1ZXJpZXMnKVxyXG4gICAgLnVwc2VydChbZGF0YV0sIHsgb25Db25mbGljdDogJ2Zyb21fZGF0ZSxlbWl0ZW4nIH0pXHJcbiAgICAuc2VsZWN0KCk7XHJcblxyXG4gIGlmIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHdhdGNobGlzdCBhbmFseXNpczonLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcblxyXG4gIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgd2F0Y2hsaXN0IGFuYWx5c2lzIGhpc3Rvcnkgd2l0aCBvcHRpb25hbCBmaWx0ZXJzXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0V2F0Y2hsaXN0QW5hbHlzaXNIaXN0b3J5KGZpbHRlcnM/OiB7XHJcbiAgZW1pdGVuPzogc3RyaW5nO1xyXG4gIHNlY3Rvcj86IHN0cmluZztcclxuICBmcm9tRGF0ZT86IHN0cmluZztcclxuICB0b0RhdGU/OiBzdHJpbmc7XHJcbiAgc3RhdHVzPzogc3RyaW5nO1xyXG4gIGxpbWl0PzogbnVtYmVyO1xyXG4gIG9mZnNldD86IG51bWJlcjtcclxuICBzb3J0Qnk/OiBzdHJpbmc7XHJcbiAgc29ydE9yZGVyPzogJ2FzYycgfCAnZGVzYyc7XHJcbn0pIHtcclxuICBsZXQgcXVlcnkgPSBzdXBhYmFzZVxyXG4gICAgLmZyb20oJ3N0b2NrX3F1ZXJpZXMnKVxyXG4gICAgLnNlbGVjdCgnKicsIHsgY291bnQ6ICdleGFjdCcgfSk7XHJcblxyXG4gIC8vIEhhbmRsZSBzb3J0aW5nXHJcbiAgY29uc3Qgc29ydEJ5ID0gZmlsdGVycz8uc29ydEJ5IHx8ICdmcm9tX2RhdGUnO1xyXG4gIGNvbnN0IHNvcnRPcmRlciA9IGZpbHRlcnM/LnNvcnRPcmRlciB8fCAnZGVzYyc7XHJcblxyXG4gIGlmIChzb3J0QnkgPT09ICdjb21iaW5lZCcpIHtcclxuICAgIC8vIFNvcnQgYnkgZGF0ZSB0aGVuIGVtaXRlblxyXG4gICAgcXVlcnkgPSBxdWVyeVxyXG4gICAgICAub3JkZXIoJ2Zyb21fZGF0ZScsIHsgYXNjZW5kaW5nOiBzb3J0T3JkZXIgPT09ICdhc2MnIH0pXHJcbiAgICAgIC5vcmRlcignZW1pdGVuJywgeyBhc2NlbmRpbmc6IHNvcnRPcmRlciA9PT0gJ2FzYycgfSk7XHJcbiAgfSBlbHNlIGlmIChzb3J0QnkgPT09ICdlbWl0ZW4nKSB7XHJcbiAgICAvLyBXaGVuIHNvcnRpbmcgYnkgZW1pdGVuLCBzZWNvbmRhcnkgc29ydCBieSBkYXRlIGFzY2VuZGluZ1xyXG4gICAgcXVlcnkgPSBxdWVyeVxyXG4gICAgICAub3JkZXIoJ2VtaXRlbicsIHsgYXNjZW5kaW5nOiBzb3J0T3JkZXIgPT09ICdhc2MnIH0pXHJcbiAgICAgIC5vcmRlcignZnJvbV9kYXRlJywgeyBhc2NlbmRpbmc6IHRydWUgfSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIHF1ZXJ5ID0gcXVlcnkub3JkZXIoc29ydEJ5LCB7IGFzY2VuZGluZzogc29ydE9yZGVyID09PSAnYXNjJyB9KTtcclxuICB9XHJcblxyXG4gIGlmIChmaWx0ZXJzPy5lbWl0ZW4pIHtcclxuICAgIGNvbnN0IGVtaXRlbkxpc3QgPSBmaWx0ZXJzLmVtaXRlbi5zcGxpdCgvXFxzKy8pLmZpbHRlcihCb29sZWFuKTtcclxuICAgIGlmIChlbWl0ZW5MaXN0Lmxlbmd0aCA+IDApIHsgLy8gQ2hhbmdlZCB0byBhbHdheXMgdXNlIC5pbigpIGlmIGVtaXRlbnMgYXJlIHByZXNlbnRcclxuICAgICAgcXVlcnkgPSBxdWVyeS5pbignZW1pdGVuJywgZW1pdGVuTGlzdCk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIGlmIChmaWx0ZXJzPy5zZWN0b3IpIHtcclxuICAgIHF1ZXJ5ID0gcXVlcnkuZXEoJ3NlY3RvcicsIGZpbHRlcnMuc2VjdG9yKTtcclxuICB9XHJcbiAgaWYgKGZpbHRlcnM/LmZyb21EYXRlKSB7XHJcbiAgICBxdWVyeSA9IHF1ZXJ5Lmd0ZSgnZnJvbV9kYXRlJywgZmlsdGVycy5mcm9tRGF0ZSk7XHJcbiAgfVxyXG4gIGlmIChmaWx0ZXJzPy50b0RhdGUpIHtcclxuICAgIHF1ZXJ5ID0gcXVlcnkubHRlKCdmcm9tX2RhdGUnLCBmaWx0ZXJzLnRvRGF0ZSk7XHJcbiAgfVxyXG4gIGlmIChmaWx0ZXJzPy5zdGF0dXMpIHtcclxuICAgIHF1ZXJ5ID0gcXVlcnkuZXEoJ3N0YXR1cycsIGZpbHRlcnMuc3RhdHVzKTtcclxuICB9XHJcbiAgaWYgKGZpbHRlcnM/LmxpbWl0KSB7XHJcbiAgICBxdWVyeSA9IHF1ZXJ5LmxpbWl0KGZpbHRlcnMubGltaXQpO1xyXG4gIH1cclxuICBpZiAoZmlsdGVycz8ub2Zmc2V0KSB7XHJcbiAgICBxdWVyeSA9IHF1ZXJ5LnJhbmdlKGZpbHRlcnMub2Zmc2V0LCBmaWx0ZXJzLm9mZnNldCArIChmaWx0ZXJzLmxpbWl0IHx8IDUwKSAtIDEpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgeyBkYXRhLCBlcnJvciwgY291bnQgfSA9IGF3YWl0IHF1ZXJ5O1xyXG5cclxuICBpZiAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIHdhdGNobGlzdCBhbmFseXNpczonLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcblxyXG4gIHJldHVybiB7IGRhdGEsIGNvdW50IH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgbGF0ZXN0IHN0b2NrIHF1ZXJ5IGZvciBhIHNwZWNpZmljIGVtaXRlblxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldExhdGVzdFN0b2NrUXVlcnkoZW1pdGVuOiBzdHJpbmcpIHtcclxuICBjb25zdCB7IGRhdGEsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxyXG4gICAgLmZyb20oJ3N0b2NrX3F1ZXJpZXMnKVxyXG4gICAgLnNlbGVjdCgnKicpXHJcbiAgICAuZXEoJ2VtaXRlbicsIGVtaXRlbilcclxuICAgIC5lcSgnc3RhdHVzJywgJ3N1Y2Nlc3MnKVxyXG4gICAgLm9yZGVyKCdmcm9tX2RhdGUnLCB7IGFzY2VuZGluZzogZmFsc2UgfSlcclxuICAgIC5saW1pdCgxKVxyXG4gICAgLnNpbmdsZSgpO1xyXG5cclxuICBpZiAoZXJyb3IpIHJldHVybiBudWxsO1xyXG4gIHJldHVybiBkYXRhO1xyXG59XHJcblxyXG4vKipcclxuICogVXBkYXRlIHRoZSBtb3N0IHJlY2VudCBwcmV2aW91cyBkYXkncyByZWFsIHByaWNlIGZvciBhbiBlbWl0ZW5cclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVQcmV2aW91c0RheVJlYWxQcmljZShlbWl0ZW46IHN0cmluZywgY3VycmVudERhdGU6IHN0cmluZywgcHJpY2U6IG51bWJlcikge1xyXG4gIC8vIDEuIEZpbmQgdGhlIGxhdGVzdCBzdWNjZXNzZnVsIHJlY29yZCBiZWZvcmUgY3VycmVudERhdGVcclxuICBjb25zdCB7IGRhdGE6IHJlY29yZCwgZXJyb3I6IGZpbmRFcnJvciB9ID0gYXdhaXQgc3VwYWJhc2VcclxuICAgIC5mcm9tKCdzdG9ja19xdWVyaWVzJylcclxuICAgIC5zZWxlY3QoJ2lkLCBmcm9tX2RhdGUnKVxyXG4gICAgLmVxKCdlbWl0ZW4nLCBlbWl0ZW4pXHJcbiAgICAuZXEoJ3N0YXR1cycsICdzdWNjZXNzJylcclxuICAgIC5sdCgnZnJvbV9kYXRlJywgY3VycmVudERhdGUpXHJcbiAgICAub3JkZXIoJ2Zyb21fZGF0ZScsIHsgYXNjZW5kaW5nOiBmYWxzZSB9KVxyXG4gICAgLmxpbWl0KDEpXHJcbiAgICAuc2luZ2xlKCk7XHJcblxyXG4gIGlmIChmaW5kRXJyb3IgfHwgIXJlY29yZCkge1xyXG4gICAgaWYgKGZpbmRFcnJvciAmJiBmaW5kRXJyb3IuY29kZSAhPT0gJ1BHUlNUMTE2JykgeyAvLyBQR1JTVDExNiBpcyBcIm5vIHJvd3MgcmV0dXJuZWRcIlxyXG4gICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBmaW5kaW5nIHByZXZpb3VzIHJlY29yZCBmb3IgJHtlbWl0ZW59IGJlZm9yZSAke2N1cnJlbnREYXRlfTpgLCBmaW5kRXJyb3IpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICAvLyAyLiBVcGRhdGUgdGhhdCByZWNvcmQgd2l0aCB0aGUgbmV3IHByaWNlXHJcbiAgY29uc3QgeyBkYXRhLCBlcnJvcjogdXBkYXRlRXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlXHJcbiAgICAuZnJvbSgnc3RvY2tfcXVlcmllcycpXHJcbiAgICAudXBkYXRlKHsgcmVhbF9oYXJnYTogcHJpY2UgfSlcclxuICAgIC5lcSgnaWQnLCByZWNvcmQuaWQpXHJcbiAgICAuc2VsZWN0KCk7XHJcblxyXG4gIGlmICh1cGRhdGVFcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihgRXJyb3IgdXBkYXRpbmcgcmVhbF9oYXJnYSBmb3IgJHtlbWl0ZW59IG9uICR7cmVjb3JkLmZyb21fZGF0ZX06YCwgdXBkYXRlRXJyb3IpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGRhdGE7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgYSBuZXcgYWdlbnQgc3RvcnkgcmVjb3JkIHdpdGggcGVuZGluZyBzdGF0dXNcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVBZ2VudFN0b3J5KGVtaXRlbjogc3RyaW5nKSB7XHJcbiAgY29uc3QgeyBkYXRhLCBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2VcclxuICAgIC5mcm9tKCdhZ2VudF9zdG9yaWVzJylcclxuICAgIC5pbnNlcnQoeyBlbWl0ZW4sIHN0YXR1czogJ3BlbmRpbmcnIH0pXHJcbiAgICAuc2VsZWN0KClcclxuICAgIC5zaW5nbGUoKTtcclxuXHJcbiAgaWYgKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyBhZ2VudCBzdG9yeTonLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcblxyXG4gIHJldHVybiBkYXRhO1xyXG59XHJcblxyXG4vKipcclxuICogVXBkYXRlIGFnZW50IHN0b3J5IHdpdGggcmVzdWx0IG9yIGVycm9yXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlQWdlbnRTdG9yeShpZDogbnVtYmVyLCBkYXRhOiB7XHJcbiAgc3RhdHVzOiAncHJvY2Vzc2luZycgfCAnY29tcGxldGVkJyB8ICdlcnJvcic7XHJcbiAgbWF0cmlrc19zdG9yeT86IG9iamVjdFtdO1xyXG4gIHN3b3RfYW5hbHlzaXM/OiBvYmplY3Q7XHJcbiAgY2hlY2tsaXN0X2thdGFsaXM/OiBvYmplY3RbXTtcclxuICBrZXlzdGF0X3NpZ25hbD86IHN0cmluZztcclxuICBzdHJhdGVnaV90cmFkaW5nPzogb2JqZWN0O1xyXG4gIGtlc2ltcHVsYW4/OiBzdHJpbmc7XHJcbiAgZXJyb3JfbWVzc2FnZT86IHN0cmluZztcclxufSkge1xyXG4gIGNvbnN0IHsgZGF0YTogcmVzdWx0LCBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2VcclxuICAgIC5mcm9tKCdhZ2VudF9zdG9yaWVzJylcclxuICAgIC51cGRhdGUoZGF0YSlcclxuICAgIC5lcSgnaWQnLCBpZClcclxuICAgIC5zZWxlY3QoKVxyXG4gICAgLnNpbmdsZSgpO1xyXG5cclxuICBpZiAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHVwZGF0aW5nIGFnZW50IHN0b3J5OicsIGVycm9yKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBsYXRlc3QgYWdlbnQgc3RvcnkgZm9yIGFuIGVtaXRlblxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEFnZW50U3RvcnlCeUVtaXRlbihlbWl0ZW46IHN0cmluZykge1xyXG4gIGNvbnN0IHsgZGF0YSwgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlXHJcbiAgICAuZnJvbSgnYWdlbnRfc3RvcmllcycpXHJcbiAgICAuc2VsZWN0KCcqJylcclxuICAgIC5lcSgnZW1pdGVuJywgZW1pdGVuLnRvVXBwZXJDYXNlKCkpXHJcbiAgICAub3JkZXIoJ2NyZWF0ZWRfYXQnLCB7IGFzY2VuZGluZzogZmFsc2UgfSlcclxuICAgIC5saW1pdCgxKVxyXG4gICAgLnNpbmdsZSgpO1xyXG5cclxuICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSAhPT0gJ1BHUlNUMTE2Jykge1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZmV0Y2hpbmcgYWdlbnQgc3Rvcnk6JywgZXJyb3IpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGRhdGEgfHwgbnVsbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBhbGwgYWdlbnQgc3RvcmllcyBmb3IgYW4gZW1pdGVuXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0QWdlbnRTdG9yaWVzQnlFbWl0ZW4oZW1pdGVuOiBzdHJpbmcsIGxpbWl0OiBudW1iZXIgPSAyMCkge1xyXG4gIGNvbnN0IHsgZGF0YSwgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlXHJcbiAgICAuZnJvbSgnYWdlbnRfc3RvcmllcycpXHJcbiAgICAuc2VsZWN0KCcqJylcclxuICAgIC5lcSgnZW1pdGVuJywgZW1pdGVuLnRvVXBwZXJDYXNlKCkpXHJcbiAgICAub3JkZXIoJ2NyZWF0ZWRfYXQnLCB7IGFzY2VuZGluZzogZmFsc2UgfSlcclxuICAgIC5saW1pdChsaW1pdCk7XHJcblxyXG4gIGlmIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZmV0Y2hpbmcgYWdlbnQgc3RvcmllczonLCBlcnJvcik7XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcblxyXG4gIHJldHVybiBkYXRhIHx8IFtdO1xyXG59XHJcblxyXG4iLCAiaW1wb3J0IHR5cGUgeyBNYXJrZXREZXRlY3RvclJlc3BvbnNlLCBPcmRlcmJvb2tSZXNwb25zZSwgQnJva2VyRGF0YSwgV2F0Y2hsaXN0UmVzcG9uc2UsIEJyb2tlclN1bW1hcnlEYXRhLCBFbWl0ZW5JbmZvUmVzcG9uc2UsIEtleVN0YXRzUmVzcG9uc2UsIEtleVN0YXRzRGF0YSwgS2V5U3RhdHNJdGVtIH0gZnJvbSAnLi90eXBlcyc7XHJcbmltcG9ydCB7IGdldFNlc3Npb25WYWx1ZSwgdXBkYXRlVG9rZW5MYXN0VXNlZCwgaW52YWxpZGF0ZVRva2VuIH0gZnJvbSAnLi9zdXBhYmFzZSc7XHJcblxyXG5jb25zdCBTVE9DS0JJVF9CQVNFX1VSTCA9ICdodHRwczovL2V4b2R1cy5zdG9ja2JpdC5jb20nO1xyXG5jb25zdCBTVE9DS0JJVF9BVVRIX1VSTCA9ICdodHRwczovL3N0b2NrYml0LmNvbSc7XHJcblxyXG4vLyBDdXN0b20gZXJyb3IgZm9yIHRva2VuIGV4cGlyeSAtIGFsbG93cyBVSSB0byBkZXRlY3QgYW5kIHNob3cgcmVmcmVzaCBwcm9tcHRcclxuZXhwb3J0IGNsYXNzIFRva2VuRXhwaXJlZEVycm9yIGV4dGVuZHMgRXJyb3Ige1xyXG4gIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZyA9ICdUb2tlbiBoYXMgZXhwaXJlZCBvciBpcyBpbnZhbGlkLiBQbGVhc2UgbG9naW4gdG8gU3RvY2tiaXQgYWdhaW4uJykge1xyXG4gICAgc3VwZXIobWVzc2FnZSk7XHJcbiAgICB0aGlzLm5hbWUgPSAnVG9rZW5FeHBpcmVkRXJyb3InO1xyXG4gIH1cclxufVxyXG5cclxuLy8gQ2FjaGUgdG9rZW4gdG8gcmVkdWNlIGRhdGFiYXNlIGNhbGxzXHJcbmxldCBjYWNoZWRUb2tlbjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XHJcbmxldCB0b2tlbkxhc3RGZXRjaGVkOiBudW1iZXIgPSAwO1xyXG5jb25zdCBUT0tFTl9DQUNIRV9EVVJBVElPTiA9IDYwMDAwOyAvLyAxIG1pbnV0ZVxyXG5cclxuLy8gQ2FjaGUgc2VjdG9yIGRhdGEgdG8gcmVkdWNlIEFQSSBjYWxsc1xyXG5jb25zdCBzZWN0b3JDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCB7IHNlY3Rvcjogc3RyaW5nOyB0aW1lc3RhbXA6IG51bWJlciB9PigpO1xyXG5jb25zdCBTRUNUT1JfQ0FDSEVfRFVSQVRJT04gPSAzNjAwMDAwOyAvLyAxIGhvdXJcclxuXHJcbi8vIENhY2hlIGZvciBzZWN0b3JzIGxpc3RcclxubGV0IHNlY3RvcnNMaXN0Q2FjaGU6IHsgc2VjdG9yczogc3RyaW5nW107IHRpbWVzdGFtcDogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcclxuY29uc3QgU0VDVE9SU19MSVNUX0NBQ0hFX0RVUkFUSU9OID0gODY0MDAwMDA7IC8vIDI0IGhvdXJzXHJcblxyXG4vKipcclxuICogR2V0IEpXVCB0b2tlbiBmcm9tIGRhdGFiYXNlIG9yIGVudmlyb25tZW50XHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRBdXRoVG9rZW4oKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG5cclxuICAvLyBSZXR1cm4gY2FjaGVkIHRva2VuIGlmIHN0aWxsIHZhbGlkXHJcbiAgaWYgKGNhY2hlZFRva2VuICYmIChub3cgLSB0b2tlbkxhc3RGZXRjaGVkKSA8IFRPS0VOX0NBQ0hFX0RVUkFUSU9OKSB7XHJcbiAgICByZXR1cm4gY2FjaGVkVG9rZW47XHJcbiAgfVxyXG5cclxuICAvLyBGZXRjaCBmcm9tIGRhdGFiYXNlXHJcbiAgY29uc3QgdG9rZW4gPSBhd2FpdCBnZXRTZXNzaW9uVmFsdWUoJ3N0b2NrYml0X3Rva2VuJyk7XHJcblxyXG4gIC8vIEZhbGxiYWNrIHRvIGVudiBpZiBkYXRhYmFzZSB0b2tlbiBub3QgZm91bmRcclxuICBpZiAoIXRva2VuKSB7XHJcbiAgICBjb25zdCBlbnZUb2tlbiA9IHByb2Nlc3MuZW52LlNUT0NLQklUX0pXVF9UT0tFTjtcclxuICAgIGlmICghZW52VG9rZW4pIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTVE9DS0JJVF9KV1RfVE9LRU4gbm90IGZvdW5kIGluIGRhdGFiYXNlIG9yIGVudmlyb25tZW50Jyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZW52VG9rZW47XHJcbiAgfVxyXG5cclxuICAvLyBVcGRhdGUgY2FjaGVcclxuICBjYWNoZWRUb2tlbiA9IHRva2VuO1xyXG4gIHRva2VuTGFzdEZldGNoZWQgPSBub3c7XHJcblxyXG4gIHJldHVybiB0b2tlbjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbW1vbiBoZWFkZXJzIGZvciBTdG9ja2JpdCBBUElcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGdldEhlYWRlcnMoKTogUHJvbWlzZTxIZWFkZXJzSW5pdD4ge1xyXG4gIHJldHVybiB7XHJcbiAgICAnYWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgJ2F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7YXdhaXQgZ2V0QXV0aFRva2VuKCl9YCxcclxuICAgICdvcmlnaW4nOiAnaHR0cHM6Ly9zdG9ja2JpdC5jb20nLFxyXG4gICAgJ3JlZmVyZXInOiAnaHR0cHM6Ly9zdG9ja2JpdC5jb20vJyxcclxuICAgICd1c2VyLWFnZW50JzogJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xNDMuMC4wLjAgU2FmYXJpLzUzNy4zNicsXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEhhbmRsZSBBUEkgcmVzcG9uc2UgLSBjaGVjayBmb3IgNDAxIGFuZCB1cGRhdGUgdG9rZW4gc3RhdHVzXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVBcGlSZXNwb25zZShyZXNwb25zZTogUmVzcG9uc2UsIGFwaU5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwMSkge1xyXG4gICAgLy8gVG9rZW4gaXMgaW52YWxpZCAtIG1hcmsgaXQgYW5kIGNsZWFyIGNhY2hlXHJcbiAgICBhd2FpdCBpbnZhbGlkYXRlVG9rZW4oKTtcclxuICAgIGNhY2hlZFRva2VuID0gbnVsbDtcclxuICAgIHRocm93IG5ldyBUb2tlbkV4cGlyZWRFcnJvcihgJHthcGlOYW1lfTogVG9rZW4gZXhwaXJlZCBvciBpbnZhbGlkICg0MDEpYCk7XHJcbiAgfVxyXG4gIFxyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgJHthcGlOYW1lfSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICB9XHJcbiAgXHJcbiAgLy8gVG9rZW4gaXMgdmFsaWQgLSB1cGRhdGUgbGFzdCB1c2VkIHRpbWVzdGFtcCAoZmlyZSBhbmQgZm9yZ2V0KVxyXG4gIHVwZGF0ZVRva2VuTGFzdFVzZWQoKS5jYXRjaCgoKSA9PiB7fSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGZXRjaCBNYXJrZXQgRGV0ZWN0b3IgZGF0YSAoYnJva2VyIGluZm9ybWF0aW9uKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoTWFya2V0RGV0ZWN0b3IoXHJcbiAgZW1pdGVuOiBzdHJpbmcsXHJcbiAgZnJvbURhdGU6IHN0cmluZyxcclxuICB0b0RhdGU6IHN0cmluZ1xyXG4pOiBQcm9taXNlPE1hcmtldERldGVjdG9yUmVzcG9uc2U+IHtcclxuICBjb25zdCB1cmwgPSBuZXcgVVJMKGAke1NUT0NLQklUX0JBU0VfVVJMfS9tYXJrZXRkZXRlY3RvcnMvJHtlbWl0ZW59YCk7XHJcbiAgdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoJ2Zyb20nLCBmcm9tRGF0ZSk7XHJcbiAgdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoJ3RvJywgdG9EYXRlKTtcclxuICB1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZCgndHJhbnNhY3Rpb25fdHlwZScsICdUUkFOU0FDVElPTl9UWVBFX05FVCcpO1xyXG4gIHVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKCdtYXJrZXRfYm9hcmQnLCAnTUFSS0VUX0JPQVJEX1JFR1VMRVInKTtcclxuICB1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZCgnaW52ZXN0b3JfdHlwZScsICdJTlZFU1RPUl9UWVBFX0FMTCcpO1xyXG4gIHVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKCdsaW1pdCcsICcyNScpO1xyXG5cclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybC50b1N0cmluZygpLCB7XHJcbiAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgaGVhZGVyczogYXdhaXQgZ2V0SGVhZGVycygpLFxyXG4gIH0pO1xyXG5cclxuICBhd2FpdCBoYW5kbGVBcGlSZXNwb25zZShyZXNwb25zZSwgJ01hcmtldCBEZXRlY3RvciBBUEknKTtcclxuXHJcbiAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZldGNoIE9yZGVyYm9vayBkYXRhIChtYXJrZXQgZGF0YSlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaE9yZGVyYm9vayhlbWl0ZW46IHN0cmluZyk6IFByb21pc2U8T3JkZXJib29rUmVzcG9uc2U+IHtcclxuICBjb25zdCB1cmwgPSBgJHtTVE9DS0JJVF9CQVNFX1VSTH0vY29tcGFueS1wcmljZS1mZWVkL3YyL29yZGVyYm9vay9jb21wYW5pZXMvJHtlbWl0ZW59YDtcclxuXHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICBoZWFkZXJzOiBhd2FpdCBnZXRIZWFkZXJzKCksXHJcbiAgfSk7XHJcblxyXG4gIGF3YWl0IGhhbmRsZUFwaVJlc3BvbnNlKHJlc3BvbnNlLCAnT3JkZXJib29rIEFQSScpO1xyXG5cclxuICByZXR1cm4gcmVzcG9uc2UuanNvbigpO1xyXG59XHJcblxyXG4vKipcclxuICogRmV0Y2ggRW1pdGVuIEluZm8gKGluY2x1ZGluZyBzZWN0b3IpXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hFbWl0ZW5JbmZvKGVtaXRlbjogc3RyaW5nKTogUHJvbWlzZTxFbWl0ZW5JbmZvUmVzcG9uc2U+IHtcclxuICAvLyBDaGVjayBjYWNoZSBmaXJzdFxyXG4gIGNvbnN0IGNhY2hlZCA9IHNlY3RvckNhY2hlLmdldChlbWl0ZW4udG9VcHBlckNhc2UoKSk7XHJcbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcclxuICBcclxuICBpZiAoY2FjaGVkICYmIChub3cgLSBjYWNoZWQudGltZXN0YW1wKSA8IFNFQ1RPUl9DQUNIRV9EVVJBVElPTikge1xyXG4gICAgLy8gUmV0dXJuIGNhY2hlZCBkYXRhIGluIHRoZSBleHBlY3RlZCBmb3JtYXRcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGRhdGE6IHtcclxuICAgICAgICBzZWN0b3I6IGNhY2hlZC5zZWN0b3IsXHJcbiAgICAgICAgc3ViX3NlY3RvcjogJycsXHJcbiAgICAgICAgc3ltYm9sOiBlbWl0ZW4sXHJcbiAgICAgICAgbmFtZTogJycsXHJcbiAgICAgICAgcHJpY2U6ICcwJyxcclxuICAgICAgICBjaGFuZ2U6ICcwJyxcclxuICAgICAgICBwZXJjZW50YWdlOiAwLFxyXG4gICAgICB9LFxyXG4gICAgICBtZXNzYWdlOiAnU3VjY2Vzc2Z1bGx5IHJldHJpZXZlZCBjb21wYW55IGRhdGEgKGNhY2hlZCknLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHVybCA9IGAke1NUT0NLQklUX0JBU0VfVVJMfS9lbWl0dGVuLyR7ZW1pdGVufS9pbmZvYDtcclxuXHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcclxuICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICBoZWFkZXJzOiBhd2FpdCBnZXRIZWFkZXJzKCksXHJcbiAgfSk7XHJcblxyXG4gIGF3YWl0IGhhbmRsZUFwaVJlc3BvbnNlKHJlc3BvbnNlLCAnRW1pdGVuIEluZm8gQVBJJyk7XHJcblxyXG4gIGNvbnN0IGRhdGE6IEVtaXRlbkluZm9SZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICBcclxuICAvLyBDYWNoZSB0aGUgc2VjdG9yIGRhdGFcclxuICBpZiAoZGF0YS5kYXRhPy5zZWN0b3IpIHtcclxuICAgIHNlY3RvckNhY2hlLnNldChlbWl0ZW4udG9VcHBlckNhc2UoKSwge1xyXG4gICAgICBzZWN0b3I6IGRhdGEuZGF0YS5zZWN0b3IsXHJcbiAgICAgIHRpbWVzdGFtcDogbm93LFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gZGF0YTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZldGNoIGFsbCBzZWN0b3JzIGxpc3RcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaFNlY3RvcnMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xyXG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcbiAgXHJcbiAgLy8gQ2hlY2sgY2FjaGUgZmlyc3RcclxuICBpZiAoc2VjdG9yc0xpc3RDYWNoZSAmJiAobm93IC0gc2VjdG9yc0xpc3RDYWNoZS50aW1lc3RhbXApIDwgU0VDVE9SU19MSVNUX0NBQ0hFX0RVUkFUSU9OKSB7XHJcbiAgICByZXR1cm4gc2VjdG9yc0xpc3RDYWNoZS5zZWN0b3JzO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgdXJsID0gYCR7U1RPQ0tCSVRfQkFTRV9VUkx9L2VtaXR0ZW4vc2VjdG9yc2A7XHJcblxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgaGVhZGVyczogYXdhaXQgZ2V0SGVhZGVycygpLFxyXG4gIH0pO1xyXG5cclxuICBhd2FpdCBoYW5kbGVBcGlSZXNwb25zZShyZXNwb25zZSwgJ1NlY3RvcnMgQVBJJyk7XHJcblxyXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgY29uc3Qgc2VjdG9yczogc3RyaW5nW10gPSAoZGF0YS5kYXRhIHx8IFtdKS5tYXAoKGl0ZW06IHsgbmFtZTogc3RyaW5nIH0pID0+IGl0ZW0ubmFtZSkuZmlsdGVyKEJvb2xlYW4pO1xyXG4gIFxyXG4gIC8vIENhY2hlIHRoZSBzZWN0b3JzIGxpc3RcclxuICBzZWN0b3JzTGlzdENhY2hlID0ge1xyXG4gICAgc2VjdG9ycyxcclxuICAgIHRpbWVzdGFtcDogbm93LFxyXG4gIH07XHJcblxyXG4gIHJldHVybiBzZWN0b3JzO1xyXG59XHJcblxyXG5cclxuLyoqXHJcbiAqIEZldGNoIFdhdGNobGlzdCBkYXRhXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hXYXRjaGxpc3QoKTogUHJvbWlzZTxXYXRjaGxpc3RSZXNwb25zZT4ge1xyXG4gIC8vIFN0ZXAgMTogR2V0IFdhdGNobGlzdCBJRFxyXG4gIGNvbnN0IG1ldGFVcmwgPSBgJHtTVE9DS0JJVF9CQVNFX1VSTH0vd2F0Y2hsaXN0P3BhZ2U9MSZsaW1pdD01MDBgO1xyXG4gIGNvbnN0IG1ldGFSZXNwb25zZSA9IGF3YWl0IGZldGNoKG1ldGFVcmwsIHtcclxuICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICBoZWFkZXJzOiBhd2FpdCBnZXRIZWFkZXJzKCksXHJcbiAgfSk7XHJcblxyXG4gIGF3YWl0IGhhbmRsZUFwaVJlc3BvbnNlKG1ldGFSZXNwb25zZSwgJ1dhdGNobGlzdCBNZXRhIEFQSScpO1xyXG5cclxuICBjb25zdCBtZXRhSnNvbiA9IGF3YWl0IG1ldGFSZXNwb25zZS5qc29uKCk7XHJcblxyXG4gIGNvbnN0IHdhdGNobGlzdHMgPSBBcnJheS5pc0FycmF5KG1ldGFKc29uLmRhdGEpID8gbWV0YUpzb24uZGF0YSA6IFttZXRhSnNvbi5kYXRhXTtcclxuICBjb25zdCBkZWZhdWx0V2F0Y2hsaXN0ID0gd2F0Y2hsaXN0cy5maW5kKCh3OiBhbnkpID0+IHcuaXNfZGVmYXVsdCkgfHwgd2F0Y2hsaXN0c1swXTtcclxuICBjb25zdCB3YXRjaGxpc3RJZCA9IGRlZmF1bHRXYXRjaGxpc3Q/LndhdGNobGlzdF9pZDtcclxuXHJcbiAgaWYgKCF3YXRjaGxpc3RJZCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBObyB3YXRjaGxpc3RfaWQgZm91bmQgaW4gcmVzcG9uc2U6ICR7SlNPTi5zdHJpbmdpZnkobWV0YUpzb24pfWApO1xyXG4gIH1cclxuXHJcbiAgLy8gU3RlcCAyOiBHZXQgV2F0Y2hsaXN0IERldGFpbHNcclxuICBjb25zdCBkZXRhaWxVcmwgPSBgJHtTVE9DS0JJVF9CQVNFX1VSTH0vd2F0Y2hsaXN0LyR7d2F0Y2hsaXN0SWR9P3BhZ2U9MSZsaW1pdD01MDBgO1xyXG4gIGNvbnN0IGRldGFpbFJlc3BvbnNlID0gYXdhaXQgZmV0Y2goZGV0YWlsVXJsLCB7XHJcbiAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgaGVhZGVyczogYXdhaXQgZ2V0SGVhZGVycygpLFxyXG4gIH0pO1xyXG5cclxuICBhd2FpdCBoYW5kbGVBcGlSZXNwb25zZShkZXRhaWxSZXNwb25zZSwgJ1dhdGNobGlzdCBEZXRhaWwgQVBJJyk7XHJcblxyXG4gIGNvbnN0IGRldGFpbEpzb24gPSBhd2FpdCBkZXRhaWxSZXNwb25zZS5qc29uKCk7XHJcblxyXG4gIC8vIE1hcCBzeW1ib2wgdG8gY29tcGFueV9jb2RlIGZvciBjb21wYXRpYmlsaXR5XHJcbiAgaWYgKGRldGFpbEpzb24uZGF0YT8ucmVzdWx0KSB7XHJcbiAgICBkZXRhaWxKc29uLmRhdGEucmVzdWx0ID0gZGV0YWlsSnNvbi5kYXRhLnJlc3VsdC5tYXAoKGl0ZW06IGFueSkgPT4gKHtcclxuICAgICAgLi4uaXRlbSxcclxuICAgICAgY29tcGFueV9jb2RlOiBpdGVtLnN5bWJvbCB8fCBpdGVtLmNvbXBhbnlfY29kZVxyXG4gICAgfSkpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGRldGFpbEpzb247XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgdG9wIGJyb2tlciBieSBCVkFMIGZyb20gTWFya2V0IERldGVjdG9yIHJlc3BvbnNlXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0VG9wQnJva2VyKG1hcmtldERldGVjdG9yRGF0YTogTWFya2V0RGV0ZWN0b3JSZXNwb25zZSk6IEJyb2tlckRhdGEgfCBudWxsIHtcclxuICAvLyBEZWJ1ZyBsb2cgdG8gc2VlIGFjdHVhbCBBUEkgcmVzcG9uc2Ugc3RydWN0dXJlXHJcbiAgLy8gY29uc29sZS5sb2coJ01hcmtldCBEZXRlY3RvciBBUEkgUmVzcG9uc2U6JywgSlNPTi5zdHJpbmdpZnkobWFya2V0RGV0ZWN0b3JEYXRhLCBudWxsLCAyKSk7XHJcblxyXG4gIC8vIFRoZSBhY3R1YWwgZGF0YSBpcyB3cmFwcGVkIGluICdkYXRhJyBwcm9wZXJ0eVxyXG4gIGNvbnN0IGJyb2tlcnMgPSBtYXJrZXREZXRlY3RvckRhdGE/LmRhdGE/LmJyb2tlcl9zdW1tYXJ5Py5icm9rZXJzX2J1eTtcclxuXHJcbiAgaWYgKCFicm9rZXJzIHx8ICFBcnJheS5pc0FycmF5KGJyb2tlcnMpIHx8IGJyb2tlcnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAvLyBSZXR1cm4gbnVsbCBpbnN0ZWFkIG9mIHRocm93aW5nIGVycm9yIHRvIGFsbG93IGNhbGxlciB0byBoYW5kbGUgZ3JhY2VmdWxseVxyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICAvLyBTb3J0IGJ5IGJ2YWwgZGVzY2VuZGluZyBhbmQgZ2V0IHRoZSBmaXJzdCBvbmVcclxuICAvLyBOb3RlOiBidmFsIGlzIGEgc3RyaW5nIGluIHRoZSBBUEkgcmVzcG9uc2UsIHNvIHdlIGNvbnZlcnQgdG8gTnVtYmVyXHJcbiAgY29uc3QgdG9wQnJva2VyID0gWy4uLmJyb2tlcnNdLnNvcnQoKGEsIGIpID0+IE51bWJlcihiLmJ2YWwpIC0gTnVtYmVyKGEuYnZhbCkpWzBdO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgYmFuZGFyOiB0b3BCcm9rZXIubmV0YnNfYnJva2VyX2NvZGUsXHJcbiAgICBiYXJhbmdCYW5kYXI6IE1hdGgucm91bmQoTnVtYmVyKHRvcEJyb2tlci5ibG90KSksXHJcbiAgICByYXRhUmF0YUJhbmRhcjogTWF0aC5yb3VuZChOdW1iZXIodG9wQnJva2VyLm5ldGJzX2J1eV9hdmdfcHJpY2UpKSxcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogSGVscGVyIHRvIHBhcnNlIGxvdCBzdHJpbmcgKGUuZy4sIFwiMjUsMzIyLDAwMFwiIC0+IDI1MzIyMDAwKVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTG90KGxvdFN0cjogc3RyaW5nKTogbnVtYmVyIHtcclxuICBpZiAoIWxvdFN0cikgcmV0dXJuIDA7XHJcbiAgcmV0dXJuIE51bWJlcihsb3RTdHIucmVwbGFjZSgvLC9nLCAnJykpO1xyXG59XHJcblxyXG4vKipcclxuICogR2V0IGJyb2tlciBzdW1tYXJ5IGRhdGEgZnJvbSBNYXJrZXQgRGV0ZWN0b3IgcmVzcG9uc2VcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRCcm9rZXJTdW1tYXJ5KG1hcmtldERldGVjdG9yRGF0YTogTWFya2V0RGV0ZWN0b3JSZXNwb25zZSk6IEJyb2tlclN1bW1hcnlEYXRhIHtcclxuICBjb25zdCBkZXRlY3RvciA9IG1hcmtldERldGVjdG9yRGF0YT8uZGF0YT8uYmFuZGFyX2RldGVjdG9yO1xyXG4gIGNvbnN0IGJyb2tlclN1bW1hcnkgPSBtYXJrZXREZXRlY3RvckRhdGE/LmRhdGE/LmJyb2tlcl9zdW1tYXJ5O1xyXG5cclxuICAvLyBQcm92aWRlIHNhZmUgZGVmYXVsdHMgaWYgZGF0YSBpcyBtaXNzaW5nXHJcbiAgcmV0dXJuIHtcclxuICAgIGRldGVjdG9yOiB7XHJcbiAgICAgIHRvcDE6IGRldGVjdG9yPy50b3AxIHx8IHsgdm9sOiAwLCBwZXJjZW50OiAwLCBhbW91bnQ6IDAsIGFjY2Rpc3Q6ICctJyB9LFxyXG4gICAgICB0b3AzOiBkZXRlY3Rvcj8udG9wMyB8fCB7IHZvbDogMCwgcGVyY2VudDogMCwgYW1vdW50OiAwLCBhY2NkaXN0OiAnLScgfSxcclxuICAgICAgdG9wNTogZGV0ZWN0b3I/LnRvcDUgfHwgeyB2b2w6IDAsIHBlcmNlbnQ6IDAsIGFtb3VudDogMCwgYWNjZGlzdDogJy0nIH0sXHJcbiAgICAgIGF2ZzogZGV0ZWN0b3I/LmF2ZyB8fCB7IHZvbDogMCwgcGVyY2VudDogMCwgYW1vdW50OiAwLCBhY2NkaXN0OiAnLScgfSxcclxuICAgICAgdG90YWxfYnV5ZXI6IGRldGVjdG9yPy50b3RhbF9idXllciB8fCAwLFxyXG4gICAgICB0b3RhbF9zZWxsZXI6IGRldGVjdG9yPy50b3RhbF9zZWxsZXIgfHwgMCxcclxuICAgICAgbnVtYmVyX2Jyb2tlcl9idXlzZWxsOiBkZXRlY3Rvcj8ubnVtYmVyX2Jyb2tlcl9idXlzZWxsIHx8IDAsXHJcbiAgICAgIGJyb2tlcl9hY2NkaXN0OiBkZXRlY3Rvcj8uYnJva2VyX2FjY2Rpc3QgfHwgJy0nLFxyXG4gICAgICB2b2x1bWU6IGRldGVjdG9yPy52b2x1bWUgfHwgMCxcclxuICAgICAgdmFsdWU6IGRldGVjdG9yPy52YWx1ZSB8fCAwLFxyXG4gICAgICBhdmVyYWdlOiBkZXRlY3Rvcj8uYXZlcmFnZSB8fCAwLFxyXG4gICAgfSxcclxuICAgIHRvcEJ1eWVyczogYnJva2VyU3VtbWFyeT8uYnJva2Vyc19idXk/LnNsaWNlKDAsIDQpIHx8IFtdLFxyXG4gICAgdG9wU2VsbGVyczogYnJva2VyU3VtbWFyeT8uYnJva2Vyc19zZWxsPy5zbGljZSgwLCA0KSB8fCBbXSxcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogUGFyc2UgS2V5U3RhdHMgQVBJIHJlc3BvbnNlIGludG8gc3RydWN0dXJlZCBkYXRhXHJcbiAqL1xyXG5mdW5jdGlvbiBwYXJzZUtleVN0YXRzUmVzcG9uc2UoanNvbjogS2V5U3RhdHNSZXNwb25zZSk6IEtleVN0YXRzRGF0YSB7XHJcbiAgY29uc3QgY2F0ZWdvcmllcyA9IGpzb24uZGF0YT8uY2xvc3VyZV9maW5faXRlbXNfcmVzdWx0cyB8fCBbXTtcclxuICBcclxuICBjb25zdCBmaW5kQ2F0ZWdvcnkgPSAobmFtZTogc3RyaW5nKTogS2V5U3RhdHNJdGVtW10gPT4ge1xyXG4gICAgY29uc3QgY2F0ZWdvcnkgPSBjYXRlZ29yaWVzLmZpbmQoYyA9PiBjLmtleXN0YXRzX25hbWUgPT09IG5hbWUpO1xyXG4gICAgaWYgKCFjYXRlZ29yeSkgcmV0dXJuIFtdO1xyXG4gICAgcmV0dXJuIGNhdGVnb3J5LmZpbl9uYW1lX3Jlc3VsdHMubWFwKHIgPT4gci5maXRlbSk7XHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGN1cnJlbnRWYWx1YXRpb246IGZpbmRDYXRlZ29yeSgnQ3VycmVudCBWYWx1YXRpb24nKSxcclxuICAgIGluY29tZVN0YXRlbWVudDogZmluZENhdGVnb3J5KCdJbmNvbWUgU3RhdGVtZW50JyksXHJcbiAgICBiYWxhbmNlU2hlZXQ6IGZpbmRDYXRlZ29yeSgnQmFsYW5jZSBTaGVldCcpLFxyXG4gICAgcHJvZml0YWJpbGl0eTogZmluZENhdGVnb3J5KCdQcm9maXRhYmlsaXR5JyksXHJcbiAgICBncm93dGg6IGZpbmRDYXRlZ29yeSgnR3Jvd3RoJyksXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZldGNoIEtleVN0YXRzIGRhdGEgZm9yIGEgc3RvY2tcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaEtleVN0YXRzKGVtaXRlbjogc3RyaW5nKTogUHJvbWlzZTxLZXlTdGF0c0RhdGE+IHtcclxuICBjb25zdCB1cmwgPSBgJHtTVE9DS0JJVF9CQVNFX1VSTH0va2V5c3RhdHMvcmF0aW8vdjEvJHtlbWl0ZW59P3llYXJfbGltaXQ9MTBgO1xyXG4gIFxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgaGVhZGVyczogYXdhaXQgZ2V0SGVhZGVycygpLFxyXG4gIH0pO1xyXG5cclxuICBhd2FpdCBoYW5kbGVBcGlSZXNwb25zZShyZXNwb25zZSwgJ0tleVN0YXRzIEFQSScpO1xyXG5cclxuICBjb25zdCBqc29uOiBLZXlTdGF0c1Jlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gIHJldHVybiBwYXJzZUtleVN0YXRzUmVzcG9uc2UoanNvbik7XHJcbn1cclxuXHJcbiIsICIvKipcclxuICogQ2FsY3VsYXRlIEZyYWtzaSBiYXNlZCBvbiBzdG9jayBwcmljZVxyXG4gKiBSdWxlczpcclxuICogLSA8IDIwMDogRnJha3NpIDFcclxuICogLSAyMDAtNDk5OiBGcmFrc2kgMlxyXG4gKiAtIDUwMC0xOTk5OiBGcmFrc2kgNVxyXG4gKiAtIDIwMDAtNDk5OTogRnJha3NpIDEwXHJcbiAqIC0gPj0gNTAwMDogRnJha3NpIDI1XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnJha3NpKGhhcmdhOiBudW1iZXIpOiBudW1iZXIge1xyXG4gIGlmIChoYXJnYSA8IDIwMCkgcmV0dXJuIDE7XHJcbiAgaWYgKGhhcmdhID49IDIwMCAmJiBoYXJnYSA8IDUwMCkgcmV0dXJuIDI7XHJcbiAgaWYgKGhhcmdhID49IDUwMCAmJiBoYXJnYSA8IDIwMDApIHJldHVybiA1O1xyXG4gIGlmIChoYXJnYSA+PSAyMDAwICYmIGhhcmdhIDwgNTAwMCkgcmV0dXJuIDEwO1xyXG4gIHJldHVybiAyNTsgLy8gaGFyZ2EgPj0gNTAwMFxyXG59XHJcblxyXG4vKipcclxuICogQ2FsY3VsYXRlIHRhcmdldCBwcmljZXMgYmFzZWQgb24gYnJva2VyIGFuZCBtYXJrZXQgZGF0YVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNhbGN1bGF0ZVRhcmdldHMoXHJcbiAgcmF0YVJhdGFCYW5kYXI6IG51bWJlcixcclxuICBiYXJhbmdCYW5kYXI6IG51bWJlcixcclxuICBhcmE6IG51bWJlcixcclxuICBhcmI6IG51bWJlcixcclxuICB0b3RhbEJpZDogbnVtYmVyLFxyXG4gIHRvdGFsT2ZmZXI6IG51bWJlcixcclxuICBoYXJnYTogbnVtYmVyXHJcbikge1xyXG4gIC8vIENhbGN1bGF0ZSBGcmFrc2lcclxuICBjb25zdCBmcmFrc2kgPSBnZXRGcmFrc2koaGFyZ2EpO1xyXG5cclxuICAvLyBUb3RhbCBQYXBhbiA9IChBUkEgLSBBUkIpIC8gRnJha3NpXHJcbiAgY29uc3QgdG90YWxQYXBhbiA9IChhcmEgLSBhcmIpIC8gZnJha3NpO1xyXG5cclxuICAvLyBSYXRhIHJhdGEgQmlkIE9mZXIgPSAoVG90YWwgQmlkICsgVG90YWwgT2ZmZXIpIC8gVG90YWwgUGFwYW5cclxuICBjb25zdCByYXRhUmF0YUJpZE9mZXIgPSAodG90YWxCaWQgKyB0b3RhbE9mZmVyKSAvIHRvdGFsUGFwYW47XHJcblxyXG4gIC8vIGEgPSBSYXRhIHJhdGEgYmFuZGFyIFx1MDBENyA1JVxyXG4gIGNvbnN0IGEgPSByYXRhUmF0YUJhbmRhciAqIDAuMDU7XHJcblxyXG4gIC8vIHAgPSBCYXJhbmcgQmFuZGFyIC8gUmF0YSByYXRhIEJpZCBPZmVyXHJcbiAgY29uc3QgcCA9IGJhcmFuZ0JhbmRhciAvIHJhdGFSYXRhQmlkT2ZlcjtcclxuXHJcbiAgLy8gVGFyZ2V0IFJlYWxpc3RpcyA9IFJhdGEgcmF0YSBiYW5kYXIgKyBhICsgKHAvMiBcdTAwRDcgRnJha3NpKVxyXG4gIGNvbnN0IHRhcmdldFJlYWxpc3RpczEgPSByYXRhUmF0YUJhbmRhciArIGEgKyAoKHAgLyAyKSAqIGZyYWtzaSk7XHJcblxyXG4gIC8vIFRhcmdldCBNYXggPSBSYXRhIHJhdGEgYmFuZGFyICsgYSArIChwIFx1MDBENyBGcmFrc2kpXHJcbiAgY29uc3QgdGFyZ2V0TWF4ID0gcmF0YVJhdGFCYW5kYXIgKyBhICsgKHAgKiBmcmFrc2kpO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgZnJha3NpLFxyXG4gICAgdG90YWxQYXBhbjogTWF0aC5yb3VuZCh0b3RhbFBhcGFuKSxcclxuICAgIHJhdGFSYXRhQmlkT2ZlcjogTWF0aC5yb3VuZChyYXRhUmF0YUJpZE9mZXIpLFxyXG4gICAgYTogTWF0aC5yb3VuZChhKSxcclxuICAgIHA6IE1hdGgucm91bmQocCksXHJcbiAgICB0YXJnZXRSZWFsaXN0aXMxOiBNYXRoLnJvdW5kKHRhcmdldFJlYWxpc3RpczEpLFxyXG4gICAgdGFyZ2V0TWF4OiBNYXRoLnJvdW5kKHRhcmdldE1heCksXHJcbiAgfTtcclxufVxyXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7OztBQ0FBLHlCQUE2QjtBQUU3QixJQUFNLGNBQWMsUUFBUSxJQUFJO0FBQ2hDLElBQU0sa0JBQWtCLFFBQVEsSUFBSTtBQUU3QixJQUFNLGVBQVcsaUNBQWEsYUFBYSxlQUFlO0FBMENqRSxlQUFzQixnQkFBZ0IsS0FBcUM7QUFDekUsUUFBTSxFQUFFLE1BQU0sTUFBTSxJQUFJLE1BQU0sU0FDM0IsS0FBSyxTQUFTLEVBQ2QsT0FBTyxPQUFPLEVBQ2QsR0FBRyxPQUFPLEdB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
