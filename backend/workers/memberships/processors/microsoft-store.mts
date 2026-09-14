import {
  enqueueContinueRecoverMicrosoftStoreSources,
  enqueueReconcileMicrosoftStoreSource,
} from '@queues/memberships/enqueues'
import {
  advanceMicrosoftStoreSourceRecoveryCursor,
  findRecoverableMicrosoftStoreSourceJobs,
  reconcileMicrosoftStoreSource,
} from '@services/memberships/microsoft'

type RecoverMicrosoftStoreSourcesDependencies = {
  advanceMicrosoftStoreSourceRecoveryCursor: typeof advanceMicrosoftStoreSourceRecoveryCursor
  enqueueContinueRecoverMicrosoftStoreSources: typeof enqueueContinueRecoverMicrosoftStoreSources
  enqueueReconcileMicrosoftStoreSource: typeof enqueueReconcileMicrosoftStoreSource
  findRecoverableMicrosoftStoreSourceJobs: typeof findRecoverableMicrosoftStoreSourceJobs
}

const recoveryDependencies: RecoverMicrosoftStoreSourcesDependencies = {
  advanceMicrosoftStoreSourceRecoveryCursor,
  enqueueContinueRecoverMicrosoftStoreSources,
  enqueueReconcileMicrosoftStoreSource,
  findRecoverableMicrosoftStoreSourceJobs,
}

export async function recoverMicrosoftStoreSources(
  overrides: Partial<RecoverMicrosoftStoreSourcesDependencies> = {},
): Promise<void> {
  const dependencies = { ...recoveryDependencies, ...overrides }
  const batch = await dependencies.findRecoverableMicrosoftStoreSourceJobs()
  await Promise.all(
    batch.sourceIds.map(sourceId =>
      dependencies.enqueueReconcileMicrosoftStoreSource({ sourceId }),
    ),
  )
  const advanced = await dependencies.advanceMicrosoftStoreSourceRecoveryCursor(batch)
  if (advanced && !batch.completesSweep)
    await dependencies.enqueueContinueRecoverMicrosoftStoreSources()
}

export async function processMicrosoftStoreSource(data: { sourceId: string }): Promise<void> {
  await reconcileMicrosoftStoreSource({ sourceId: data.sourceId })
}
