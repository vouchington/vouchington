import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  getTestAdmissionResponseTopicSnapshot,
  getTestPostCategoryFinalization,
  hardDeleteTestUser,
} from '@voucha/test-helpers'
import { persistPostCategoryFinalization } from '../post-category-finalizations.mts'

describe('post category finalization relations', () => {
  it('distinguishes an empty create snapshot from an absent update snapshot', async () => {
    const owner = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createTestPost({ user: owner, title: `Empty snapshot ${suffix}` })
    await persistPostCategoryFinalization(post.id, owner.id, owner.id, 'create', {})
    const created = await getTestAdmissionResponseTopicSnapshot(post.id)
    expect(created?.topicCount).toBe(0)
    expect(created?.responseGeneration).not.toBeNull()
    await persistPostCategoryFinalization(post.id, owner.id, owner.id, 'update', {})
    await expect(getTestAdmissionResponseTopicSnapshot(post.id)).resolves.toEqual({
      responseGeneration: null,
      topicCount: 0,
    })
  })

  it('retains an actor identity after the live user row is deleted', async () => {
    const owner = await createTestUser()
    const editor = await createTestUser({ administrator: true })
    const suffix = Math.random().toString(36).slice(2, 12)
    const post = await createTestPost({ user: owner, title: `Deleted actor ${suffix}` })
    await persistPostCategoryFinalization(post.id, editor.id, owner.id, 'update', {})
    await hardDeleteTestUser(editor.id)
    const pending = await getTestPostCategoryFinalization(post.id)
    expect(pending?.actor_user_ids).toContain(editor.id)
  })
})
