import { DelayedError, type Job } from 'glide-mq'
import { processDurableActivityPubInboxDelivery } from '@services/ap-inbox-activities'
import type { ActivityPubInboxDeliveryJob } from '@queues/activitypub/types'

export async function processDelivery(
  data: ActivityPubInboxDeliveryJob,
  options: {
    moveToDelayed: Job['moveToDelayed']
    updateData: Job<ActivityPubInboxDeliveryJob>['updateData']
  },
): Promise<void> {
  try {
    const result = await processDurableActivityPubInboxDelivery(data, options.updateData)
    if (result.outcome !== 'deferred') return
    await options.moveToDelayed(result.deferredUntil.getTime())
  } catch (err) {
    if (err instanceof DelayedError) throw err
    if (isTerminalProtocolError(err)) {
      console.info(
        JSON.stringify({
          event: 'activitypub_inbox_delivery_rejected',
          requestDigest: data.requestDigest,
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      return
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
