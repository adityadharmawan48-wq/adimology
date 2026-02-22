import { NextResponse } from 'next/server';
import { getProfileSetting } from '@/lib/supabase';

export async function GET() {
  try {
    const enabled = await getProfileSetting('password_enabled');
    const hash = await getProfileSetting('password_hash');

    return NextResponse.json({
      success: true,
      enabled: enabled === 'true',
      hasPassword: !!hash && hash.length > 0,
    });
  } catch (error) {
    console.error('Error checking password status:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
