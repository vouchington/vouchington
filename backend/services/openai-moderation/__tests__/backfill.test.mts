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
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { listUnmoderatedImageIdPage, listUnmoderatedPostIdPage } from '../backfill.mts'
import { openaiModerationWorkConfig } from '../work-limits.mts'

describe('openai-moderation backfill pages', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('listUnmoderatedPostIdPage includes never-moderated, content-changed, and no-content-then-edited posts; excludes up-to-date posts', async () => {
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

    const page = await listUnmoderatedPostIdPage(uuidBefore(unmoderated.id))
    const ids = new Set(page.ids)

    expect(ids.has(unmoderated.id)).toBe(true)
    expect(ids.has(noContentEdited.id)).toBe(true)
    expect(ids.has(contentChanged.id)).toBe(true)
    expect(ids.has(upToDate.id)).toBe(false)
    // A page holds at most the configured batch size, in id order
    expect(page.ids.length).toBeLessThanOrEqual(500)
    expect(page.ids).toEqual(page.ids.toSorted())
  })

  it('listUnmoderatedImageIdPage includes completed-upload unmoderated images, excludes pending and moderated', async () => {
    // Completed upload, never moderated → included
    const completedUnmoderated = await insertPendingTestImage(user.id)
    await updateImageStatus(completedUnmoderated, 'complete')
    // Pending upload (no upload_completed_at) → excluded
    const pending = await insertPendingTestImage(user.id)
    // Already moderated (insertTestImage sets openai_omni_moderation_created_at + completed upload) → excluded
    const moderated = await insertTestImage(user.id)

    const ids = new Set((await listUnmoderatedImageIdPage(uuidBefore(completedUnmoderated))).ids)

    expect(ids.has(completedUnmoderated)).toBe(true)
    expect(ids.has(pending)).toBe(false)
    expect(ids.has(moderated)).toBe(false)
  })

  it('starts from the first id without a cursor and reports a full page as having more', async () => {
    await createTestPost({ user })
    const image = await insertPendingTestImage(user.id)
    await updateImageStatus(image, 'complete')
    const restore = overrideDynamicConfigFieldsForTest(openaiModerationWorkConfig, {
      backfill_batch_size: 1,
    })
    try {
      const posts = await listUnmoderatedPostIdPage()
      const images = await listUnmoderatedImageIdPage()

      expect(posts.ids).toHaveLength(1)
      expect(posts.hasMore).toBe(true)
      expect(images.ids).toHaveLength(1)
      expect(images.hasMore).toBe(true)
    } finally {
      restore()
    }
  })
})
