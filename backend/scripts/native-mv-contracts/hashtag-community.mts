import assert from 'node:assert/strict'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { archiveTestCommunity } from '../../test-helpers/entities/community-archive.mts'
import { createTestPost } from '../../test-helpers/entities/create-test-entities.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { createTopHashtagPostSourceForTest } from '../../test-helpers/entities/top-hashtags.mts'
import { insertTestCommunity } from '../../test-helpers/entities/communities.mts'
import { insertTestCommunityPostReview } from '../../test-helpers/entities/community-post-reviews.mts'
import { createUnlinkedTopicAlias } from '@services/topics/aliases'
import { searchTopHashtags } from '@services/topics/top-hashtags'

export async function checkHashtagCommunityContracts(): Promise<void> {
  const suffix = crypto.randomUUID()
  const hashtag = `approved-community-comments-${suffix}`
  const owner = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
  const rootAuthor = await createTestUser()
  const rootPost = await createTestPost({
    user: rootAuthor!,
    title: `Approved community root ${suffix}`,
    community_id: community.id,
    privacy: 'public',
    broadcast: 'everyone',
  })
  await insertTestCommunityPostReview({
    communityId: community.id,
    postId: rootPost.id,
    submittedById: rootAuthor!.id,
  })
  const alias = await createUnlinkedTopicAlias(hashtag)
  for (let index = 0; index < 3; index++) {
    const commenter = await createTestUser()
    const comment = await createTestPost({
      user: commenter!,
      title: `Approved community comment ${index} ${suffix}`,
      post_type: 'comment',
      parent_post_id: rootPost.id,
      community_id: community.id,
      privacy: 'public',
      broadcast: 'everyone',
    })
    await createTopHashtagPostSourceForTest({
      postId: comment.id,
      topicAliasId: alias.id,
      userId: commenter!.id,
      authoredToken: `#${hashtag}`,
    })
  }
  await refreshMaterializedView('mv_top_hashtags')
  const approved = (await searchTopHashtags({ q: hashtag })).results
  assert.equal(approved.length, 1)
  assert.equal(approved[0]?.topic_alias_id, alias.id)
  assert.equal(approved[0]?.item_count, 3)
  assert.equal(approved[0]?.contributor_count, 3)

  const archivedSuffix = crypto.randomUUID()
  const archivedOwner = await createTestUser()
  const archivedCommunity = await insertTestCommunity({
    createdById: archivedOwner!.id,
    visibility: 'public',
  })
  const archivedAlias = await createUnlinkedTopicAlias(`archived-community-${archivedSuffix}`)
  for (let index = 0; index < 3; index++) {
    const contributor = await createTestUser()
    const post = await createTestPost({
      user: contributor!,
      title: `Archived community hashtag source ${index} ${archivedSuffix}`,
      community_id: archivedCommunity.id,
      privacy: 'public',
      broadcast: 'everyone',
    })
    await insertTestCommunityPostReview({
      communityId: archivedCommunity.id,
      postId: post.id,
      submittedById: contributor!.id,
    })
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: archivedAlias.id,
      userId: contributor!.id,
      authoredToken: `#archived-community-${archivedSuffix}`,
    })
  }
  await archiveTestCommunity({
    communityId: archivedCommunity.id,
    archivedById: archivedOwner!.id,
  })
  await refreshMaterializedView('mv_top_hashtags')
  assert.deepEqual(
    (await searchTopHashtags({ q: `archived-community-${archivedSuffix}` })).results,
    [],
  )
}
