import { SENSITIVE_VALUE } from '@vouchington/utils/observability'
import { scrubJobData as scrubJobPayload } from '@vouchington/utils/job-data-scrub'

// GlideMQ job payloads are per-queue-shaped and can carry email addresses, login tokens,
// physical addresses, phone numbers, IPs, or names (see backend/queues/*/types.mts). Values
// default to redacted; these key lists name the fields that are redacted whatever their value.
const SENSITIVE_KEY_SUBSTRINGS: readonly string[] = [
  'email',
  'phone',
  'address',
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'sessionid',
  'ssn',
  'creditcard',
  'cardnumber',
  'cvv',
  'dob',
  'birthdate',
]
// `code` is the community invite code: an 8-hex-digit value that starting with a letter would
// otherwise pass the safe-scalar check and reach Sentry. Matched exactly so `zipcode` and similar
// stay readable.
const SENSITIVE_KEY_NAMES: readonly string[] = [
  'code',
  'contactname',
  'sendername',
  'invitername',
  'firstname',
  'lastname',
  'fullname',
]

export function scrubJobData(data: unknown): Record<string, unknown> | undefined {
  return scrubJobPayload(data, {
    redacted: SENSITIVE_VALUE,
    sensitiveSubstrings: SENSITIVE_KEY_SUBSTRINGS,
    sensitiveNames: SENSITIVE_KEY_NAMES,
  })
}
