import { describe, expect, it, vi } from 'vitest'
import { processReconcileCopyrightAgentDispatches } from './process-reconcile-copyright-agent-dispatches.mts'

describe('processReconcileCopyrightAgentDispatches', () => {
  it('does not disclose pending copyright submissions to agents while intake is disabled', async () => {
    const getPending = vi.fn<() => Promise<[]>>().mockResolvedValue([])

    await processReconcileCopyrightAgentDispatches({
      isCopyrightIntakeEnabled: () => false,
      getPending,
    })

    expect(getPending).not.toHaveBeenCalled()
  })

  it('re-enqueues each durable email, form, and appeal gap through its normal deduplicated producer', async () => {
    const enqueueEmail = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
    const enqueueForm = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
    const enqueueAppeal = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)
    await processReconcileCopyrightAgentDispatches({
      isCopyrightIntakeEnabled: () => true,
      getPending: async () => [
        { kind: 'email', intakeId: 'email-intake' },
        { kind: 'form', submissionId: 'form-submission' },
        { kind: 'appeal', submissionId: 'appeal-submission' },
      ],
      enqueueEmail,
      enqueueForm,
      enqueueAppeal,
    })
    expect(enqueueEmail).toHaveBeenCalledWith('email-intake')
    expect(enqueueForm).toHaveBeenCalledWith('form-submission')
    expect(enqueueAppeal).toHaveBeenCalledWith('appeal-submission')
  })
})
