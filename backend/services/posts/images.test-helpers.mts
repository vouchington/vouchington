import { randomUUID } from 'node:crypto'
import type { PostImageRollback } from './images-rollback.mts'

export function createPostImageRollbackFixture(
  overrides: Partial<PostImageRollback> = {},
): PostImageRollback {
  return {
    revisionId: randomUUID(),
    currentImages: [],
    images: [],
    currentLlmModerationContentSha256: Buffer.alloc(32),
    llmModerationContentSha256: Buffer.alloc(32),
    currentLatestClearanceChangeId: null,
    latestClearanceChangeId: null,
    approvedAt: null,
    rejectedAt: null,
    inReviewAt: null,
    clearanceChangedById: null,
    clearancePublicReasonCode: null,
    clearancePrivateNote: null,
    clearancePlatformOverride: false,
    ...overrides,
  }
}
