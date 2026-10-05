import {
  createTestPost,
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

type Caller = PrivateUser & { membership_plan: null }
type PostBody = Record<string, unknown>
type ReadResult = {
  success: boolean
  error?: string
  post?: PostBody
  ancestors?: PostBody[]
}
type TestPost = Awaited<ReturnType<typeof createTestPost>>

const NOT_FOUND = { success: false, error: 'Post not found' }

function asCaller(user: PrivateUser): Caller {
  return { ...user, membership_plan: null }
}

// Every call goes through the real call path, which checks the result against the output schema, so
// a result the published schema rejects would surface here as an error result.
async function call(caller: Caller, name: string, postId: string | null | undefined) {
  if (!postId) throw new Error('the test post has no id or slug to read')
  const result = await callMcpTool(
    name,
    { post_id: postId },
    caller,
    ['posts:read'],
    USER_MCP_SERVER_CONFIG,
  )
  expect(result.isError).toBeUndefined()
  const [block] = result.content as [{ type: 'text'; text: string }]
  expect(result.structuredContent).toEqual(JSON.parse(block.text))
  return { body: result.structuredContent as ReadResult, text: block.text }
}

async function pendingPost(user: PrivateUser, options: Parameters<typeof createTestPost>[0] = {}) {
  const post = await createTestPost({ user, ...options })
  await setTestPostClearanceStatus(post.id, 'pending', user.id)
  return post
}

describe('get_post and get_post_ancestors — real DB', () => {
  let author: Caller
  let admin: Caller

  beforeAll(async () => {
    author = asCaller(await createTestUser())
    admin = asCaller(await createTestUser({ administrator: true }))
  })

  describe('a public post', () => {
    it('is returned by id and by slug as wrapped external content', async () => {
      const post = await createTestPost({ user: author, markdown: 'A public post body' })

      const byId = await call(author, 'get_post', post.id)
      const bySlug = await call(admin, 'get_post', post.slug)

      expect(bySlug.body).toEqual(byId.body)
      expect(byId.body.post).toMatchObject({
        id: post.id,
        slug: post.slug,
        post_type: 'discussion',
        parent_post_id: null,
        root_post_id: null,
        created_by_id: author.id,
        is_anonymous: false,
      })
      expect(byId.body.post).not.toHaveProperty('deleted_at')
      expect(byId.body.post?.['markdown']).toContain('A public post body')
      expect(byId.body.post?.['markdown']).not.toBe('A public post body')
    })

    it('has no ancestors', async () => {
      const post = await createTestPost({ user: author })

      expect((await call(author, 'get_post_ancestors', post.id)).body).toEqual({
        success: true,
        ancestors: [],
      })
    })

    it('hides the author of an anonymous post from everyone, including the author', async () => {
      const post = await createTestPost({ user: author, is_anonymous: true })

      for (const caller of [author, admin]) {
        const { body, text } = await call(caller, 'get_post', post.id)
        expect(body.post).toMatchObject({ is_anonymous: true, created_by_id: null })
        expect(text).not.toContain(author.id)
      }
    })
  })

  describe('a post the credential owner could see only through private visibility', () => {
    const hidden: [string, (user: PrivateUser) => Promise<TestPost>][] = [
      [
        'a private post shared with signed-in users',
        user => createTestPost({ user, privacy: 'private', broadcast: 'users' }),
      ],
      [
        'a private post shared with followers',
        user => createTestPost({ user, privacy: 'private', broadcast: 'followers' }),
      ],
      [
        'a private post shared with mutual followers',
        user => createTestPost({ user, privacy: 'private', broadcast: 'mutual_followers' }),
      ],
      [
        'a post in a private community the owner belongs to',
        async user => {
          const community = await insertTestCommunity({
            createdById: user.id,
            visibility: 'private',
          })
          await insertTestCommunityMember({ communityId: community.id, userId: user.id })
          return createTestPost({ user, community_id: community.id })
        },
      ],
      ['the owner’s own post awaiting review', user => pendingPost(user)],
      [
        'a topic recommendation',
        user => createTestPost({ user, post_type: 'topic_recommendation' }),
      ],
    ]

    it.each(hidden)('answers %s as not found, even to its author', async (_label, build) => {
      const post = await build(author)

      for (const caller of [author, admin]) {
        for (const name of ['get_post', 'get_post_ancestors']) {
          expect((await call(caller, name, post.id)).body).toEqual(NOT_FOUND)
          expect((await call(caller, name, post.slug)).body).toEqual(NOT_FOUND)
        }
      }
    })
  })

  describe('a post that is deleted, missing or malformed', () => {
    it('answers as not found', async () => {
      const post = await createTestPost({ user: author })
      await deleteTestPost(post.id)

      for (const postId of [post.id, post.slug, crypto.randomUUID(), 'No Such Post!']) {
        for (const name of ['get_post', 'get_post_ancestors']) {
          expect((await call(author, name, postId)).body).toEqual(NOT_FOUND)
        }
      }
    })
  })

  describe('a comment thread', () => {
    it('returns the parent chain from the root down, without the comment itself', async () => {
      const root = await createTestPost({ user: author })
      const first = await createTestPost({
        user: author,
        post_type: 'comment',
        parent_post_id: root.id,
      })
      const second = await createTestPost({
        user: admin,
        post_type: 'comment',
        parent_post_id: first.id,
      })

      const { body } = await call(author, 'get_post_ancestors', second.id)
      const comment = await call(author, 'get_post', second.id)

      expect(body.ancestors?.map(ancestor => ancestor['id'])).toEqual([root.id, first.id])
      expect(comment.body.post).toMatchObject({
        post_type: 'comment',
        parent_post_id: first.id,
        root_post_id: root.id,
      })
    })

    it('leaves a deleted ancestor out of the chain', async () => {
      const root = await createTestPost({ user: author })
      const removed = await createTestPost({
        user: author,
        post_type: 'comment',
        parent_post_id: root.id,
      })
      const reply = await createTestPost({
        user: admin,
        post_type: 'comment',
        parent_post_id: removed.id,
      })
      await deleteTestPost(removed.id)

      const { body, text } = await call(author, 'get_post_ancestors', reply.id)

      expect(body.ancestors?.map(ancestor => ancestor['id'])).toEqual([root.id])
      expect(text).not.toContain(removed.slug)
      expect((await call(author, 'get_post', removed.id)).body).toEqual(NOT_FOUND)
      expect((await call(author, 'get_post', reply.id)).body.post).toMatchObject({
        parent_post_id: removed.id,
      })
    })

    it('answers a comment under a hidden ancestor as not found, without naming the ancestor', async () => {
      const root = await createTestPost({ user: author })
      const hiddenParent = await pendingPost(author, {
        post_type: 'comment',
        parent_post_id: root.id,
      })
      const reply = await createTestPost({
        user: admin,
        post_type: 'comment',
        parent_post_id: hiddenParent.id,
      })

      for (const name of ['get_post', 'get_post_ancestors']) {
        const { body, text } = await call(admin, name, reply.id)
        expect(body).toEqual(NOT_FOUND)
        expect(text).not.toContain(hiddenParent.id)
      }
    })

    it('answers a comment under a private root as not found', async () => {
      const root = await createTestPost({ user: author, privacy: 'private', broadcast: 'users' })
      const comment = await createTestPost({
        user: author,
        post_type: 'comment',
        parent_post_id: root.id,
      })

      for (const name of ['get_post', 'get_post_ancestors']) {
        expect((await call(author, name, comment.id)).body).toEqual(NOT_FOUND)
      }
    })
  })
})
