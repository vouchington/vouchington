import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import { describe, expect, it, vi } from 'vitest'
import type { CopyrightAgentDispatch } from '@services/copyright-notices'
import type { CopyrightAgentDispatchPage } from '@services/copyright-notices/reconcile-agent-dispatches'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
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
    enqueueEmail: vi.fn<ReconcileCopyrightAgentDispatchesDeps['enqueueEmail']>(async () => {}),
    enqueueForm: vi.fn<ReconcileCopyrightAgentDispatchesDeps['enqueueForm']>(async () => {}),
    enqueueAppeal: vi.fn<ReconcileCopyrightAgentDispatchesDeps['enqueueAppeal']>(async () => {}),
    applyFormEffect: vi.fn<ReconcileCopyrightAgentDispatchesDeps['applyFormEffect']>(
      async () => {},
    ),
  }
}

describe('processReconcileCopyrightAgentDispatches', () => {
  describe('while new intake is switched on', () => {
    useCopyrightIntakeEnvironment()

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

      expect(getPending.mock.calls).toEqual([
        [{ limit: 100 }],
        [{ limit: 100, after: 'first-cursor' }],
      ])
      expect(deps.enqueueEmail).toHaveBeenCalledWith('first-page')
      expect(deps.applyFormEffect).toHaveBeenCalledWith('last-page')
    })

    it('continues beyond its cap despite a failed head and resumes at the saved cursor', async () => {
      overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
        batch_size: 1,
        max_batches_per_run: 1,
      })
      const deps = dispatchDeps()
      deps.enqueueEmail.mockRejectedValueOnce(new Error('head failed'))
      const enqueueContinuation = vi.fn<
        ReconcileCopyrightAgentDispatchesDeps['enqueueContinuation']
      >(async () => null)
      await expect(
        processReconcileCopyrightAgentDispatches({
          ...deps,
          enqueueContinuation,
          getPending: async () => page([{ kind: 'email', intakeId: 'head' }], 'head-cursor'),
        }),
      ).rejects.toBeInstanceOf(AggregateError)
      expect(enqueueContinuation).toHaveBeenCalledWith({ after: 'head-cursor' })
      const getPending = vi.fn<ReconcileCopyrightAgentDispatchesDeps['getPending']>(async () =>
        page([{ kind: 'email', intakeId: 'tail' }], null),
      )
      await expect(
        processReconcileCopyrightAgentDispatches({ ...deps, getPending }, { after: 'head-cursor' }),
      ).resolves.toEqual({ hasMore: false })
      expect(getPending).toHaveBeenCalledWith({ after: 'head-cursor', limit: 1 })
      expect(deps.enqueueEmail).toHaveBeenCalledWith('tail')
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
        (err: unknown) => err,
      )

      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([enqueueFailure, effectFailure])
      expect(deps.enqueueAppeal).toHaveBeenCalledWith('same-page-appeal')
      expect(deps.applyFormEffect).toHaveBeenCalledWith('same-page-effect')
      expect(deps.enqueueEmail).toHaveBeenCalledWith('next-page-email')
    })
  })

  describe('while new intake is switched off', () => {
    useCopyrightIntakeEnvironment({ enabled: false })

    it('still re-enqueues appeal recommendations but not email or form screening', async () => {
      const deps = dispatchDeps()

      await processReconcileCopyrightAgentDispatches({
        ...deps,
        getPending: async () =>
          page(
            [
              { kind: 'email', intakeId: 'paused-email' },
              { kind: 'form-screening', submissionId: 'paused-form' },
              { kind: 'appeal', submissionId: 'open-appeal' },
            ],
            null,
          ),
      })

      expect(deps.enqueueAppeal).toHaveBeenCalledExactlyOnceWith('open-appeal')
      expect(deps.enqueueEmail).not.toHaveBeenCalled()
      expect(deps.enqueueForm).not.toHaveBeenCalled()
    })

    it('still applies a saved form effect, because it starts no agent work', async () => {
      const deps = dispatchDeps()

      await processReconcileCopyrightAgentDispatches({
        ...deps,
        getPending: async () =>
          page(
            [
              { kind: 'form-screening', submissionId: 'paused-form' },
              { kind: 'form-effect', submissionId: 'received-form' },
            ],
            null,
          ),
      })

      expect(deps.applyFormEffect).toHaveBeenCalledExactlyOnceWith('received-form')
      expect(deps.enqueueForm).not.toHaveBeenCalled()
    })

    it('walks past a page of paused dispatches to reach an appeal on a later page', async () => {
      const deps = dispatchDeps()
      const getPending = vi
        .fn<ReconcileCopyrightAgentDispatchesDeps['getPending']>()
        .mockResolvedValueOnce(page([{ kind: 'email', intakeId: 'paused-email' }], 'first-cursor'))
        .mockResolvedValueOnce(page([{ kind: 'appeal', submissionId: 'later-appeal' }], null))

      await processReconcileCopyrightAgentDispatches({ ...deps, getPending })

      expect(getPending.mock.calls).toEqual([
        [{ limit: 100 }],
        [{ limit: 100, after: 'first-cursor' }],
      ])
      expect(deps.enqueueAppeal).toHaveBeenCalledExactlyOnceWith('later-appeal')
      expect(deps.enqueueEmail).not.toHaveBeenCalled()
    })
  })
})
