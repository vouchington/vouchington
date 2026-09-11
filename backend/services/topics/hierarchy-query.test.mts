import { describe, expect, it } from 'vitest'
import { TOPIC_CHILD_IDS_QUERY, TOPIC_PARENT_IDS_QUERY } from './hierarchy.mts'

describe('topic hierarchy complete-list queries', () => {
  it.each([
    ['parent', TOPIC_PARENT_IDS_QUERY],
    ['child', TOPIC_CHILD_IDS_QUERY],
  ])('does not silently limit %s relations', (_relation, query) => {
    expect(query).not.toContain('LIMIT')
  })
})
