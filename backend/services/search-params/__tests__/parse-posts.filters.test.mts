import { describe, it, expect } from 'vitest'
import { parsePostsSearchParams } from '../parse-posts.mts'

describe('parsePostsSearchParams', () => {
  describe('q shorthand for text_search_query', () => {
    it('maps q to text_search_query', async () => {
      const { searchOptions } = await parsePostsSearchParams({ q: 'credit cards' })
      expect(searchOptions.text_search_query).toBe('credit cards')
    })

    it('does not override explicit text_search_query with q', async () => {
      const { searchOptions } = await parsePostsSearchParams({
        q: 'from q',
        text_search_query: 'explicit',
      })
      expect(searchOptions.text_search_query).toBe('explicit')
    })

    it('ignores empty q', async () => {
      const { searchOptions } = await parsePostsSearchParams({ q: '' })
      expect(searchOptions.text_search_query).toBeUndefined()
    })

    it('does not set text_search_query when q is absent', async () => {
      const { searchOptions } = await parsePostsSearchParams({})
      expect(searchOptions.text_search_query).toBeUndefined()
    })
  })

  describe('post_types filter', () => {
    it('parses article post type', async () => {
      const { searchOptions } = await parsePostsSearchParams({ post_types: 'article' })
      expect(searchOptions.post_types).toEqual(['article'])
    })

    it('parses blog_post post type', async () => {
      const { searchOptions } = await parsePostsSearchParams({ post_types: 'blog_post' })
      expect(searchOptions.post_types).toEqual(['blog_post'])
    })

    it('parses story post type', async () => {
      const { searchOptions } = await parsePostsSearchParams({ post_types: 'story' })
      expect(searchOptions.post_types).toEqual(['story'])
    })

    it('parses multiple post types including article and blog_post', async () => {
      const { searchOptions } = await parsePostsSearchParams({
        post_types: 'article,blog_post,review',
      })
      expect(searchOptions.post_types).toEqual(['article', 'blog_post', 'review'])
    })

    it('omits post_types when none provided', async () => {
      const { searchOptions } = await parsePostsSearchParams({})
      expect(searchOptions.post_types).toBeUndefined()
    })
  })

  describe('pagination defaults', () => {
    it('does not expose the internal omitLimit option through query parameters', async () => {
      const { searchOptions } = await parsePostsSearchParams({ omitLimit: 'true' })
      expect(searchOptions).not.toHaveProperty('omitLimit')
    })

    it('defaults limit to 25', async () => {
      const { searchOptions } = await parsePostsSearchParams({})
      expect(searchOptions.limit).toBe(25)
    })

    it('respects custom limit', async () => {
      const { searchOptions } = await parsePostsSearchParams({ limit: '50' })
      expect(searchOptions.limit).toBe(50)
    })

    it('clamps limit to max 100', async () => {
      const { searchOptions } = await parsePostsSearchParams({ limit: '200' })
      expect(searchOptions.limit).toBe(100)
    })
  })

  describe('sort parameter', () => {
    it('parses valid sort values', async () => {
      const { searchOptions: opts1 } = await parsePostsSearchParams({ sort: 'new' })
      expect(opts1.sort).toBe('new')

      const { searchOptions: opts2 } = await parsePostsSearchParams({ sort: 'best' })
      expect(opts2.sort).toBe('best')

      const { searchOptions: opts3 } = await parsePostsSearchParams({ sort: 'relevance' })
      expect(opts3.sort).toBe('relevance')

      const { searchOptions: opts4 } = await parsePostsSearchParams({ sort: 'following_new' })
      expect(opts4.sort).toBe('following_new')
    })

    it('ignores invalid sort values', async () => {
      const { searchOptions } = await parsePostsSearchParams({ sort: 'invalid' })
      expect(searchOptions.sort).toBeUndefined()
    })
  })

  describe('shouldReturnEmpty', () => {
    it('returns shouldReturnEmpty=false for basic queries', async () => {
      const { shouldReturnEmpty } = await parsePostsSearchParams({})
      expect(shouldReturnEmpty).toBe(false)
    })

    it('returns shouldReturnEmpty=true for non-existent creator', async () => {
      const { shouldReturnEmpty } = await parsePostsSearchParams({
        creator: 'nonexistent-user-slug-xyz',
      })
      expect(shouldReturnEmpty).toBe(true)
    })

    it('returns shouldReturnEmpty=true for invalid story_id', async () => {
      const { shouldReturnEmpty } = await parsePostsSearchParams({
        story_id: 'not-a-uuid',
      })
      expect(shouldReturnEmpty).toBe(true)
    })
  })
})
