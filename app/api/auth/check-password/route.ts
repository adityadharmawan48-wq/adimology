import { NextResponse } from 'next/server';
import { getProfileSetting } from '@/lib/supabase';
import { verifySessionToken, setSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SESSION_NAME = 'adimology_session';

export async function GET(request: Request) {
  try {
    const enabledSetting = await getProfileSetting('password_enabled');
    const hash = await getProfileSetting('password_hash');
    const isEnabled = enabledSetting === 'true';

    // Also check if valid session exists
    const cookieHeader = request.headers.get('cookie') || '';
    const sessionCookie = cookieHeader
      .split(';')
      .find(c => c.trim().startsWith(`${SESSION_NAME}=`))
      ?.split('=')[1];

    let isAuthenticated = false;
    if (sessionCookie) {
      const session = await verifySessionToken(sessionCookie);
      if (session) {
        // If password is enabled, we require a verified session (from password entry)
        // If password is disabled, any valid session is fine
        if (isEnabled) {
          isAuthenticated = session.verified === true;
        } else {
          isAuthenticated = true;
        }
      }
    }

    // Prepare response
    const result = {
      success: true,
      enabled: isEnabled,
      hasPassword: !!hash && hash.length > 0,
      isAuthenticated,
    };

    // IF password gate is disabled, automatically issue a guest session cookie
    // so subsequent API calls pass the proxy
    if (!isEnabled) {
      const response = NextResponse.json({ ...result, isAuthenticated: true });
      await setSession(response, false);
      return response;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking password status:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
