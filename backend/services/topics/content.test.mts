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
    expect(result.title).toBe('Topic Name')
    expect(result.body).toBe('alpha beta\nDetails')
  })

  it('uses aliases with commas as literal characters', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: ['foo,bar', 'baz'],
      markdown: 'Details',
    })

    expect(result.content).toBe('Topic Name\nbaz foo,bar\nDetails')
  })

  it('preserves quotes and backslashes in alias values', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: ['value with "quote"', 'path\\name'],
      markdown: 'Details',
    })

    expect(result.content).toBe('Topic Name\npath\\name value with "quote"\nDetails')
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

    expect(result.content).toBe('Topic Name\nNULL bar foo\nDetails')
  })

  it('canonicalizes an alias set without depending on database collation or mutating callers', () => {
    const aliases = ['public-media', 'public service media', 'public broadcaster', 'public-media']
    const original = [...aliases]
    const first = createTopicEmbeddingContent({ name: 'Public Media', aliases })
    const second = createTopicEmbeddingContent({
      name: 'Public Media',
      aliases: aliases.toReversed(),
    })
    expect(first.content_sha256).toEqual(second.content_sha256)
    expect(first.body).toBe('public broadcaster public service media public-media\n')
    expect(aliases).toEqual(original)
  })

  it('handles empty aliases arrays', () => {
    const result = createTopicEmbeddingContent({
      name: 'Topic Name',
      aliases: [],
    })

    expect(result.content).toBe('Topic Name\n\n')
  })
})
