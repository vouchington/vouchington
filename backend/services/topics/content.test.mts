import { describe, expect, it } from 'vitest'
import { createTopicEmbeddingContent } from './content.mts'

describe('topic embedding content', () => {
  it('uses aliases when provided as string array', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: ['alpha', 'beta'],
      markdown: 'Details',
    })

    expect(result.content).toBe('Topic Name\nalpha beta\nDetails')
  })

  it('uses aliases with commas as literal characters', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: ['foo,bar', 'baz'],
      markdown: 'Details',
    })

    expect(result.content).toBe('Topic Name\nfoo,bar baz\nDetails')
  })

  it('preserves quotes and backslashes in alias values', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: ['value with "quote"', 'path\\name'],
      markdown: 'Details',
    })

    expect(result.content).toBe('Topic Name\nvalue with "quote" path\\name\nDetails')
  })

  it('supports alias values that contain spaces', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: ['hello world', 'plain'],
      markdown: 'Details',
    })

    expect(result.content).toBe('Topic Name\nhello world plain\nDetails')
  })

  it('includes literal NULL strings when provided as aliases', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: ['foo', 'NULL', 'bar'],
      markdown: 'Details',
    })

    expect(result.content).toBe('Topic Name\nfoo NULL bar\nDetails')
  })

  it('handles empty aliases arrays', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: [],
    })

    expect(result.content).toBe('Topic Name\n\n')
  })
})
