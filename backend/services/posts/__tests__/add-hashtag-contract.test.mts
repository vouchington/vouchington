import { beforeAll, describe, expect, it } from 'vitest'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import {
  CONTRIBUTING_USER_AGE_MS,
  approveTestPost,
  createTestTopic,
  createRandomString,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  createTestUserWithAge,
  getLatestPostCategoryRevisionForTest,
  getPostHashtagSourcesForTest,
  getTestPostPublicationDirtyWorkForScope,
  getTopicAliasIdForTest,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { addPostHashtag } from '../add-hashtag.mts'
import { createPost } from '../create.mts'

const firstParty = { kind: 'first_party' } as const

describe('addPostHashtag admission and persistence', () => {
  let creator: PrivateUser

  beforeAll(async () => {
    creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('rejects an invalid hashtag without alias or source writes', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const invalid = `#invalid!${suffix}`
    const post = await createPost(creator, {
      title: `Invalid hashtag ${suffix}`,
      categories: [{ type: 'hashtag', hashtag: `#retained-${suffix}` }],
    })
    const before = await getPostHashtagSourcesForTest(post.id)

    await expect(addPostHashtag(creator, post.id, invalid, firstParty)).rejects.toMatchObject({
      status: 422,
    })
    expect(await getTopicAliasIdForTest(`invalid!${suffix}`)).toBeNull()
    expect(await getPostHashtagSourcesForTest(post.id)).toEqual(before)
  })

  it('stores effective additive categories in the revision and publication capture', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const retained = `#retained-${suffix}`
    const added = `#added-${suffix}`
    const topic = await createTestTopic({
      name: `Retained tag ${suffix}`,
      slug: `retained-tag-${suffix}`,
    })
    const retainedAliasId = await createTopHashtagAliasForTest(topic.id, retained.slice(1))
    const postId = await insertTestPost({
      title: `Revision tag ${suffix}`,
      slug: `revision-tag-${suffix}`,
      markdown: 'A settled post fixture',
      createdById: creator.id,
    })
    await createTopHashtagPostSourceForTest({
      postId,
      topicAliasId: retainedAliasId,
      userId: creator.id,
      authoredToken: retained,
    })
    expect(
      await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }),
    ).toBeUndefined()

    await addPostHashtag(creator, postId, added, firstParty)

    expect(await getLatestPostCategoryRevisionForTest(postId)).toMatchObject({
      after: [
        { type: 'hashtag', hashtag: retained },
        { type: 'hashtag', hashtag: added },
      ],
    })
    expect(
      (await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId }))?.reasons,
    ).toContain('post_topics_changed')
  })

  it('rejects a suspended author before mutation', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const suffix = createRandomString(8).toLowerCase()
    const tag = `suspended-${suffix}`
    const post = await createPost(author, { title: `Suspended tag ${suffix}` })
    await suspendTestUser(author.id)
    try {
      const suspended = await getPrivateUserByAny(author.id)
      if (!suspended) throw new Error('Suspended test author disappeared')
      await expect(addPostHashtag(suspended, post.id, `#${tag}`, firstParty)).rejects.toMatchObject(
        {
          status: 403,
          code: ACCOUNT_SUSPENDED,
        },
      )
      expect(await getTopicAliasIdForTest(tag)).toBeNull()
      expect(await getPostHashtagSourcesForTest(post.id)).toEqual([])
    } finally {
      await unsuspendTestUser(author.id)
    }
  })

  it('hides an inaccessible root and an unpublished community post', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const rootOwner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const rootId = await insertTestPost({
      title: `Hidden root ${suffix}`,
      slug: `hidden-root-${suffix}`,
      markdown: 'Private root',
      createdById: rootOwner.id,
      broadcast: 'followers',
      privacy: 'private',
    })
    const replyId = await insertTestPost({
      title: `Hidden reply ${suffix}`,
      slug: `hidden-reply-${suffix}`,
      markdown: 'Reply',
      createdById: creator.id,
      postType: 'comment',
      parentId: rootId,
      rootId,
    })
    await expect(
      addPostHashtag(creator, replyId, `#hidden-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 404 })

    const community = await insertTestCommunity({
      createdById: creator.id,
      post_approval_required_at: new Date(),
    })
    await insertTestCommunityMember({ communityId: community.id, userId: creator.id })
    const communityPost = await createPost(creator, {
      title: `Unpublished tag ${suffix}`,
      community_id: community.id,
    })
    await approveTestPost(communityPost.id)
    await expect(
      addPostHashtag(creator, communityPost.id, `#unpublished-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 404 })
    expect(await getTopicAliasIdForTest(`hidden-${suffix}`)).toBeNull()
    expect(await getTopicAliasIdForTest(`unpublished-${suffix}`)).toBeNull()
    expect(await getPostHashtagSourcesForTest(replyId)).toEqual([])
    expect(await getPostHashtagSourcesForTest(communityPost.id)).toEqual([])
  })

  it('rejects blocked candidate and root post types', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const recommendationId = await insertTestPost({
      title: `Blocked recommendation ${suffix}`,
      slug: `blocked-recommendation-${suffix}`,
      markdown: 'Internal recommendation',
      createdById: creator.id,
      postType: 'topic_recommendation',
    })
    const replyId = await insertTestPost({
      title: `Blocked root reply ${suffix}`,
      slug: `blocked-root-reply-${suffix}`,
      markdown: 'Reply',
      createdById: creator.id,
      postType: 'comment',
      rootId: recommendationId,
      parentId: recommendationId,
    })
    await expect(
      addPostHashtag(creator, recommendationId, `#blocked-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      addPostHashtag(creator, replyId, `#blocked-root-${suffix}`, firstParty),
    ).rejects.toMatchObject({ status: 404 })
    expect(await getTopicAliasIdForTest(`blocked-${suffix}`)).toBeNull()
    expect(await getTopicAliasIdForTest(`blocked-root-${suffix}`)).toBeNull()
    expect(await getPostHashtagSourcesForTest(recommendationId)).toEqual([])
    expect(await getPostHashtagSourcesForTest(replyId)).toEqual([])
  })
})
