import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import {
  createDueStatutoryCopyrightRestoreIntents,
  listRecoverableCopyrightActionIntentIds,
  processCopyrightActionIntent,
  reconcileCopyrightEnforcementRequests,
} from '@services/copyright-notices'

type CopyrightActionProcessorDependencies = {
  enqueueApplyCopyrightAction: typeof enqueueApplyCopyrightAction
  listRecoverableCopyrightActionIntentIds: typeof listRecoverableCopyrightActionIntentIds
  processCopyrightActionIntent: typeof processCopyrightActionIntent
  createDueStatutoryCopyrightRestoreIntents: typeof createDueStatutoryCopyrightRestoreIntents
  reconcileCopyrightEnforcementRequests: typeof reconcileCopyrightEnforcementRequests
  now: () => Date
}

export async function processApplyCopyrightAction(
  data: { intentId: string },
  dependencies: Partial<CopyrightActionProcessorDependencies> = {},
): Promise<'applied' | 'stale' | 'blocked' | 'not_claimed'> {
  const process = dependencies.processCopyrightActionIntent ?? processCopyrightActionIntent
  const now = dependencies.now ?? (() => new Date())
  return await process(data.intentId, now())
}

export async function processReconcileCopyrightActionIntents(
  dependencies: Partial<CopyrightActionProcessorDependencies> = {},
): Promise<{ enqueued: number }> {
  const list =
    dependencies.listRecoverableCopyrightActionIntentIds ?? listRecoverableCopyrightActionIntentIds
  const enqueue = dependencies.enqueueApplyCopyrightAction ?? enqueueApplyCopyrightAction
  const now = dependencies.now ?? (() => new Date())
  const evaluatedAt = now()
  const createDue =
    dependencies.createDueStatutoryCopyrightRestoreIntents ??
    createDueStatutoryCopyrightRestoreIntents
  const reconcileEnforcement =
    dependencies.reconcileCopyrightEnforcementRequests ?? reconcileCopyrightEnforcementRequests
  await reconcileEnforcement(100)
  await createDue(evaluatedAt)
  const intentIds = await list(100, evaluatedAt)
  await Promise.all(intentIds.map(intentId => enqueue(intentId)))
  return { enqueued: intentIds.length }
}
