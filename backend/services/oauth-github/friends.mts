import createHttpError from 'http-errors'
import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import { getOAuthTokenPurpose } from '@services/oauth-accounts/upsert'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { githubFollowingHasNextPage } from './friends-pagination.mts'
import { finalizeGithubFriendSync, persistGithubFriendPage } from './friends-persistence.mts'

type GithubUserShort = {
  id: number
  login: string
}

/* no-mistakes: integration=oauth */
async function fetchGithubFollowing(
  accessToken: string,
  page: number,
): Promise<{ users: GithubUserShort[]; hasNextPage: boolean }> {
  const params = new URLSearchParams({ per_page: '100', page: String(page) })
  const url = `https://api.github.com/user/following?${params.toString()}`
  const response = await fetch(url, {
    dispatcher: getExternalRequestDispatcher(),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!response.ok)
    throw createHttpError(502, `GitHub /user/following request failed: ${response.status}`)
  const users = (await response.json()) as GithubUserShort[]
  return { users, hasNextPage: githubFollowingHasNextPage(response.headers.get('link'), url) }
}

async function getGithubSyncAccount(githubUserId: string) {
  const { rows } = await read(
    `/* getGithubSyncAccount */ SELECT user_id, access_token_ciphertext FROM github_accounts WHERE github_user_id = $1 AND access_token_ciphertext IS NOT NULL`,
    [githubUserId],
  )

  return rows[0] as { user_id?: string | null; access_token_ciphertext?: string } | undefined
}

// Carry the marker as text and cast back to timestamptz in the cleanup DELETE — pg's TIMESTAMPTZ
// parser (data-stores/psql/setup.mts) returns a JS Date, which truncates PostgreSQL's microsecond
// precision to milliseconds and can leave stale rows whose updated_at sits in the truncated
// sub-ms window uncleaned by `updated_at <= marker`.
async function getSyncStartTime(): Promise<string> {
  const {
    rows: [{ now }],
  } = await read(`/* getSyncStartTime */ SELECT CURRENT_TIMESTAMP::text AS now`, [])

  return now as string
}

export async function syncGithubFriends(githubUserId: string): Promise<void> {
  const account = await getGithubSyncAccount(githubUserId)
  if (!account?.user_id || !account.access_token_ciphertext) return
  const accessToken = decryptSecret(
    account.access_token_ciphertext,
    getOAuthTokenPurpose('github', githubUserId, 'access_token'),
  )

  const syncStartTime = await getSyncStartTime()

  let page = 1
  let hasMore = true

  while (hasMore) {
    // oxlint-disable-next-line no-await-in-loop -- the current page determines whether the next page exists
    const { users, hasNextPage } = await fetchGithubFollowing(accessToken, page)
    // oxlint-disable-next-line no-await-in-loop -- each provider page commits before requesting its successor.
    const persisted = await persistGithubFriendPage(
      githubUserId,
      account.user_id,
      users.map(user => String(user.id)),
    )
    if (!persisted) return
    hasMore = hasNextPage
    page++
  }

  await finalizeGithubFriendSync(githubUserId, account.user_id, syncStartTime)
}
