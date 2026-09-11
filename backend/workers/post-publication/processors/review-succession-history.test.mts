import type { auditReviewSuccessionHistory } from '@services/posts/review-successions/index'
import type { enqueueContinueAuditReviewSuccessionHistory } from '@queues/post-publication/enqueues'
import { describe, expect, it, vi } from 'vitest'
import { processAuditReviewSuccessionHistory } from './review-succession-history.mts'

describe('review succession history audit processor', () => {
  it('reuses the fixed cutoff while enqueueing a continuation', async () => {
    const audit = vi.fn<typeof auditReviewSuccessionHistory>().mockResolvedValue({
      cutoffArchivedAt: '2026-09-09T00:00:00.000Z',
      cursor: '00000000-0000-7000-8000-000000000042',
      hasMore: true,
      findings: [],
    })
    const enqueue = vi
      .fn<typeof enqueueContinueAuditReviewSuccessionHistory>()
      .mockResolvedValue(null)

    await processAuditReviewSuccessionHistory(
      { cursor: null, cutoffArchivedAt: null },
      {
        auditReviewSuccessionHistory: audit,
        enqueueContinueAuditReviewSuccessionHistory: enqueue,
      },
    )

    expect(audit).toHaveBeenCalledWith({ cursor: null, cutoffArchivedAt: null })
    expect(enqueue).toHaveBeenCalledWith(
      '00000000-0000-7000-8000-000000000042',
      '2026-09-09T00:00:00.000Z',
    )
  })

  it('does not enqueue after the final page', async () => {
    const audit = vi.fn<typeof auditReviewSuccessionHistory>().mockResolvedValue({
      cutoffArchivedAt: '2026-09-09T00:00:00.000Z',
      cursor: null,
      hasMore: false,
      findings: [],
    })
    const enqueue = vi
      .fn<typeof enqueueContinueAuditReviewSuccessionHistory>()
      .mockResolvedValue(null)

    await processAuditReviewSuccessionHistory(
      {
        cursor: '00000000-0000-7000-8000-000000000042',
        cutoffArchivedAt: '2026-09-09T00:00:00.000Z',
      },
      {
        auditReviewSuccessionHistory: audit,
        enqueueContinueAuditReviewSuccessionHistory: enqueue,
      },
    )

    expect(enqueue).not.toHaveBeenCalled()
  })

  it('fails rather than dropping a full audit page without its continuation cursor', async () => {
    const audit = vi.fn<typeof auditReviewSuccessionHistory>().mockResolvedValue({
      cutoffArchivedAt: '2026-09-09T00:00:00.000Z',
      cursor: null,
      hasMore: true,
      findings: [],
    })
    const enqueue = vi
      .fn<typeof enqueueContinueAuditReviewSuccessionHistory>()
      .mockResolvedValue(null)

    await expect(
      processAuditReviewSuccessionHistory(
        { cursor: null, cutoffArchivedAt: null },
        {
          auditReviewSuccessionHistory: audit,
          enqueueContinueAuditReviewSuccessionHistory: enqueue,
        },
      ),
    ).rejects.toThrow('continuation requires a cursor')
    expect(enqueue).not.toHaveBeenCalled()
  })
})
