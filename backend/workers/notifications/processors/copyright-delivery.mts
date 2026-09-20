import {
  enqueueSendCopyrightEmailIntakeResponse,
  enqueueSendCopyrightNoticeEmail,
} from '@queues/emails/enqueues'
import { enqueueDeliverCopyrightNotice } from '@queues/notifications/enqueues'
import {
  deliverCopyrightInAppNotification,
  listRecoverableCopyrightDeliveryIntents,
  listRecoverableCopyrightEmailIntakeResponses,
} from '@services/copyright-notices'

type CopyrightDeliveryProcessorDependencies = {
  deliverCopyrightInAppNotification: typeof deliverCopyrightInAppNotification
  listRecoverableCopyrightDeliveryIntents: typeof listRecoverableCopyrightDeliveryIntents
  listRecoverableCopyrightEmailIntakeResponses: typeof listRecoverableCopyrightEmailIntakeResponses
  enqueueDeliverCopyrightNotice: typeof enqueueDeliverCopyrightNotice
  enqueueSendCopyrightNoticeEmail: typeof enqueueSendCopyrightNoticeEmail
  enqueueSendCopyrightEmailIntakeResponse: typeof enqueueSendCopyrightEmailIntakeResponse
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
  const listResponses =
    dependencies.listRecoverableCopyrightEmailIntakeResponses ??
    listRecoverableCopyrightEmailIntakeResponses
  const enqueueResponse =
    dependencies.enqueueSendCopyrightEmailIntakeResponse ?? enqueueSendCopyrightEmailIntakeResponse
  const responses = await listResponses(100)
  await Promise.all(
    intents.map(intent =>
      intent.channel === 'in_app' ? enqueueInApp(intent.id) : enqueueEmail(intent.id),
    ),
  )
  await Promise.all(responses.map(response => enqueueResponse(response.id)))
  return { enqueued: intents.length + responses.length }
}
