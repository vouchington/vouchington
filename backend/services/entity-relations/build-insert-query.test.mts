import { describe, expect, it } from 'vitest'
import type { BasicUser } from '@voucha/types/entities/user'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { buildInsertQuery } from './build-insert-query.mts'

const creator: BasicUser = {
  __entity_type: 'user',
  id: '01900000-0000-7000-8000-000000000001',
  roles: [],
}
const relation = getEntityRelationMetadataOrThrow({
  subjectType: 'rss_feed_item',
  objectType: 'topic',
  predicate: 'category',
})
const userFollowRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  objectType: 'user',
  predicate: 'follow',
})

describe('buildInsertQuery', () => {
  it('uses parallel UNNEST arrays for a stable multi-row query shape', () => {
    const query = buildInsertQuery(
      relation,
      creator,
      [
        {
          subject: { id: '01900000-0000-7000-8000-000000000002' },
          object: { id: '01900000-0000-7000-8000-000000000003' },
        },
        {
          subject: { id: '01900000-0000-7000-8000-000000000004' },
          object: { id: '01900000-0000-7000-8000-000000000005' },
        },
      ],
      { vote: true },
    )

    expect(query.text).toContain('FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY')
    expect(query.text).toContain('ORDER BY input.subject_id, input.object_id')
    expect(query.text).toContain('ORDER BY input.ordinality')
    expect(query.text).not.toContain('VALUES')
    expect(query.values).toEqual([
      ['01900000-0000-7000-8000-000000000002', '01900000-0000-7000-8000-000000000004'],
      ['01900000-0000-7000-8000-000000000003', '01900000-0000-7000-8000-000000000005'],
      creator.id,
    ])
  })

  it('locks the prior row before upsert so newly_active reflects the version it updates', () => {
    const query = buildInsertQuery(relation, creator, [
      { subject: { id: creator.id }, object: { id: creator.id } },
    ])

    expect(query.text).toContain('existing AS MATERIALIZED')
    expect(query.text).toContain('ORDER BY r.subject_id, r.object_id')
    expect(query.text).toContain('FOR UPDATE')
    expect(query.text).toContain('LEFT JOIN existing')
    expect(query.text).toContain(
      '(existing.subject_id IS NULL OR existing.deleted_at IS NOT NULL) AS newly_active',
    )
    expect(query.text).toContain('FROM input\n      LEFT JOIN existing')
  })

  it('preserves an active Follow identity and rotates it only on resurrection', () => {
    const query = buildInsertQuery(userFollowRelation, creator, [
      { subject: { id: creator.id }, object: { id: creator.id } },
    ])

    expect(query.text).toContain('outbound_ap_follow_activity_id')
    expect(query.text).toContain('THEN relation__user__follow__user.outbound_ap_follow_activity_id')
    expect(query.text).toContain('ELSE uuidv7()')
  })

  it('keeps identical SQL text for different batch sizes', () => {
    const one = buildInsertQuery(relation, creator, [
      { subject: { id: creator.id }, object: { id: creator.id } },
    ])
    const two = buildInsertQuery(relation, creator, [
      { subject: { id: creator.id }, object: { id: creator.id } },
      { subject: { id: creator.id }, object: { id: creator.id } },
    ])

    expect(one.text).toBe(two.text)
  })

  it('keeps high-cardinality relation writes to three bind parameters', () => {
    const pairs = Array.from({ length: 10_000 }, (_, index) => ({
      subject: { id: `01900000-0000-7000-8000-${index.toString().padStart(12, '0')}` },
      object: {
        id: `01900000-0000-7001-8000-${(index + 10_000).toString().padStart(12, '0')}`,
      },
    }))

    const query = buildInsertQuery(relation, creator, pairs)

    expect(query.values).toHaveLength(3)
    expect(query.values[0]).toHaveLength(10_000)
    expect(query.values[1]).toHaveLength(10_000)
    expect(query.text).toBe(buildInsertQuery(relation, creator, [pairs[0]!]).text)
  })
})
