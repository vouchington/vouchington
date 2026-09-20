import { getPendingCopyrightAgentDispatches } from '@services/copyright-notices'
import { enqueueOrRetryCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { enqueueOrRetryCopyrightFormScreening } from '@queues/ai-agents/enqueues/copyright-form-screening'

export async function processReconcileCopyrightAgentDispatches(
  dependencies: Partial<{
    getPending: typeof getPendingCopyrightAgentDispatches
    enqueueEmail: typeof enqueueOrRetryCopyrightEmailIntake
    enqueueForm: typeof enqueueOrRetryCopyrightFormScreening
  }> = {},
): Promise<void> {
  const getPending = dependencies.getPending ?? getPendingCopyrightAgentDispatches
  const enqueueEmail = dependencies.enqueueEmail ?? enqueueOrRetryCopyrightEmailIntake
  const enqueueForm = dependencies.enqueueForm ?? enqueueOrRetryCopyrightFormScreening
  const pending = await getPending()
  await Promise.all(
    pending.map(item =>
      item.kind === 'email' ? enqueueEmail(item.intakeId) : enqueueForm(item.submissionId),
    ),
  )
}
