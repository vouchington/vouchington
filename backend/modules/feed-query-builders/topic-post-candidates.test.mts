import { describe, expect, it } from 'vitest'
import {
  buildTopicAliasMembershipExists,
  buildTopicMembershipExists,
  buildUniversalTopicMembershipExists,
} from './topic-post-candidates.mts'

describe('topic membership column validation', () => {
  it('binds one topic from its relation before probing posts', () => {
    const membership = buildTopicMembershipExists('candidate_post.id', 'topic-id')
    expect(membership.text).toContain('candidate_post.id IN (')
    expect(membership.text).toContain('rel.subject_id')
    expect(membership.text).toContain('alias_relation.subject_id')
    expect(membership.values).toEqual(['topic-id', 'topic-id'])
  })

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
