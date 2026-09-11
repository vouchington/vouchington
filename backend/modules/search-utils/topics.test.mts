import { it, expect, describe } from 'vitest'
import { detectTopicSort } from './topics.mts'

describe('topics', () => {
  it('detectTopicSort returns "new" when no search query', () => {
    expect(detectTopicSort({})).toBe('new')
  })

  it('detectTopicSort returns "relevance" when text search provided', () => {
    expect(detectTopicSort({ text_search_query: 'hello' })).toBe('relevance')
  })

  it('detectTopicSort returns "relevance" when semantic search provided', () => {
    expect(detectTopicSort({ semantic_search_query: 'hello' })).toBe('relevance')
  })

  it('detectTopicSort returns "relevance" when similar_post_id provided', () => {
    expect(detectTopicSort({ similar_post_id: 'post-123' })).toBe('relevance')
  })

  it('detectTopicSort returns "relevance" when similar_topic_id provided', () => {
    expect(detectTopicSort({ similar_topic_id: 'topic-123' })).toBe('relevance')
  })

  it('detectTopicSort returns "new" for whitespace-only text search', () => {
    expect(detectTopicSort({ text_search_query: '   ' })).toBe('new')
  })

  it('detectTopicSort returns "new" for whitespace-only semantic search', () => {
    expect(detectTopicSort({ semantic_search_query: '   ' })).toBe('new')
  })

  it('detectTopicSort respects explicit sort option', () => {
    expect(detectTopicSort({ text_search_query: 'hello', sort: 'best' })).toBe('best')
    expect(detectTopicSort({ sort: 'best' })).toBe('best')
  })
})
