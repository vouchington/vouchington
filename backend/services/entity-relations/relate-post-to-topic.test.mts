import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  relatePostToTopic,
} from '@voucha/test-helpers'
import { getEntityRelations } from './query.mts'
import { SYSTEM_ENTITY_RELATION_VIEWER } from './viewer.mts'

describe('relatePostToTopic', () => {
  it('creates an eligible scored category relation', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()

    const [relation] = await relatePostToTopic(user, post, topic)

    const relations = await getEntityRelations('post', post.id, 'category', 'topic', {
      viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      readOnly: false,
    })
    expect(relation?.id).toBeTruthy()
    expect(
      relations.some(
        row =>
          row.id === relation!.id && row.object_id === topic.id && (row.votes_score_net ?? 0) > 0,
      ),
    ).toBe(true)
  })
})
