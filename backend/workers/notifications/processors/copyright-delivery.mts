import type {
  CopyrightDeliveryReconcileChannel,
  CopyrightDeliveryReconcileData,
} from '@queues/notifications/types'
import { enqueueBulkSendCopyrightNoticeEmails } from '@queues/emails/enqueues'
import {
  enqueueBulkDeliverCopyrightNotices,
  enqueueReconcileCopyrightDeliveryChannel,
} from '@queues/notifications/enqueues'
import {
  deliverCopyrightInAppNotification,
  searchRecoverableCopyrightDeliveryIntentIds,
} from '@services/copyright-notices'
import { getCopyrightSweepLimits } from '@services/copyright-notices/work-limits'
import { settleCopyrightSweepByBulkEnqueue, walkCopyrightSweep } from './copyright-sweep-walk.mts'

type BulkEnqueue = (intentIds: string[]) => Promise<unknown>

const enqueueByChannel: Record<CopyrightDeliveryReconcileChannel, BulkEnqueue> = {
  in_app: enqueueBulkDeliverCopyrightNotices,
  email: enqueueBulkSendCopyrightNoticeEmails,
}

export async function processDeliverCopyrightNotice(data: { intentId: string }): Promise<boolean> {
  return deliverCopyrightInAppNotification(data.intentId)
}

/**
 * Walks one channel's capped pages of delivery intents, adding each page's delivery jobs in one
 * bulk call. The job's claim, not this sweep, fails a lease-expired row at the retry cap. A job that
 * finds more enqueues its own continuation from the saved cursor, then fails with every error so
 * its retry covers only this channel. A failed page read fails the job and its retry resumes from
 * the job's own cursor.
 */
function createChannelProcessor(channel: CopyrightDeliveryReconcileChannel) {
  return async function processReconcileCopyrightDeliveryChannel(
    data: CopyrightDeliveryReconcileData = {},
  ): Promise<{ enqueued: number; hasMore: boolean }> {
    const walked = await walkCopyrightSweep(
      page => searchRecoverableCopyrightDeliveryIntentIds({ channel, ...page }),
      settleCopyrightSweepByBulkEnqueue(enqueueByChannel[channel]),
      { after: data.after, limits: getCopyrightSweepLimits(channel) },
    )
    if (walked.after !== undefined)
      await enqueueReconcileCopyrightDeliveryChannel(channel, { after: walked.after })
    if (walked.errors.length > 0) {
      throw new AggregateError(walked.errors, `Copyright ${channel} delivery reconciliation failed`)
    }
    return { enqueued: walked.enqueued, hasMore: walked.after !== undefined }
  }
}

export const copyrightDeliveryReconcileProcessors = {
  in_app: createChannelProcessor('in_app'),
  email: createChannelProcessor('email'),
} as const satisfies Record<CopyrightDeliveryReconcileChannel, unknown>
