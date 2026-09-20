import { enqueueSendCopyrightNoticeEmail } from '@queues/emails/enqueues'
import { enqueueDeliverCopyrightNotice } from '@queues/notifications/enqueues'
import {
  deliverCopyrightInAppNotification,
  listRecoverableCopyrightDeliveryIntents,
} from '@services/copyright-notices'

type CopyrightDeliveryProcessorDependencies = {
  deliverCopyrightInAppNotification: typeof deliverCopyrightInAppNotification
  listRecoverableCopyrightDeliveryIntents: typeof listRecoverableCopyrightDeliveryIntents
  enqueueDeliverCopyrightNotice: typeof enqueueDeliverCopyrightNotice
  enqueueSendCopyrightNoticeEmail: typeof enqueueSendCopyrightNoticeEmail
}

export async function processDeliverCopyrightNotice(
  data: { intentId: string },
  dependencies: Partial<CopyrightDeliveryProcessorDependencies> = {},
): Promise<boolean> {
  const deliver =
    dependencies.deliverCopyrightInAppNotification ?? deliverCopyrightInAppNotification
  return await deliver(data.intentId)
}

export async function processReconcileCopyrightDeliveryIntents(
  dependencies: Partial<CopyrightDeliveryProcessorDependencies> = {},
): Promise<{ enqueued: number }> {
  const list =
    dependencies.listRecoverableCopyrightDeliveryIntents ?? listRecoverableCopyrightDeliveryIntents
  const enqueueInApp = dependencies.enqueueDeliverCopyrightNotice ?? enqueueDeliverCopyrightNotice
  const enqueueEmail =
    dependencies.enqueueSendCopyrightNoticeEmail ?? enqueueSendCopyrightNoticeEmail
  const intents = await list(100)
  await Promise.all(
    intents.map(intent =>
      intent.channel === 'in_app' ? enqueueInApp(intent.id) : enqueueEmail(intent.id),
    ),
  )
  return { enqueued: intents.length }
}
