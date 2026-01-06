import { NextRequest, NextResponse } from 'next/server';
import { upsertSession } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    // Upsert token to database
    await upsertSession('stockbit_token', token);

    return NextResponse.json({
      success: true,
      message: 'Token updated successfully',
    });
  } catch (error: unknown) {
    console.error('Update Token Error:', error);
    
    // Extract error message from various error types
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    }
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
