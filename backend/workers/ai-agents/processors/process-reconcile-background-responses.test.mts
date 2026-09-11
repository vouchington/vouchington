import { describe, expect, it, vi } from 'vitest'
import {
  processReconcileBackgroundResponses,
  type ReconcileBackgroundResponsesDeps,
} from './process-reconcile-background-responses.mts'
import type { ExpiredBackgroundResponse } from '@services/openai-background-responses'

function makeExpiredRow(responseId: string): ExpiredBackgroundResponse {
  return {
    responseId,
    agentSlug: 'test-agent',
    communityId: null,
    postId: null,
    leaseToken: '019f0000-0000-7000-8000-000000000010',
    leaseExpiresAt: new Date('2026-07-01T00:03:00Z'),
    createdAt: new Date('2026-07-01T00:00:00Z'),
  }
}

describe('processReconcileBackgroundResponses', () => {
  it('reconciles every stale row returned by the batch query', async () => {
    const rows = [
      makeExpiredRow('resp_one'),
      makeExpiredRow('resp_two'),
      makeExpiredRow('resp_three'),
    ]
    const reconciled: string[] = []
    const reconcileExpiredBackgroundResponse = vi.fn<
      ReconcileBackgroundResponsesDeps['reconcileExpiredBackgroundResponse']
    >(async row => {
      reconciled.push(row.responseId)
      return 'recorded'
    })

    await processReconcileBackgroundResponses({
      getExpiredBackgroundResponses: vi.fn<
        ReconcileBackgroundResponsesDeps['getExpiredBackgroundResponses']
      >(async () => rows),
      reconcileExpiredBackgroundResponse,
    })

    expect(reconciled.sort()).toEqual(['resp_one', 'resp_three', 'resp_two'])
    expect(reconcileExpiredBackgroundResponse).toHaveBeenCalledTimes(3)
  })

  it('continues reconciling the remaining rows when one row throws', async () => {
    const rows = [makeExpiredRow('resp_failing'), makeExpiredRow('resp_ok')]
    const reconciled: string[] = []
    const reconcileExpiredBackgroundResponse = vi.fn<
      ReconcileBackgroundResponsesDeps['reconcileExpiredBackgroundResponse']
    >(async row => {
      if (row.responseId === 'resp_failing') throw new Error('retrieve failed')
      reconciled.push(row.responseId)
      return 'recorded'
    })

    await expect(
      processReconcileBackgroundResponses({
        getExpiredBackgroundResponses: vi.fn<
          ReconcileBackgroundResponsesDeps['getExpiredBackgroundResponses']
        >(async () => rows),
        reconcileExpiredBackgroundResponse,
      }),
    ).resolves.toBeUndefined()

    expect(reconciled).toEqual(['resp_ok'])
  })

  it('does nothing when there are no stale rows', async () => {
    const reconcileExpiredBackgroundResponse =
      vi.fn<ReconcileBackgroundResponsesDeps['reconcileExpiredBackgroundResponse']>()

    await processReconcileBackgroundResponses({
      getExpiredBackgroundResponses: vi.fn<
        ReconcileBackgroundResponsesDeps['getExpiredBackgroundResponses']
      >(async () => []),
      reconcileExpiredBackgroundResponse,
    })

    expect(reconcileExpiredBackgroundResponse).not.toHaveBeenCalled()
  })
})
