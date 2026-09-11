import { SENTRY_FILTERED_VALUE } from '@ts-shared/utils/sentry-event-scrubbing'

// GlideMQ job payloads are per-queue-shaped and can carry email addresses, login tokens,
// physical addresses, phone numbers, IPs, or names (see backend/queues/*/types.mts). Rather than
// maintaining an exhaustive per-queue allowlist, values default to redacted and only scalars that
// cannot identify a person (booleans, numbers, UUID/ULID-shaped ids, short enum/slug-like strings)
// survive. Key names that are known to carry PII/secrets are redacted regardless of value shape.
const MAX_DEPTH = 4
const MAX_ARRAY_ITEMS = 10
const MAX_OBJECT_KEYS = 32

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
const SENSITIVE_KEY_NAMES: readonly string[] = [
  'contactname',
  'sendername',
  'invitername',
  'firstname',
  'lastname',
  'fullname',
]

const SAFE_SCALAR_STRING = /^[a-z][a-z0-9_-]{0,63}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

// Mirrors the old key-collection contract: only plain, non-empty objects produce output; a
// missing/non-object/array/empty payload yields undefined so callers can omit the field entirely.
export function scrubJobData(data: unknown): Record<string, unknown> | undefined {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return undefined
  const keys = Object.keys(data)
  if (keys.length === 0) return undefined
  // Depth 0 is always below MAX_DEPTH, so scrubObject always returns a plain object here.
  return scrubObject(data as Record<string, unknown>, 0) as Record<string, unknown>
}

function scrubValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return scrubString(value)
  if (Array.isArray(value)) return scrubArray(value, depth)
  if (typeof value === 'object') return scrubObject(value as Record<string, unknown>, depth)
  return SENTRY_FILTERED_VALUE
}

function scrubString(value: string): string {
  if (UUID_PATTERN.test(value) || ULID_PATTERN.test(value)) return value
  return SAFE_SCALAR_STRING.test(value) ? value : SENTRY_FILTERED_VALUE
}

function scrubArray(value: unknown[], depth: number): unknown {
  if (depth >= MAX_DEPTH) return SENTRY_FILTERED_VALUE
  const items = value.slice(0, MAX_ARRAY_ITEMS).map(item => scrubValue(item, depth + 1))
  if (value.length > MAX_ARRAY_ITEMS) items.push(`...${value.length - MAX_ARRAY_ITEMS} more`)
  return items
}

function scrubObject(value: Record<string, unknown>, depth: number): unknown {
  if (depth >= MAX_DEPTH) return SENTRY_FILTERED_VALUE
  const keys = Object.keys(value).sort()
  const result: Record<string, unknown> = {}
  for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
    result[key] = isSensitiveKey(key) ? SENTRY_FILTERED_VALUE : scrubValue(value[key], depth + 1)
  }
  return result
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
  return (
    SENSITIVE_KEY_NAMES.includes(normalized) ||
    SENSITIVE_KEY_SUBSTRINGS.some(substring => normalized.includes(substring))
  )
}
