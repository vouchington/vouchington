import { describe, it, expect } from 'vitest'
import { VALID_RSS_POST_TYPES } from '@ts-shared/feed-capabilities'
import { buildTopicPostsRssUrl } from './posts-rss-url'

describe('buildTopicPostsRssUrl', () => {
  it('returns unfiltered base URL when no post_types param', () => {
    expect(buildTopicPostsRssUrl('test-book', {})).toBe('/rss/posts?topics=test-book')
  })

  it('appends post_type=review for single review filter', () => {
    expect(buildTopicPostsRssUrl('test-book', { post_types: 'review' })).toBe(
      '/rss/posts?topics=test-book&post_type=review',
    )
  })

  it('appends post_type=discussion for single discussion filter', () => {
    expect(buildTopicPostsRssUrl('test-book', { post_types: 'discussion' })).toBe(
      '/rss/posts?topics=test-book&post_type=discussion',
    )
  })

  it('appends post_type=data_point for single data_point filter', () => {
    expect(buildTopicPostsRssUrl('test-book', { post_types: 'data_point' })).toBe(
      '/rss/posts?topics=test-book&post_type=data_point',
    )
  })

  it('returns unfiltered URL when multiple types selected', () => {
    expect(buildTopicPostsRssUrl('test-book', { post_types: 'review,discussion' })).toBe(
      '/rss/posts?topics=test-book',
    )
  })

  it('returns unfiltered URL for story (not supported by RSS endpoint)', () => {
    expect(buildTopicPostsRssUrl('test-book', { post_types: 'story' })).toBe(
      '/rss/posts?topics=test-book',
    )
  })

  it('returns unfiltered URL for blog_post (not supported by RSS endpoint)', () => {
    expect(buildTopicPostsRssUrl('test-book', { post_types: 'blog_post' })).toBe(
      '/rss/posts?topics=test-book',
    )
  })

  it('accepts values from the shared RSS post type catalog', () => {
    for (const postType of VALID_RSS_POST_TYPES) {
      expect(buildTopicPostsRssUrl('test-book', { post_types: postType })).toBe(
        `/rss/posts?topics=test-book&post_type=${postType}`,
      )
    }
  })

  it('returns unfiltered URL for empty post_types string', () => {
    expect(buildTopicPostsRssUrl('test-book', { post_types: '' })).toBe(
      '/rss/posts?topics=test-book',
    )
  })

  it('returns unfiltered URL when post_types is an array', () => {
    expect(buildTopicPostsRssUrl('test-book', { post_types: ['review'] })).toBe(
      '/rss/posts?topics=test-book',
    )
  })

  it('encodes special characters in topic slug', () => {
    expect(buildTopicPostsRssUrl('c++ primer', { post_types: 'review' })).toBe(
      '/rss/posts?topics=c%2B%2B%20primer&post_type=review',
    )
  })

  it('encodes special characters in topic slug for base URL', () => {
    expect(buildTopicPostsRssUrl('c++ primer', {})).toBe('/rss/posts?topics=c%2B%2B%20primer')
  })
})
