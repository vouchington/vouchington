import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  friend_follow_limit: 1000,
  votes_per_friend_limit: 20,
}

/** Hard ceilings: the follow ceiling is the per-user follow cap; votes per friend stay a short recent window. */
export const friendTrustedHostnamesWorkMaxValues = {
  friend_follow_limit: 10_000,
  votes_per_friend_limit: 500,
}

export const friendTrustedHostnamesWorkConfig = new DynamicConfig({
  key: 'friend-trusted-hostnames-work-config',
  fieldTypes: {
    friend_follow_limit: 'number',
    votes_per_friend_limit: 'number',
  },
  defaultFields,
})

export function getFriendTrustedHostnamesLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(friendTrustedHostnamesWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: friendTrustedHostnamesWorkMaxValues[field],
  })
}
