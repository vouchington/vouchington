import { describe, expect, it } from 'vitest'

import { buildCommentsForSchema, buildInteractionStats } from '../post-schema-helpers'

import type { PostsResponseBody } from '@/types/api-responses'

describe('post-schema-helpers', () => {
  describe('buildCommentsForSchema', () => {
    it('returns empty array when descendants have no results', () => {
      const descendants: PostsResponseBody = {
        results: [],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        posts: {},
        posts_metrics: {},
        post_elections: {},
        markdown_to_html: {},
      }

      const comments = buildCommentsForSchema(descendants)
      expect(comments).toEqual([])
    })

    it('builds comment array from descendants with author and text', () => {
      const descendants: PostsResponseBody = {
        results: [{ __entity_type: 'post', id: 'comment1', ranking: 1, search_vector_ts: null }],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        posts: {
          comment1: {
            id: 'comment1',
            post_type: 'comment',
            title: '',
            markdown: 'Great discussion',
            created_at: '2026-03-01T12:00:00.000Z',
            updated_at: '2026-03-01T12:00:00.000Z',
            root_id: null,
            created_by_id: 'user1',
            created_by: {
              __entity_type: 'user',
              id: 'user1',
              username: 'alice',
              profile_image_id: null,
            },
            deleted_at: null,
            deleted_by_id: null,
            archived_at: null,
            archived_by_id: null,
            broadcast: 'everyone',
            privacy: 'public',
            is_anonymous: false,

            community_id: null,

            clearance_status: 'approved',
          },
        },
        posts_metrics: {},
        post_elections: {},
        markdown_to_html: {
          comment1: '<p>Great discussion</p>',
        },
      }

      const comments = buildCommentsForSchema(descendants)
      expect(comments).toHaveLength(1)
      expect(comments[0]).toEqual({
        authorName: 'alice',
        datePublished: '2026-03-01T12:00:00.000Z',
        text: 'Great discussion',
      })
    })

    it('omits author for anonymous comments', () => {
      const descendants: PostsResponseBody = {
        results: [{ __entity_type: 'post', id: 'comment1', ranking: 1, search_vector_ts: null }],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        posts: {
          comment1: {
            id: 'comment1',
            post_type: 'comment',
            title: '',
            markdown: 'Anonymous reply',
            created_at: '2026-03-01T13:00:00.000Z',
            updated_at: '2026-03-01T13:00:00.000Z',
            root_id: null,
            created_by_id: 'user2',
            created_by: {
              __entity_type: 'user',
              id: 'user2',
              username: 'bob',
              profile_image_id: null,
            },
            deleted_at: null,
            deleted_by_id: null,
            archived_at: null,
            archived_by_id: null,
            broadcast: 'everyone',
            privacy: 'public',
            is_anonymous: true,

            community_id: null,

            clearance_status: 'approved',
          },
        },
        posts_metrics: {},
        post_elections: {},
        markdown_to_html: {
          comment1: '<p>Anonymous reply</p>',
        },
      }

      const comments = buildCommentsForSchema(descendants)
      expect(comments).toHaveLength(1)
      expect(comments[0]).not.toHaveProperty('authorName')
      expect(comments[0]).toEqual({
        datePublished: '2026-03-01T13:00:00.000Z',
        text: 'Anonymous reply',
      })
    })

    it('limits to 20 comments', () => {
      const results = Array.from({ length: 25 }, (_, i) => ({
        __entity_type: 'post' as const,
        id: `comment${i}`,
        ranking: 1,
        search_vector_ts: null,
      }))

      const posts: Record<string, any> = {}
      const markdown_to_html: Record<string, string> = {}

      results.forEach((_, i) => {
        posts[`comment${i}`] = {
          id: `comment${i}`,
          post_type: 'comment',
          title: '',
          markdown: `Comment ${i}`,
          created_at: '2026-03-01T12:00:00.000Z',
          updated_at: '2026-03-01T12:00:00.000Z',
          root_id: null,
          created_by_id: `user${i}`,
          created_by: {
            __entity_type: 'user',
            id: `user${i}`,
            username: `user${i}`,
            profile_image_id: null,
          },
          deleted_at: null,
          deleted_by_id: null,
          archived_at: null,
          archived_by_id: null,
          broadcast: 'everyone',
          privacy: 'public',
          is_anonymous: false,

          community_id: null,

          clearance_status: 'approved',
        }
        markdown_to_html[`comment${i}`] = `<p>Comment ${i}</p>`
      })

      const descendants: PostsResponseBody = {
        results,
        page_info: { has_next_page: true, end_cursor: 'cursor', start_cursor: null },
        posts,
        posts_metrics: {},
        post_elections: {},
        markdown_to_html,
      }

      const comments = buildCommentsForSchema(descendants)
      expect(comments).toHaveLength(20)
    })

    it('filters out comments with empty text after excerpt creation', () => {
      const descendants: PostsResponseBody = {
        results: [
          { __entity_type: 'post', id: 'comment1', ranking: 1, search_vector_ts: null },
          { __entity_type: 'post', id: 'comment2', ranking: 1, search_vector_ts: null },
        ],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        posts: {
          comment1: {
            id: 'comment1',
            post_type: 'comment',
            title: '',
            markdown: 'Valid comment',
            created_at: '2026-03-01T12:00:00.000Z',
            updated_at: '2026-03-01T12:00:00.000Z',
            root_id: null,
            created_by_id: 'user1',
            created_by: {
              __entity_type: 'user',
              id: 'user1',
              username: 'alice',
              profile_image_id: null,
            },
            deleted_at: null,
            deleted_by_id: null,
            archived_at: null,
            archived_by_id: null,
            broadcast: 'everyone',
            privacy: 'public',
            is_anonymous: false,

            community_id: null,

            clearance_status: 'approved',
          },
          comment2: {
            id: 'comment2',
            post_type: 'comment',
            title: '',
            markdown: '',
            created_at: '2026-03-01T13:00:00.000Z',
            updated_at: '2026-03-01T13:00:00.000Z',
            root_id: null,
            created_by_id: 'user2',
            created_by: {
              __entity_type: 'user',
              id: 'user2',
              username: 'bob',
              profile_image_id: null,
            },
            deleted_at: null,
            deleted_by_id: null,
            archived_at: null,
            archived_by_id: null,
            broadcast: 'everyone',
            privacy: 'public',
            is_anonymous: false,

            community_id: null,

            clearance_status: 'approved',
          },
        },
        posts_metrics: {},
        post_elections: {},
        markdown_to_html: {
          comment1: '<p>Valid comment</p>',
          comment2: '',
        },
      }

      const comments = buildCommentsForSchema(descendants)
      expect(comments).toHaveLength(1)
      expect(comments[0]?.text).toBe('Valid comment')
    })
  })
})
