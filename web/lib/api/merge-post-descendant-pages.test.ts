import { describe, expect, it } from 'vitest'
import { mergePostAncestorPages, mergePostDescendantPages } from './merge-post-descendant-pages'
import type { PostsResponseBody } from '@/types/api-responses'

const pageInfo = (cursor: string | null) => ({
  start_cursor: null,
  end_cursor: cursor,
  has_next_page: cursor !== null,
})

describe('mergePostDescendantPages', () => {
  it('deduplicates descendant references and merges projection sidecars', () => {
    const makePage = (id: string, cursor: string | null): PostsResponseBody =>
      ({
        results: [{ id, __entity_type: 'post' }],
        page_info: pageInfo(cursor),
        posts: { [id]: { id } },
        posts_metrics: { [id]: { count: { descendants: 0 } } },
        markdown_to_html: { [id]: `<p>${id}</p>` },
        election_votes: {
          [id]: {
            __entity_type: 'election_vote',
            user_id: 'user-1',
            choice: 'vouch',
            created_at: '2026-01-01T00:00:00Z',
          },
        },
        bookmarks: { [id]: { id: `bookmark-${id}` } },
      }) as unknown as PostsResponseBody

    const merged = mergePostDescendantPages([
      makePage('comment-1', 'cursor-1'),
      makePage('comment-1', 'cursor-2'),
      makePage('comment-2', null),
    ])
    expect(merged.results.map(result => result.id)).toEqual(['comment-1', 'comment-2'])
    expect(Object.keys(merged.posts)).toEqual(['comment-1', 'comment-2'])
    expect(merged.markdown_to_html?.['comment-2']).toBe('<p>comment-2</p>')
    expect(merged.election_votes?.['comment-1']).toBeDefined()
    expect(merged.bookmarks?.['comment-2']).toBeDefined()
  })
})

describe('mergePostAncestorPages', () => {
  it('pins the root and prepends rootward pages in root-to-target order', () => {
    const makePage = (ids: string[], cursor: string | null): PostsResponseBody =>
      ({
        results: ids.map(id => ({ id, __entity_type: 'post' })),
        page_info: pageInfo(cursor),
        posts: Object.fromEntries(ids.map(id => [id, { id }])),
        markdown_to_html: Object.fromEntries(ids.map(id => [id, `<p>${id}</p>`])),
      }) as unknown as PostsResponseBody

    const merged = mergePostAncestorPages([
      makePage(['root', 'parent-5', 'parent-6', 'target'], 'cursor-1'),
      makePage(['root', 'parent-3', 'parent-4'], 'cursor-2'),
      makePage(['root', 'parent-1', 'parent-2'], null),
    ])

    expect(merged.results.map(result => result.id)).toEqual([
      'root',
      'parent-1',
      'parent-2',
      'parent-3',
      'parent-4',
      'parent-5',
      'parent-6',
      'target',
    ])
    expect(Object.keys(merged.posts).toSorted()).toEqual(
      [
        'root',
        'parent-1',
        'parent-2',
        'parent-3',
        'parent-4',
        'parent-5',
        'parent-6',
        'target',
      ].toSorted(),
    )
    expect(merged.page_info).toEqual(pageInfo(null))
  })
})
