import { describe, expect, it } from 'vitest'
import {
  keyedTopicAliasMembershipExists,
  keyedTopicMembershipExists,
  keyedUniversalTopicMembershipExists,
} from './topic-membership-probes.mts'

describe('search topic membership probes', () => {
  it('probes a hashtag topic by the post id, never from a topic-side pool', () => {
    const membership = keyedTopicMembershipExists('candidate_post.id', 'topic-id')
    expect(membership.text).toContain('direct_relation.subject_id = candidate_post.id')
    expect(membership.text).toContain('alias_relation.subject_id = candidate_post.id')
    expect(membership.text).toContain('LIMIT 1')
    expect(membership.text).not.toContain(' IN (')
    expect(membership.values).toEqual(['topic-id', 'topic-id'])
  })

  it('probes a listed post by its id for a universal topic', () => {
    const membership = keyedUniversalTopicMembershipExists('posts.id', 'topic-id')
    expect(membership.text).toContain('rating.post_id = posts.id')
    expect(membership.text).toContain('data_point.post_id = posts.id')
    expect(membership.values).toEqual(['topic-id', 'topic-id', 'topic-id', 'topic-id'])
  })

  it('probes one exact alias', () => {
    expect(keyedTopicAliasMembershipExists('posts.id', 'alias-id').values).toEqual(['alias-id'])
  })

  it.each([
    keyedTopicMembershipExists,
    keyedUniversalTopicMembershipExists,
    keyedTopicAliasMembershipExists,
  ])('rejects an unqualified post id column', build => {
    expect(() => build('id; DROP TABLE posts', 'x')).toThrow('Invalid postIdColumn format')
  })
})
