import type { ParsedPatient, ScoredPatient } from './types';

// BP stage enum (internal)
type BpStage = 'NORMAL' | 'ELEVATED' | 'STAGE1' | 'STAGE2';

const BP_STAGE_SCORE: Record<BpStage, number> = {
  NORMAL: 0,
  ELEVATED: 1,
  STAGE1: 2,
  STAGE2: 3,
};

function stageSystolic(s: number): BpStage {
  if (s < 120) return 'NORMAL';
  if (s < 130) return 'ELEVATED';
  if (s < 140) return 'STAGE1';
  return 'STAGE2';
}

function stageDiastolic(d: number): BpStage {
  // Diastolic has no "Elevated" category — that requires systolic 120-129 AND diastolic <80
  if (d < 80) return 'NORMAL';
  if (d < 90) return 'STAGE1';
  return 'STAGE2';
}

function higherStage(a: BpStage, b: BpStage): BpStage {
  const order: BpStage[] = ['NORMAL', 'ELEVATED', 'STAGE1', 'STAGE2'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/**
 * Score blood pressure according to AHA staging.
 * When systolic and diastolic fall into different stages, the higher stage wins.
 * Elevated (score=2) only applies when systolic is 120–129 AND diastolic < 80.
 *
 * Returns 0 if either value is null (invalid/missing data — no score assigned).
 */
export function scoreBP(systolic: number | null, diastolic: number | null): number {
  if (systolic === null || diastolic === null) return 0;

  const sysStage = stageSystolic(systolic);
  const diaStage = stageDiastolic(diastolic);

  // Elevated only counts when diastolic is normal (< 80)
  // If systolic says Elevated but diastolic says Stage1+, diastolic wins
  const effectiveSysStage =
    sysStage === 'ELEVATED' && diaStage !== 'NORMAL' ? 'NORMAL' : sysStage;

  const finalStage = higherStage(effectiveSysStage, diaStage);
  return BP_STAGE_SCORE[finalStage];
}

/**
 * Score temperature.
 * NOTE: 101.0 is hardcoded — the spec contains hidden Unicode RTL override
 * characters that make the high-fever threshold appear reversed in some editors.
 *
 * Returns 0 if temp is null.
 */
export function scoreTemperature(temp: number | null): number {
  if (temp === null) return 0;
  if (temp >= 101.0) return 2; // hardcoded — do NOT copy-paste from spec
  if (temp >= 99.6) return 1;
  return 0;
}

/**
 * Score age.
 * Returns 0 if age is null.
 */
export function scoreAge(age: number | null): number {
  if (age === null) return 0;
  if (age > 65) return 2;
  if (age >= 40) return 1; // 40–65 inclusive
  return 0;                // < 40 scores 0
}

/**
 * Score a parsed patient and return a ScoredPatient with all score fields.
 */
export function scorePatient(patient: ParsedPatient): ScoredPatient {
  const bpScore = scoreBP(patient.systolic, patient.diastolic);
  const tempScore = scoreTemperature(patient.temperature);
  const ageScore = scoreAge(patient.age);
  const totalScore = bpScore + tempScore + ageScore;

  return {
    ...patient,
    bpScore,
    tempScore,
    ageScore,
    totalScore,
  };
}
