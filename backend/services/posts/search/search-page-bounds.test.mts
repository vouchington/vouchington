import { encodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
import { dataPointLimitLiteral } from './data-point-arms.mts'
import { assembleDataPointPage } from './data-point-assemble.mts'
import { decodeDataPointCursor } from './data-point-cursor.mts'
import { buildDataPointPageQuery } from './data-point-query.mts'

const ID = '123e4567-e89b-12d3-a456-426614174000'
const OTHER = '223e4567-e89b-12d3-a456-426614174000'

function dataPointAfter(overrides: Record<string, unknown>): string {
  return encodeCursor({
    phase: 'null',
    parent_open: false,
    community_id: null,
    post_id: null,
    ...overrides,
  })
}

describe('search page bounds', () => {
  it('rejects a data-point limit outside the configured bound', () => {
    expect(() => dataPointLimitLiteral(0)).toThrow(/outside its configured bound/)
    expect(dataPointLimitLiteral(1)).toBe('1')
    expect(dataPointLimitLiteral(101)).toBe('101')
  })

  it('rejects malformed data-point cursors', () => {
    expect(() => decodeDataPointCursor(dataPointAfter({ phase: 'other' }))).toThrow(
      'Invalid cursor',
    )
    expect(() => decodeDataPointCursor(dataPointAfter({ community_id: 'nope' }))).toThrow(
      'Invalid cursor',
    )
    expect(() =>
      decodeDataPointCursor(dataPointAfter({ parent_open: true, post_id: 'nope' })),
    ).toThrow('Invalid cursor')
    expect(() => decodeDataPointCursor(dataPointAfter({ parent_open: true }))).toThrow(
      'Invalid cursor',
    )
    expect(() => decodeDataPointCursor(dataPointAfter({ phase: 'community' }))).toThrow(
      'Invalid cursor',
    )
    expect(() => decodeDataPointCursor(dataPointAfter({ community_id: OTHER }))).toThrow(
      'Invalid cursor',
    )
  })

  it('returns an empty data-point page, including one that resumes at the next community', () => {
    expect(assembleDataPointPage([], { limit: 5, childLimit: 5 }).page_info).toEqual({
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    })
    const resumed = assembleDataPointPage(
      [
        {
          phase: 'later',
          parent_ord: null,
          community_id: null,
          post_id: null,
          title: null,
          data_point_vertical: null,
          structured_data: null,
          eligible: null,
          parent_has_more: true,
          next_community_id: ID,
        },
      ],
      { limit: 5, childLimit: 5 },
    )
    expect(resumed.results).toEqual([])
    expect(resumed.page_info.has_next_page).toBe(true)
    expect(decodeDataPointCursor(resumed.page_info.end_cursor ?? undefined)).toMatchObject({
      phase: 'community',
      parent_open: true,
      community_id: ID,
    })
  })

  it('builds the open community arm and keeps optional filters outside the child limit', () => {
    const dataPoints = buildDataPointPageQuery(
      {},
      { phase: 'community', parent_open: true, community_id: ID, post_id: OTHER },
      25,
      25,
    )
    expect(dataPoints.sql).toContain('community.id =')
    expect(dataPoints.values).toContain(ID)

    const filtered = buildDataPointPageQuery(
      { topic_id: ID, vertical: 'bank_account' },
      null,
      25,
      25,
    )
    expect(filtered.sql).toContain('data_point_vertical')
    expect(filtered.sql).toContain('post_data_point_topics')
    for (const predicate of filtered.sql.split('FROM posts').slice(1)) {
      const childWhere = predicate.slice(0, predicate.indexOf('LIMIT'))
      expect(childWhere).not.toContain('data_point_vertical')
      expect(childWhere).not.toContain('post_data_point_topics')
    }
  })
})
