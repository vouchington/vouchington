import {
  getPendingCopyrightAgentDispatches,
  isCopyrightIntakeEnabled,
} from '@services/copyright-notices'
import { enqueueOrRetryCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { enqueueOrRetryCopyrightFormScreening } from '@queues/ai-agents/enqueues/copyright-form-screening'
import { enqueueOrRetryCopyrightAppealRecommendation } from '@queues/ai-agents/enqueues/copyright-appeal-recommendation'

export async function processReconcileCopyrightAgentDispatches(
  dependencies: Partial<{
    getPending: typeof getPendingCopyrightAgentDispatches
    enqueueEmail: typeof enqueueOrRetryCopyrightEmailIntake
    enqueueForm: typeof enqueueOrRetryCopyrightFormScreening
    enqueueAppeal: typeof enqueueOrRetryCopyrightAppealRecommendation
    isCopyrightIntakeEnabled: typeof isCopyrightIntakeEnabled
  }> = {},
): Promise<void> {
  const getPending = dependencies.getPending ?? getPendingCopyrightAgentDispatches
  const enqueueEmail = dependencies.enqueueEmail ?? enqueueOrRetryCopyrightEmailIntake
  const enqueueForm = dependencies.enqueueForm ?? enqueueOrRetryCopyrightFormScreening
  const enqueueAppeal = dependencies.enqueueAppeal ?? enqueueOrRetryCopyrightAppealRecommendation
  const copyrightIntakeEnabled = dependencies.isCopyrightIntakeEnabled ?? isCopyrightIntakeEnabled
  if (!copyrightIntakeEnabled()) return
  const pending = await getPending()
  await Promise.all(
    pending.map(item => {
      if (item.kind === 'email') return enqueueEmail(item.intakeId)
      if (item.kind === 'form') return enqueueForm(item.submissionId)
      return enqueueAppeal(item.submissionId)
    }),
  )
}
