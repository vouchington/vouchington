import type { CopyrightSweepContinuation } from '@queues/notifications/types'
import { enqueueSendCopyrightNoticeEmail } from '@queues/emails/enqueues'
import {
  enqueueDeliverCopyrightNotice,
  enqueueReconcileCopyrightDeliveryIntents,
} from '@queues/notifications/enqueues'
import {
  deliverCopyrightInAppNotification,
  searchRecoverableCopyrightDeliveryIntentIds,
} from '@services/copyright-notices'
import {
  enqueueEveryCopyrightSweepPage,
  type CopyrightSweepTally,
} from './copyright-sweep-walk.mts'

type CopyrightDeliveryChannel = Parameters<
  typeof searchRecoverableCopyrightDeliveryIntentIds
>[0]['channel']

export type ReconcileCopyrightDeliveryIntentsDeps = {
  enqueueContinuation: typeof enqueueReconcileCopyrightDeliveryIntents
  searchDeliveryIntents: typeof searchRecoverableCopyrightDeliveryIntentIds
  enqueueDeliverCopyrightNotice: typeof enqueueDeliverCopyrightNotice
  enqueueSendCopyrightNoticeEmail: typeof enqueueSendCopyrightNoticeEmail
}

const defaultDeps: ReconcileCopyrightDeliveryIntentsDeps = {
  enqueueContinuation: enqueueReconcileCopyrightDeliveryIntents,
  searchDeliveryIntents: searchRecoverableCopyrightDeliveryIntentIds,
  enqueueDeliverCopyrightNotice,
  enqueueSendCopyrightNoticeEmail,
}

export async function processDeliverCopyrightNotice(
  data: { intentId: string },
  dependencies: {
    deliverCopyrightInAppNotification?: typeof deliverCopyrightInAppNotification
  } = {},
): Promise<boolean> {
  const deliver =
    dependencies.deliverCopyrightInAppNotification ?? deliverCopyrightInAppNotification
  return deliver(data.intentId)
}

/**
 * Processes capped pages of each channel's delivery intents, enqueueing each row's delivery job. The
 * job's claim, not this sweep, fails a lease-expired row at the retry cap. A failed page read or
 * enqueue does not stop the rest; the job fails afterwards with every error so its retry covers
 * what is still pending.
 */
export async function processReconcileCopyrightDeliveryIntents(
  dependencyOverrides: Partial<ReconcileCopyrightDeliveryIntentsDeps> = {},
  data: CopyrightSweepContinuation = {},
): Promise<{ enqueued: number; hasMore: boolean }> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const cursors: Record<string, string> = {}
  const tally: CopyrightSweepTally = { enqueued: 0, errors: [] }
  const enqueueByChannel: Record<CopyrightDeliveryChannel, typeof enqueueDeliverCopyrightNotice> = {
    in_app: intentId => deps.enqueueDeliverCopyrightNotice(intentId),
    email: intentId => deps.enqueueSendCopyrightNoticeEmail(intentId),
  }
  const channels = Object.keys(enqueueByChannel) as CopyrightDeliveryChannel[]
  await Promise.all(
    channels.map(channel =>
      enqueueEveryCopyrightSweepPage(
        tally,
        page => deps.searchDeliveryIntents({ channel, ...page }),
        enqueueByChannel[channel],
        {
          after: data.cursors?.[channel],
          skip: data.cursors !== undefined && !(channel in data.cursors),
          onMore: after => {
            cursors[channel] = after
          },
        },
      ),
    ),
  )
  if (Object.keys(cursors).length > 0) await deps.enqueueContinuation({ cursors })
  if (tally.errors.length > 0) {
    throw new AggregateError(tally.errors, 'Copyright delivery reconciliation failed')
  }
  return { enqueued: tally.enqueued, hasMore: Object.keys(cursors).length > 0 }
}
