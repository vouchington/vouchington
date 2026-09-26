import {
  enqueueSendCopyrightEmailIntakeResponse,
  enqueueSendCopyrightNoticeEmail,
} from '@queues/emails/enqueues'
import { enqueueDeliverCopyrightNotice } from '@queues/notifications/enqueues'
import {
  deliverCopyrightInAppNotification,
  searchRecoverableCopyrightDeliveryIntentIds,
  searchRecoverableCopyrightEmailIntakeResponseIds,
} from '@services/copyright-notices'
import {
  enqueueEveryCopyrightSweepPage,
  type CopyrightSweepTally,
} from './copyright-sweep-walk.mts'

type CopyrightDeliveryChannel = Parameters<
  typeof searchRecoverableCopyrightDeliveryIntentIds
>[0]['channel']

export type ReconcileCopyrightDeliveryIntentsDeps = {
  searchDeliveryIntents: typeof searchRecoverableCopyrightDeliveryIntentIds
  searchEmailIntakeResponses: typeof searchRecoverableCopyrightEmailIntakeResponseIds
  enqueueDeliverCopyrightNotice: typeof enqueueDeliverCopyrightNotice
  enqueueSendCopyrightNoticeEmail: typeof enqueueSendCopyrightNoticeEmail
  enqueueSendCopyrightEmailIntakeResponse: typeof enqueueSendCopyrightEmailIntakeResponse
}

const defaultDeps: ReconcileCopyrightDeliveryIntentsDeps = {
  searchDeliveryIntents: searchRecoverableCopyrightDeliveryIntentIds,
  searchEmailIntakeResponses: searchRecoverableCopyrightEmailIntakeResponseIds,
  enqueueDeliverCopyrightNotice,
  enqueueSendCopyrightNoticeEmail,
  enqueueSendCopyrightEmailIntakeResponse,
}

export async function processDeliverCopyrightNotice(
  data: { intentId: string },
  dependencies: {
    deliverCopyrightInAppNotification?: typeof deliverCopyrightInAppNotification
  } = {},
): Promise<boolean> {
  const deliver =
    dependencies.deliverCopyrightInAppNotification ?? deliverCopyrightInAppNotification
  return await deliver(data.intentId)
}

/**
 * Walks every page of each channel's delivery intents and of the email intake responses together,
 * enqueueing each row's delivery job. The job's claim, not this sweep, fails a lease-expired row at
 * the retry cap. A failed page read or enqueue does not stop the rest; the job fails afterwards with
 * every error so its retry covers what is still pending.
 */
export async function processReconcileCopyrightDeliveryIntents(
  dependencyOverrides: Partial<ReconcileCopyrightDeliveryIntentsDeps> = {},
): Promise<{ enqueued: number }> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const tally: CopyrightSweepTally = { enqueued: 0, errors: [] }
  const enqueueByChannel: Record<CopyrightDeliveryChannel, typeof enqueueDeliverCopyrightNotice> = {
    in_app: intentId => deps.enqueueDeliverCopyrightNotice(intentId),
    email: intentId => deps.enqueueSendCopyrightNoticeEmail(intentId),
  }
  const channels = Object.keys(enqueueByChannel) as CopyrightDeliveryChannel[]
  await Promise.all([
    ...channels.map(channel =>
      enqueueEveryCopyrightSweepPage(
        tally,
        page => deps.searchDeliveryIntents({ channel, ...page }),
        enqueueByChannel[channel],
      ),
    ),
    enqueueEveryCopyrightSweepPage(
      tally,
      page => deps.searchEmailIntakeResponses(page),
      responseId => deps.enqueueSendCopyrightEmailIntakeResponse(responseId),
    ),
  ])
  if (tally.errors.length > 0) {
    throw new AggregateError(tally.errors, 'Copyright delivery reconciliation failed')
  }
  return { enqueued: tally.enqueued }
}
