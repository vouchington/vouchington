import type { OAuthProvider } from './_oauth-config-support.mts'

export type FriendsTableConfig = Readonly<{
  table: string
  userIdColumn: string
  friendIdColumn: string
}>

const FRIENDS_TABLE_CONFIGS = Object.freeze({
  facebook: Object.freeze({
    table: 'facebook_friends',
    userIdColumn: 'facebook_account_id',
    friendIdColumn: 'facebook_friend_id',
  }),
  x: Object.freeze({
    table: 'x_friends',
    userIdColumn: 'x_account_id',
    friendIdColumn: 'x_friend_id',
  }),
  github: Object.freeze({
    table: 'github_friends',
    userIdColumn: 'github_account_id',
    friendIdColumn: 'github_friend_id',
  }),
} satisfies Partial<Record<OAuthProvider, FriendsTableConfig>>)

export function getFriendsTableConfig(provider: OAuthProvider): FriendsTableConfig {
  if (typeof provider !== 'string') throw new Error('Invalid friends provider')
  if (!Object.hasOwn(FRIENDS_TABLE_CONFIGS, provider)) {
    throw new Error(`No friends table config for provider: ${provider}`)
  }
  return FRIENDS_TABLE_CONFIGS[provider as keyof typeof FRIENDS_TABLE_CONFIGS]
}

export function sourceAccountId(provider: OAuthProvider): string {
  if (provider === 'facebook')
    return '(SELECT id FROM facebook_accounts WHERE facebook_user_id = $1)'
  if (provider === 'x') return '(SELECT id FROM x_accounts WHERE x_user_id = $1)'
  return '(SELECT id FROM github_accounts WHERE github_user_id = $1)'
}

export function friendAccountReference(
  provider: OAuthProvider,
  friendIdExpression: '$2' | 'friend_id',
): { column: string; value: string } {
  if (provider === 'facebook') {
    return {
      column: ', friend_facebook_account_id',
      value: `, (SELECT id FROM facebook_accounts WHERE facebook_user_id = ${friendIdExpression})`,
    }
  }
  if (provider === 'x') {
    return {
      column: ', friend_x_account_id',
      value: `, (SELECT id FROM x_accounts WHERE x_user_id = ${friendIdExpression})`,
    }
  }
  return {
    column: ', friend_github_account_id',
    value: `, (SELECT id FROM github_accounts WHERE github_user_id = ${friendIdExpression})`,
  }
}
