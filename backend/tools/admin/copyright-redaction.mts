import type { CopyrightStaffEmailIntake } from '@services/copyright-notices/read-models'
import type { CopyrightStaffQueueCase } from '@services/copyright-notices/read-models-staff-types'
import { stripContactDetails } from '@services/copyright-notices/contact-redaction'

const REDACTED = '[redacted]'
const CONTACT_FIELDS = new Set([
  'claimant_contact',
  'claimant_email',
  'counter_notice_address',
  'counter_notice_telephone',
])
const INTAKE_TEXT_FIELDS = new Set([
  'submission_summary',
  'appeal_reason',
  'work_description',
  'moderator_reasoning',
])

const CONTACT_PROPERTY_NAMES = new Set([
  'contact',
  'email',
  'phone',
  'telephone',
  'address',
  'claimant_contact',
  'claimant_email',
  'counter_notice_address',
  'counter_notice_telephone',
])

/** Defense in depth for fields added later to an otherwise contact-free read projection. */
export function redactCopyrightContactFields<T>(value: T): T {
  if (value instanceof Date || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redactCopyrightContactFields) as T
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      CONTACT_PROPERTY_NAMES.has(key) && typeof child === 'string'
        ? REDACTED
        : redactCopyrightContactFields(child),
    ]),
  ) as T
}

function redactStatement(statement: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(statement).map(([key, value]) => {
      if ((key === 'address' || key === 'telephone') && typeof value === 'string')
        return [key, REDACTED]
      if (key === 'name' || key === 'electronic_signature' || key === 'signature')
        return [key, value]
      return [key, typeof value === 'string' ? stripContactDetails(value) : value]
    }),
  )
}

export function redactCopyrightQueueCase(
  staffCase: CopyrightStaffQueueCase,
): CopyrightStaffQueueCase {
  return {
    ...staffCase,
    claimant: { ...staffCase.claimant, contact: REDACTED },
    work_description: stripContactDetails(staffCase.work_description),
    territorial: staffCase.territorial
      ? {
          ...staffCase.territorial,
          notifier: {
            ...staffCase.territorial.notifier,
            email: staffCase.territorial.notifier.email === null ? null : REDACTED,
          },
        }
      : undefined,
    appeals: staffCase.appeals.map(appeal => ({
      ...appeal,
      reason: stripContactDetails(appeal.reason),
    })),
    counter_notices: staffCase.counter_notices.map(counterNotice => ({
      ...counterNotice,
      statement: redactStatement(counterNotice.statement),
    })),
    legal_holds: staffCase.legal_holds.map(hold => ({
      ...hold,
      statement: redactStatement(hold.statement),
    })),
  }
}

export function redactCopyrightEmailIntake(intake: CopyrightStaffEmailIntake) {
  const output = intake.recommendation?.structured_output
  const structured_output = output
    ? Object.fromEntries(
        Object.entries(output).map(([key, value]) => {
          if (CONTACT_FIELDS.has(key) && typeof value === 'string') return [key, REDACTED]
          if (INTAKE_TEXT_FIELDS.has(key) && typeof value === 'string')
            return [key, stripContactDetails(value)]
          if (key === 'missing_information' && Array.isArray(value))
            return [
              key,
              value.map(item => (typeof item === 'string' ? stripContactDetails(item) : item)),
            ]
          if (key === 'source_evidence' && Array.isArray(value)) {
            return [
              key,
              value
                .filter(item => {
                  if (!item || typeof item !== 'object') return false
                  return !CONTACT_FIELDS.has(String((item as Record<string, unknown>)['field']))
                })
                .map(item => {
                  const evidence = item as Record<string, unknown>
                  return {
                    ...evidence,
                    excerpt:
                      typeof evidence['excerpt'] === 'string'
                        ? stripContactDetails(evidence['excerpt'])
                        : evidence['excerpt'],
                  }
                }),
            ]
          }
          return [key, value]
        }),
      )
    : null
  return {
    id: intake.id,
    received_at: intake.received_at,
    review_path: intake.review_path,
    linked_notice: intake.linked_notice,
    ses_verdicts: intake.ses_verdicts,
    recommendation:
      intake.recommendation && structured_output
        ? { id: intake.recommendation.id, structured_output }
        : null,
  }
}
