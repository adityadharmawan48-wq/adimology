import { NextRequest, NextResponse } from 'next/server';
import { setProfileSetting } from '@/lib/supabase';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, enabled } = body;

    if (enabled && (!password || password.length < 4)) {
      return NextResponse.json(
        { success: false, error: 'Password minimal 4 karakter' },
        { status: 400 }
      );
    }

    if (enabled) {
      const hash = await hashPassword(password);
      await setProfileSetting('password_hash', hash);
      await setProfileSetting('password_enabled', 'true');
    } else {
      await setProfileSetting('password_hash', '');
      await setProfileSetting('password_enabled', 'false');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error setting password:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
