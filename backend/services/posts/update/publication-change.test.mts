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
  hardDeleteTestPosts,
  hardDeleteTestTopics,
  insertTestTopicsAndExplicitPostCategories,
  listTestPostPublicationImpactTopicIds,
} from '@voucha/test-helpers'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  enableQueryCapture,
  stopTestQueryCapture,
  countCapturedQueriesByAnnotation,
} from '@voucha/test-helpers/query-capture'

describe('post update publication capture', () => {
  it('defers archive capture to the final composite-update publication write', async () => {
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!author) throw new Error('Expected author')
    const post = await createPost(author, {
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
    const post = await createPost(author, {
      post_type: 'discussion',
      title: `Publication topic footprint ${suffix}`,
    })
    if (!post) throw new Error('Expected post')
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

    enableQueryCapture()
    let queries: ReturnType<typeof stopTestQueryCapture>
    try {
      await expect(updatePost(administrator, post, { title })).resolves.toMatchObject({ title })
    } finally {
      queries = stopTestQueryCapture()
    }
    expect(
      countCapturedQueriesByAnnotation(queries, 'updateEntityRelationVoteStatsIfChanged'),
    ).toBe(0)
    expect(
      countCapturedQueriesByAnnotation(
        queries,
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
      [...topicIds].sort(),
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
    const post = await createPost(author, {
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
