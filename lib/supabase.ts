import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Save stock query to database
 */
export async function saveStockQuery(data: {
  emiten: string;
  sector?: string;
  from_date?: string;
  to_date?: string;
  bandar?: string;
  barang_bandar?: number;
  rata_rata_bandar?: number;
  harga?: number;
  ara?: number;
  arb?: number;
  fraksi?: number;
  total_bid?: number;
  total_offer?: number;
  total_papan?: number;
  rata_rata_bid_ofer?: number;
  a?: number;
  p?: number;
  target_realistis?: number;
  target_max?: number;
}) {
  const { data: result, error } = await supabase
    .from('stock_queries')
    .upsert([data], { onConflict: 'from_date,emiten' })
    .select();

  if (error) {
    console.error('Error saving to Supabase:', error);
    throw error;
  }

  return result;
}

/**
 * Get session value by key
 */
export async function getSessionValue(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('session')
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) return null;
  return data.value;
}

/**
 * Token status interface
 */
export interface TokenStatus {
  exists: boolean;
  isValid: boolean;
  token?: string;
  expiresAt?: string;
  lastUsedAt?: string;
  updatedAt?: string;
  isExpiringSoon: boolean;  // Within 1 hour of expiry
  isExpired: boolean;
  hoursUntilExpiry?: number;
}

/**
 * Get full token status including expiry information
 */
export async function getTokenStatus(): Promise<TokenStatus> {
  const { data, error } = await supabase
    .from('session')
    .select('value, expires_at, last_used_at, is_valid, updated_at')
    .eq('key', 'stockbit_token')
    .single();

  if (error || !data) {
    return {
      exists: false,
      isValid: false,
      isExpiringSoon: false,
      isExpired: true,
    };
  }

  const now = new Date();
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < now : false;
  const hoursUntilExpiry = expiresAt 
    ? (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60) 
    : undefined;
  const isExpiringSoon = hoursUntilExpiry !== undefined && hoursUntilExpiry <= 1 && hoursUntilExpiry > 0;

  return {
    exists: true,
    isValid: data.is_valid !== false && !isExpired,
    token: data.value,
    expiresAt: data.expires_at,
    lastUsedAt: data.last_used_at,
    updatedAt: data.updated_at,
    isExpiringSoon,
    isExpired,
    hoursUntilExpiry,
  };
}

/**
 * Upsert session value with optional expiry
 */
export async function upsertSession(
  key: string, 
  value: string, 
  expiresAt?: Date
) {
  const { data, error } = await supabase
    .from('session')
    .upsert(
      { 
        key, 
        value, 
        updated_at: new Date().toISOString(),
        expires_at: expiresAt?.toISOString() || null,
        is_valid: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
    .select();

  if (error) throw error;
  return data;
}

/**
 * Update token last used timestamp (call after successful API request)
 */
export async function updateTokenLastUsed() {
  const { error } = await supabase
    .from('session')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key', 'stockbit_token');

  if (error) {
    console.error('Error updating token last_used_at:', error);
  }
}

/**
 * Mark token as invalid (call when receiving 401 from Stockbit API)
 */
export async function invalidateToken() {
  const { error } = await supabase
    .from('session')
    .update({ is_valid: false })
    .eq('key', 'stockbit_token');

  if (error) {
    console.error('Error invalidating token:', error);
  }
}

/**
 * Set token expiry time (typically 24 hours from login)
 */
export async function setTokenExpiry(hoursFromNow: number = 24) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hoursFromNow);
  
  const { error } = await supabase
    .from('session')
    .update({ expires_at: expiresAt.toISOString() })
    .eq('key', 'stockbit_token');

  if (error) {
    console.error('Error setting token expiry:', error);
  }
}

/**
 * Save watchlist analysis to database (reusing stock_queries table)
 */
export async function saveWatchlistAnalysis(data: {
  from_date: string;  // analysis date
  to_date: string;    // same as from_date for daily analysis
  emiten: string;
  sector?: string;
  bandar?: string;
  barang_bandar?: number;
  rata_rata_bandar?: number;
  harga?: number;
  ara?: number;       // offer_teratas
  arb?: number;       // bid_terbawah
  fraksi?: number;
  total_bid?: number;
  total_offer?: number;
  total_papan?: number;
  rata_rata_bid_ofer?: number;
  a?: number;
  p?: number;
  target_realistis?: number;
  target_max?: number;
  status?: string;
  error_message?: string;
}) {
  const { data: result, error } = await supabase
    .from('stock_queries')
    .upsert([data], { onConflict: 'from_date,emiten' })
    .select();

  if (error) {
    console.error('Error saving watchlist analysis:', error);
    throw error;
  }

  return result;
}

