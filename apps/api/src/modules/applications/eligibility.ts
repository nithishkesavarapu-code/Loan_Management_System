import {
  completedAge, indiaDate, personalFieldNames, personalFieldLabels, personalFieldSchemas,
  type EligibilityResult, type PersonalField,
} from '@lms/shared';
import { HttpError } from '../../middleware/errors.js';

export function evaluateEligibility(details: Partial<Record<PersonalField, unknown>>, now: Date): EligibilityResult {
  const failures: EligibilityResult['failures'] = [];
  let ageYears: number | null = null;
  const today = indiaDate(now);
  for (const field of personalFieldNames) {
    const value = details[field];
    if (value == null || (typeof value === 'string' && !value.trim())) {
      failures.push({ field, code: 'REQUIRED', message: `${personalFieldLabels[field]} is required.` });
      continue;
    }
    const parsed = personalFieldSchemas[field].safeParse(value);
    if (!parsed.success || (field === 'dob' && String(parsed.data) > today)) {
      failures.push({ field, code: 'INVALID_FORMAT', message: `${personalFieldLabels[field]} is invalid.` });
      continue;
    }
    if (field === 'pan' && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(parsed.data))) {
      failures.push({ field, code: 'PAN_INVALID', message: 'PAN must contain five letters, four digits, and one letter.' });
    } else if (field === 'dob') {
      ageYears = completedAge(String(parsed.data), today);
      if (ageYears < 23 || ageYears > 50) failures.push({ field, code: 'AGE_OUT_OF_RANGE', message: 'Age must be between 23 and 50 years, inclusive.' });
    } else if (field === 'monthlySalaryPaise' && Number(parsed.data) < 2_500_000) {
      failures.push({ field, code: 'SALARY_TOO_LOW', message: 'Monthly salary must be at least INR 25,000.' });
    } else if (field === 'employmentMode' && parsed.data === 'UNEMPLOYED') {
      failures.push({ field, code: 'EMPLOYMENT_INELIGIBLE', message: 'Employment must be Salaried or Self-employed.' });
    }
  }
  return { eligible: failures.length === 0, evaluatedAt: now.toISOString(), ageYears, failures };
}

export function requireEligibility(details: Partial<Record<PersonalField, unknown>>, now: Date): EligibilityResult {
  const result = evaluateEligibility(details, now);
  if (!result.eligible) {
    const fields: Record<string, string[]> = {};
    for (const failure of result.failures) (fields[`personalDetails.${failure.field}`] ??= []).push(failure.message);
    throw new HttpError(422, 'BRE_FAILED', 'The application does not meet the eligibility requirements.', { fields });
  }
  return result;
}
