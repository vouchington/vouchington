import {
  applyNonSpamSignedInCopyrightFormScreening,
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
    applyFormEffect: typeof applyNonSpamSignedInCopyrightFormScreening
    enqueueAppeal: typeof enqueueOrRetryCopyrightAppealRecommendation
    isCopyrightIntakeEnabled: typeof isCopyrightIntakeEnabled
  }> = {},
): Promise<void> {
  const getPending = dependencies.getPending ?? getPendingCopyrightAgentDispatches
  const enqueueEmail = dependencies.enqueueEmail ?? enqueueOrRetryCopyrightEmailIntake
  const enqueueForm = dependencies.enqueueForm ?? enqueueOrRetryCopyrightFormScreening
  const applyFormEffect = dependencies.applyFormEffect ?? applyNonSpamSignedInCopyrightFormScreening
  const enqueueAppeal = dependencies.enqueueAppeal ?? enqueueOrRetryCopyrightAppealRecommendation
  const copyrightIntakeEnabled = dependencies.isCopyrightIntakeEnabled ?? isCopyrightIntakeEnabled
  if (!copyrightIntakeEnabled()) return
  const pending = await getPending()
  const enqueues: Promise<void>[] = []
  const formEffects: string[] = []
  for (const item of pending) {
    if (item.kind === 'form-effect') {
      formEffects.push(item.submissionId)
    } else if (item.kind === 'email') {
      enqueues.push(enqueueEmail(item.intakeId))
    } else if (item.kind === 'form-screening') {
      enqueues.push(enqueueForm(item.submissionId))
    } else {
      enqueues.push(enqueueAppeal(item.submissionId))
    }
  }
  await Promise.all(enqueues)
  for (const submissionId of formEffects) {
    // oxlint-disable-next-line no-await-in-loop -- each durable legal effect may lock targets.
    await applyFormEffect(submissionId)
  }
}
