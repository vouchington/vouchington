import type { FediverseProviderAdapter, FediverseSearchBucket } from '../types.mts'
import onError from '@modules/on-error'
import { fetch } from 'undici'
import { getProviderRequestDispatcher } from '@modules/api-egress-proxy'
import {
  FEDIVERSE_ADAPTER_BUDGET_MS,
  FEDIVERSE_MASTODON_ACCESS_TOKEN,
  FEDIVERSE_MASTODON_HOST,
  FEDIVERSE_PROVIDER_TIMEOUT_MS,
} from '@voucha/config'
import { buildMastodonBucket, readMastodonOffset } from './mastodon-cursor.mts'
import { type MastodonAccount, mapMastodonAccount } from './mastodon-mappers.mts'

export { mapMastodonAccount } from './mastodon-mappers.mts'

type MastodonSearchResponse = {
  accounts: MastodonAccount[]
}

/* no-mistakes: integration=mastodon */
async function fetchMastodonAccountSearch(
  host: string,
  q: string,
  limit: number,
  offset: number,
  accessToken: string | undefined,
  budgetSignal: AbortSignal,
): Promise<MastodonSearchResponse> {
  const signal = AbortSignal.any([AbortSignal.timeout(FEDIVERSE_PROVIDER_TIMEOUT_MS), budgetSignal])

  const url = new URL(`https://${host}/api/v2/search`)
  url.searchParams.set('q', q)
  url.searchParams.set('type', 'accounts')
  url.searchParams.set('limit', String(limit))
  if (accessToken) {
    url.searchParams.set('resolve', 'false')
    url.searchParams.set('offset', String(offset))
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const response = await fetch(url, {
    dispatcher: getProviderRequestDispatcher('fediverse_search_enabled'),
    signal,
    headers,
  })

  if (!response.ok) {
    throw new Error(`Mastodon search returned ${response.status} for host ${host}`)
  }

  return (await response.json()) as MastodonSearchResponse
}

export function createMastodonAdapter(
  host: string = FEDIVERSE_MASTODON_HOST,
  accessToken: string | undefined = FEDIVERSE_MASTODON_ACCESS_TOKEN,
): FediverseProviderAdapter {
  return {
    provider: 'mastodon',
    async search(options): Promise<FediverseSearchBucket> {
      if (options.type === 'video' || options.type === 'instance') {
        return { provider: 'mastodon', status: 'ok', items: [] }
      }

      // Full-text status search needs a service-account token, and an authenticated Mastodon
      // search can surface that account's own favourites/bookmarks/mentions alongside genuine
      // global matches with no field to tell them apart (docs.joinmastodon.org/methods/search) —
      // this public, anonymous-accessible endpoint never proxies token-scoped status search.
      if (options.type === 'post') {
        return { provider: 'mastodon', status: 'partial', items: [], error_code: 'auth_required' }
      }

      const limit = options.limit ?? 10
      const offset = readMastodonOffset(options.cursor)
      const budgetSignal = AbortSignal.timeout(FEDIVERSE_ADAPTER_BUDGET_MS)

      try {
        const response = await fetchMastodonAccountSearch(
          host,
          options.q,
          limit,
          offset,
          accessToken,
          budgetSignal,
        )
        const items = response.accounts.map(account => mapMastodonAccount(account, host))
        return buildMastodonBucket(items, offset, limit, accessToken)
      } catch (error) {
        onError(error as Error)
        return { provider: 'mastodon', status: 'error', items: [], error_code: 'provider_error' }
      }
    },
  }
}
