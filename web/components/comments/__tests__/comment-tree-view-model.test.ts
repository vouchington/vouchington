import { describe, expect, it } from 'vitest'
import { projectCommentTree } from '../comment-tree-view-model'
import type { PostsResponseBody } from '@/types/api-responses'

function makeData(): PostsResponseBody {
  return {
    results: [{ id: 'comment-1', __entity_type: 'post', ranking: 0, search_vector_ts: null }],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    posts: {
      'comment-1': { id: 'comment-1' },
      orphan: { id: 'orphan' },
    },
    posts_metrics: {},
    markdown_to_html: { 'comment-1': '<p>kept</p>', orphan: '<p>dropped</p>' },
    post_moderations: {
      'comment-1': [{ id: 'moderation-1' }],
      orphan: [{ id: 'moderation-orphan' }],
    },
    agent_moderation_elections: {
      'moderation-1': { id: 'moderation-1' },
      'moderation-orphan': { id: 'moderation-orphan' },
    },
    election_votes: {
      'comment-1': { id: 'vote-1' },
      'moderation-1': { id: 'vote-2' },
      orphan: { id: 'vote-orphan' },
    },
    post_elections: {
      'comment-1': { id: 'comment-1', votes_count_up: 2, votes_count_down: 1 },
      orphan: { id: 'orphan', votes_count_up: 99, votes_count_down: 0 },
    },
    bookmarks: {
      'comment-1': { save: true },
      orphan: { save: true },
    },
  } as unknown as PostsResponseBody
}

describe('comment tree view model', () => {
  it('keeps only result-referenced comments and their display sidecars', () => {
    const projected = projectCommentTree(makeData())
    expect(Object.keys(projected.posts)).toEqual(['comment-1'])
    expect(projected.markdown_to_html).toEqual({ 'comment-1': '<p>kept</p>' })
    expect(projected).not.toHaveProperty('page_info')
    expect(projected).not.toHaveProperty('posts_metrics')
  })

  it('keeps only moderation elections and votes referenced by retained comments', () => {
    const projected = projectCommentTree(makeData())
    expect(Object.keys(projected.post_moderations ?? {})).toEqual(['comment-1'])
    expect(Object.keys(projected.agent_moderation_elections ?? {})).toEqual(['moderation-1'])
    expect(Object.keys(projected.election_votes ?? {}).toSorted()).toEqual([
      'comment-1',
      'moderation-1',
    ])
  })

  it('filters orphan post elections and bookmarks while retaining referenced values', () => {
    const projected = projectCommentTree(makeData())
    expect(projected.post_elections).toEqual({
      'comment-1': expect.objectContaining({ votes_count_up: 2, votes_count_down: 1 }),
    })
    expect(projected.bookmarks).toEqual({ 'comment-1': { save: true } })
  })
})
