import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  setPostModerationContentSha256,
} from '@voucha/test-helpers'
import { countTestPostModerationAttempts } from '@voucha/test-helpers/post-moderation-attempt-state'
import { beginPostModerationAttempt } from './moderation-ledger-attempts.mts'

const onError = vi.hoisted(() => vi.fn<VitestLooseMock>())
const enqueueCreatePostModeration = vi.hoisted(() => vi.fn<VitestLooseMock>())
// Only the two edges are stubbed: the error reporter and the queue. The ledger runs for real.
vi.mock<typeof import('@modules/on-error')>(import('@modules/on-error'), async importOriginal => ({
  ...(await importOriginal()),
  default: onError,
}))
vi.mock<typeof import('@queues/openai-moderation/enqueues')>(
  import('@queues/openai-moderation/enqueues'),
  async importOriginal => ({ ...(await importOriginal()), enqueueCreatePostModeration }),
)

describe('post moderation enqueue after the version commit', () => {
  it('keeps the committed attempt and reports a failed enqueue for the sweep to recover', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `Enqueue failure ${randomUUID()}`,
      slug: `enqueue-failure-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Enqueue failure fixture.',
      clearanceStatus: 'pending',
    })
    await setPostModerationContentSha256(postId, randomBytes(32))
    const failure = new Error('valkey down')
    enqueueCreatePostModeration.mockRejectedValueOnce(failure)

    const attempt = await beginPostModerationAttempt(postId, 'openai_omni')

    expect(attempt).not.toBeNull()
    expect(onError).toHaveBeenCalledWith(failure)
    await expect(countTestPostModerationAttempts(postId, 'openai_omni')).resolves.toBe(1)
  })

  it('wraps a non-Error enqueue rejection', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `Enqueue failure wrap ${randomUUID()}`,
      slug: `enqueue-failure-wrap-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Enqueue failure wrap fixture.',
      clearanceStatus: 'pending',
    })
    await setPostModerationContentSha256(postId, randomBytes(32))
    enqueueCreatePostModeration.mockRejectedValueOnce('boom')

    await beginPostModerationAttempt(postId, 'openai_omni')

    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Post moderation enqueue failed', cause: 'boom' }),
    )
  })
})
