import { dynamicConfigPrimaryValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit, type GlideClient } from '@valkey/valkey-glide'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'

const ACCOUNTING_UNCERTAINTY_KEY_PREFIX = 'ai-usage:accounting-uncertain'
const UTC_DAY_MS = 24 * 60 * 60 * 1000

export type AccountingUncertaintySource = 'ledger_write_failed' | 'unknown_billed_attempt'

export type AccountingUncertaintyValkeyClient = Pick<GlideClient, 'get' | 'set'>

export function getAccountingUncertaintyKey(requestDay: string): string {
  return `${ACCOUNTING_UNCERTAINTY_KEY_PREFIX}:${requestDay}`
}

/**
 * Persists the first uncertainty signal for a request day. The NX write deliberately never
 * refreshes the expiry or overwrites the diagnostic source: once raised, the latch remains set
 * until that UTC day's boundary.
 */
export async function latchAccountingUncertainty(
  options: { requestDay: string; source: AccountingUncertaintySource },
  client: AccountingUncertaintyValkeyClient = dynamicConfigPrimaryValkeyClient,
): Promise<void> {
  const { requestDay, source } = options
  const ttlSeconds = getSecondsUntilRequestDayBoundary(requestDay)
  if (ttlSeconds === null) return

  await client.set(getAccountingUncertaintyKey(requestDay), source, {
    conditionalSet: 'onlyIfDoesNotExist',
    expiry: { type: TimeUnit.Seconds, count: ttlSeconds },
  })
}

/** Returns the latch's first persisted source, or null when the request day is not latched. */
export async function getAccountingUncertaintySource(
  requestDay: string,
  client: AccountingUncertaintyValkeyClient = dynamicConfigPrimaryValkeyClient,
): Promise<AccountingUncertaintySource | null> {
  const value = await client.get(getAccountingUncertaintyKey(requestDay))
  if (value === null) return null
  if (value === 'ledger_write_failed' || value === 'unknown_billed_attempt') return value
  throw new Error(`Invalid accounting uncertainty source for ${requestDay}`)
}

function getSecondsUntilRequestDayBoundary(requestDay: string): number | null {
  if (requestDay < getCurrentUtcDay()) return null
  const boundary = Date.parse(`${requestDay}T00:00:00.000Z`) + UTC_DAY_MS
  return Math.max(1, Math.ceil((boundary - Date.now()) / 1000))
}
