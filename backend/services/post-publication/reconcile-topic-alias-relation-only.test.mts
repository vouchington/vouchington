import {
  beginTransaction,
  createActivePostTopicAliasRelationForTest,
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  listTestPostPublicationImpactTopicIds,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { linkTopicAlias, unlinkTopicAlias } from '../topics/aliases.mts'
import { claimPostPublicationDirtyWork } from './dirty-work.mts'
import { reconcilePostPublicationDirtyWork } from './reconcile.mts'
import { recordPostPublicationChange } from './capture.mts'

describe('topic alias publication reconciliation: relation-only membership', () => {
  it('reconciles a relation-only alias member that has no source row', async () => {
    const user = await createTestUser()
    const owner = await createTestTopic({ user })
    const aliasId = await createTopHashtagAliasForTest(owner.id, `alias-${crypto.randomUUID()}`)
    const post = await createTestPost({ user })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: user.id,
    })
    await using postChangeQuery = await beginTransaction()
    const work = await recordPostPublicationChange(postChangeQuery, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    await postChangeQuery.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected topic alias publication work lease')

    const page = await reconcilePostPublicationDirtyWork(claimed, 10)

    expect(page.posts.map(candidate => candidate.id)).toEqual([post.id])
  })

  it('retains and re-projects a relation-only alias membership topic after a relink', async () => {
    const user = await createTestUser()
    const [initialOwner, replacementOwner] = await Promise.all([
      createTestTopic({ user }),
      createTestTopic({ user }),
    ])
    const aliasId = await createTopHashtagAliasForTest(
      initialOwner.id,
      `alias-${crypto.randomUUID()}`,
    )
    const post = await createTestPost({ user })
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: user.id,
    })
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_topics_changed',
    })
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected post publication work lease')

    const initialPage = await reconcilePostPublicationDirtyWork(claimed, 10)

    expect(initialPage.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: post.id,
          projection_identity: expect.objectContaining({ topicIds: [initialOwner.id] }),
        }),
      ]),
    )
    await expect(listTestPostPublicationImpactTopicIds(work.id)).resolves.toEqual(
      expect.arrayContaining([initialOwner.id]),
    )

    await unlinkTopicAlias(aliasId)
    await linkTopicAlias(replacementOwner.id, aliasId)
    await using aliasChangeQuery = await beginTransaction()
    const aliasWork = await recordPostPublicationChange(aliasChangeQuery, {
      scope: { type: 'topic_alias', topicAliasId: aliasId },
      reason: 'post_topics_changed',
    })
    await aliasChangeQuery.commit()
    const claimedAliasWork = await claimPostPublicationDirtyWork(aliasWork, 60)
    if (!claimedAliasWork) throw new Error('Expected topic alias publication work lease')
    const aliasPage = await reconcilePostPublicationDirtyWork(claimedAliasWork, 10)
    expect(aliasPage.posts.map(candidate => candidate.id)).toContain(post.id)

    const relinkedPage = await reconcilePostPublicationDirtyWork(claimed, 10)

    expect(relinkedPage.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: post.id,
          projection_identity: expect.objectContaining({ topicIds: [replacementOwner.id] }),
        }),
      ]),
    )
    await expect(listTestPostPublicationImpactTopicIds(work.id)).resolves.toEqual(
      expect.arrayContaining([initialOwner.id, replacementOwner.id]),
    )
  })
})
