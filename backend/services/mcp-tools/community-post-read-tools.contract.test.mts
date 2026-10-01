import { approvePublication } from '@services/communities/publications/moderate'
import { setPinnedPosts } from '@services/communities/publications/pinned'
import type { PrivateUser } from '@services/users/types'
import {
  createRandomString,
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { createCommunityPostFixture } from '@voucha/test-helpers/services/posts/test-support'
import { beforeAll, describe, expect, it } from 'vitest'

type Body = Record<string, unknown>
type PostBody = {
  id: string
  created_by_id: string | null
  is_anonymous: boolean
  markdown: string
}
type PostsPage = {
  success: true
  pinned_post_ids: string[]
  results: PostBody[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

const NOT_FOUND = { success: false, error: 'Community not found' }
const INVALID_CURSOR = { success: false, error: 'Invalid cursor' }

type Caller = PrivateUser & { membership_plan: null }

const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })
const call = (caller: Caller, name: string, args: Body) =>
  callStructuredMcpTool(caller, name, args, ['communities:read'])
const idsOf = (posts: PostBody[]) => posts.map(post => post.id)

describe('get_community_posts and get_community_pinned_posts — real DB', () => {
  const random = createRandomString(8)
  let owner: Caller
  let author: Caller
  let admin: Caller
  let slug: string
  let communityId: string
  let posts: Record<'one' | 'two' | 'three' | 'four' | 'anon' | 'pinnedAnon', string>

  async function communityWithMembers(options: { visibility?: 'private' } = {}) {
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `posts-${createRandomString(8)}`,
      post_approval_required_at: new Date(),
      ...options,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: author.id })
    return community
  }

  const publish = async (id: string, user: Caller, attrs: Body = {}) => {
    const post = await createCommunityPostFixture(user, id, attrs)
    await approvePublication(owner, id, post.id)
    return post.id
  }

  beforeAll(async () => {
    const [ownerUser, authorUser, adminUser] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    ;[owner, author, admin] = [ownerUser, authorUser, adminUser].map(asCaller) as Caller[]
    const community = await communityWithMembers()
    communityId = community.id
    slug = community.slug
    const text = (word: string) => ({
      title: `${word} ${random}`,
      markdown: `${word} body ${random}`,
    })
    posts = {
      one: await publish(communityId, owner, text('Marker one')),
      two: await publish(communityId, owner, text('Marker two')),
      three: await publish(communityId, owner, text('Plain three')),
      four: await publish(communityId, owner, text('Plain four')),
      anon: await publish(communityId, author, { ...text('Anon'), is_anonymous: true }),
      pinnedAnon: await publish(communityId, author, {
        ...text('Pinned anon'),
        is_anonymous: true,
      }),
    }
    await createCommunityPostFixture(author, communityId, text('Unapproved'))
    await setPinnedPosts(owner, communityId, [posts.one, posts.pinnedAnon, posts.three])
  })

  const listPosts = (args: Body = {}, caller: Caller = author) =>
    call(caller, 'get_community_posts', {
      community_id: slug,
      ...args,
    }) as unknown as Promise<PostsPage>

  describe('get_community_posts', () => {
    it('leaves pinned and unapproved posts out of the page and names the pins once', async () => {
      const first = await listPosts({ limit: 2 })
      const second = await listPosts({ limit: 2, after: first.page_info.end_cursor })

      expect(idsOf(first.results)).toEqual([posts.anon, posts.four])
      expect(first.pinned_post_ids).toEqual([posts.one, posts.pinnedAnon, posts.three])
      expect(first.page_info.has_next_page).toBe(true)
      expect(idsOf(second.results)).toEqual([posts.two])
      expect(second.pinned_post_ids).toEqual([])
      expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    })

    it('lists pinned posts again, without naming the pins, when q filters the page', async () => {
      const page = await listPosts({ q: `marker ${random}` })

      expect(new Set(idsOf(page.results))).toEqual(new Set([posts.one, posts.two]))
      expect(page.pinned_post_ids).toEqual([])
    })

    it('returns the same page as the signed-out REST route, by id as well as slug', async () => {
      const response = await createRequest().get(`/api/v1/communities/${slug}/posts`).expect(200)

      const page = await listPosts({ community_id: communityId })

      expect(idsOf(page.results)).toEqual(
        response.body.results.map((row: { id: string }) => row.id),
      )
      expect(page.pinned_post_ids).toEqual(response.body.pinned_post_ids)
    })

    it('hides the author of an anonymous post from the author and from administrators', async () => {
      const anonId = posts.anon
      for (const caller of [author, admin, owner]) {
        const { results } = await listPosts({}, caller)
        const anon = results.find(post => post.id === anonId)

        expect(anon).toMatchObject({ is_anonymous: true, created_by_id: null })
        expect(JSON.stringify(results)).not.toContain(author.id)
      }
    })

    it('wraps post text as external content', async () => {
      const [plain] = (await listPosts({ limit: 1 })).results

      expect(plain?.markdown).toContain(`body ${random}`)
      expect(plain?.markdown).not.toBe(`Anon body ${random}`)
    })

    it('sorts by hot and refuses a cursor from the other sort', async () => {
      const hot = await listPosts({ sort: 'hot', limit: 1 })
      const recent = await listPosts({ limit: 1 })

      expect(hot.results).toHaveLength(1)
      expect(await listPosts({ after: hot.page_info.end_cursor })).toEqual(INVALID_CURSOR)
      expect(await listPosts({ sort: 'hot', after: recent.page_info.end_cursor })).toEqual(
        INVALID_CURSOR,
      )
      expect(await listPosts({ after: 'not-a-cursor' })).toEqual(INVALID_CURSOR)
    })
  })

  describe('get_community_pinned_posts', () => {
    const listPinned = (caller: Caller, id = slug) =>
      call(caller, 'get_community_pinned_posts', { community_id: id }) as unknown as Promise<{
        pinned_posts: PostBody[]
      }>

    it('returns the pinned posts in pin order with an anonymous author hidden from everyone', async () => {
      for (const caller of [author, admin]) {
        const { pinned_posts } = await listPinned(caller)

        expect(idsOf(pinned_posts)).toEqual([posts.one, posts.pinnedAnon, posts.three])
        expect(pinned_posts[1]).toMatchObject({ is_anonymous: true, created_by_id: null })
        expect(JSON.stringify(pinned_posts)).not.toContain(author.id)
      }
    })

    it('matches the signed-out REST route and the pin ids of the post listing', async () => {
      const response = await createRequest()
        .get(`/api/v1/communities/${slug}/pinned-posts`)
        .expect(200)

      const { pinned_posts } = await listPinned(owner, communityId)

      expect(idsOf(pinned_posts)).toEqual(
        response.body.pinned_posts.map((pin: { post_id: string }) => pin.post_id),
      )
      expect(idsOf(pinned_posts)).toEqual((await listPosts()).pinned_post_ids)
    })

    it('leaves out a pinned post the public can no longer read', async () => {
      const community = await communityWithMembers()
      const kept = await publish(community.id, owner)
      const removed = await publish(community.id, owner)
      await setPinnedPosts(owner, community.id, [kept, removed])
      await deleteTestPost(removed)

      const { pinned_posts } = await listPinned(owner, community.slug)

      expect(idsOf(pinned_posts)).toEqual([kept])
    })

    it('returns an empty list for a community with no pins', async () => {
      const community = await communityWithMembers()

      expect(await listPinned(owner, community.slug)).toEqual({ success: true, pinned_posts: [] })
    })
  })

  describe('a private community', () => {
    it.each(['get_community_posts', 'get_community_pinned_posts'])(
      'is not found by %s for its member, owner and an administrator',
      async name => {
        const community = await communityWithMembers({ visibility: 'private' })
        const post = await publish(community.id, owner, { broadcast: 'users', privacy: 'private' })
        await setPinnedPosts(owner, community.id, [post])

        for (const caller of [author, owner, admin]) {
          for (const community_id of [community.id, community.slug]) {
            expect(await call(caller, name, { community_id })).toEqual(NOT_FOUND)
          }
        }
      },
    )
  })
})
