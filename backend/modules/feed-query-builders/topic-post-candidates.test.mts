import { describe, expect, it } from 'vitest'
import {
  buildTopicAliasMembershipExists,
  buildTopicMembershipExists,
  buildUniversalTopicMembershipExists,
} from './topic-post-candidates.mts'

describe('topic membership column validation', () => {
  it.each([
    buildTopicMembershipExists,
    buildUniversalTopicMembershipExists,
    buildTopicAliasMembershipExists,
  ])('rejects an unqualified or injected post column', builder => {
    expect(() => builder('id', 'topic-id')).toThrow('Invalid postIdColumn format: id')
    expect(() => builder('posts.id; DROP TABLE users', 'topic-id')).toThrow(
      'Invalid postIdColumn format: posts.id; DROP TABLE users',
    )
  })
})
