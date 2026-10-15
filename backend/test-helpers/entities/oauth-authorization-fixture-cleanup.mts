import { write } from '@data-stores/psql'

export async function deleteTestOAuthAuthorizationFixtures(fixtures: {
  authorizationIds?: string[]
  facebookUserIds?: string[]
  githubUserIds?: string[]
  xUserIds?: string[]
  linkedinUserIds?: string[]
  userIds?: string[]
}): Promise<void> {
  await deleteRowsByIds('oauth_authorizations', 'id', fixtures.authorizationIds)
  await deleteRowsByIds('github_accounts', 'github_user_id', fixtures.githubUserIds)
  await deleteRowsByIds('facebook_accounts', 'facebook_user_id', fixtures.facebookUserIds)
  await deleteRowsByIds('x_accounts', 'x_user_id', fixtures.xUserIds)
  await deleteRowsByIds('linkedin_accounts', 'linkedin_user_id', fixtures.linkedinUserIds)
  await deleteRowsByIds('users', 'id', fixtures.userIds)
}

async function deleteRowsByIds(
  table:
    | 'oauth_authorizations'
    | 'facebook_accounts'
    | 'github_accounts'
    | 'linkedin_accounts'
    | 'users'
    | 'x_accounts',
  column: 'facebook_user_id' | 'github_user_id' | 'linkedin_user_id' | 'id' | 'x_user_id',
  ids: string[] | undefined,
): Promise<void> {
  if (!ids?.length) return
  await write(
    `/* deleteTestOAuthAuthorizationFixtures */ DELETE FROM ${table}
     WHERE ${column} = ANY($1::${column === 'id' ? 'uuid' : 'text'}[])`,
    [ids],
  )
}
