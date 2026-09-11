import type { QueryOptions } from '@data-stores/psql/types'
import { read } from '@data-stores/psql'
import type { OAuthProvider } from '@services/oauth'

export async function hasOtherAuthMethods(
  options: QueryOptions,
  userId: string,
  excluding: OAuthProvider | 'email',
): Promise<boolean> {
  const checks: string[] = []

  if (excluding !== 'email') {
    checks.push(`SELECT 1 FROM user_email_addresses WHERE user_id = $1`)
  }
  if (excluding !== 'facebook') {
    checks.push(`SELECT 1 FROM facebook_accounts WHERE user_id = $1`)
  }
  if (excluding !== 'apple') {
    checks.push(`SELECT 1 FROM apple_accounts WHERE user_id = $1`)
  }
  if (excluding !== 'google') {
    checks.push(`SELECT 1 FROM google_accounts WHERE user_id = $1`)
  }
  if (excluding !== 'x') {
    checks.push(`SELECT 1 FROM x_accounts WHERE user_id = $1`)
  }
  if (excluding !== 'linkedin') {
    checks.push(`SELECT 1 FROM linkedin_accounts WHERE user_id = $1`)
  }
  if (excluding !== 'microsoft') {
    checks.push(`SELECT 1 FROM microsoft_accounts WHERE user_id = $1`)
  }
  if (excluding !== 'github') {
    checks.push(`SELECT 1 FROM github_accounts WHERE user_id = $1`)
  }
  checks.push(`SELECT 1 FROM user_phone_numbers WHERE user_id = $1`)

  const query = checks.map(q => `(${q} LIMIT 1)`).join(' UNION ALL ')
  const { rows } = await read(
    `/* hasOtherAuthMethods */ SELECT 1 FROM (${query}) t LIMIT 1`,
    [userId],
    options,
  )
  return rows.length > 0
}
