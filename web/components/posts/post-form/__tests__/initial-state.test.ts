import { describe, it, expect } from 'vitest'
import { toDataPointTopic, getInitialStructuredData } from '../initial-state'
import type { Topic } from '@/types/topics'
import type { Post } from '@/types/posts'

function makeTopic(topic_type: string): Topic {
  return { id: 't1', name: 'Test Topic', topic_type, slug: 't1' } as Topic
}

describe('toDataPointTopic', () => {
  it('returns credit_card vertical for card topic_type', () => {
    expect(toDataPointTopic(makeTopic('card'))).toEqual({
      id: 't1',
      name: 'Test Topic',
      vertical: 'credit_card',
    })
  })

  it('returns bank_account vertical for bank_account topic_type', () => {
    expect(toDataPointTopic(makeTopic('bank_account'))).toEqual({
      id: 't1',
      name: 'Test Topic',
      vertical: 'bank_account',
    })
  })

  it('returns undefined for unsupported topic types', () => {
    expect(toDataPointTopic(makeTopic('rewards_program'))).toBeUndefined()
  })
})

describe('getInitialStructuredData', () => {
  it('returns empty object when no post and no initialDataPointTopic', () => {
    expect(getInitialStructuredData({})).toEqual({})
  })

  it('returns structured data with topic_ids and topic_name when only initialDataPointTopic provided', () => {
    expect(
      getInitialStructuredData({
        initialDataPointTopic: { id: 't1', name: 'Chase Sapphire', vertical: 'credit_card' },
      }),
    ).toEqual({ topic_ids: ['t1'], topic_name: 'Chase Sapphire' })
  })

  it('merges topic_name into post structured_data when both post and initialDataPointTopic are provided', () => {
    const post = { structured_data: { topic_ids: ['t1'], result: 'approved' } } as unknown as Post
    expect(
      getInitialStructuredData({
        post,
        initialDataPointTopic: { id: 't1', name: 'Chase Sapphire', vertical: 'credit_card' },
      }),
    ).toEqual({ topic_ids: ['t1'], result: 'approved', topic_name: 'Chase Sapphire' })
  })

  it('returns post structured_data unchanged when post has structured_data but no initialDataPointTopic', () => {
    const post = { structured_data: { topic_ids: ['t1'], result: 'approved' } } as unknown as Post
    expect(getInitialStructuredData({ post })).toEqual({ topic_ids: ['t1'], result: 'approved' })
  })
})
