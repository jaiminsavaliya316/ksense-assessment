import { NextResponse } from 'next/server';
import { fetchAllPatients } from '@/lib/fetcher';
import { parsePatient } from '@/lib/parser';
import { scorePatient } from '@/lib/scoring';
import { generateAlerts } from '@/lib/alerts';
import type { PipelineResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/patients
 *
 * Runs the full pipeline:
 *   fetchAllPatients → parsePatient → scorePatient → generateAlerts
 *
 * Returns a PipelineResult with the full scored patient list,
 * the three alert lists, and a summary.
 */
export async function GET() {
  try {
    // 1. Fetch all raw patients (handles pagination + retries)
    const rawPatients = await fetchAllPatients();

    // 2. Parse each patient (defensive field cleaning + quality tagging)
    const parsed = rawPatients.map((p, i) => parsePatient(p, i));

    // 3. Score each patient
    const scored = parsed.map(scorePatient);

    // 4. Generate alert lists
    const alerts = generateAlerts(scored);

    const result: PipelineResult = {
      patients: scored,
      alerts,
      summary: {
        totalFetched: scored.length,
        highRiskCount: alerts.high_risk_patients.length,
        feverCount: alerts.fever_patients.length,
        dataQualityCount: alerts.data_quality_issues.length,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/patients] Pipeline error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
