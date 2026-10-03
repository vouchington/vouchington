import { createPost, updatePost } from '@services/posts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createActivePostTopicAliasRelationForTest,
  createRandomString,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  createTopHashtagAliasForTest,
  getTestPostPublicationDirtyWorkForScope,
  getTestPostCategoryRelationIds,
  hardDeleteTestPosts,
  hardDeleteTestTopics,
  insertTestTopicsAndExplicitPostCategories,
  listTestPostPublicationImpactTopicIds,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { onceElectionVoteStatsCompleted } from '@voucha/test-helpers/election-vote-stats'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  withCapturedTestQueries,
  countCapturedQueriesByAnnotation,
} from '@voucha/test-helpers/query-capture'

describe('post update publication capture', () => {
  it('defers archive capture to the final composite-update publication write', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const post = await createPost(author, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Publication archive ordering ${createRandomString(10)}`,
    })
    if (!post) throw new Error('Expected post')
    onTestFinished(() => hardDeleteTestPosts([post.id]))
    const before = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: post.id,
    })
    if (!before) throw new Error('Expected post creation publication work')

    await updatePost(author, post, {
      archive: true,
      title: `${post.title} updated`,
    })

    const after = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: post.id,
    })
    expect(BigInt(after!.generation)).toBeGreaterThan(BigInt(before.generation))
    expect(after?.reasons).toContain('post_content_reset')
    expect(after?.reasons).not.toContain('post_archived')
  })

  it('retains every prior topic in the coalesced repair work during an admin edit', async () => {
    const administrator = await createTestUser({ administrator: true })
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!administrator || !author) throw new Error('Expected administrator and author')
    const suffix = createRandomString(10)
    const post = await createPost(author, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Publication topic footprint ${suffix}`,
    })
    if (!post) throw new Error('Expected post')
    // The author's own like arrives through the post-created listener; its recompute is the
    // `post_updated` capture, and it is debounced, so wait for it instead of reading too early.
    await onceElectionVoteStatsCompleted({ electionId: post.id, orderingKey: 'post' })
    const topicIds = await insertTestTopicsAndExplicitPostCategories({
      count: 1_001,
      createdById: administrator.id,
      postId: post.id,
      prefix: `publication-topic-footprint-${suffix}`,
    })
    expect(topicIds).toHaveLength(1_001)
    onTestFinished(async () => {
      await hardDeleteTestPosts([post.id])
      await hardDeleteTestTopics(topicIds)
    })
    const title = `Publication topic footprint updated ${suffix}`

    const { queries } = await withCapturedTestQueries(() =>
      expect(updatePost(administrator, post, { title })).resolves.toMatchObject({ title }),
    )
    const relationIds = new Set(await getTestPostCategoryRelationIds(post.id))
    expect(relationIds.size).toBe(1_001)
    // Other tests share this worker. Contextual capture drops their async contexts, and these
    // stats queries put the target relation id (or batch of ids) in the first parameter.
    const postQueries = queries.filter(query => {
      const targets = query.values[0]
      return Array.isArray(targets)
        ? targets.some(id => typeof id === 'string' && relationIds.has(id))
        : typeof targets === 'string' && relationIds.has(targets)
    })
    expect(
      countCapturedQueriesByAnnotation(postQueries, 'updateEntityRelationVoteStatsIfChanged'),
    ).toBe(0)
    expect(
      countCapturedQueriesByAnnotation(
        postQueries,
        'updateEntityRelationElectionVoteStatsFromPrimaryBatch',
      ),
    ).toBe(2)

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: post.id,
    })
    expect(work).toBeDefined()
    expect(work!.reasons).toContain('post_updated')
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual(
      [...topicIds].toSorted(),
    )
  })

  it('includes relation-only alias membership topics in previous publication topics', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const suffix = createRandomString(10)
    const topic = await createTestTopic({
      user: author,
      name: `Relation-only topic ${suffix}`,
    })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `relation-only-${suffix}`)
    const post = await createPost(author, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Publication relation-only membership ${suffix}`,
    })
    if (!post) throw new Error('Expected post')
    await createActivePostTopicAliasRelationForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: author.id,
    })
    onTestFinished(() => hardDeleteTestPosts([post.id]))

    // Title change alone (no categories/structured_data) still sets syncHashtagCategories, which is
    // enough to make updatePost load previousTopicIds from getPreviousPostPublicationTopicIds and
    // record them as impact_topic keys — the relation-only membership has no source row to trigger
    // through any other path.
    await updatePost(author, post, { title: `${post.title} updated` })

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'post',
      id: post.id,
    })
    expect(work).toBeDefined()
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual([topic.id])
  })
})
