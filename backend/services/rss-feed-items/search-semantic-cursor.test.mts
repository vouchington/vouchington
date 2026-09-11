import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import {
  getSemanticRssFeedItemCursor,
  getSemanticRssFeedItemCursorScope,
} from './search-semantic-cursor.mts'

const ID = '019e0000-0800-7000-8000-000000000001'
const options = {
  semantic_search_query: '  Developer\nTools  ',
  topic_ids: ['topic-b', 'topic-a', 'topic-b'],
  media_types: ['video', 'article', 'video'] as Array<'article' | 'audio' | 'video'>,
}

function validCursor(overrides: Record<string, unknown> = {}): string {
  return encodeCursor({
    ranking_score: 0.9,
    published_at: '2025-01-01T00:00:00.000000Z',
    id: ID,
    scope: getSemanticRssFeedItemCursorScope(options),
    ...overrides,
  })
}

describe('semantic RSS search cursor', () => {
  it('normalizes equivalent query and array filter scopes', () => {
    expect(getSemanticRssFeedItemCursorScope(options)).toBe(
      getSemanticRssFeedItemCursorScope({
        semantic_search_query: 'developer tools',
        topic_ids: ['topic-a', 'topic-b'],
        media_types: ['article', 'video'],
      }),
    )
  })

  it.each([
    [
      'missing key',
      encodeCursor({
        ranking_score: 0.9,
        published_at: '2025-01-01T00:00:00.000000Z',
        id: ID,
        scope: 'scope',
      }),
    ],
    ['extra key', validCursor({ extra: true })],
    ['nonfinite score', validCursor({ ranking_score: Number.POSITIVE_INFINITY })],
    ['imprecise timestamp', validCursor({ published_at: '2025-01-01T00:00:00.000Z' })],
  ])('rejects a cursor with a %s', (_name, after) => {
    expect(() => getSemanticRssFeedItemCursor(after, options)).toThrow(
      'Invalid semantic search cursor',
    )
  })

  it('preserves the shared UUID cursor validation error', () => {
    expect(() => getSemanticRssFeedItemCursor(validCursor({ id: 'not-a-uuid' }), options)).toThrow(
      'Invalid cursor: id is not a valid UUID',
    )
  })

  it('rejects cursors scoped to another query, filter, or viewer', () => {
    const queryCursor = validCursor({
      scope: getSemanticRssFeedItemCursorScope({ ...options, semantic_search_query: 'other' }),
    })
    const filterCursor = validCursor({
      scope: getSemanticRssFeedItemCursorScope({ ...options, topic_ids: ['other-topic'] }),
    })
    const viewerCursor = validCursor({
      scope: getSemanticRssFeedItemCursorScope({
        ...options,
        read: true,
        currentUserId: '019e0000-0100-7000-8000-000000000001',
      }),
    })
    for (const after of [queryCursor, filterCursor, viewerCursor]) {
      expect(() => getSemanticRssFeedItemCursor(after, options)).toThrow(
        'Invalid semantic search cursor',
      )
    }
  })
})
