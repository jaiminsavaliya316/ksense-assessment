import type { ScoredPatient, SubmissionPayload } from './types';

const FEVER_THRESHOLD = 99.6;
const HIGH_RISK_THRESHOLD = 4;

/**
 * Generate the three alert lists from a set of scored patients.
 *
 * Rules:
 * - high_risk_patients:  totalScore >= 4
 * - fever_patients:      temperature is a valid number AND >= 99.6°F
 *                        (patients with null/invalid temp are NOT included — data_quality only)
 * - data_quality_issues: hasDataQualityIssue === true
 *
 * Each list is sorted alphabetically by patient ID.
 */
export function generateAlerts(patients: ScoredPatient[]): SubmissionPayload {
  const highRisk: string[] = [];
  const fever: string[] = [];
  const dataQuality: string[] = [];

  for (const p of patients) {
    if (p.totalScore >= HIGH_RISK_THRESHOLD) {
      highRisk.push(p.patientId);
    }

    // Only flag fever for patients with a VALID temperature reading
    if (p.temperature !== null && p.temperature >= FEVER_THRESHOLD) {
      fever.push(p.patientId);
    }

    if (p.hasDataQualityIssue) {
      dataQuality.push(p.patientId);
    }
  }

  return {
    high_risk_patients: highRisk.sort(),
    fever_patients: fever.sort(),
    data_quality_issues: dataQuality.sort(),
  };
}
