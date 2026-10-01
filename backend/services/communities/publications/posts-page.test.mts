import { describe, expect, it } from 'vitest'
import {
  createActivePostTopicAliasRelationForTest,
  createRandomString,
  createTestUser,
  getTopicAliasIdForTest,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  insertUnlinkedTopicAliasForTest,
} from '@voucha/test-helpers'
import { getCommunityPostsPage } from './posts-page.mts'
import { setPinnedPosts } from './pinned.mts'

describe('getCommunityPostsPage', () => {
  async function communityWithPosts(count: number) {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const postIds: string[] = []
    for (let index = 0; index < count; index++) {
      const postId = await insertTestPost({
        communityId: community.id,
        createdById: owner.id,
        markdown: `Posts page body ${index}`,
        slug: `posts-page-${createRandomString(8)}`,
        title: `Posts page ${index}`,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: owner.id,
      })
      postIds.push(postId)
    }
    return { community, owner, postIds }
  }

  it('leaves pinned posts out of the page and names them on the first page only', async () => {
    const { community, owner, postIds } = await communityWithPosts(3)
    await setPinnedPosts(owner, community.id, [postIds[0]!])

    const first = await getCommunityPostsPage(community.id, { currentUser: null, limit: 1 })
    const second = await getCommunityPostsPage(community.id, {
      currentUser: null,
      limit: 1,
      after: first.page_info.end_cursor!,
    })

    expect(first.results.map(post => post.id)).toEqual([postIds[2]])
    expect(first.pinned_post_ids).toEqual([postIds[0]])
    expect(second.results.map(post => post.id)).toEqual([postIds[1]])
    expect(second.pinned_post_ids).toEqual([])
  })

  it('narrows the page to the posts carrying an exact-alias hashtag', async () => {
    const { community, owner, postIds } = await communityWithPosts(2)
    const alias = `unlinked-${createRandomString(10)}`
    await insertUnlinkedTopicAliasForTest(alias)
    const aliasId = await getTopicAliasIdForTest(alias)
    await createActivePostTopicAliasRelationForTest({
      postId: postIds[0]!,
      topicAliasId: aliasId!,
      userId: owner.id,
    })

    const tagged = await getCommunityPostsPage(community.id, {
      currentUser: null,
      q: `#${alias}`,
    })

    expect(tagged.results.map(post => post.id)).toEqual([postIds[0]])
    expect(tagged.pinned_post_ids).toEqual([])
  })

  it('returns no posts for a hashtag that names nothing', async () => {
    const { community } = await communityWithPosts(1)

    const page = await getCommunityPostsPage(community.id, {
      currentUser: null,
      q: `#nothing${createRandomString(10)}`,
    })

    expect(page.results).toEqual([])
  })
})
