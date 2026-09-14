import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import type { Post } from '@services/posts/types'
import {
  createTestUserDirect,
  getPostModerationResetState,
  insertTestImage,
  insertTestPost,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import type { ImageDeletePostRollback, ImageDeleteResult } from './delete-rollback-types.mts'
import { rollbackImageDeletion } from './delete-rollback.mts'

describe('rollbackImageDeletion integrity', () => {
  it('rejects a rollback snapshot without the deleted content hash', async () => {
    const fixture = await createRollbackFixture()

    await expect(
      rollbackImageDeletion(
        fixture.imageId,
        createDeleteResult(fixture, { deleted_content_sha256: null }),
      ),
    ).rejects.toThrow(
      `Image deletion rollback is missing the deleted content hash for post ${fixture.postId}`,
    )
  })

  it('rejects a clearance compensation without its deleted change', async () => {
    const fixture = await createRollbackFixture()
    expect(fixture.latestClearanceChangeId).toBeNull()

    await expect(
      rollbackImageDeletion(
        fixture.imageId,
        createDeleteResult(fixture, {
          clearance_reset: true,
          deleted_clearance_change_id: null,
        }),
      ),
    ).rejects.toThrow(
      `Image deletion rollback is missing the compensated clearance change for post ${fixture.postId}`,
    )
  })
})

async function createRollbackFixture() {
  const creator = await createTestUserDirect()
  expect(creator).toBeTruthy()
  const suffix = randomUUID()
  const postId = await insertTestPost({
    title: `Image deletion rollback integrity ${suffix}`,
    slug: `image-deletion-rollback-integrity-${suffix}`,
    createdById: creator!.id,
    markdown: 'Post used to verify image rollback snapshot integrity',
    clearanceStatus: 'pending',
  })
  const imageId = await insertTestImage(creator!.id)
  const post = (await getPostByAny(postId, { readOnly: false })) as Post
  const hash = createPostModerationContent(post).content_sha256
  await setPostLLMModerationContentSha256(postId, hash)
  const state = await getPostModerationResetState(postId)
  expect(state).not.toBeNull()
  return { imageId, postId, hash, latestClearanceChangeId: state!.latest_clearance_change_id }
}

function createDeleteResult(
  fixture: Awaited<ReturnType<typeof createRollbackFixture>>,
  overrides: Partial<ImageDeletePostRollback> = {},
): Extract<ImageDeleteResult, { deletedThisImage: true }> {
  return {
    affectedPostIds: [fixture.postId],
    deletedThisImage: true,
    imageRollback: {
      openai_omni_moderation_results: null,
      openai_omni_moderation_flagged: null,
      openai_omni_moderation_created_at: null,
    },
    postRollbacks: [
      {
        post_id: fixture.postId,
        revision_id: null,
        approved_at: null,
        rejected_at: null,
        in_review_at: null,
        clearance_change_id: null,
        clearance_changed_by_id: null,
        clearance_public_reason_code: null,
        clearance_private_note: null,
        clearance_platform_override: false,
        llm_moderation_content_sha256: fixture.hash,
        clearance_reset: false,
        deleted_content_sha256: fixture.hash,
        deleted_clearance_change_id: fixture.latestClearanceChangeId,
        ...overrides,
      },
    ],
  }
}
