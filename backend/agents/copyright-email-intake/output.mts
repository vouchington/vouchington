/** Bounds the schema-valid model output; anything past a bound is rejected, never truncated. */
export function parseCopyrightEmailIntakeOutput(value: unknown): Record<string, unknown> {
  const parsed = value as Record<string, unknown> | null
  const recommendations = new Set(['invalid_or_spam', 'requires_information', 'potentially_valid'])
  if (
    !parsed ||
    typeof parsed.recommendation !== 'string' ||
    !recommendations.has(parsed.recommendation) ||
    !isSubmissionKind(parsed.submission_kind) ||
    !isOptionalString(parsed.submission_summary, 10_000) ||
    !isOptionalString(parsed.appeal_reason, 10_000) ||
    !isOptionalString(parsed.counter_notice_name, 200) ||
    !isOptionalString(parsed.counter_notice_address, 4096) ||
    !isOptionalString(parsed.counter_notice_telephone, 200) ||
    !isOptionalBoolean(parsed.consent_to_federal_jurisdiction) ||
    !isOptionalBoolean(parsed.consent_to_service_of_process) ||
    !isOptionalBoolean(parsed.good_faith_misidentification_under_penalty_of_perjury) ||
    !isOptionalString(parsed.counter_notice_electronic_signature, 500) ||
    !isOptionalString(parsed.claimant_name, 200) ||
    !isOptionalString(parsed.claimant_contact, 4096) ||
    !isOptionalString(parsed.claimant_email, 254) ||
    !isOptionalString(parsed.work_description, 50_000) ||
    !isOptionalBoolean(parsed.has_good_faith_belief) ||
    !isOptionalBoolean(parsed.has_accuracy_authority_under_penalty_of_perjury) ||
    !isOptionalString(parsed.electronic_signature, 500) ||
    !isStringArray(parsed.target_urls, 20, 2048) ||
    !isSourceEvidence(parsed.source_evidence) ||
    !isStringArray(parsed.missing_information, 20, 2000) ||
    !isBoundedString(parsed.moderator_reasoning, 10_000)
  ) {
    throw new TypeError('runCopyrightEmailIntakeAgent: invalid response shape')
  }
  return parsed
}

function isOptionalBoolean(value: unknown): boolean {
  return value === null || typeof value === 'boolean'
}

const SOURCE_FIELDS = new Set([
  'submission_kind',
  'submission_summary',
  'appeal_reason',
  'counter_notice_name',
  'counter_notice_address',
  'counter_notice_telephone',
  'consent_to_federal_jurisdiction',
  'consent_to_service_of_process',
  'good_faith_misidentification_under_penalty_of_perjury',
  'counter_notice_electronic_signature',
  'claimant_name',
  'claimant_contact',
  'claimant_email',
  'work_description',
  'has_good_faith_belief',
  'has_accuracy_authority_under_penalty_of_perjury',
  'electronic_signature',
  'target_url',
])

function isSubmissionKind(value: unknown): boolean {
  return (
    value === 'notice' ||
    value === 'appeal' ||
    value === 'counter_notice' ||
    value === 'withdrawal' ||
    value === 'court_or_ccb_hold' ||
    value === 'supplement'
  )
}

function isSourceEvidence(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 30 &&
    value.every(
      item =>
        item &&
        typeof item === 'object' &&
        Object.keys(item).length === 2 &&
        SOURCE_FIELDS.has((item as Record<string, unknown>).field as string) &&
        isBoundedString((item as Record<string, unknown>).excerpt, 1000),
    )
  )
}

function isOptionalString(value: unknown, maxLength: number): boolean {
  return value === null || isBoundedString(value, maxLength)
}

function isStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every(item => isBoundedString(item, maxLength))
  )
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength
}
