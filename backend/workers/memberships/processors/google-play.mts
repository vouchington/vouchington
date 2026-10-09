import {
  enqueueBulkAcknowledgeGooglePlayPurchases,
  enqueueBulkProcessGooglePlayNotifications,
  enqueueBulkReconcileGooglePlayActiveSources,
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
  // ast-grep-ignore: no-three-sequential-awaits -- the durable recovery cursor advances only after the awaited bulk fan-out succeeds
  const batch = await findRecoverableGooglePlayNotificationJobs()
  await enqueueBulkProcessGooglePlayNotifications(batch.notifications)
  await advanceGooglePlayNotificationRecoveryCursor(batch)
}

export async function recoverGooglePlayActiveSources(): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- the durable recovery cursor advances only after the awaited bulk fan-out succeeds
  const batch = await findRecoverableGooglePlayActiveSourceJobs()
  await enqueueBulkReconcileGooglePlayActiveSources(batch.sourceIds.map(sourceId => ({ sourceId })))
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
  // ast-grep-ignore: no-three-sequential-awaits -- the durable recovery cursor advances only after the awaited bulk fan-out succeeds
  const batch = await findDueGooglePlayAcknowledgementIds()
  await enqueueBulkAcknowledgeGooglePlayPurchases(
    batch.acknowledgementIds.map(acknowledgementId => ({ acknowledgementId })),
  )
  await advanceGooglePlayAcknowledgementRecoveryCursor(batch)
}
