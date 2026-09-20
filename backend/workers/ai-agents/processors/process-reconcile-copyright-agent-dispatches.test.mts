import { describe, expect, it, vi } from 'vitest'
import { processReconcileCopyrightAgentDispatches } from './process-reconcile-copyright-agent-dispatches.mts'

describe('processReconcileCopyrightAgentDispatches', () => {
  it('re-enqueues each durable email and form gap through its normal deduplicated producer', async () => {
    const enqueueEmail = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
    const enqueueForm = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
    await processReconcileCopyrightAgentDispatches({
      getPending: async () => [
        { kind: 'email', intakeId: 'email-intake' },
        { kind: 'form', submissionId: 'form-submission' },
      ],
      enqueueEmail,
      enqueueForm,
    })
    expect(enqueueEmail).toHaveBeenCalledWith('email-intake')
    expect(enqueueForm).toHaveBeenCalledWith('form-submission')
  })
})
