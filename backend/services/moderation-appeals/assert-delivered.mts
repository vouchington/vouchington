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
