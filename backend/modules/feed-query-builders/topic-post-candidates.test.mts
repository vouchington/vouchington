import { describe, expect, it } from 'vitest'
import {
  buildTopicAliasMembershipExists,
  buildTopicMembershipExists,
  buildUniversalTopicMembershipExists,
} from './topic-post-candidates.mts'

describe('topic membership column validation', () => {
  it('probes a hashtag topic by the post id, never from a topic-side pool', () => {
    const membership = buildTopicMembershipExists('candidate_post.id', 'topic-id')
    expect(membership.text).toContain('direct_relation.subject_id = candidate_post.id')
    expect(membership.text).toContain('alias_relation.subject_id = candidate_post.id')
    expect(membership.text).not.toContain(' IN (')
    expect(membership.values).toEqual(['topic-id', 'topic-id'])
  })

  it('probes a listed post by its id for a universal topic', () => {
    const membership = buildUniversalTopicMembershipExists('posts.id', 'topic-id')
    expect(membership.text).toContain('direct_relation.subject_id = posts.id')
    expect(membership.text).toContain('alias_relation.subject_id = posts.id')
    expect(membership.text).toContain('alias.topic_id')
    expect(membership.text).not.toContain('candidate.post_id')
    expect(membership.values).toEqual(['topic-id', 'topic-id', 'topic-id', 'topic-id'])
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
