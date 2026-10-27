import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import * as moderationEnqueues from '@queues/openai-moderation/enqueues'
import {
  createTestUser,
  insertTestPost,
  setPostModerationContentSha256,
} from '@voucha/test-helpers'
import { countTestPostModerationAttempts } from '@voucha/test-helpers/post-moderation-attempt-state'
import { beginPostModerationAttempt } from './moderation-ledger-attempts.mts'

describe('post moderation enqueue after the version commit', () => {
  it('keeps the committed attempt and does not fail the caller when the enqueue fails', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `Enqueue failure ${randomUUID()}`,
      slug: `enqueue-failure-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Enqueue failure fixture.',
      clearanceStatus: 'pending',
    })
    await setPostModerationContentSha256(postId, randomBytes(32))
    const enqueue = vi
      .spyOn(moderationEnqueues, 'enqueueCreatePostModeration')
      .mockRejectedValueOnce(new Error('valkey down'))

    const attempt = await beginPostModerationAttempt(postId, 'openai_omni')

    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(attempt).not.toBeNull()
    await expect(countTestPostModerationAttempts(postId, 'openai_omni')).resolves.toBe(1)
  })
})
