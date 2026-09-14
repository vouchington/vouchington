import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestPost,
  createTestUser,
  getPostModerationData,
  insertPendingTestImage,
  insertTestImage,
  setPostModerationComplete,
  setPostLLMModerationContentSha256,
  updateImageStatus,
  updatePostModerationData,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { streamUnmoderatedImageIdBatches, streamUnmoderatedPostIdBatches } from '../backfill.mts'

// Drains a batch-yielding stream into a flat set of ids, and records the per-batch
// sizes so we can assert the stream yields arrays (one addBulk per batch).
async function drainStream(
  stream: AsyncGenerator<string[], void, unknown>,
): Promise<{ ids: Set<string>; batchSizes: number[] }> {
  const ids = new Set<string>()
  const batchSizes: number[] = []
  for await (const batch of stream) {
    expect(Array.isArray(batch)).toBe(true)
    batchSizes.push(batch.length)
    for (const id of batch) ids.add(id)
  }
  return { ids, batchSizes }
}

describe('openai-moderation backfill streams', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('streamUnmoderatedPostIdBatches includes never-moderated, content-changed, and no-content-then-edited posts; excludes up-to-date posts', async () => {
    // Never moderated — input_sha256 NULL, content_sha256 set → DISTINCT → included
    const unmoderated = await createTestPost({ user })
    // No-content-then-edited — the prior version remains complete but the new content hash is not.
    const noContentEdited = await createTestPost({ user })
    // Content changed — random input_sha256 differs from the post's content_sha256 → included
    const contentChanged = await createTestPost({ user })
    // Up to date — input_sha256 == content_sha256 → NOT DISTINCT → excluded
    const upToDate = await createTestPost({ user })
    if (!unmoderated || !noContentEdited || !contentChanged || !upToDate) {
      throw new Error('Failed to create test posts')
    }
    await setPostModerationComplete(noContentEdited.id, false)
    await setPostLLMModerationContentSha256(noContentEdited.id, randomBytes(32))
    const contentChangedData = (await getPostModerationData(contentChanged.id)) as {
      openai_omni_moderation_content_sha256: Buffer
    }
    await updatePostModerationData(
      contentChanged.id,
      contentChangedData.openai_omni_moderation_content_sha256,
      [],
      false,
    )
    await setPostLLMModerationContentSha256(contentChanged.id, randomBytes(32))
    // Use the post's actual content fingerprint so input == content (genuinely up to date)
    const upToDateData = (await getPostModerationData(upToDate.id)) as {
      openai_omni_moderation_content_sha256: Buffer
    }
    await updatePostModerationData(
      upToDate.id,
      upToDateData.openai_omni_moderation_content_sha256,
      [],
      false,
    )

    const { ids, batchSizes } = await drainStream(streamUnmoderatedPostIdBatches())

    expect(ids.has(unmoderated.id)).toBe(true)
    expect(ids.has(noContentEdited.id)).toBe(true)
    expect(ids.has(contentChanged.id)).toBe(true)
    expect(ids.has(upToDate.id)).toBe(false)
    // Batches are arrays bounded by the batch size
    expect(batchSizes.every(n => n > 0 && n <= 500)).toBe(true)
  })

  it('streamUnmoderatedImageIdBatches includes completed-upload unmoderated images, excludes pending and moderated', async () => {
    // Completed upload, never moderated → included
    const completedUnmoderated = await insertPendingTestImage(user.id)
    await updateImageStatus(completedUnmoderated, 'complete')
    // Pending upload (no upload_completed_at) → excluded
    const pending = await insertPendingTestImage(user.id)
    // Already moderated (insertTestImage sets openai_omni_moderation_created_at + completed upload) → excluded
    const moderated = await insertTestImage(user.id)

    const { ids } = await drainStream(streamUnmoderatedImageIdBatches())

    expect(ids.has(completedUnmoderated)).toBe(true)
    expect(ids.has(pending)).toBe(false)
    expect(ids.has(moderated)).toBe(false)
  })
})
