import createHttpError from 'http-errors'
import { FACEBOOK_GRAPHQL_VERSION } from '@voucha/config'
import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import { getOAuthTokenPurpose } from '@services/oauth-accounts/upsert'
import { fetch } from 'undici'
import { throwIfRateLimitedResponse } from '@modules/queue-errors'
import { getExternalRequestDispatcher } from '@modules/utils/http'
import type { FriendSyncResume } from '@queues/find-your-friends/types'
import { finalizeFacebookFriendSync, persistFacebookFriendPage } from './friends-persistence.mts'
import { getOauthFacebookWorkLimit } from './work-limits.mts'

/** Requested provider page size; a longer response is rejected so one page bounds its persist chunks. */
const FACEBOOK_FRIENDS_PAGE_LIMIT = 200

type FacebookFriendsResponse = {
  data: Array<{ id: string; name: string }>
  paging?: {
    cursors?: { after?: string }
    next?: string
  }
  error?: { message: string }
}

/* no-mistakes: integration=oauth */
async function fetchFacebookFriends(
  accessToken: string,
  after?: string,
): Promise<FacebookFriendsResponse> {
  const params = new URLSearchParams({
    fields: 'id,name',
    limit: String(FACEBOOK_FRIENDS_PAGE_LIMIT),
    access_token: accessToken,
  })
  if (after) params.set('after', after)
  const response = await fetch(
    `https://graph.facebook.com/${FACEBOOK_GRAPHQL_VERSION}/me/friends?${params.toString()}`,
    {
      dispatcher: getExternalRequestDispatcher(),
    },
  )
  throwIfRateLimitedResponse(response, 'https://graph.facebook.com/me/friends')
  if (!response.ok)
    throw createHttpError(502, `Facebook /me/friends request failed: ${response.status}`)
  return response.json() as Promise<FacebookFriendsResponse>
}

async function getFacebookSyncAccount(facebookUserId: string) {
  const { rows } = await read(
    `/* getFacebookSyncAccount */ SELECT id, user_id, access_token_ciphertext FROM facebook_accounts WHERE facebook_user_id = $1 AND access_token_ciphertext IS NOT NULL`,
    [facebookUserId],
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
export async function syncFacebookFriends(
  facebookUserId: string,
  resume?: FriendSyncResume,
): Promise<FriendSyncResume | null> {
  const account = await getFacebookSyncAccount(facebookUserId)
  if (!account?.user_id || !account.access_token_ciphertext) return null
  const syncStartTime = resume?.syncStartTime ?? (await getSyncStartTime())

  if (resume?.phase !== 'finalize') {
    const accessToken = decryptSecret(
      account.access_token_ciphertext,
      getOAuthTokenPurpose('facebook', facebookUserId, 'access_token'),
    )
    const maxPages = getOauthFacebookWorkLimit('max_provider_pages_per_run')
    let after = resume?.cursor
    let exhausted = false
    for (let page = 0; page < maxPages && !exhausted; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- the next Facebook cursor comes from the current response
      const result = await fetchFacebookFriends(accessToken, after)
      if (result.error)
        throw createHttpError(502, `Facebook friends error: ${result.error.message}`)
      if (result.data.length > FACEBOOK_FRIENDS_PAGE_LIMIT)
        throw createHttpError(502, 'Facebook /me/friends returned more friends than requested')
      // oxlint-disable-next-line no-await-in-loop -- each provider page commits before requesting its successor.
      const persisted = await persistFacebookFriendPage(
        account.id,
        account.user_id,
        result.data.map(friend => friend.id),
        syncStartTime,
      )
      if (!persisted) return null
      after = result.paging?.cursors?.after
      exhausted = !result.paging?.next || !after
    }
    if (!exhausted) return { phase: 'pages', syncStartTime, cursor: after }
  }

  const lastFinalizedKey = await finalizeFacebookFriendSync(
    account.id,
    account.user_id,
    syncStartTime,
    resume?.phase === 'finalize' ? resume.cursor : undefined,
  )
  return lastFinalizedKey === null
    ? null
    : { phase: 'finalize', syncStartTime, cursor: lastFinalizedKey }
}
