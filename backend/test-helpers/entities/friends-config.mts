import type { OAuthProvider } from './_oauth-config-support.mts'

export type FriendsTableConfig = {
  table: string
  userIdColumn: string
  friendIdColumn: string
}

const FRIENDS_TABLE_CONFIGS: Partial<Record<OAuthProvider, FriendsTableConfig>> = {
  facebook: {
    table: 'facebook_friends',
    userIdColumn: 'facebook_account_id',
    friendIdColumn: 'facebook_friend_id',
  },
  x: {
    table: 'x_friends',
    userIdColumn: 'x_user_id',
    friendIdColumn: 'x_friend_id',
  },
  github: {
    table: 'github_friends',
    userIdColumn: 'github_user_id',
    friendIdColumn: 'github_friend_id',
  },
}

export function getFriendsTableConfig(provider: OAuthProvider): FriendsTableConfig {
  const config = FRIENDS_TABLE_CONFIGS[provider]
  if (!config) throw new Error(`No friends table config for provider: ${provider}`)
  return config
}

export function sourceAccountId(provider: OAuthProvider): string {
  return provider === 'facebook'
    ? '(SELECT id FROM facebook_accounts WHERE facebook_user_id = $1)'
    : '$1'
}
