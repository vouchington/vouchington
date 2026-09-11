import { randomUUID } from 'node:crypto'
import type { PostImageRollback } from './images-rollback.mts'

export function createPostImageRollbackFixture(
  overrides: Partial<PostImageRollback> = {},
): PostImageRollback {
  return {
    revisionId: randomUUID(),
    currentImages: [],
    images: [],
    currentOpenaiModerationContentSha256: Buffer.alloc(32),
    currentLlmModerationContentSha256: Buffer.alloc(32),
    changedById: '00000000-0000-7000-8000-000000000001',
    openaiModerationContentSha256: Buffer.alloc(32),
    llmModerationContentSha256: Buffer.alloc(32),
    currentLatestClearanceChangeId: null,
    latestClearanceChangeId: null,
    approvedAt: null,
    rejectedAt: null,
    inReviewAt: null,
    spamDetectionFlagged: null,
    spamDetectionCreatedAt: null,
    spamDetectionScore: null,
    spamDetectionResults: null,
    openaiModerationFlagged: null,
    openaiModerationCreatedAt: null,
    ...overrides,
  }
}
