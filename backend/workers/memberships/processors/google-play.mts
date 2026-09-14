import {
  enqueueAcknowledgeGooglePlayPurchase,
  enqueueProcessGooglePlayNotification,
  enqueueReconcileGooglePlayActiveSource,
} from '@queues/memberships/enqueues'
import {
  acknowledgeGooglePlayPurchase,
  createConfiguredGooglePlaySubscriptionsV2Client,
  findDueGooglePlayAcknowledgementIds,
  advanceGooglePlayAcknowledgementRecoveryCursor,
  findRecoverableGooglePlayNotificationJobs,
  advanceGooglePlayNotificationRecoveryCursor,
  findRecoverableGooglePlayActiveSourceJobs,
  advanceGooglePlayActiveSourceRecoveryCursor,
  reconcileGooglePlayActiveSource,
  reconcileGooglePlayRtdnNotification,
} from '@services/memberships/google'
export { refreshConfiguredGoogleOidcTrustMaterial } from '@services/memberships/google'

export async function processGooglePlayNotification(data: { evidenceId: string }): Promise<void> {
  await reconcileGooglePlayRtdnNotification({
    evidenceId: data.evidenceId,
    client: createConfiguredGooglePlaySubscriptionsV2Client(),
  })
}

export async function recoverGooglePlayNotifications(): Promise<void> {
  const batch = await findRecoverableGooglePlayNotificationJobs()
  await Promise.all(
    batch.notifications.map(notification => enqueueProcessGooglePlayNotification(notification)),
  )
  await advanceGooglePlayNotificationRecoveryCursor(batch)
}

export async function recoverGooglePlayActiveSources(): Promise<void> {
  const batch = await findRecoverableGooglePlayActiveSourceJobs()
  await Promise.all(
    batch.sourceIds.map(sourceId => enqueueReconcileGooglePlayActiveSource({ sourceId })),
  )
  await advanceGooglePlayActiveSourceRecoveryCursor(batch)
}

export async function processGooglePlayActiveSource(data: { sourceId: string }): Promise<void> {
  await reconcileGooglePlayActiveSource({
    sourceId: data.sourceId,
    client: createConfiguredGooglePlaySubscriptionsV2Client(),
  })
}

export async function processGooglePlayAcknowledgement(data: {
  acknowledgementId: string
}): Promise<void> {
  await acknowledgeGooglePlayPurchase({
    acknowledgementId: data.acknowledgementId,
    client: createConfiguredGooglePlaySubscriptionsV2Client(),
  })
}

export async function recoverGooglePlayAcknowledgements(): Promise<void> {
  const batch = await findDueGooglePlayAcknowledgementIds()
  await Promise.all(
    batch.acknowledgementIds.map(acknowledgementId =>
      enqueueAcknowledgeGooglePlayPurchase({ acknowledgementId }),
    ),
  )
  await advanceGooglePlayAcknowledgementRecoveryCursor(batch)
}
