import { describe, expect, it } from 'vitest'
import {
  getCommentPlaceholderState,
  maskCommentPlaceholders,
  maskPlaceholderMetrics,
} from './comment-placeholder.mts'
import type { Post, PostMetrics } from './types.mts'

const approved = new Date('2026-01-01T00:00:00Z')

function comment(overrides: Partial<Post> = {}): Post {
  return {
    __entity_type: 'post',
    id: 'c1',
    post_type: 'comment',
    title: '',
    markdown: 'secret text',
    ai_summary_markdown: 'secret summary',
    root_post_id: 'r1',
    parent_post_id: 'r1',
    created_by_id: 'author',
    created_by: { id: 'author' },
    approved_at: approved,
    deleted_at: null,
    ...overrides,
  } as unknown as Post
}

describe('comment placeholders', () => {
  it('states why a comment is a placeholder, and not for staff, authors or cleared comments', () => {
    const viewer = { id: 'viewer', roles: [] } as never
    const moderator = { id: 'mod', roles: ['moderator'] } as never
    const author = { id: 'author', roles: [] } as never
    const pending = comment({ approved_at: null })

    expect(getCommentPlaceholderState(comment(), viewer)).toBeNull()
    expect(getCommentPlaceholderState(comment({ deleted_at: approved }), moderator)).toBe('deleted')
    expect(getCommentPlaceholderState(pending, viewer)).toBe('unmoderated')
    expect(getCommentPlaceholderState(pending, null)).toBe('unmoderated')
    expect(getCommentPlaceholderState(pending, author)).toBeNull()
    expect(getCommentPlaceholderState(pending, moderator)).toBeNull()
  })

  it('removes text and author from a placeholder and leaves other posts alone', () => {
    const post = comment({ deleted_at: approved })
    const live = comment({ id: 'c2' })
    const discussion = comment({ id: 'd1', post_type: 'discussion', deleted_at: approved })
    const [masked, kept, other, missing] = maskCommentPlaceholders(
      [post, live, discussion, null],
      null,
    )

    expect(masked).toMatchObject({
      id: 'c1',
      placeholder_state: 'deleted',
      title: '',
      markdown: '',
      ai_summary_markdown: '',
      created_by_id: null,
      created_by: null,
      parent_post_id: 'r1',
      root_post_id: 'r1',
    })
    expect(JSON.stringify(masked)).not.toContain('secret')
    expect(kept).toBe(live)
    expect(other).toBe(discussion)
    expect(missing).toBeNull()
  })

  it('reduces placeholder metrics to its reply counts and leaves others untouched', () => {
    const metrics = (id: string) =>
      ({
        id,
        count: { descendants: 4, children: 2 },
        bookmarks: { follow: 5, save: 6 },
      }) as PostMetrics
    const placeholder = { id: 'p', placeholder_state: 'deleted' as const }
    const readable = { id: 'r' }

    const [masked, untouched, missing] = maskPlaceholderMetrics(
      [placeholder, readable],
      [metrics('p'), metrics('r'), null],
    )

    expect(masked).toMatchObject({
      count: { descendants: 4, children: 2 },
      bookmarks: { follow: 0, save: 0 },
    })
    expect(untouched).toEqual(metrics('r'))
    expect(missing).toBeNull()
  })
})
