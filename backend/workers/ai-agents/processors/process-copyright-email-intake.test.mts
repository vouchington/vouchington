import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type { CopyrightEmailIntakeModelCaller } from '@agents/copyright-email-intake'
import type { CopyrightEmailIntakeJobData } from '@queues/ai-agents/types'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { processCopyrightEmailIntake } from './process-copyright-email-intake.mts'
import {
  processReconcileCopyrightAgentDispatches,
  type ReconcileCopyrightAgentDispatchesDeps,
} from './process-reconcile-copyright-agent-dispatches.mts'

const jobFor = (intakeId: string) =>
  ({ data: { intake_id: intakeId } }) as Job<CopyrightEmailIntakeJobData>

describe('processCopyrightEmailIntake while intake is switched off', () => {
  useCopyrightIntakeEnvironment({ enabled: false })

  it('does not send email contents to the model and leaves the ingested email pending', async () => {
    const intake = await createParsedCopyrightEmailIntake()
    const callModel = vi.fn<CopyrightEmailIntakeModelCaller>()

    await expect(processCopyrightEmailIntake(jobFor(intake.id), callModel)).resolves.toEqual({
      success: true,
    })

    expect(callModel).not.toHaveBeenCalled()
    await expect(readTestPendingCopyrightAgentDispatches(intake.id)).resolves.toEqual([
      { kind: 'email', intakeId: intake.id },
    ])
  })

  it('sends an email ingested during the pause to the model once the switch turns on', async () => {
    const intake = await createParsedCopyrightEmailIntake()
    const callModel = vi
      .fn<CopyrightEmailIntakeModelCaller>()
      .mockRejectedValue(new Error('the model was reached'))
    const enqueueEmail = vi.fn<ReconcileCopyrightAgentDispatchesDeps['enqueueEmail']>(
      async () => {},
    )
    const reconcile = () =>
      processReconcileCopyrightAgentDispatches({
        enqueueEmail,
        getPending: async () => ({
          results: await readTestPendingCopyrightAgentDispatches(intake.id),
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }),
      })

    await processCopyrightEmailIntake(jobFor(intake.id), callModel)
    await reconcile()
    expect(enqueueEmail).not.toHaveBeenCalled()

    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'true')
    await reconcile()
    expect(enqueueEmail).toHaveBeenCalledExactlyOnceWith(intake.id)
    await expect(processCopyrightEmailIntake(jobFor(intake.id), callModel)).rejects.toThrow(
      'the model was reached',
    )
    expect(callModel).toHaveBeenCalledOnce()
  })
})
