import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const url = formData.get('url') as string | null;
    const keyword = formData.get('keyword') as string | null;
    const platform = formData.get('platform') as string | null;

    const response = await fetch(`${API_URL}/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url || undefined,
        keyword: keyword || undefined,
        platform: platform || undefined,
      }),
    });

    const result = await response.json();
    return NextResponse.redirect(new URL('/workflows', request.url));
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create workflow' },
      { status: 500 },
    );
  }
}
