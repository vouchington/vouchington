import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { insertScoredPostTopicCategoryRelation } from '@voucha/test-helpers/entities/entity-relations-posts'
import { insertTestPost, setPostVotesScoreUp } from '@voucha/test-helpers/entities/posts'

describe('trending visibility', () => {
  it('keeps the dedicated trending route public-only for a signed-in owner', async () => {
    const admin = await createTestUser({ administrator: true })
    const namespace = randomUUID()
    const topicId = await insertTestTopic({
      name: `Trending visibility ${namespace}`,
      slug: `trending-visibility-${namespace}`,
      createdById: admin.id,
    })
    const ids = await Promise.all(
      (['public', 'private'] as const).map(privacy =>
        insertTestPost({
          title: `Trending ${privacy} ${namespace}`,
          slug: `trending-${privacy}-${namespace}`,
          createdById: admin.id,
          markdown: 'Trending visibility fixture',
          privacy,
          broadcast: privacy === 'public' ? 'everyone' : 'followers',
        }),
      ),
    )
    for (const id of ids) {
      await setPostVotesScoreUp(id, 2)
      await insertScoredPostTopicCategoryRelation(id, topicId, admin.id)
    }

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get('/api/v1/trending-posts')
      .query({ topic_id: topicId })
      .expect(200)
    expect(response.body.results.map((row: { id: string }) => row.id)).toEqual([ids[0]])
  })
})
