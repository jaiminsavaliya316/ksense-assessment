import { NextResponse } from 'next/server';
import { CONFIG } from '@/lib/config';
import { fetchAllPatients } from '@/lib/fetcher';
import { parsePatient } from '@/lib/parser';
import { scorePatient } from '@/lib/scoring';
import { generateAlerts } from '@/lib/alerts';
import { fetchWithRetry } from '@/lib/fetcher';

export const dynamic = 'force-dynamic';

/**
 * POST /api/submit
 *
 * Runs the full pipeline to produce fresh alerts, then POSTs
 * the SubmissionPayload to DemoMed's /submit-assessment endpoint.
 *
 * Returns DemoMed's feedback response (score, breakdown, remaining attempts).
 */
export async function POST() {
  try {
    // Run pipeline fresh (don't cache stale results for submission)
    const rawPatients = await fetchAllPatients();
    const parsed = rawPatients.map((p, i) => parsePatient(p, i));
    const scored = parsed.map(scorePatient);
    const alerts = generateAlerts(scored);

    console.log('[/api/submit] Submitting payload:', JSON.stringify(alerts, null, 2));

    // POST to DemoMed
    const submitUrl = `${CONFIG.BASE_URL}${CONFIG.SUBMIT_ENDPOINT}`;
    const response = await fetchWithRetry(submitUrl, {
      method: 'POST',
      body: JSON.stringify(alerts),
    });

    const feedback = await response.json();
    console.log('[/api/submit] DemoMed response:', JSON.stringify(feedback, null, 2));

    return NextResponse.json({
      submitted: alerts,
      feedback,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/submit] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
