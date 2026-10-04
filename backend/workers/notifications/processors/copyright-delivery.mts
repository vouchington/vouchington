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
  createCopyrightSweepBudget,
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
  const cursors = new Map(Object.entries(data.cursors ?? {}))
  const budget = createCopyrightSweepBudget()
  const deferred = new Set<string>()
  const tally: CopyrightSweepTally = { enqueued: 0, errors: [] }
  const enqueueByChannel: Record<CopyrightDeliveryChannel, typeof enqueueDeliverCopyrightNotice> = {
    in_app: intentId => deps.enqueueDeliverCopyrightNotice(intentId),
    email: intentId => deps.enqueueSendCopyrightNoticeEmail(intentId),
  }
  const channels = Object.keys(enqueueByChannel) as CopyrightDeliveryChannel[]
  const pending = [...(data.pending ?? channels)]
  while (budget.remainingPages > 0 && pending.length > 0) {
    const channel = pending.shift()! as CopyrightDeliveryChannel
    if (!channels.includes(channel))
      throw new Error(`Unknown copyright delivery channel: ${channel}`)
    const after = cursors.get(channel) ?? undefined
    cursors.delete(channel)
    // oxlint-disable-next-line no-await-in-loop -- rotate channels after each page under the shared job allowance.
    await enqueueEveryCopyrightSweepPage(
      tally,
      page => deps.searchDeliveryIntents({ channel, ...page }),
      enqueueByChannel[channel],
      {
        after,
        budget,
        singlePage: true,
        onPageReadError: () => {
          deferred.add(channel)
        },
        onMore: next => {
          cursors.set(channel, next ?? null)
        },
      },
    )
    if (cursors.has(channel) && !deferred.has(channel)) pending.push(channel)
  }
  pending.push(...deferred)
  if (pending.length > 0)
    await deps.enqueueContinuation({ pending, cursors: Object.fromEntries(cursors) })
  if (tally.errors.length > 0) {
    throw new AggregateError(tally.errors, 'Copyright delivery reconciliation failed')
  }
  return { enqueued: tally.enqueued, hasMore: pending.length > 0 }
}
