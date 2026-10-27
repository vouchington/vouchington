import { DelayedError, type Job } from 'glide-mq'
import { UnrecoverableError } from '@vouchington/queue-errors'
import {
  activityPubInboxDeliveryTransitions,
  processDurableActivityPubInboxDelivery,
} from '@services/ap-inbox-activities'
import type { ActivityPubInboxDeliveryJob } from '@queues/activitypub/types'

export async function processDelivery(
  data: ActivityPubInboxDeliveryJob,
  options: { isFinalAttempt: boolean; moveToDelayed: Job['moveToDelayed'] },
): Promise<void> {
  try {
    const result = await processDurableActivityPubInboxDelivery(data.deliveryId)
    if (result.outcome !== 'deferred') return

    await options.moveToDelayed(result.deferredUntil.getTime())
  } catch (err) {
    if (err instanceof DelayedError) throw err
    if (isTerminalProtocolError(err)) {
      await activityPubInboxDeliveryTransitions.reject(data.deliveryId)
      throw new UnrecoverableError(err instanceof Error ? err.message : String(err))
    }
    if (options.isFinalAttempt) {
      await activityPubInboxDeliveryTransitions.exhaust(data.deliveryId, err)
    }
    throw err
  }
}

function isTerminalProtocolError(error: unknown): boolean {
  const typed = error as { status?: unknown; statusCode?: unknown }
  const status =
    typeof typed?.status === 'number'
      ? typed.status
      : typeof typed?.statusCode === 'number'
        ? typed.statusCode
        : 500
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}
