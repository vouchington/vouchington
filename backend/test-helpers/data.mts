import crypto from 'node:crypto'
import { verifyPhoneNumber } from '@modules/utils'

// Matches USERNAME_MAX_LENGTH in ts-shared/utils/validation-core.mts — keep in sync.
const USERNAME_MAX_LENGTH = 50
const USERNAME_RANDOM_LENGTH = 12
const TEST_EMAIL_PREFIX_MAX_LENGTH = 45
const TEST_EMAIL_RANDOM_LENGTH = 12

const DAY_MS = 24 * 60 * 60 * 1000
const RETENTION_WINDOW_STEP_MS = 60 * 1000
// Shared by createTestFutureUtcDay and createTestExpiryWindow -- both need the same "far enough in
// the future, spread across a wide random namespace" anti-collision property (see each function's
// own docstring for why).
const TEST_FUTURE_OFFSET_DAYS = 50_000
const TEST_FUTURE_NAMESPACE_DAYS = 365_000
const PHONE_NUMBER_GENERATION_ATTEMPTS = 100

export const createRandomString = (length: number) =>
  crypto
    .randomBytes(length * 3)
    .toString('base64')
    .replaceAll(/[^a-z0-9]/gi, '')
    .slice(0, length)
    .toLowerCase()

export function createUniqueTestEmail(prefix: string): string {
  const normalizedPrefix =
    prefix
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, TEST_EMAIL_PREFIX_MAX_LENGTH)
      .replace(/-+$/, '') || 'test'

  return `tests+${normalizedPrefix}-${createRandomString(TEST_EMAIL_RANDOM_LENGTH)}@voucha.ai`
}

export const createRandomEmailAddress = () => createUniqueTestEmail('random')

/**
 * Returns a random UTC day (YYYY-MM-DD), 137-1136 years out. Far enough in the future that no real
 * `uuidv7()`-defaulted row from a concurrently running test can ever land there, and randomized
 * across a wide namespace so re-running the same test doesn't collide with rows a previous run left
 * behind. This isolates row ownership, not exact global aggregates: use
 * acquireTestAiUsageDateReservation for those (see test-helpers/README.md).
 */
export function createTestFutureUtcDay(): string {
  const namespaceOffsetMs = crypto.randomInt(TEST_FUTURE_NAMESPACE_DAYS) * DAY_MS
  const ms = Date.now() + TEST_FUTURE_OFFSET_DAYS * DAY_MS + namespaceOffsetMs
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Generate a parallel-safe, validation-conformant test username.
 *
 * Guarantees: starts with a letter, contains only [a-z0-9-], ends alphanumeric,
 * ≤ USERNAME_MAX_LENGTH (50) characters, never all-numeric / phone-shaped / a UUID.
 *
 * Pass a short `label` for debuggability (e.g. `safeUsername('cmod')` → `u-cmod-<random12>`).
 * The `u-` prefix makes the leading-letter guarantee branchless regardless of label content.
 */
export function safeUsername(label = 'user'): string {
  const cleaned = `u-${label}`.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
  // Slice the prefix so the final `<prefix>-<random>` stays ≤ USERNAME_MAX_LENGTH and ends alphanumeric.
  const prefix = cleaned
    .slice(0, USERNAME_MAX_LENGTH - USERNAME_RANDOM_LENGTH - 1)
    .replace(/-+$/, '')
  return `${prefix}-${createRandomString(USERNAME_RANDOM_LENGTH)}`
}

export type TestRetentionWindow = {
  retentionDays: number
  now: Date
  lowerBoundDate: Date
  upperBoundDate: Date
  beforeLowerBoundDate: Date
  firstEligibleDate: Date
  secondEligibleDate: Date
  afterUpperBoundDate: Date
}

export type TestExpiryWindow = Omit<TestRetentionWindow, 'retentionDays'>

export function createTestExpiryWindow(): TestExpiryWindow {
  const namespaceOffsetMs = crypto.randomInt(TEST_FUTURE_NAMESPACE_DAYS) * DAY_MS
  const dayOffsetMs = crypto.randomInt(DAY_MS)
  const firstEligibleDate = new Date(
    Date.now() + TEST_FUTURE_OFFSET_DAYS * DAY_MS + namespaceOffsetMs + dayOffsetMs,
  )
  const secondEligibleDate = new Date(firstEligibleDate.getTime() + RETENTION_WINDOW_STEP_MS)
  const upperBoundDate = new Date(secondEligibleDate.getTime() + RETENTION_WINDOW_STEP_MS)

  return {
    now: new Date(upperBoundDate.getTime()),
    lowerBoundDate: new Date(firstEligibleDate.getTime() - RETENTION_WINDOW_STEP_MS),
    upperBoundDate,
    beforeLowerBoundDate: new Date(firstEligibleDate.getTime() - 2 * RETENTION_WINDOW_STEP_MS),
    firstEligibleDate,
    secondEligibleDate,
    afterUpperBoundDate: new Date(upperBoundDate.getTime() + RETENTION_WINDOW_STEP_MS),
  }
}

export function createTestRetentionWindow(): TestRetentionWindow {
  const retentionDays = 1
  const window = createTestExpiryWindow()
  return {
    ...window,
    retentionDays,
    now: new Date(window.upperBoundDate.getTime() + retentionDays * DAY_MS),
  }
}

/**
 * Assert that a value is a valid ISO 8601 date string.
 * Use this in API tests to verify the backend never returns invalid dates.
 */
export function assertValidIsoDateString(value: unknown, fieldName: string): void {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName}: expected a valid ISO date string, got ${String(value)}`)
  }
  if (typeof value !== 'string') {
    throw new Error(
      `${fieldName}: expected a string, got ${typeof value} (${JSON.stringify(value)})`,
    )
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName}: invalid date string: "${value}"`)
  }
  if (parsed.getTime() === 0) {
    throw new Error(`${fieldName}: date is Unix epoch (likely a null date): "${value}"`)
  }
}

export function createRandomPhoneNumber(): string {
  for (let attempt = 0; attempt < PHONE_NUMBER_GENERATION_ATTEMPTS; attempt++) {
    const areaCode = crypto.randomInt(200, 1_000)
    const exchange = crypto.randomInt(200, 1_000)
    const subscriber = crypto.randomInt(10_000).toString().padStart(4, '0')
    const phoneNumber = `${areaCode}${exchange}${subscriber}`
    try {
      verifyPhoneNumber(phoneNumber)
      return phoneNumber
    } catch {
      continue
    }
  }

  throw new Error(
    `Unable to generate a valid NANP phone number after ${PHONE_NUMBER_GENERATION_ATTEMPTS} attempts`,
  )
}
