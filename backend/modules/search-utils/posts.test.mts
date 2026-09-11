import { it, expect, describe } from 'vitest'
import { hasTextSearch, hasSemanticSearch, detectSearchSort } from './posts.mts'
import { clampLimit } from './limits.mts'

describe('posts', () => {
  // hasTextSearch tests
  it('hasTextSearch returns true for valid query', () => {
    expect(hasTextSearch({ text_search_query: 'hello' })).toBe(true)
  })

  it('hasTextSearch returns false for empty string', () => {
    expect(hasTextSearch({ text_search_query: '' })).toBe(false)
  })

  it('hasTextSearch returns false for whitespace only', () => {
    expect(hasTextSearch({ text_search_query: '   ' })).toBe(false)
  })

  it('hasTextSearch returns false for undefined', () => {
    expect(hasTextSearch({})).toBe(false)
  })

  // hasSemanticSearch tests
  it('hasSemanticSearch returns true for valid query', () => {
    expect(hasSemanticSearch({ semantic_search_query: 'hello' })).toBe(true)
  })

  it('hasSemanticSearch returns false for empty string', () => {
    expect(hasSemanticSearch({ semantic_search_query: '' })).toBe(false)
  })

  it('hasSemanticSearch returns false for whitespace only', () => {
    expect(hasSemanticSearch({ semantic_search_query: '   ' })).toBe(false)
  })

  it('hasSemanticSearch returns false for undefined', () => {
    expect(hasSemanticSearch({})).toBe(false)
  })

  // detectSearchSort tests
  it('detectSearchSort returns "new" when no search query', () => {
    expect(detectSearchSort({})).toBe('new')
  })

  it('detectSearchSort returns "relevance" when text search provided', () => {
    expect(detectSearchSort({ text_search_query: 'hello' })).toBe('relevance')
  })

  it('detectSearchSort returns "relevance" when semantic search provided', () => {
    expect(detectSearchSort({ semantic_search_query: 'hello' })).toBe('relevance')
  })

  it('detectSearchSort returns "relevance" when similar_post_id provided', () => {
    expect(detectSearchSort({ similar_post_id: 'post-123' })).toBe('relevance')
  })

  it('detectSearchSort returns "relevance" when similar_topic_id provided', () => {
    expect(detectSearchSort({ similar_topic_id: 'topic-123' })).toBe('relevance')
  })

  it('detectSearchSort returns "relevance" when similar_rss_feed_item_id provided', () => {
    expect(
      detectSearchSort({
        similar_rss_feed_item_id: '123e4567-e89b-12d3-a456-426614174000:guid-123',
      }),
    ).toBe('relevance')
  })

  it('detectSearchSort respects explicit sort option', () => {
    expect(detectSearchSort({ text_search_query: 'hello', sort: 'best' })).toBe('best')
    expect(detectSearchSort({ sort: 'best' })).toBe('best')
  })

  it('detectSearchSort does not treat empty string sort as absent', () => {
    expect(detectSearchSort({ text_search_query: 'hello', sort: '' as never })).toBe('')
  })

  // clampLimit tests
  it('clampLimit returns default 25 for undefined', () => {
    expect(clampLimit()).toBe(25)
  })

  it('clampLimit clamps to minimum 1', () => {
    expect(clampLimit(0)).toBe(1)
    expect(clampLimit(-5)).toBe(1)
    expect(clampLimit(-100)).toBe(1)
  })

  it('clampLimit clamps to maximum 100', () => {
    expect(clampLimit(101)).toBe(100)
    expect(clampLimit(500)).toBe(100)
    expect(clampLimit(1000)).toBe(100)
  })

  it('clampLimit allows values within range', () => {
    expect(clampLimit(1)).toBe(1)
    expect(clampLimit(25)).toBe(25)
    expect(clampLimit(50)).toBe(50)
    expect(clampLimit(100)).toBe(100)
  })
})
