import { withCopyrightCasePurgeIsolation } from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-isolation'
import { describe, expect, it, vi } from 'vitest'
import type { CopyrightCasePurgeJobData } from '@queues/psql/types'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { commitCopyrightCorrespondenceAfterPurgeSnapshot } from '@voucha/test-helpers/copyright-purge-writer-race'
import { processCopyrightCasePurge } from './copyright-case-purge.mts'

describe('copyright case purge native conflict', () => {
  it('ends the pass after native serialization abort without saving or rescheduling the page', async () => {
    const entry = await createRetentionMinimalCase()
    const before = await getCopyrightNoticePrivateAggregate(entry.noticeId)
    const data: CopyrightCasePurgeJobData = {
      noticeId: entry.noticeId,
      phase: 'verify_parties',
      phaseIndex: 0,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    }
    const updateData = vi.fn<(data: CopyrightCasePurgeJobData) => Promise<void>>()
    const moveToDelayed = vi.fn<(timestamp: number) => Promise<never>>()
    const { result, message, failure } = await commitCopyrightCorrespondenceAfterPurgeSnapshot(
      entry.noticeId,
      () =>
        withCopyrightCasePurgeIsolation(() =>
          processCopyrightCasePurge({ data, updateData, moveToDelayed }),
        ),
    )
    expect(message).toBeDefined()
    expect(failure).toEqual(expect.objectContaining({ code: '40001' }))
    expect(result).toEqual({ data, hasMore: false })
    expect(updateData).not.toHaveBeenCalled()
    expect(moveToDelayed).not.toHaveBeenCalled()
    const aggregate = await getCopyrightNoticePrivateAggregate(entry.noticeId)
    expect(aggregate?.correspondence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: message!.id, body_ciphertext: message!.body_ciphertext }),
      ]),
    )
    expect(aggregate?.notice.id).toBe(entry.noticeId)
    expect(aggregate?.submissions).toEqual(before?.submissions)
    expect(aggregate?.targets).toEqual(before?.targets)
  })
})
