import { describe, expect, it } from 'vitest'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  getPostLockedFields,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'

const WRITE_SCOPES = ['community-moderation:read', 'community-moderation:write'] as const

async function postFixture() {
  const owner = await createTestPlusMcpCaller()
  const moderator = await createTestPlusMcpCaller()
  const author = await createTestPlusMcpCaller()
  const outsider = await createTestPlusMcpCaller()
  const community = await insertTestCommunity({ createdById: owner.id })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
    insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    }),
    insertTestCommunityMember({ communityId: community.id, userId: author.id }),
  ])
  const postId = await insertTestPost({
    title: 'Moderation lock contract',
    slug: `moderation-lock-${crypto.randomUUID()}`,
    markdown: 'A visible community post.',
    createdById: author.id,
    communityId: community.id,
  })
  await insertTestCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: author.id,
  })
  return { moderator, author, outsider, community, postId }
}

describe('community moderation MCP post lock options — REST twins and real PostgreSQL', () => {
  it('locks and unlocks a visible community post through MCP and its REST twins', async () => {
    const { moderator, author, community, postId } = await postFixture()
    const path = `/api/v1/posts/${postId}/lock`
    expect(
      await callStructuredMcpTool(
        moderator,
        'add_community_moderation',
        optionArgs('lock_post', { idOrSlug: postId }),
        WRITE_SCOPES,
      ),
    ).toEqual({ success: true })
    const locked = await getPostLockedFields(postId)
    expect(locked?.locked_at).not.toBeNull()
    expect(locked?.locked_by_id).toBe(moderator.id)

    const restLock = createRequest()
    await restLock.authenticateAs(moderator)
    await restLock.post(path).expect(204)
    expect(await getPostLockedFields(postId)).toMatchObject({
      locked_at: expect.any(Date),
      locked_by_id: moderator.id,
    })

    await callStructuredMcpTool(
      moderator,
      'add_community_moderation',
      optionArgs('lock_post', { idOrSlug: postId }),
      WRITE_SCOPES,
    )

    const restUnlock = createRequest()
    await restUnlock.authenticateAs(moderator)
    await restUnlock.delete(path).expect(204)
    expect(await getPostLockedFields(postId)).toMatchObject({ locked_at: null })
    await restLock.post(path).expect(204)

    expect(
      await callStructuredMcpTool(
        moderator,
        'remove_community_moderation',
        optionArgs('unlock_post', { idOrSlug: postId }),
        WRITE_SCOPES,
      ),
    ).toEqual({ success: true })
    expect(await getPostLockedFields(postId)).toMatchObject({ locked_at: null })

    await callStructuredMcpTool(
      moderator,
      'remove_community_moderation',
      optionArgs('unlock_post', { idOrSlug: postId }),
      WRITE_SCOPES,
    )
    expect(await getPostLockedFields(postId)).toMatchObject({ locked_at: null })

    const authorPostId = await insertTestPost({
      title: 'Author can lock own community post',
      slug: `moderation-lock-author-${crypto.randomUUID()}`,
      markdown: 'A post locked by its author.',
      createdById: author.id,
      communityId: community.id,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: authorPostId,
      submittedById: author.id,
    })
    const authorLock = await callStructuredMcpTool(
      author,
      'add_community_moderation',
      optionArgs('lock_post', { idOrSlug: authorPostId }),
      WRITE_SCOPES,
    )
    expect(authorLock).toEqual({ success: true })
    expect(await getPostLockedFields(authorPostId)).toMatchObject({
      locked_at: expect.any(Date),
      locked_by_id: author.id,
    })
    const authorRest = createRequest()
    await authorRest.authenticateAs(author)
    await authorRest.delete(`/api/v1/posts/${authorPostId}/lock`).expect(204)
  })

  it('rejects a non-moderator, hidden post, and suspended moderator before changing lock state', async () => {
    const { moderator, outsider, postId } = await postFixture()
    const lock = (caller: typeof moderator, idOrSlug: string) =>
      callRejectedMcpTool(
        caller,
        'add_community_moderation',
        optionArgs('lock_post', { idOrSlug }),
        WRITE_SCOPES,
      )

    expect(await lock(outsider, postId)).toContain('Forbidden')
    expect(await getPostLockedFields(postId)).toMatchObject({ locked_at: null })
    const outsiderRest = createRequest()
    await outsiderRest.authenticateAs(outsider)
    await outsiderRest.post(`/api/v1/posts/${postId}/lock`).expect(403)
    await expectMcpToolFunctionThrows(
      outsider,
      'add_community_moderation',
      optionArgs('lock_post', { idOrSlug: postId }),
      { status: 403, message: 'Forbidden' },
    )

    const privatePostId = await insertTestPost({
      title: 'Private post hidden from moderator',
      slug: `moderation-lock-private-${crypto.randomUUID()}`,
      markdown: 'Only followers can view this post.',
      createdById: outsider.id,
      privacy: 'private',
      broadcast: 'followers',
    })
    expect(await lock(moderator, privatePostId)).toContain('Post not found')
    expect(await getPostLockedFields(privatePostId)).toMatchObject({ locked_at: null })
    for (const [option, method] of [
      ['lock_post', 'post'],
      ['unlock_post', 'delete'],
    ] as const) {
      const request = createRequest()
      await request.authenticateAs(moderator)
      await request[method](`/api/v1/posts/${privatePostId}/lock`).expect(404)
      await expectMcpToolFunctionThrows(
        moderator,
        method === 'post' ? 'add_community_moderation' : 'remove_community_moderation',
        optionArgs(option, { idOrSlug: privatePostId }),
        { status: 404, message: 'Post not found' },
      )
    }
    expect(await getPostLockedFields(privatePostId)).toMatchObject({ locked_at: null })

    await callStructuredMcpTool(
      moderator,
      'add_community_moderation',
      optionArgs('lock_post', { idOrSlug: postId }),
      WRITE_SCOPES,
    )
    await suspendTestUser(moderator.id)
    try {
      expect(await lock(moderator, postId)).toContain('suspended')
      expect(
        await callRejectedMcpTool(
          moderator,
          'remove_community_moderation',
          optionArgs('unlock_post', { idOrSlug: postId }),
          WRITE_SCOPES,
        ),
      ).toContain('suspended')
      const suspendedRest = createRequest()
      await suspendedRest.authenticateAs(moderator)
      await suspendedRest.post(`/api/v1/posts/${postId}/lock`).expect(403)
      await suspendedRest.delete(`/api/v1/posts/${postId}/lock`).expect(403)
      expect(await getPostLockedFields(postId)).toMatchObject({
        locked_at: expect.any(Date),
        locked_by_id: moderator.id,
      })
    } finally {
      await unsuspendTestUser(moderator.id)
    }
  })
})
