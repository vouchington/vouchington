import { isUUID } from '@ts-shared/utils/validation-core'

export type FollowerDistributionSendBody =
  | { audience: 'all_followers' }
  | { audience: 'selected_followers'; recipient_user_ids: readonly string[] }

export function assertFollowerDistributionSendBody(body: FollowerDistributionSendBody): void {
  const keys = Object.keys(body)
  if (body.audience === 'all_followers') {
    if (keys.length !== 1 || keys[0] !== 'audience') {
      throw new TypeError('All-followers sends cannot include recipient IDs')
    }
    return
  }

  if (keys.length !== 2 || !keys.includes('audience') || !keys.includes('recipient_user_ids')) {
    throw new TypeError('Selected-follower sends contain unexpected fields')
  }

  const recipientIds = body.recipient_user_ids
  if (recipientIds.length === 0) throw new TypeError('Choose at least one follower')
  if (new Set(recipientIds).size !== recipientIds.length) {
    throw new TypeError('Choose each follower only once')
  }
  if (!recipientIds.every(isUUID)) throw new TypeError('Follower IDs must be valid UUIDs')
}
