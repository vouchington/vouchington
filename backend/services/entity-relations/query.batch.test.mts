import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { getEntityRelationsBatch } from './query.mts'
import { upsertEntityRelation } from './upsert.mts'
import { ANONYMOUS_ENTITY_RELATION_VIEWER } from './viewer.mts'

describe('getEntityRelationsBatch', () => {
  it('applies the page limit separately to each subject and preserves empty subjects', async () => {
    const creator = await createTestUser({ administrator: true })
    const [first, second, empty, one, two] = await Promise.all(
      Array.from({ length: 5 }, () => createTestTopic()),
    )
    const metadata = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      predicate: 'category',
      objectType: 'topic',
    })
    await upsertEntityRelation(creator, metadata, first!, [one!, two!], { vote: false })
    await upsertEntityRelation(creator, metadata, second!, [two!], { vote: false })
    const firstIdentifier = `{${first!.id.toUpperCase()}}`
    const groups = await getEntityRelationsBatch(
      'topic',
      [firstIdentifier, second!.id, empty!.id, firstIdentifier],
      'category',
      'topic',
      { viewer: ANONYMOUS_ENTITY_RELATION_VIEWER, limit: 1, sort: 'newest' },
    )
    expect(groups.size).toBe(3)
    expect(groups.get(firstIdentifier)).toHaveLength(1)
    expect(groups.get(firstIdentifier)![0]!.subject_id).toBe(first!.id)
    expect([one!.id, two!.id]).toContain(groups.get(firstIdentifier)![0]!.object_id)
    expect(groups.get(second!.id)).toMatchObject([{ subject_id: second!.id, object_id: two!.id }])
    expect(groups.get(empty!.id)).toEqual([])
  })
})
