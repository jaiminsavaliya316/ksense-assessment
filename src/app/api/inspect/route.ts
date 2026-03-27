import { NextResponse } from 'next/server';
import { CONFIG } from '@/lib/config';
import { fetchWithRetry } from '@/lib/fetcher';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inspect
 *
 * Dumps the raw, unparsed patient data from the DemoMed API.
 * Use this to manually inspect what the API actually returns before
 * trusting the parser output.
 *
 * Fetches only the first page to keep response fast.
 * Add ?page=N&limit=20 to query a specific page.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') ?? '1';
    const limit = searchParams.get('limit') ?? String(CONFIG.PAGE_LIMIT);

    const url = `${CONFIG.BASE_URL}${CONFIG.PATIENTS_ENDPOINT}?page=${page}&limit=${limit}`;
    const response = await fetchWithRetry(url);
    const raw = await response.json();

    return NextResponse.json({
      _meta: { url, page, limit },
      ...raw,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/inspect] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
