import { read } from '@data-stores/psql'

export async function getTestAuthorizationAccountId(
  provider: 'facebook' | 'x' | 'github' | 'google',
  providerUserId: string,
): Promise<string> {
  const { rows } =
    provider === 'facebook'
      ? await read<{ id: string }>(
          `/* getTestFacebookAccountId */ SELECT id FROM facebook_accounts WHERE facebook_user_id = $1`,
          [providerUserId],
        )
      : provider === 'x'
        ? await read<{ id: string }>(
            `/* getTestXAccountId */ SELECT id FROM x_accounts WHERE x_user_id = $1`,
            [providerUserId],
          )
        : provider === 'google'
          ? await read<{ id: string }>(
              `/* getTestGoogleAccountId */ SELECT id FROM google_accounts WHERE google_user_id = $1`,
              [providerUserId],
            )
          : await read<{ id: string }>(
              `/* getTestGithubAccountId */ SELECT id FROM github_accounts WHERE github_user_id = $1`,
              [providerUserId],
            )
  if (!rows[0]) throw new Error(`${provider} test account must exist before authorization fixture`)
  return rows[0].id
}
