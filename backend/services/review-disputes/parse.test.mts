import { describe, it, expect } from 'vitest'
import { parseCreateReviewDisputeInput } from './parse.mts'

describe('parseCreateReviewDisputeInput', () => {
  const validBase = {
    post_id: 'post-123',
    reason: 'factually_inaccurate',
    claim_text: 'This is wrong.',
  }

  it('parses a valid input without topic_id', () => {
    const result = parseCreateReviewDisputeInput(validBase)
    expect(result.postId).toBe('post-123')
    expect(result.reason).toBe('factually_inaccurate')
    expect(result.claimText).toBe('This is wrong.')
    expect(result.topicId).toBeUndefined()
  })

  it('parses a valid input with topic_id', () => {
    const result = parseCreateReviewDisputeInput({ ...validBase, topic_id: 'topic-abc' })
    expect(result.topicId).toBe('topic-abc')
  })

  it('ignores blank topic_id', () => {
    const result = parseCreateReviewDisputeInput({ ...validBase, topic_id: '   ' })
    expect(result.topicId).toBeUndefined()
  })

  it('ignores non-string topic_id', () => {
    const result = parseCreateReviewDisputeInput({ ...validBase, topic_id: 42 })
    expect(result.topicId).toBeUndefined()
  })

  it('throws 422 when post_id is missing', () => {
    expect(() => parseCreateReviewDisputeInput({ reason: 'other', claim_text: 'hi' })).toThrow(
      'post_id is required',
    )
  })

  it('throws 422 when reason is invalid', () => {
    expect(() => parseCreateReviewDisputeInput({ ...validBase, reason: 'not_a_reason' })).toThrow(
      'reason must be one of',
    )
  })

  it('throws 422 when claim_text is empty', () => {
    expect(() => parseCreateReviewDisputeInput({ ...validBase, claim_text: '  ' })).toThrow(
      'claim_text is required',
    )
  })

  it('throws 422 when claim_text exceeds 4000 chars', () => {
    expect(() =>
      parseCreateReviewDisputeInput({ ...validBase, claim_text: 'x'.repeat(4001) }),
    ).toThrow('claim_text too long')
  })
})
