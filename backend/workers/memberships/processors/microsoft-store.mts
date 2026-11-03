import {
  enqueueBulkReconcileMicrosoftStoreSources,
  enqueueContinueRecoverMicrosoftStoreSources,
} from '@queues/memberships/enqueues'
import {
  advanceMicrosoftStoreSourceRecoveryCursor,
  findRecoverableMicrosoftStoreSourceJobs,
  reconcileMicrosoftStoreSource,
} from '@services/memberships/microsoft'

export async function recoverMicrosoftStoreSources(): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- the durable recovery cursor advances only after the awaited bulk fan-out succeeds
  const batch = await findRecoverableMicrosoftStoreSourceJobs()
  await enqueueBulkReconcileMicrosoftStoreSources(batch.sourceIds.map(sourceId => ({ sourceId })))
  const advanced = await advanceMicrosoftStoreSourceRecoveryCursor(batch)
  if (advanced && !batch.completesSweep) await enqueueContinueRecoverMicrosoftStoreSources()
}

export async function processMicrosoftStoreSource(data: { sourceId: string }): Promise<void> {
  await reconcileMicrosoftStoreSource({ sourceId: data.sourceId })
}
