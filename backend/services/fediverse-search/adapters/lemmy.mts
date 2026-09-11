import type {
  FediverseProviderAdapter,
  FediverseSearchBucket,
  FediverseSearchResult,
} from '../types.mts'
import onError from '@modules/on-error'
import { fetch } from 'undici'
import { getProviderRequestDispatcher } from '@modules/api-egress-proxy'
import {
  FEDIVERSE_ADAPTER_BUDGET_MS,
  FEDIVERSE_LEMMY_HOST,
  FEDIVERSE_PROVIDER_TIMEOUT_MS,
} from '@voucha/config'
import {
  decodeLemmyCombinedCursor,
  encodeLemmyCombinedCursor,
  fetchLemmyKind,
} from './lemmy-cursor.mts'
import { rollUpBucketStatus } from './partial-bucket.mts'
import {
  type LemmyPostView,
  type LemmyPersonView,
  type LemmyCommunityView,
  mapLemmyPost,
  mapLemmyPerson,
  mapLemmyCommunity,
} from './lemmy-mappers.mts'

export { mapLemmyPost, mapLemmyPerson, mapLemmyCommunity } from './lemmy-mappers.mts'

type LemmySearchResponse = {
  posts?: LemmyPostView[]
  communities?: LemmyCommunityView[]
  users?: LemmyPersonView[]
}

type LemmySearchTypeParam = 'Posts' | 'Users' | 'Communities'

/* no-mistakes: integration=lemmy */
async function fetchLemmySearch(
  host: string,
  q: string,
  typeParam: LemmySearchTypeParam,
  page: number,
  limit: number,
  budgetSignal: AbortSignal,
): Promise<LemmySearchResponse> {
  const signal = AbortSignal.any([AbortSignal.timeout(FEDIVERSE_PROVIDER_TIMEOUT_MS), budgetSignal])

  const url = new URL(`https://${host}/api/v3/search`)
  url.searchParams.set('q', q)
  url.searchParams.set('type_', typeParam)
  url.searchParams.set('sort', 'TopAll')
  // Without an explicit listing_type, Lemmy falls back to the instance's
  // default (often 'Local'), which would silently drop federated results.
  url.searchParams.set('listing_type', 'All')
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url, {
    dispatcher: getProviderRequestDispatcher('fediverse_search_enabled'),
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Lemmy search returned ${response.status} for host ${host}`)
  }

  return (await response.json()) as LemmySearchResponse
}

function extractLemmyPosts(response: LemmySearchResponse): LemmyPostView[] {
  return response.posts ?? []
}

function extractLemmyUsers(response: LemmySearchResponse): LemmyPersonView[] {
  return response.users ?? []
}

function extractLemmyCommunities(response: LemmySearchResponse): LemmyCommunityView[] {
  return response.communities ?? []
}

export function createLemmyAdapter(host: string = FEDIVERSE_LEMMY_HOST): FediverseProviderAdapter {
  return {
    provider: 'lemmy',
    async search(options): Promise<FediverseSearchBucket> {
      if (options.type === 'video' || options.type === 'instance') {
        return { provider: 'lemmy', status: 'ok', items: [] }
      }

      const limit = options.limit ?? 10
      const includePosts = options.type !== 'profile'
      const includeProfiles = options.type !== 'post'
      const combined = decodeLemmyCombinedCursor(options.cursor)
      const budgetSignal = AbortSignal.timeout(FEDIVERSE_ADAPTER_BUDGET_MS)

      try {
        // Each kind gets whatever budget remains after the prior kinds' items, so the
        // combined result never needs slicing — nothing fetched is ever dropped before shown.
        const items: FediverseSearchResult[] = []

        const postsResult = await fetchLemmyKind(
          (page, budget) => fetchLemmySearch(host, options.q, 'Posts', page, budget, budgetSignal),
          extractLemmyPosts,
          combined.p,
          limit - items.length,
          includePosts,
        )
        items.push(...postsResult.items.map(mapLemmyPost))

        const usersResult = await fetchLemmyKind(
          (page, budget) => fetchLemmySearch(host, options.q, 'Users', page, budget, budgetSignal),
          extractLemmyUsers,
          combined.u,
          limit - items.length,
          includeProfiles,
        )
        items.push(...usersResult.items.map(mapLemmyPerson))

        const communitiesResult = await fetchLemmyKind(
          (page, budget) =>
            fetchLemmySearch(host, options.q, 'Communities', page, budget, budgetSignal),
          extractLemmyCommunities,
          combined.c,
          limit - items.length,
          includeProfiles,
        )
        items.push(...communitiesResult.items.map(mapLemmyCommunity))

        const status = rollUpBucketStatus([postsResult, usersResult, communitiesResult])
        if (status === 'error') {
          return { provider: 'lemmy', status: 'error', items: [], error_code: 'provider_error' }
        }

        const hasMore =
          (includePosts && !postsResult.next.done) ||
          (includeProfiles && (!usersResult.next.done || !communitiesResult.next.done))
        const next_cursor = hasMore
          ? encodeLemmyCombinedCursor({
              p: postsResult.next,
              u: usersResult.next,
              c: communitiesResult.next,
            })
          : undefined

        return {
          provider: 'lemmy',
          status,
          items,
          ...(next_cursor === undefined ? {} : { next_cursor }),
          ...(status === 'ok' ? {} : { error_code: 'provider_error' }),
        }
      } catch (error) {
        onError(error as Error)
        return { provider: 'lemmy', status: 'error', items: [], error_code: 'provider_error' }
      }
    },
  }
}
