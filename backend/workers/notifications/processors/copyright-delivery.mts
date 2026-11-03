import type { CopyrightSweepContinuation } from '@queues/notifications/types'
import { enqueueBulkSendCopyrightNoticeEmails } from '@queues/emails/enqueues'
import {
  enqueueBulkDeliverCopyrightNotices,
  enqueueReconcileCopyrightDeliveryIntents,
} from '@queues/notifications/enqueues'
import {
  deliverCopyrightInAppNotification,
  searchRecoverableCopyrightDeliveryIntentIds,
} from '@services/copyright-notices'
import {
  enqueueBulkCopyrightSweepPages,
  createCopyrightSweepBudget,
  type CopyrightSweepTally,
} from './copyright-sweep-walk.mts'

type CopyrightDeliveryChannel = Parameters<
  typeof searchRecoverableCopyrightDeliveryIntentIds
>[0]['channel']

type BulkEnqueue = (intentIds: string[]) => Promise<unknown>

export async function processDeliverCopyrightNotice(data: { intentId: string }): Promise<boolean> {
  return deliverCopyrightInAppNotification(data.intentId)
}

/**
 * Processes capped pages of each channel's delivery intents, adding each page's delivery jobs in one
 * bulk call. The job's claim, not this sweep, fails a lease-expired row at the retry cap. A failed
 * page read or bulk add does not stop the rest; the job fails afterwards with every error so its
 * retry covers what is still pending.
 */
export async function processReconcileCopyrightDeliveryIntents(
  data: CopyrightSweepContinuation = {},
): Promise<{ enqueued: number; hasMore: boolean }> {
  const cursors = new Map(
    Object.entries(data.cursors ?? {}).map(([key, cursor]) => [
      key === 'email-notices' ? 'email' : key,
      cursor,
    ]),
  )
  const budget = createCopyrightSweepBudget()
  const deferred = new Set<string>()
  const tally: CopyrightSweepTally = { enqueued: 0, errors: [] }
  const enqueueByChannel: Record<CopyrightDeliveryChannel, BulkEnqueue> = {
    in_app: enqueueBulkDeliverCopyrightNotices,
    email: enqueueBulkSendCopyrightNoticeEmails,
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
    await enqueueBulkCopyrightSweepPages(
      tally,
      page => searchRecoverableCopyrightDeliveryIntentIds({ channel, ...page }),
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
  if (pending.length > 0) {
    const continuationCursors = Object.fromEntries(
      [...cursors].map(([key, cursor]) => [key === 'email' ? 'email-notices' : key, cursor]),
    )
    await enqueueReconcileCopyrightDeliveryIntents({ pending, cursors: continuationCursors })
  }
  if (tally.errors.length > 0) {
    throw new AggregateError(tally.errors, 'Copyright delivery reconciliation failed')
  }
  return { enqueued: tally.enqueued, hasMore: pending.length > 0 }
}
