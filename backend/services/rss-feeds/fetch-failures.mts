import { read } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { softDeleteRssFeedById } from './delete.mts'
import { isPermanentRssFetchError } from './is-permanent-fetch-error.mts'

type RssFeedFetchFailurePolicy = {
  url_hostname_id: string
  feed_unreliable_status_codes: number[] | null
  hostname_unreliable_status_codes: number[] | null
}

export function getEffectiveUnreliableStatusCodes(
  policy: RssFeedFetchFailurePolicy | null | undefined,
): readonly number[] {
  return policy?.feed_unreliable_status_codes ?? policy?.hostname_unreliable_status_codes ?? []
}

export async function getEffectiveFetchUnreliableStatusCodes(
  policy: RssFeedFetchFailurePolicy | null | undefined,
  fetchHostnameId: string,
): Promise<readonly number[]> {
  if (!policy) return []
  if (policy.feed_unreliable_status_codes !== null) return policy.feed_unreliable_status_codes
  if (fetchHostnameId === policy.url_hostname_id) return getEffectiveUnreliableStatusCodes(policy)

  const { rows } = await read<{ unreliable_status_codes: number[] | null }>(
    sql`/* getEffectiveFetchUnreliableStatusCodes */
      SELECT unreliable_status_codes
      FROM url_hostnames
      WHERE id = ${fetchHostnameId}
      LIMIT 1
    `,
  )
  return rows[0]?.unreliable_status_codes ?? []
}

export async function maybeSoftDeletePermanentFetchErrorForFetch({
  error,
  feedUrl,
  rssFeedId,
  policy,
  fetchHostnameId,
}: {
  error: unknown
  feedUrl: string
  rssFeedId: string
  policy: RssFeedFetchFailurePolicy | null | undefined
  fetchHostnameId: string
}): Promise<void> {
  await maybeSoftDeletePermanentFetchError({
    error,
    feedUrl,
    rssFeedId,
    unreliableStatusCodes: await getEffectiveFetchUnreliableStatusCodes(policy, fetchHostnameId),
  })
}

export async function maybeSoftDeletePermanentFetchError({
  error,
  feedUrl,
  rssFeedId,
  unreliableStatusCodes = [],
}: {
  error: unknown
  feedUrl: string
  rssFeedId: string
  unreliableStatusCodes?: readonly number[]
}): Promise<void> {
  if (!isPermanentRssFetchError(error, { unreliableStatusCodes })) return
  const softDeleted = await softDeleteRssFeedById(rssFeedId)
  if (!softDeleted) return
  const cause = error instanceof Error ? error : new Error(String(error))
  const reportError = new Error(`RSS feed permanently broken and soft-deleted: ${feedUrl}`, {
    cause,
  })
  Object.assign(reportError, {
    extra: { rssFeedId, rssFeedUrl: feedUrl, action: 'softDeleted' },
    tags: { operation: 'fetchRssFeed.permanentError' },
  })
  onError(reportError)
}
