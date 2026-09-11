import { describe, expect, it } from 'vitest'
import { insertVoteWeightPenalty } from './insert-vote-weight-penalty.mts'

describe('insertVoteWeightPenalty', () => {
  it('rejects ambiguous penalty sources', async () => {
    await expect(
      insertVoteWeightPenalty({
        userIds: ['11111111-1111-4111-8111-111111111111'],
        reason: 'ambiguous-source-test',
        sourceFlagId: '22222222-2222-4222-8222-222222222222',
        sourceHostnameId: '33333333-3333-4333-8333-333333333333',
        createdById: '44444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toThrow('insertVoteWeightPenalty accepts at most one source')
  })
})
