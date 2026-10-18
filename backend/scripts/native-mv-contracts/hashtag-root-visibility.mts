import assert from 'node:assert/strict'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { createTestPost } from '../../test-helpers/entities/create-test-entities.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { createTopHashtagPostSourceForTest } from '../../test-helpers/entities/top-hashtags.mts'
import { setTestPostClearanceStatus } from '../../test-helpers/entities/post-clearance.mts'
import { suspendTestUser } from '../../test-helpers/entities/users-lifecycle.mts'
import { createUnlinkedTopicAlias } from '@services/topics/aliases'
import { searchTopHashtags } from '@services/topics/top-hashtags'

type RootRestriction = 'private' | 'rejected' | 'suspended-author'

async function checkRootRestriction(restriction: RootRestriction): Promise<void> {
  const suffix = crypto.randomUUID()
  const hashtag = `${restriction}-root-comment-${suffix}`
  const alias = await createUnlinkedTopicAlias(hashtag)
  const rootAuthor = await createTestUser()
  const rootPost = await createTestPost({
    user: rootAuthor!,
    title: `${restriction} root post ${suffix}`,
    privacy: restriction === 'private' ? 'private' : 'public',
    broadcast: restriction === 'private' ? 'followers' : 'everyone',
  })
  for (let index = 0; index < 3; index++) {
    const commenter = await createTestUser()
    const comment = await createTestPost({
      user: commenter!,
      title: `${restriction} root hashtag comment ${index} ${suffix}`,
      post_type: 'comment',
      parent_post_id: rootPost.id,
    })
    await createTopHashtagPostSourceForTest({
      postId: comment.id,
      topicAliasId: alias.id,
      userId: commenter!.id,
      authoredToken: `#${hashtag}`,
    })
  }
  if (restriction === 'rejected') {
    await setTestPostClearanceStatus(rootPost.id, 'rejected', rootAuthor!.id)
  } else if (restriction === 'suspended-author') {
    await suspendTestUser(rootAuthor!.id)
  }
  await refreshMaterializedView('mv_top_hashtags')
  assert.deepEqual((await searchTopHashtags({ q: hashtag })).results, [], restriction)
}

export async function checkHashtagRootVisibilityContracts(): Promise<void> {
  await checkRootRestriction('private')
  await checkRootRestriction('rejected')
  await checkRootRestriction('suspended-author')
}
