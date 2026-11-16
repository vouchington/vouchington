import { isSlug, validateHttpUrl } from '@modules/utils'

const REFERRAL_COLUMNS = [
  'referral_validation_slug',
  'referral_user_help_text',
  'referral_hostname',
  'referral_pathname',
  'referral_example_url',
  'referral_company_slug',
] as const

const REFERRAL_VALIDATION_SLUG_PATTERN = /^[a-z0-9_]+$/

/** The referral validation slug a row claims, or undefined when it cannot claim one. */
export function claimedReferralValidationSlug(row: Record<string, string>): string | undefined {
  if (row.topic_type?.trim() !== 'referral_program') return undefined
  const slug = row.referral_validation_slug?.trim()
  return slug && REFERRAL_VALIDATION_SLUG_PATTERN.test(slug) ? slug : undefined
}

export function validateReferralFields(
  row: Record<string, string>,
  isDuplicateReferralValidationSlug: boolean,
): string[] {
  if (row.topic_type?.trim() === 'referral_program') {
    return validateReferralProgramFields(row, isDuplicateReferralValidationSlug)
  }
  return REFERRAL_COLUMNS.filter(col => row[col]?.trim()).map(
    col => `${col} must be empty for topic_type other than referral_program`,
  )
}

export function validateReferralUrlFields(row: Record<string, string>): string[] {
  const referralExampleUrl = row.referral_example_url?.trim()
  const referralCompanySlug = row.referral_company_slug?.trim()
  return [
    ...(referralExampleUrl && !isReferralExampleUrl(referralExampleUrl)
      ? ['referral_example_url must be a valid URL']
      : []),
    ...(referralCompanySlug && !isSlug(referralCompanySlug)
      ? ['referral_company_slug must be a valid slug']
      : []),
  ]
}

function validateReferralProgramFields(
  row: Record<string, string>,
  isDuplicateReferralValidationSlug: boolean,
): string[] {
  const referralValidationSlug = row.referral_validation_slug?.trim()
  return [
    ...(!referralValidationSlug
      ? ['referral_validation_slug is required for topic_type=referral_program']
      : !REFERRAL_VALIDATION_SLUG_PATTERN.test(referralValidationSlug)
        ? ['referral_validation_slug must match ^[a-z0-9_]+$']
        : isDuplicateReferralValidationSlug
          ? [`referral_validation_slug "${referralValidationSlug}" is duplicated in this batch`]
          : []),
    ...(row.referral_hostname?.trim()
      ? []
      : ['referral_hostname is required for topic_type=referral_program']),
    ...(row.referral_pathname?.trim()
      ? []
      : ['referral_pathname is required for topic_type=referral_program']),
  ]
}

function isReferralExampleUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol) && validateHttpUrl(value)
  } catch {
    return false
  }
}
