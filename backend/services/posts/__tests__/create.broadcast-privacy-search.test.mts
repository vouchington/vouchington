import { beforeAll, describe, expect, it } from 'vitest'
import { createPost } from '../create.mts'
import { getPostIds } from '../search/get-ids.mts'
import { followUser } from '@voucha/test-helpers/entities/test-entities'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { approveTestPost } from '@voucha/test-helpers/entities/post-clearance'
import type { PrivateUser } from '@services/users/types'
import { WEB_PROVENANCE } from '@voucha/test-helpers'

describe('create.broadcast-privacy-search', () => {
  let creator: PrivateUser
  let follower: PrivateUser
  let mutualFollower: PrivateUser
  let stranger: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
    follower = await createTestUser()
    mutualFollower = await createTestUser()
    stranger = await createTestUser()
    admin = await createTestUser({ administrator: true })

    // follower follows creator (one-way)
    await followUser(follower, creator)

    // mutual follow between mutualFollower and creator
    await followUser(mutualFollower, creator)
    await followUser(creator, mutualFollower)
  })

  describe('search audience filtering', () => {
    let privatePost: Awaited<ReturnType<typeof createPost>>
    let followersPublicPost: Awaited<ReturnType<typeof createPost>>

    beforeAll(async () => {
      privatePost = await createPost(WEB_PROVENANCE, creator, {
        title: 'Private followers post for search',
        markdown: 'private content for search test',
        broadcast: 'followers',
        privacy: 'private',
      })
      followersPublicPost = await createPost(WEB_PROVENANCE, creator, {
        title: 'Public followers post for search',
        markdown: 'public followers content for search test',
        broadcast: 'followers',
      })
      // Approve posts so the clearance gate doesn't block audience tests
      await Promise.all([
        approveTestPost(privatePost!.id),
        approveTestPost(followersPublicPost!.id),
      ])
    })

    it('creator sees own private posts in search', async () => {
      const results = await getPostIds(creator, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).toContain(privatePost.id)
    })

    it('follower sees private followers-only posts in search', async () => {
      const results = await getPostIds(follower, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).toContain(privatePost.id)
    })

    it('stranger cannot see private posts in search', async () => {
      const results = await getPostIds(stranger, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).not.toContain(privatePost.id)
    })

    it('admin sees all private posts in search', async () => {
      const results = await getPostIds(admin, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).toContain(privatePost.id)
    })

    it('logged-out user cannot see private or public followers-only posts in search', async () => {
      const results = await getPostIds(undefined, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).not.toContain(privatePost.id)
      expect(ids).not.toContain(followersPublicPost.id)
    })

    it('non-followers cannot see public followers-only posts in search', async () => {
      const results = await getPostIds(stranger, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).not.toContain(followersPublicPost.id)
    })
  })

  describe('mutual followers privacy', () => {
    let mutualPost: Awaited<ReturnType<typeof createPost>>

    beforeAll(async () => {
      mutualPost = await createPost(WEB_PROVENANCE, creator, {
        title: 'Mutual followers private',
        markdown: 'mutual content',
        broadcast: 'mutual_followers',
        privacy: 'private',
      })
      await approveTestPost(mutualPost!.id)
    })

    it('mutual follower sees mutual-only posts in search', async () => {
      const results = await getPostIds(mutualFollower, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).toContain(mutualPost.id)
    })

    it('one-way follower cannot see mutual-only private posts', async () => {
      const results = await getPostIds(follower, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).not.toContain(mutualPost.id)
    })
  })

  describe('users broadcast visibility', () => {
    let usersPost: Awaited<ReturnType<typeof createPost>>
    let usersPrivatePost: Awaited<ReturnType<typeof createPost>>

    beforeAll(async () => {
      usersPost = await createPost(WEB_PROVENANCE, creator, {
        title: 'Users-only post for search',
        markdown: 'users content',
        broadcast: 'users',
      })
      usersPrivatePost = await createPost(WEB_PROVENANCE, creator, {
        title: 'Users-only private post for search',
        markdown: 'private users content',
        broadcast: 'users',
        privacy: 'private',
      })
      await Promise.all([approveTestPost(usersPost!.id), approveTestPost(usersPrivatePost!.id)])
    })

    it('logged-in users can see users-only and users-private posts in search', async () => {
      const results = await getPostIds(stranger, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).toContain(usersPost.id)
      expect(ids).toContain(usersPrivatePost.id)
    })

    it('logged-out users cannot see users-only or users-private posts in search', async () => {
      const results = await getPostIds(undefined, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).not.toContain(usersPost.id)
      expect(ids).not.toContain(usersPrivatePost.id)
    })
  })

  describe('anonymous user page filtering', () => {
    let anonymousPost: Awaited<ReturnType<typeof createPost>>

    beforeAll(async () => {
      anonymousPost = await createPost(WEB_PROVENANCE, creator, {
        title: 'Anonymous profile-hidden post',
        markdown: 'anonymous profile hidden',
        is_anonymous: true,
      })
    })

    it('creator sees anonymous posts on their own user page', async () => {
      const results = await getPostIds(creator, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).toContain(anonymousPost.id)
    })

    it('admin sees anonymous posts on user pages', async () => {
      const results = await getPostIds(admin, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).toContain(anonymousPost.id)
    })

    it('other users do not see anonymous posts on user pages', async () => {
      const results = await getPostIds(stranger, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).not.toContain(anonymousPost.id)
    })

    it('logged-out users do not see anonymous posts on user pages', async () => {
      const results = await getPostIds(undefined, { user_id: creator.id })
      const ids = results.results.map(r => r.id)
      expect(ids).not.toContain(anonymousPost.id)
    })
  })
})
