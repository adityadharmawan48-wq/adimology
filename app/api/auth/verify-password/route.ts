import { NextRequest, NextResponse } from 'next/server';
import { getProfileSetting } from '@/lib/supabase';

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
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }

    const storedHash = await getProfileSetting('password_hash');

    if (!storedHash) {
      return NextResponse.json(
        { success: false, error: 'No password has been set' },
        { status: 400 }
      );
    }

    const inputHash = await hashPassword(password);
    const valid = inputHash === storedHash;

    return NextResponse.json({ success: true, valid });
  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
