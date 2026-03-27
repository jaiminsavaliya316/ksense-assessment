// Raw patient exactly as returned from the API — fields may be missing or malformed
export interface RawPatient {
  patient_id?: string;
  name?: string;
  age?: unknown;            // number, string, null, undefined
  gender?: string;
  blood_pressure?: unknown; // "120/80", "INVALID", "150/", null, etc.
  temperature?: unknown;    // number, "TEMP_ERROR", null, etc.
  visit_date?: string;
  diagnosis?: string;
  medications?: string;
}

// Parsed patient with cleaned, typed data
export interface ParsedPatient {
  patientId: string;
  name: string;
  age: number | null;
  systolic: number | null;
  diastolic: number | null;
  temperature: number | null;
  hasDataQualityIssue: boolean;
  dataQualityReasons: string[];
  rawData: RawPatient;
}

// Scored patient — ParsedPatient + risk scores
export interface ScoredPatient extends ParsedPatient {
  bpScore: number;
  tempScore: number;
  ageScore: number;
  totalScore: number;
}

// API pagination envelope
export interface PaginatedResponse {
  data: RawPatient[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// What we POST to DemoMed's /submit-assessment
export interface SubmissionPayload {
  high_risk_patients: string[];
  fever_patients: string[];
  data_quality_issues: string[];
}

// Full pipeline result — returned by /api/patients
export interface PipelineResult {
  patients: ScoredPatient[];
  alerts: SubmissionPayload;
  summary: {
    totalFetched: number;
    highRiskCount: number;
    feverCount: number;
    dataQualityCount: number;
  };
}
