import { read } from '@data-stores/psql'

export async function getTestAuthorizationAccountId(
  provider: 'facebook' | 'x',
  providerUserId: string,
): Promise<string> {
  const { rows } =
    provider === 'facebook'
      ? await read<{ id: string }>(
          `/* getTestFacebookAccountId */ SELECT id FROM facebook_accounts WHERE facebook_user_id = $1`,
          [providerUserId],
        )
      : await read<{ id: string }>(
          `/* getTestXAccountId */ SELECT id FROM x_accounts WHERE x_user_id = $1`,
          [providerUserId],
        )
  if (!rows[0]) throw new Error(`${provider} test account must exist before authorization fixture`)
  return rows[0].id
}
