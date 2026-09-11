import createHttpError from 'http-errors'
import { FACEBOOK_GRAPHQL_VERSION } from '@voucha/config'
import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import { getOAuthTokenPurpose } from '@services/oauth-accounts/upsert'
import { fetch } from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { finalizeFacebookFriendSync, persistFacebookFriendPage } from './friends-persistence.mts'

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
    limit: '200',
    access_token: accessToken,
  })
  if (after) params.set('after', after)
  const response = await fetch(
    `https://graph.facebook.com/${FACEBOOK_GRAPHQL_VERSION}/me/friends?${params.toString()}`,
    {
      dispatcher: getExternalRequestDispatcher(),
    },
  )
  if (!response.ok)
    throw createHttpError(502, `Facebook /me/friends request failed: ${response.status}`)
  return response.json() as Promise<FacebookFriendsResponse>
}

async function getFacebookSyncAccount(facebookUserId: string) {
  const { rows } = await read(
    `/* getFacebookSyncAccount */ SELECT user_id, access_token_ciphertext FROM facebook_accounts WHERE facebook_user_id = $1 AND access_token_ciphertext IS NOT NULL`,
    [facebookUserId],
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

export async function syncFacebookFriends(facebookUserId: string): Promise<void> {
  const account = await getFacebookSyncAccount(facebookUserId)
  if (!account?.user_id || !account.access_token_ciphertext) return
  const accessToken = decryptSecret(
    account.access_token_ciphertext,
    getOAuthTokenPurpose('facebook', facebookUserId, 'access_token'),
  )

  const syncStartTime = await getSyncStartTime()

  let after: string | undefined

  do {
    // oxlint-disable-next-line no-await-in-loop -- the next Facebook cursor comes from the current response
    const result = await fetchFacebookFriends(accessToken, after)
    if (result.error) throw createHttpError(502, `Facebook friends error: ${result.error.message}`)
    // oxlint-disable-next-line no-await-in-loop -- each provider page commits before requesting its successor.
    const persisted = await persistFacebookFriendPage(
      facebookUserId,
      account.user_id,
      result.data.map(friend => friend.id),
    )
    if (!persisted) return
    after = result.paging?.cursors?.after
    if (!result.paging?.next) break
  } while (after)

  await finalizeFacebookFriendSync(facebookUserId, account.user_id, syncStartTime)
}
