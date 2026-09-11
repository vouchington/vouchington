import { isSlug, validateHttpUrl } from '@modules/utils'

const REFERRAL_COLUMNS = [
  'referral_validation_slug',
  'referral_user_help_text',
  'referral_hostname',
  'referral_pathname',
  'referral_example_url',
  'referral_company_slug',
] as const

export function validateReferralFields(
  row: Record<string, string>,
  errors: string[],
  seenReferralValidationSlugs: Set<string>,
): void {
  const topicType = row.topic_type?.trim()
  if (topicType === 'referral_program') {
    validateReferralProgramFields(row, errors, seenReferralValidationSlugs)
    return
  }
  for (const col of REFERRAL_COLUMNS) {
    if (row[col]?.trim())
      errors.push(`${col} must be empty for topic_type other than referral_program`)
  }
}

export function validateReferralUrlFields(row: Record<string, string>, errors: string[]): void {
  const referralExampleUrl = row.referral_example_url?.trim()
  if (referralExampleUrl && !isReferralExampleUrl(referralExampleUrl)) {
    errors.push('referral_example_url must be a valid URL')
  }
  const referralCompanySlug = row.referral_company_slug?.trim()
  if (referralCompanySlug && !isSlug(referralCompanySlug)) {
    errors.push('referral_company_slug must be a valid slug')
  }
}

function validateReferralProgramFields(
  row: Record<string, string>,
  errors: string[],
  seenReferralValidationSlugs: Set<string>,
): void {
  const referralValidationSlug = row.referral_validation_slug?.trim()
  if (!referralValidationSlug) {
    errors.push('referral_validation_slug is required for topic_type=referral_program')
  } else if (!/^[a-z0-9_]+$/.test(referralValidationSlug)) {
    errors.push('referral_validation_slug must match ^[a-z0-9_]+$')
  } else if (seenReferralValidationSlugs.has(referralValidationSlug)) {
    errors.push(`referral_validation_slug "${referralValidationSlug}" is duplicated in this batch`)
  } else {
    seenReferralValidationSlugs.add(referralValidationSlug)
  }
  if (!row.referral_hostname?.trim()) {
    errors.push('referral_hostname is required for topic_type=referral_program')
  }
  if (!row.referral_pathname?.trim()) {
    errors.push('referral_pathname is required for topic_type=referral_program')
  }
}

function isReferralExampleUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol) && validateHttpUrl(value)
  } catch {
    return false
  }
}
