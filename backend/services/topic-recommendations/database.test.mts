import { it, expect, describe, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestPost,
  insertTestCommunity,
} from '@voucha/test-helpers'
import { getPosts } from './database.mts'

describe('getPosts', () => {
  let communityId: string
  let communityPostId: string
  let communityPostTitle: string
  let communityPostMarkdown: string
  let noCommunityPostId: string

  beforeAll(async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    communityId = community.id

    const r = createRandomString(8)
    communityPostTitle = `Wikipedia database test post ${r}`
    communityPostMarkdown = `Wikipedia database test content ${r}`
    communityPostId = await insertTestPost({
      title: communityPostTitle,
      slug: `wikipedia-database-test-${r}`,
      markdown: communityPostMarkdown,
      createdById: user.id,
      communityId: community.id,
    })

    const r2 = createRandomString(8)
    noCommunityPostId = await insertTestPost({
      title: `Wikipedia database test post no community ${r2}`,
      slug: `wikipedia-database-test-no-community-${r2}`,
      markdown: 'no community content',
      createdById: user.id,
    })
  }, 30_000)

  it('maps communityId, title, and content for a post in a community', async () => {
    const posts = await getPosts([communityPostId])
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual({
      id: communityPostId,
      title: communityPostTitle,
      content: communityPostMarkdown,
      communityId,
    })
  })

  it('maps communityId to null for a post without a community', async () => {
    const posts = await getPosts([noCommunityPostId])
    expect(posts).toHaveLength(1)
    expect(posts[0].communityId).toBeNull()
  })

  it('returns an empty array for an empty id list', async () => {
    const posts = await getPosts([])
    expect(posts).toEqual([])
  })
})
