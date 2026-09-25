import { describe, expect, it } from 'vitest'
import { createTestPost, createTestTopic, createTestUser } from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { getEntityRelations } from './query.mts'
import { upsertEntityRelation } from './upsert.mts'
import { SYSTEM_ENTITY_RELATION_VIEWER } from './viewer.mts'

describe('getEntityRelations primary reads', () => {
  it('hydrates a just-written relation and object data from the primary pool', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost()
    const topic = await createTestTopic()
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'category',
      objectType: 'topic',
    })
    const [created] = await upsertEntityRelation(user, metadata, post, [topic], { vote: false })

    const relations = await getEntityRelations('post', post.id, 'category', 'topic', {
      viewer: SYSTEM_ENTITY_RELATION_VIEWER,
      readOnly: false,
    })

    expect(relations).toContainEqual(
      expect.objectContaining({
        id: created!.id,
        object_data: expect.objectContaining({ id: topic.id }),
      }),
    )
  })
})
