import { encodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
import { dataPointLimitLiteral } from './data-point-arms.mts'
import { assembleDataPointPage } from './data-point-assemble.mts'
import { decodeDataPointCursor } from './data-point-cursor.mts'
import { buildDataPointPageQuery } from './data-point-query.mts'
import { assembleStorySourcePage } from './story-source-assemble.mts'
import { decodeStoryCursor } from './story-source-cursor.mts'
import { buildStorySourcePageQuery } from './story-source-query.mts'

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

function storyAfter(overrides: Record<string, unknown>): string {
  return encodeCursor({
    feed_id: ID,
    feed_open: false,
    phase: 'published',
    item_id: null,
    published_at: null,
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

  it('rejects malformed story cursors', () => {
    expect(() => decodeStoryCursor(storyAfter({ feed_id: 'nope' }))).toThrow('Invalid cursor')
    expect(() => decodeStoryCursor(storyAfter({ phase: 'other' }))).toThrow('Invalid cursor')
    expect(() =>
      decodeStoryCursor(storyAfter({ feed_open: true, item_id: 'nope', published_at: null })),
    ).toThrow('Invalid cursor')
    expect(() =>
      decodeStoryCursor(
        storyAfter({
          feed_open: true,
          item_id: OTHER,
          published_at: 'yesterday',
        }),
      ),
    ).toThrow('Invalid cursor')
    expect(() => decodeStoryCursor(storyAfter({ feed_open: true }))).toThrow('Invalid cursor')
    expect(() =>
      decodeStoryCursor(
        storyAfter({
          feed_open: true,
          item_id: OTHER,
          published_at: '9999-99-99T00:00:00.000000Z',
        }),
      ),
    ).toThrow(expect.objectContaining({ statusCode: 400, message: 'Invalid cursor' }))
    expect(() =>
      decodeStoryCursor(
        storyAfter({
          feed_open: true,
          item_id: OTHER,
          published_at: '2021-02-31T00:00:00.000000Z',
        }),
      ),
    ).toThrow(expect.objectContaining({ statusCode: 400, message: 'Invalid cursor' }))
    expect(
      decodeStoryCursor(
        storyAfter({
          feed_open: true,
          item_id: OTHER,
          published_at: '9999-12-31T23:59:59.999999Z',
        }),
      )?.published_at,
    ).toBe('9999-12-31T23:59:59.999999Z')
    expect(() =>
      decodeStoryCursor(storyAfter({ feed_open: false, item_id: OTHER, published_at: null })),
    ).toThrow('Invalid cursor')
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

  it('returns an empty story page and rejects a row the page cannot read', () => {
    expect(assembleStorySourcePage([], { limit: 5, childLimit: 5 }).page_info).toEqual({
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    })
    const resumed = assembleStorySourcePage(
      [
        {
          feed_id: null,
          feed_ord: null,
          item_id: null,
          published_at: null,
          phase: null,
          child_rank: null,
          post_id: null,
          post_type: null,
          eligible: null,
          parent_has_more: true,
          next_feed_id: ID,
        },
      ],
      { limit: 5, childLimit: 5 },
    )
    expect(resumed.page_info.has_next_page).toBe(true)
    expect(decodeStoryCursor(resumed.page_info.end_cursor ?? undefined)?.feed_id).toBe(ID)

    const badPhase = {
      feed_id: ID,
      feed_ord: 1,
      item_id: OTHER,
      published_at: null,
      phase: 'later',
      child_rank: 1,
      post_id: null,
      post_type: null,
      eligible: false,
      parent_has_more: false,
      next_feed_id: null,
    }
    expect(() => assembleStorySourcePage([badPhase], { limit: 5, childLimit: 5 })).toThrow(
      'Invalid story page row',
    )
    expect(() =>
      assembleStorySourcePage([{ ...badPhase, feed_id: 1 as unknown as string, item_id: null }], {
        limit: 5,
        childLimit: 5,
      }),
    ).toThrow('feed_id missing from story page')
  })

  it('builds the open community arm and the similar-item story join', () => {
    const dataPoints = buildDataPointPageQuery(
      {},
      { phase: 'community', parent_open: true, community_id: ID, post_id: OTHER },
      25,
      25,
    )
    expect(dataPoints.sql).toContain('community.id =')
    expect(dataPoints.values).toContain(ID)

    const stories = buildStorySourcePageQuery({
      currentUser: undefined,
      options: { similar_rss_feed_item_id: ID, post_types: ['story'] },
      cursor: null,
      hasSemanticSearch: false,
      hasTextSearch: false,
      pageSize: 25,
      childLimit: 5,
    })
    expect(stories.sql).toContain('similar_rss_feed_item_embedding')
    expect(stories.sql).toContain('is_discoverable')
    expect(stories.values).toContain(ID)

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

    const staff = buildStorySourcePageQuery({
      currentUser: {
        __entity_type: 'user',
        id: ID,
        roles: ['moderator'],
        account_type: null,
      },
      options: { post_types: ['story'] },
      cursor: null,
      hasSemanticSearch: false,
      hasTextSearch: false,
      pageSize: 25,
      childLimit: 5,
    })
    expect(staff.sql).toContain('is_enabled = FALSE')
    expect(staff.sql).not.toContain('is_discoverable')
    expect(staff.sql).not.toContain('view_rss_feed_current_states')
  })
})
