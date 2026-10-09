import {
  enqueueBulkReconcileMicrosoftStoreSources,
  enqueueContinueRecoverMicrosoftStoreSources,
} from '@queues/memberships/enqueues'
import {
  advanceMicrosoftStoreSourceRecoveryCursor,
  findRecoverableMicrosoftStoreSourceJobs,
  reconcileMicrosoftStoreSource,
} from '@services/memberships/microsoft'

type RecoverMicrosoftStoreSourcesDependencies = {
  advanceMicrosoftStoreSourceRecoveryCursor: typeof advanceMicrosoftStoreSourceRecoveryCursor
  enqueueContinueRecoverMicrosoftStoreSources: typeof enqueueContinueRecoverMicrosoftStoreSources
  enqueueBulkReconcileMicrosoftStoreSources: typeof enqueueBulkReconcileMicrosoftStoreSources
  findRecoverableMicrosoftStoreSourceJobs: typeof findRecoverableMicrosoftStoreSourceJobs
}

const recoveryDependencies: RecoverMicrosoftStoreSourcesDependencies = {
  advanceMicrosoftStoreSourceRecoveryCursor,
  enqueueContinueRecoverMicrosoftStoreSources,
  enqueueBulkReconcileMicrosoftStoreSources,
  findRecoverableMicrosoftStoreSourceJobs,
}

export async function recoverMicrosoftStoreSources(
  overrides: Partial<RecoverMicrosoftStoreSourcesDependencies> = {},
): Promise<void> {
  const dependencies = { ...recoveryDependencies, ...overrides }
  // ast-grep-ignore: no-three-sequential-awaits -- the durable recovery cursor advances only after the awaited bulk fan-out succeeds
  const batch = await dependencies.findRecoverableMicrosoftStoreSourceJobs()
  await dependencies.enqueueBulkReconcileMicrosoftStoreSources(
    batch.sourceIds.map(sourceId => ({ sourceId })),
  )
  const advanced = await dependencies.advanceMicrosoftStoreSourceRecoveryCursor(batch)
  if (advanced && !batch.completesSweep)
    await dependencies.enqueueContinueRecoverMicrosoftStoreSources()
}

export async function processMicrosoftStoreSource(data: { sourceId: string }): Promise<void> {
  await reconcileMicrosoftStoreSource({ sourceId: data.sourceId })
}
