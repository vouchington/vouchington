import { describe, expect, it, vi } from 'vitest'
import type {
  CopyrightAgentDispatch,
  CopyrightAgentDispatchPage,
} from '@services/copyright-notices'
import {
  processReconcileCopyrightAgentDispatches,
  type ReconcileCopyrightAgentDispatchesDeps,
} from './process-reconcile-copyright-agent-dispatches.mts'

function page(results: CopyrightAgentDispatch[], endCursor: string | null) {
  return {
    results,
    page_info: { has_next_page: endCursor !== null, start_cursor: null, end_cursor: endCursor },
  } satisfies CopyrightAgentDispatchPage
}

function dispatchDeps() {
  return {
    isCopyrightIntakeEnabled: () => true,
    enqueueEmail: vi.fn<ReconcileCopyrightAgentDispatchesDeps['enqueueEmail']>(async () => {}),
    enqueueForm: vi.fn<ReconcileCopyrightAgentDispatchesDeps['enqueueForm']>(async () => {}),
    enqueueAppeal: vi.fn<ReconcileCopyrightAgentDispatchesDeps['enqueueAppeal']>(async () => {}),
    applyFormEffect: vi.fn<ReconcileCopyrightAgentDispatchesDeps['applyFormEffect']>(
      async () => {},
    ),
  }
}

describe('processReconcileCopyrightAgentDispatches', () => {
  it('does not disclose pending copyright submissions to agents while intake is disabled', async () => {
    const getPending = vi.fn<ReconcileCopyrightAgentDispatchesDeps['getPending']>()

    await processReconcileCopyrightAgentDispatches({
      isCopyrightIntakeEnabled: () => false,
      getPending,
    })

    expect(getPending).not.toHaveBeenCalled()
  })

  it('re-enqueues advisory gaps and applies saved form effects without an agent run', async () => {
    const deps = dispatchDeps()
    await processReconcileCopyrightAgentDispatches({
      ...deps,
      getPending: async () =>
        page(
          [
            { kind: 'email', intakeId: 'email-intake' },
            { kind: 'form-screening', submissionId: 'form-submission' },
            { kind: 'form-effect', submissionId: 'form-effect-submission' },
            { kind: 'appeal', submissionId: 'appeal-submission' },
          ],
          null,
        ),
    })
    expect(deps.enqueueEmail).toHaveBeenCalledWith('email-intake')
    expect(deps.enqueueForm).toHaveBeenCalledWith('form-submission')
    expect(deps.applyFormEffect).toHaveBeenCalledWith('form-effect-submission')
    expect(deps.enqueueAppeal).toHaveBeenCalledWith('appeal-submission')
  })

  it('walks every page of the pending backlog', async () => {
    const deps = dispatchDeps()
    const getPending = vi
      .fn<ReconcileCopyrightAgentDispatchesDeps['getPending']>()
      .mockResolvedValueOnce(page([{ kind: 'email', intakeId: 'first-page' }], 'first-cursor'))
      .mockResolvedValueOnce(page([{ kind: 'form-effect', submissionId: 'last-page' }], null))

    await processReconcileCopyrightAgentDispatches({ ...deps, getPending })

    expect(getPending.mock.calls).toEqual([[{}], [{ after: 'first-cursor' }]])
    expect(deps.enqueueEmail).toHaveBeenCalledWith('first-page')
    expect(deps.applyFormEffect).toHaveBeenCalledWith('last-page')
  })

  it('keeps dispatching past failed items, then fails with every error', async () => {
    const deps = dispatchDeps()
    const enqueueFailure = new Error('enqueue failed')
    const effectFailure = new Error('form effect failed')
    deps.enqueueEmail.mockRejectedValueOnce(enqueueFailure)
    deps.applyFormEffect.mockRejectedValueOnce(effectFailure)
    const getPending = vi
      .fn<ReconcileCopyrightAgentDispatchesDeps['getPending']>()
      .mockResolvedValueOnce(
        page(
          [
            { kind: 'email', intakeId: 'failing-email' },
            { kind: 'form-effect', submissionId: 'failing-effect' },
            { kind: 'appeal', submissionId: 'same-page-appeal' },
            { kind: 'form-effect', submissionId: 'same-page-effect' },
          ],
          'first-cursor',
        ),
      )
      .mockResolvedValueOnce(page([{ kind: 'email', intakeId: 'next-page-email' }], null))

    const failure = await processReconcileCopyrightAgentDispatches({ ...deps, getPending }).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([enqueueFailure, effectFailure])
    expect(deps.enqueueAppeal).toHaveBeenCalledWith('same-page-appeal')
    expect(deps.applyFormEffect).toHaveBeenCalledWith('same-page-effect')
    expect(deps.enqueueEmail).toHaveBeenCalledWith('next-page-email')
  })
})
