import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  getPostModerationData,
  insertTestPost,
  safeUsername,
} from '@voucha/test-helpers'
import {
  beginPostModerationAttempt,
  ensureCurrentPostModerationVersion,
} from '@services/post-clearance'
import {
  applyPostOpenAIModerationResults,
  markPostOpenAIModerationNoContent,
} from '../persist-post-results.mts'

describe('persist post OpenAI moderation results', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('persist-openai-moderation') })
    userId = user.id
  })

  it('records direct provider results and reconstructs only flagged categories', async () => {
    const postId = await insertModerationPost('direct-results')
    const version = await ensureCurrentPostModerationVersion(postId)

    await expect(
      applyPostOpenAIModerationResults(
        postId,
        version.content_sha256,
        { categories: { harassment: true, violence: false } },
        true,
      ),
    ).resolves.toBe(true)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_flagged: true,
      openai_omni_moderation_results: { flagged_categories: ['harassment'] },
    })
  })

  it('completes a leased attempt with the child-safety rejection disposition', async () => {
    const postId = await insertModerationPost('attempt-results')
    const attempt = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(attempt).not.toBeNull()

    await expect(
      applyPostOpenAIModerationResults(
        postId,
        attempt!.content_sha256,
        [{ categories: { 'sexual/minors': true, harassment: true } }],
        true,
        attempt!,
      ),
    ).resolves.toBe(true)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_flagged: true,
      openai_omni_moderation_results: { flagged_categories: ['harassment', 'sexual/minors'] },
    })
  })

  it('records a no-content pass directly against the current version', async () => {
    const postId = await insertModerationPost('no-content-direct')

    await expect(markPostOpenAIModerationNoContent(postId)).resolves.toBe(true)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_flagged: false,
      openai_omni_moderation_results: {},
    })
  })

  it('completes a leased no-content pass', async () => {
    const postId = await insertModerationPost('no-content-attempt')
    const attempt = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(attempt).not.toBeNull()

    await expect(markPostOpenAIModerationNoContent(postId, attempt!)).resolves.toBe(true)

    await expect(getPostModerationData(postId)).resolves.toMatchObject({
      openai_omni_moderation_flagged: false,
      openai_omni_moderation_results: {},
    })
  })

  async function insertModerationPost(prefix: string): Promise<string> {
    const id = randomUUID()
    return insertTestPost({
      title: `${prefix}-${id}`,
      slug: `${prefix}-${id}`,
      markdown: 'ordinary moderation fixture',
      createdById: userId,
      clearanceStatus: 'pending',
    })
  }
})
