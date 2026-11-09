import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'
import { withHeldDelegatedThreadFenceForTest } from '@voucha/test-helpers/post-delegated-fk-concurrency'

describe('delegated thread fences and ordinary foreign-key inserts', () => {
  it('permits member and reply inserts while only the target post row is locked', async () => {
    const owner = await createTestUser()
    const joining = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const root = await insertTestPost({
      title: 'Root',
      slug: crypto.randomUUID(),
      markdown: 'Root',
      createdById: owner.id,
      communityId: community.id,
    })
    const child = await insertTestPost({
      postType: 'comment',
      title: '',
      slug: crypto.randomUUID(),
      markdown: 'Child',
      createdById: owner.id,
      communityId: community.id,
      rootId: root,
      parentId: root,
    })
    const replyId = await withHeldDelegatedThreadFenceForTest(child, async () => {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: joining.id,
        role: 'member',
      })
      return insertTestPost({
        postType: 'comment',
        title: '',
        slug: crypto.randomUUID(),
        markdown: 'Human reply',
        createdById: joining.id,
        communityId: community.id,
        rootId: root,
        parentId: child,
      })
    })
    expect(replyId).toEqual(expect.any(String))
  })
})
