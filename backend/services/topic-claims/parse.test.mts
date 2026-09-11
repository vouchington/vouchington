import { describe, it, expect } from 'vitest'
import { parseCreateTopicClaimInput } from './parse.mts'

describe('parseCreateTopicClaimInput', () => {
  it('parses valid input with all fields', () => {
    const result = parseCreateTopicClaimInput({
      topic_id: 'some-id',
      claimed_role: 'Card Issuer',
      evidence: 'We are the company.',
    })
    expect(result.topicId).toBe('some-id')
    expect(result.claimedRole).toBe('Card Issuer')
    expect(result.evidence).toBe('We are the company.')
  })

  it('trims whitespace from claimed_role', () => {
    const result = parseCreateTopicClaimInput({
      topic_id: 'id',
      claimed_role: '  Operator  ',
      evidence: '',
    })
    expect(result.claimedRole).toBe('Operator')
  })

  it('defaults evidence to empty string when not provided', () => {
    const result = parseCreateTopicClaimInput({
      topic_id: 'id',
      claimed_role: 'Issuer',
    })
    expect(result.evidence).toBe('')
  })

  it('trims whitespace from evidence', () => {
    const result = parseCreateTopicClaimInput({
      topic_id: 'id',
      claimed_role: 'Issuer',
      evidence: '  proof text  ',
    })
    expect(result.evidence).toBe('proof text')
  })

  it('throws 422 when claimed_role is missing', () => {
    expect(() => parseCreateTopicClaimInput({ topic_id: 'id', evidence: 'some proof' })).toThrow(
      /claimed_role is required/,
    )
  })

  it('throws 422 when claimed_role is empty string', () => {
    expect(() =>
      parseCreateTopicClaimInput({ topic_id: 'id', claimed_role: '', evidence: '' }),
    ).toThrow(/claimed_role is required/)
  })

  it('throws 422 when claimed_role is whitespace only', () => {
    expect(() =>
      parseCreateTopicClaimInput({ topic_id: 'id', claimed_role: '   ', evidence: '' }),
    ).toThrow(/claimed_role is required/)
  })

  it('throws 422 when claimed_role exceeds 255 characters', () => {
    expect(() =>
      parseCreateTopicClaimInput({
        topic_id: 'id',
        claimed_role: 'x'.repeat(256),
        evidence: '',
      }),
    ).toThrow(/too long/)
  })

  it('accepts claimed_role of exactly 255 characters', () => {
    const role = 'x'.repeat(255)
    const result = parseCreateTopicClaimInput({ topic_id: 'id', claimed_role: role, evidence: '' })
    expect(result.claimedRole).toBe(role)
  })
})
