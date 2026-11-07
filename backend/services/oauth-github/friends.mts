import createHttpError from 'http-errors'
import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import { getOAuthTokenPurpose } from '@services/oauth-accounts/upsert'
import { fetch } from 'undici'
import { throwIfRateLimitedResponse } from '@modules/queue-errors'
import { getExternalRequestDispatcher } from '@modules/utils/http'
import { githubFollowingHasNextPage } from './friends-pagination.mts'
import type { FriendSyncResume } from '@queues/find-your-friends/types'
import { finalizeGithubFriendSync, persistGithubFriendPage } from './friends-persistence.mts'
import { getOauthGithubWorkLimit } from './work-limits.mts'

/** Requested provider page size; a longer response is rejected so one page bounds its persist chunks. */
const GITHUB_FOLLOWING_PAGE_SIZE = 100

type GithubUserShort = {
  id: number
  login: string
}

/* no-mistakes: integration=oauth */
async function fetchGithubFollowing(
  accessToken: string,
  page: number,
): Promise<{ users: GithubUserShort[]; hasNextPage: boolean }> {
  const params = new URLSearchParams({
    per_page: String(GITHUB_FOLLOWING_PAGE_SIZE),
    page: String(page),
  })
  const url = `https://api.github.com/user/following?${params.toString()}`
  const response = await fetch(url, {
    dispatcher: getExternalRequestDispatcher(),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  })
  throwIfRateLimitedResponse(response, 'https://api.github.com/user/following')
  if (!response.ok)
    throw createHttpError(502, `GitHub /user/following request failed: ${response.status}`)
  const users = (await response.json()) as GithubUserShort[]
  return { users, hasNextPage: githubFollowingHasNextPage(response.headers.get('link'), url) }
}

async function getGithubSyncAccount(githubUserId: string) {
  const { rows } = await read(
    `/* getGithubSyncAccount */ SELECT id, user_id, access_token_ciphertext FROM github_accounts WHERE github_user_id = $1 AND access_token_ciphertext IS NOT NULL`,
    [githubUserId],
  )

  return rows[0] as
    | { id: string; user_id?: string | null; access_token_ciphertext?: string }
    | undefined
}

// Carry the marker as text and cast back to timestamptz in the cleanup DELETE — pg's TIMESTAMPTZ
// parser (data-stores/psql/setup.mts) returns a JS Date, which truncates PostgreSQL's microsecond
// precision to milliseconds and can leave stale rows whose last_observed_at sits in the truncated
// sub-ms window uncleaned by `last_observed_at < marker`.
async function getSyncStartTime(): Promise<string> {
  const {
    rows: [{ now }],
  } = await read(`/* getSyncStartTime */ SELECT CURRENT_TIMESTAMP::text AS now`, [])

  return now as string
}

/**
 * Syncs one run of provider pages, then stale-edge cleanup. Returns the position the follow-up
 * job resumes from when a per-run cap is reached, or null once the sync is complete or superseded.
 */
export async function syncGithubFriends(
  githubUserId: string,
  resume?: FriendSyncResume,
): Promise<FriendSyncResume | null> {
  const account = await getGithubSyncAccount(githubUserId)
  if (!account?.user_id || !account.access_token_ciphertext) return null
  const syncStartTime = resume?.syncStartTime ?? (await getSyncStartTime())

  if (resume?.phase !== 'finalize') {
    const accessToken = decryptSecret(
      account.access_token_ciphertext,
      getOAuthTokenPurpose('github', githubUserId, 'access_token'),
    )
    const maxPages = getOauthGithubWorkLimit('max_provider_pages_per_run')
    let page = Number(resume?.cursor ?? 1)
    let exhausted = false
    for (let fetched = 0; fetched < maxPages && !exhausted; fetched += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the current page determines whether the next page exists
      const { users, hasNextPage } = await fetchGithubFollowing(accessToken, page)
      if (users.length > GITHUB_FOLLOWING_PAGE_SIZE)
        throw createHttpError(502, 'GitHub /user/following returned more users than requested')
      // oxlint-disable-next-line no-await-in-loop -- each provider page commits before requesting its successor.
      const persisted = await persistGithubFriendPage(
        account.id,
        account.user_id,
        users.map(user => String(user.id)),
        syncStartTime,
      )
      if (!persisted) return null
      exhausted = !hasNextPage
      page += 1
    }
    if (!exhausted) return { phase: 'pages', syncStartTime, cursor: String(page) }
  }

  const lastFinalizedKey = await finalizeGithubFriendSync(
    account.id,
    account.user_id,
    syncStartTime,
    { after: resume?.phase === 'finalize' ? resume.cursor : undefined },
  )
  return lastFinalizedKey === null
    ? null
    : { phase: 'finalize', syncStartTime, cursor: lastFinalizedKey }
}
