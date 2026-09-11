import { describe, expect, it } from 'vitest'
import { getTopicPostSort } from './topic-post-sort'

describe('getTopicPostSort', () => {
  it('preserves relevance sort emitted by search filters', () => {
    expect(getTopicPostSort('relevance', null)).toBe('relevance')
    expect(getTopicPostSort('relevance', { id: 'user-1' } as never)).toBe('relevance')
  })

  it('falls back to viewer-appropriate defaults for unsupported sorts', () => {
    expect(getTopicPostSort('unsupported', null)).toBe('new')
    expect(getTopicPostSort('unsupported', { id: 'user-1' } as never)).toBe('following_new')
  })
})