/**
 * Get watchlist analysis history with optional filters
 */
export async function getWatchlistAnalysisHistory(filters?: {
  emiten?: string;
  sector?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  let query = supabase
    .from('stock_queries')
    .select('*', { count: 'exact' });

  // Handle sorting
  const sortBy = filters?.sortBy || 'from_date';
  const sortOrder = filters?.sortOrder || 'desc';

  if (sortBy === 'combined') {
    // Sort by date then emiten
    query = query
      .order('from_date', { ascending: sortOrder === 'asc' })
      .order('emiten', { ascending: sortOrder === 'asc' });
  } else if (sortBy === 'emiten') {
    // When sorting by emiten, secondary sort by date ascending
    query = query
      .order('emiten', { ascending: sortOrder === 'asc' })
      .order('from_date', { ascending: true });
  } else {
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  }

  if (filters?.emiten) {
    const emitenList = filters.emiten.split(/\s+/).filter(Boolean);
    if (emitenList.length > 0) { // Changed to always use .in() if emitens are present
      query = query.in('emiten', emitenList);
    }
  }
  if (filters?.sector) {
    query = query.eq('sector', filters.sector);
  }
  if (filters?.fromDate) {
    query = query.gte('from_date', filters.fromDate);
  }
  if (filters?.toDate) {
    query = query.lte('from_date', filters.toDate);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching watchlist analysis:', error);
    throw error;
  }

  return { data, count };
}

/**
 * Get latest stock query for a specific emiten
 */
export async function getLatestStockQuery(emiten: string) {
  const { data, error } = await supabase
    .from('stock_queries')
    .select('*')
    .eq('emiten', emiten)
    .eq('status', 'success')
    .order('from_date', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

/**
 * Update the most recent previous day's real price for an emiten
 */
export async function updatePreviousDayRealPrice(emiten: string, currentDate: string, price: number) {
  // 1. Find the latest successful record before currentDate
  const { data: record, error: findError } = await supabase
    .from('stock_queries')
    .select('id, from_date')
    .eq('emiten', emiten)
    .eq('status', 'success')
    .lt('from_date', currentDate)
    .order('from_date', { ascending: false })
    .limit(1)
    .single();

  if (findError || !record) {
    if (findError && findError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error(`Error finding previous record for ${emiten} before ${currentDate}:`, findError);
    }
    return null;
  }

  // 2. Update that record with the new price
  const { data, error: updateError } = await supabase
    .from('stock_queries')
    .update({ real_harga: price })
    .eq('id', record.id)
    .select();

  if (updateError) {
    console.error(`Error updating real_harga for ${emiten} on ${record.from_date}:`, updateError);
  }

  return data;
}

/**
 * Create a new agent story record with pending status
 */
export async function createAgentStory(emiten: string) {
  const { data, error } = await supabase
    .from('agent_stories')
    .insert({ emiten, status: 'pending' })
    .select()
    .single();

  if (error) {
    console.error('Error creating agent story:', error);
    throw error;
  }

  return data;
}

/**
 * Update agent story with result or error
 */
export async function updateAgentStory(id: number, data: {
  status: 'processing' | 'completed' | 'error';
  matriks_story?: object[];
  swot_analysis?: object;
  checklist_katalis?: object[];
  keystat_signal?: string;
  strategi_trading?: object;
  kesimpulan?: string;
  error_message?: string;
}) {
  const { data: result, error } = await supabase
    .from('agent_stories')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating agent story:', error);
    throw error;
  }

  return result;
}

/**
 * Get latest agent story for an emiten
 */
export async function getAgentStoryByEmiten(emiten: string) {
  const { data, error } = await supabase
    .from('agent_stories')
    .select('*')
    .eq('emiten', emiten.toUpperCase())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching agent story:', error);
  }

  return data || null;
}

/**
 * Get all agent stories for an emiten
 */
export async function getAgentStoriesByEmiten(emiten: string, limit: number = 20) {
  const { data, error } = await supabase
    .from('agent_stories')
    .select('*')
    .eq('emiten', emiten.toUpperCase())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching agent stories:', error);
    throw error;
  }

  return data || [];
}

