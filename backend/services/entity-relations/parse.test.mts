import { describe, expect, it } from 'vitest'
import { parseEntityRelationCreateInput, parseEntityRelationSearchInput } from './parse.mts'

describe('entity relation route parsing', () => {
  it('applies the post related URL summary contract', () => {
    const parsed = parseEntityRelationSearchInput({
      entityType: 'post',
      entityId: crypto.randomUUID(),
      predicate: 'related',
      objectType: 'url',
      summary: true,
    })

    expect(parsed.summary).toBe(true)
    expect(parsed.options).toMatchObject({
      limit: 10,
      positiveNetVoteScore: true,
      sort: 'best',
    })
  })

  it('rejects summary mode for other relation tuples', () => {
    expect(() =>
      parseEntityRelationSearchInput({
        entityType: 'post',
        entityId: crypto.randomUUID(),
        predicate: 'category',
        objectType: 'topic',
        summary: true,
      }),
    ).toThrow(/summary is only allowed/)
  })

  it('rejects filters, sorting, and limits owned by summary mode', () => {
    for (const conflict of [
      { limit: 5 },
      { sort: 'best' },
      { positiveNetVoteScore: true },
      { minNetVoteScore: 1 },
    ]) {
      expect(() =>
        parseEntityRelationSearchInput({
          entityType: 'post',
          entityId: crypto.randomUUID(),
          predicate: 'related',
          objectType: 'url',
          summary: true,
          ...conflict,
        }),
      ).toThrow(/summary owns/)
    }
  })

  it('clamps search options and passes through rss feed item id as plain uuid', () => {
    const parsed = parseEntityRelationSearchInput({
      entityType: 'rss_feed_item',
      entityId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      predicate: 'category',
      objectType: 'topic',
      minNetVoteScore: '2',
      limit: '999',
      sort: 'newest',
    })

    expect(parsed.subjectId).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(parsed.options.limit).toBe(200)
    expect(parsed.options.minNetVoteScore).toBe(2)
    expect(parsed.options.sort).toBe('newest')
  })

  it('rejects invalid entity relation predicates', () => {
    expect(() =>
      parseEntityRelationSearchInput({
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'not-a-predicate',
        objectType: 'topic',
      }),
    ).toThrow(/Invalid predicate/)
  })

  it('rejects non-integer limits', () => {
    expect(() =>
      parseEntityRelationSearchInput({
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'category',
        objectType: 'topic',
        limit: '1.5',
      }),
    ).toThrow(/limit must be a valid integer/)
  })

  it('rejects minNetVoteScore for non-election relations', () => {
    expect(() =>
      parseEntityRelationSearchInput({
        entityType: 'topic',
        entityId: 'topic-1',
        predicate: 'parent',
        objectType: 'topic',
        minNetVoteScore: '1',
      }),
    ).toThrow(/minNetVoteScore is only allowed/)
  })

  it('parses positiveNetVoteScore: true to true', () => {
    const parsed = parseEntityRelationSearchInput({
      entityType: 'rss_feed_item',
      entityId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      predicate: 'category',
      objectType: 'topic',
      positiveNetVoteScore: true,
    })
    expect(parsed.options.positiveNetVoteScore).toBe(true)
  })

  it('parses positiveNetVoteScore: string "true" to true', () => {
    const parsed = parseEntityRelationSearchInput({
      entityType: 'rss_feed_item',
      entityId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      predicate: 'category',
      objectType: 'topic',
      positiveNetVoteScore: 'true',
    })
    expect(parsed.options.positiveNetVoteScore).toBe(true)
  })

  it('rejects positiveNetVoteScore: true for non-election relations', () => {
    expect(() =>
      parseEntityRelationSearchInput({
        entityType: 'topic',
        entityId: 'topic-1',
        predicate: 'parent',
        objectType: 'topic',
        positiveNetVoteScore: true,
      }),
    ).toThrow(/positiveNetVoteScore is only allowed/)
  })

  it('does not reject positiveNetVoteScore: false for non-election relations', () => {
    expect(() =>
      parseEntityRelationSearchInput({
        entityType: 'topic',
        entityId: 'topic-1',
        predicate: 'parent',
        objectType: 'topic',
        positiveNetVoteScore: false,
      }),
    ).not.toThrow()
  })

  it('parses positiveNetVoteScore: "false" to false (no filter)', () => {
    const parsed = parseEntityRelationSearchInput({
      entityType: 'post',
      entityId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      predicate: 'category',
      objectType: 'topic',
      positiveNetVoteScore: 'false',
    })
    expect(parsed.options.positiveNetVoteScore).toBe(false)
  })

  it('parses positiveNetVoteScore: undefined as undefined', () => {
    const parsed = parseEntityRelationSearchInput({
      entityType: 'post',
      entityId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      predicate: 'category',
      objectType: 'topic',
    })
    expect(parsed.options.positiveNetVoteScore).toBeUndefined()
  })

  it('parses positiveNetVoteScore: "" (empty string) to false', () => {
    const parsed = parseEntityRelationSearchInput({
      entityType: 'post',
      entityId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      predicate: 'category',
      objectType: 'topic',
      positiveNetVoteScore: '',
    })
    expect(parsed.options.positiveNetVoteScore).toBe(false)
  })

  it('parses create input for topic objects', () => {
    const parsed = parseEntityRelationCreateInput({
      entityType: 'post',
      entityId: 'post-1',
      predicate: 'category',
      objectType: 'topic',
      objectId: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
    })

    expect(parsed.objectIds).toEqual([{ id: 'f47ac10b-58cc-4372-a567-0e02b2c3d480' }])
  })

  it('rejects user subjects for search', () => {
    expect(() =>
      parseEntityRelationSearchInput({
        entityType: 'user',
        entityId: crypto.randomUUID(),
        predicate: 'follow',
        objectType: 'user',
      }),
    ).toThrow(/bookmarks/)
  })

  it('rejects user subjects for create', () => {
    expect(() =>
      parseEntityRelationCreateInput({
        entityType: 'user',
        entityId: crypto.randomUUID(),
        predicate: 'follow',
        objectType: 'user',
        objectId: crypto.randomUUID(),
      }),
    ).toThrow(/bookmarks/)
  })
})
