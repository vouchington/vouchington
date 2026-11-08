import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
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
import { createCommunityPostFixture } from '@voucha/test-helpers/services/posts/test-support'
import { beforeAll, describe, expect, it } from 'vitest'

type Body = Record<string, unknown>
type PostBody = {
  id: string
  created_by_id: string | null
  is_anonymous: boolean
  markdown: string
}

const NOT_FOUND = { success: false, error: 'Community not found' }

type Caller = PrivateUser & { membership_plan: null }

const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })
const call = (caller: Caller, name: string, args: Body) =>
  callStructuredMcpTool(caller, name, args, ['communities:read'])
const idsOf = (posts: PostBody[]) => posts.map(post => post.id)

describe('read_community.posts and read_community.pinned_posts — real DB', () => {
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

  it('returns the same filtered community post from REST and read_posts search', async () => {
    const query = `Plain four ${random}`
    const request = createRequest()
    await request.authenticateAs(author)
    const rest = await request
      .get(`/api/v1/communities/${slug}/posts?q=${encodeURIComponent(query)}`)
      .expect(200)
    const result = await callStructuredMcpTool(
      author,
      'read_posts',
      optionArgs('search', { community_id: communityId, q: query, sort: 'new' }),
      ['posts:read'],
    )
    expect((result.results as PostBody[]).map(post => post.id)).toEqual(
      rest.body.results.map((post: { id: string }) => post.id),
    )
    expect((result.results as PostBody[]).map(post => post.id)).toEqual([posts.four])
    expect(result.page_info).toEqual(rest.body.page_info)
  })

  describe('read_community.pinned_posts', () => {
    const listPinned = (caller: Caller, id = slug) =>
      call(
        caller,
        'read_community',
        optionArgs('pinned_posts', { community_id: id }),
      ) as unknown as Promise<{
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
      const page = await createRequest().get(`/api/v1/communities/${slug}/posts`).expect(200)
      expect(idsOf(pinned_posts)).toEqual(page.body.pinned_post_ids)
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
    it('is not found by read_community.pinned_posts for its member, owner and an administrator', async () => {
      const community = await communityWithMembers({ visibility: 'private' })
      const post = await publish(community.id, owner, { broadcast: 'users', privacy: 'private' })
      await setPinnedPosts(owner, community.id, [post])

      for (const caller of [author, owner, admin]) {
        for (const community_id of [community.id, community.slug]) {
          expect(
            await call(caller, 'read_community', optionArgs('pinned_posts', { community_id })),
          ).toEqual(NOT_FOUND)
        }
      }
    })
  })
})
