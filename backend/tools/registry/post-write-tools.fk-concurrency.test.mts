import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  createTestMembership,
  insertTestImage,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  withHeldDelegatedThreadFenceForTest,
  withConcurrentMediaThenPublicationFenceForTest,
} from '@voucha/test-helpers/post-delegated-fk-concurrency'

import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'

describe('delegated thread fences and ordinary foreign-key inserts', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it('does not hold thread publication while waiting on shared media delivery', async () => {
    const user = { ...(await createTestUser()), membership_plan: 'plus' as const }
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const root = await insertTestPost({
      title: 'Root with image',
      slug: crypto.randomUUID(),
      markdown: 'Root',
      createdById: user.id,
    })
    const imageId = await insertTestImage(user.id)
    await insertTestPostImage({ postId: root, imageId })
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'false')
    const result = await withConcurrentMediaThenPublicationFenceForTest(root, imageId, () =>
      callStructuredMcpTool(
        user,
        'create_post',
        {
          idempotency_key: crypto.randomUUID(),
          post_type: 'comment',
          parent_post_id: root,
          markdown: 'Reply',
          images: [{ image_id: imageId, order_index: 0 }],
        },
        ['posts:read', 'posts:write'],
      ),
    )
    expect(result).toMatchObject({ success: true, post: { parent_post_id: root } })
  })

  it('permits member and reply inserts while retaining community and ancestry fences', async () => {
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
    const replyId = await withHeldDelegatedThreadFenceForTest(child, owner.id, async () => {
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
