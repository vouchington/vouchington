import { enqueueContinuePostPublicationShadowAudit } from '@queues/post-publication/enqueues'
import type {
  PostPublicationShadowAuditResult,
  runPostPublicationShadowAudit,
} from '@services/post-publication'
import { describe, expect, it, vi } from 'vitest'
import { processShadowAuditPostPublication } from './shadow-audit.mts'

const firstCursor = '00000000-0000-7000-8000-000000000041'
const secondCursor = '00000000-0000-7000-8000-000000000042'

function makeResult(checkpoint: string | null, hasMore: boolean): PostPublicationShadowAuditResult {
  return {
    dryRun: true,
    scannedByScope: { post: 100, author: 0, community: 0, rssFeed: 0 },
    discrepanciesByScope: { post: 0, author: 0, community: 0, rssFeed: 0 },
    checkpoint,
    hasMore,
  }
}

describe('post publication shadow-audit processor', () => {
  it('forwards a dry-run cursor through a multi-page audit', async () => {
    const run = vi
      .fn<typeof runPostPublicationShadowAudit>()
      .mockResolvedValueOnce(makeResult(firstCursor, true))
      .mockResolvedValueOnce(makeResult(secondCursor, false))
    const enqueueContinue = vi
      .fn<typeof enqueueContinuePostPublicationShadowAudit>()
      .mockResolvedValue(null)
    const dependencies = {
      runPostPublicationShadowAudit: run,
      enqueueContinuePostPublicationShadowAudit: enqueueContinue,
    }

    await processShadowAuditPostPublication({ dryRun: true, cursor: null }, dependencies)
    await processShadowAuditPostPublication({ dryRun: true, cursor: firstCursor }, dependencies)

    expect(run).toHaveBeenNthCalledWith(1, {
      dryRun: true,
      cursor: null,
    })
    expect(run).toHaveBeenNthCalledWith(2, {
      dryRun: true,
      cursor: firstCursor,
    })
    expect(enqueueContinue).toHaveBeenCalledOnce()
    expect(enqueueContinue).toHaveBeenCalledWith(true, firstCursor)
  })
})
