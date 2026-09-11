import assert from 'http-assert'
import { getModerationAppealByIdFromPrimary } from './get.mts'

export async function assertModerationAppealDelivered(appealId: string): Promise<void> {
  const appeal = await getModerationAppealByIdFromPrimary(appealId)
  assert(appeal, 404, 'Appeal not found')
  assert(appeal.sent_at, 422, 'Appeal resolution must be sent before resolving')
}
