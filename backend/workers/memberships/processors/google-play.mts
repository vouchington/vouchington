import {
  enqueueBulkAcknowledgeGooglePlayPurchases,
  enqueueBulkProcessGooglePlayNotifications,
  enqueueBulkReconcileGooglePlayActiveSources,
} from '@queues/memberships/enqueues'
import {
  acknowledgeGooglePlayPurchase,
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
  })
}

export async function recoverGooglePlayNotifications(): Promise<void> {
  const batch = await findRecoverableGooglePlayNotificationJobs()
  await enqueueBulkProcessGooglePlayNotifications(batch.notifications)
  return advanceGooglePlayNotificationRecoveryCursor(batch)
}

export async function recoverGooglePlayActiveSources(): Promise<void> {
  const batch = await findRecoverableGooglePlayActiveSourceJobs()
  await enqueueBulkReconcileGooglePlayActiveSources(batch.sourceIds.map(sourceId => ({ sourceId })))
  return advanceGooglePlayActiveSourceRecoveryCursor(batch)
}

export async function processGooglePlayActiveSource(data: { sourceId: string }): Promise<void> {
  await reconcileGooglePlayActiveSource({
    sourceId: data.sourceId,
  })
}

export async function processGooglePlayAcknowledgement(data: {
  acknowledgementId: string
}): Promise<void> {
  await acknowledgeGooglePlayPurchase({
    acknowledgementId: data.acknowledgementId,
  })
}

export async function recoverGooglePlayAcknowledgements(): Promise<void> {
  const batch = await findDueGooglePlayAcknowledgementIds()
  await enqueueBulkAcknowledgeGooglePlayPurchases(
    batch.acknowledgementIds.map(acknowledgementId => ({ acknowledgementId })),
  )
  return advanceGooglePlayAcknowledgementRecoveryCursor(batch)
}
