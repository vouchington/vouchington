import assert from 'http-assert'
import type { QueryOptions } from '@data-stores/psql'
import { getModerationAppealByIdFromPrimary } from './get.mts'

export async function assertModerationAppealDelivered(
  appealId: string,
  options: QueryOptions = {},
): Promise<void> {
  const appeal = await getModerationAppealByIdFromPrimary(appealId, options)
  assert(appeal, 404, 'Appeal not found')
  assert(appeal.sent_at, 422, 'Appeal resolution must be sent before resolving')
}

/**
 * Explains a resolution update that matched no row. The update's own `sent_at IS NOT NULL AND
 * resolved_at IS NULL` predicates guard the success path, so only a miss reads, and it reports
 * the same 404, 422, then 404 precedence a pre-read would.
 */
export async function rejectUnresolvableAppeal(
  appealId: string,
  options: QueryOptions = {},
): Promise<never> {
  await assertModerationAppealDelivered(appealId, options)
  assert(false, 404, 'Appeal not found or already resolved')
}
