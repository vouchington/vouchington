import { describe, expect, it } from 'vitest'
import { MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS } from './types.mts'
import { parseSendFollowersInput } from './send-followers-input.mts'

describe('parseSendFollowersInput', () => {
  it('accepts all followers sends', () => {
    expect(parseSendFollowersInput({ audience: 'all_followers' })).toEqual({
      audience: 'all_followers',
    })
  })

  it('accepts selected recipients at the configured maximum', () => {
    const recipientIds = Array.from(
      { length: MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    )

    expect(
      parseSendFollowersInput({
        audience: 'selected_followers',
        recipient_user_ids: recipientIds,
      }),
    ).toEqual({
      audience: 'selected_followers',
      recipient_user_ids: recipientIds,
    })
  })

  it('rejects selected recipients over the configured maximum', () => {
    const recipientIds = Array.from(
      { length: MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    )

    expect(() =>
      parseSendFollowersInput({
        audience: 'selected_followers',
        recipient_user_ids: recipientIds,
      }),
    ).toThrow(`at most ${MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS}`)
  })

  it('rejects non-UUID selected recipients', () => {
    expect(() =>
      parseSendFollowersInput({
        audience: 'selected_followers',
        recipient_user_ids: ['not-a-uuid'],
      }),
    ).toThrow('recipient_user_ids must contain valid UUIDs')
  })

  it('rejects an empty selected recipient list', () => {
    expect(() =>
      parseSendFollowersInput({ audience: 'selected_followers', recipient_user_ids: [] }),
    ).toThrow('recipient_user_ids must include at least one follower')
  })

  it('rejects duplicate selected recipients', () => {
    const recipientId = '00000000-0000-4000-8000-000000000001'
    expect(() =>
      parseSendFollowersInput({
        audience: 'selected_followers',
        recipient_user_ids: [recipientId, recipientId],
      }),
    ).toThrow('recipient_user_ids must not contain duplicates')
  })

  it('rejects recipient ids for all-followers sends', () => {
    expect(() =>
      parseSendFollowersInput({
        audience: 'all_followers',
        recipient_user_ids: ['00000000-0000-4000-8000-000000000001'],
      }),
    ).toThrow('Unexpected request fields')
  })

  it('rejects unexpected request fields', () => {
    expect(() =>
      parseSendFollowersInput({
        audience: 'selected_followers',
        recipient_user_ids: ['00000000-0000-4000-8000-000000000001'],
        ignored: true,
      }),
    ).toThrow('Unexpected request fields')
  })
})
