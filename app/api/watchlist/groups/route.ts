import { NextRequest, NextResponse } from 'next/server';
import { fetchWatchlistGroups } from '@/lib/stockbit';
import { getCachedWatchlistGroups, saveCachedWatchlistGroups, hasWatchlistCache } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sync = searchParams.get('sync') === 'true';

  try {
    // If sync requested, fetch from Stockbit and save to DB
    if (sync) {
      const groups = await fetchWatchlistGroups();
      
      // Save to local database
      await saveCachedWatchlistGroups(groups);
      
      return NextResponse.json({ 
        success: true, 
        data: groups, 
        source: 'stockbit',
        synced_at: new Date().toISOString()
      });
    }

    // Try to read from local database first
    const cached = await getCachedWatchlistGroups();
    
    if (cached.groups.length > 0) {
      return NextResponse.json({ 
        success: true, 
        data: cached.groups, 
        source: 'cache',
        synced_at: cached.synced_at
      });
    }

    // If no cache exists, auto-sync from Stockbit (first time)
    const groups = await fetchWatchlistGroups();
    
    // Save to local database for future use
    await saveCachedWatchlistGroups(groups);
    
    return NextResponse.json({ 
      success: true, 
      data: groups, 
      source: 'stockbit',
      synced_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Watchlist Groups API Error:', error);
    
    // If Stockbit fails during sync, try returning cached data
    if (sync) {
      const cached = await getCachedWatchlistGroups();
      if (cached.groups.length > 0) {
        return NextResponse.json({ 
          success: true, 
          data: cached.groups, 
          source: 'cache',
          synced_at: cached.synced_at,
          warning: 'Sync failed, showing cached data'
        });
      }
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
