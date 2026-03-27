import type { RawPatient, ParsedPatient } from './types';

/**
 * Parse a blood pressure value from the raw API (may be any type).
 *
 * Expected format: "120/80"
 * Handles: "150/" "/90" "N/A" "INVALID" null undefined ""
 */
export function parseBloodPressure(
  bp: unknown
): { systolic: number | null; diastolic: number | null } {
  if (bp === null || bp === undefined || bp === '') {
    return { systolic: null, diastolic: null };
  }

  if (typeof bp !== 'string') {
    return { systolic: null, diastolic: null };
  }

  const parts = bp.trim().split('/');
  if (parts.length !== 2) {
    // No slash or more than one slash — can't parse
    return { systolic: null, diastolic: null };
  }

  const systolicStr = parts[0].trim();
  const diastolicStr = parts[1].trim();

  const systolic = systolicStr === '' ? null : parseFloat(systolicStr);
  const diastolic = diastolicStr === '' ? null : parseFloat(diastolicStr);

  return {
    systolic: systolic === null || isNaN(systolic) ? null : systolic,
    diastolic: diastolic === null || isNaN(diastolic) ? null : diastolic,
  };
}

/**
 * Parse a temperature value. Returns null if missing or unparseable.
 */
export function parseTemperature(temp: unknown): number | null {
  if (temp === null || temp === undefined) return null;

  if (typeof temp === 'number') {
    return isNaN(temp) ? null : temp;
  }

  if (typeof temp === 'string') {
    const trimmed = temp.trim();
    if (trimmed === '') return null;
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? null : parsed;
  }

  return null;
}

/**
 * Parse an age value. Returns null if missing or unparseable.
 */
export function parseAge(age: unknown): number | null {
  if (age === null || age === undefined) return null;

  if (typeof age === 'number') {
    return isNaN(age) ? null : age;
  }

  if (typeof age === 'string') {
    const trimmed = age.trim();
    if (trimmed === '') return null;
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? null : parsed;
  }

  return null;
}

/**
 * Parse a raw patient into a clean, typed ParsedPatient.
 * Tracks all data quality issues encountered.
 *
 * @param raw   - The raw patient object from the API
 * @param index - Index in the page array, used for generating placeholder IDs
 */
export function parsePatient(raw: RawPatient, index: number): ParsedPatient {
  const dataQualityReasons: string[] = [];

  // Patient ID
  let patientId: string;
  if (!raw.patient_id) {
    patientId = `UNKNOWN_${index}`;
    dataQualityReasons.push('missing patient_id');
  } else {
    patientId = raw.patient_id;
  }

  // Age
  const age = parseAge(raw.age);
  if (age === null) {
    dataQualityReasons.push('invalid/missing age');
  }

  // Blood pressure
  const { systolic, diastolic } = parseBloodPressure(raw.blood_pressure);
  if (systolic === null || diastolic === null) {
    dataQualityReasons.push('invalid/missing BP');
  }

  // Temperature
  const temperature = parseTemperature(raw.temperature);
  if (temperature === null) {
    dataQualityReasons.push('invalid/missing temperature');
  }

  return {
    patientId,
    name: raw.name ?? 'Unknown',
    age,
    systolic,
    diastolic,
    temperature,
    hasDataQualityIssue: dataQualityReasons.length > 0,
    dataQualityReasons,
    rawData: raw,
  };
}
