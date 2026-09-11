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
  FEDIVERSE_BLUESKY_HOST,
  FEDIVERSE_PROVIDER_TIMEOUT_MS,
} from '@voucha/config'
import { decodeFediverseCursor, encodeFediverseCursor } from '../cursor.mts'
import {
  type BlueskyActor,
  type BlueskyPost,
  mapBlueskyActor,
  mapBlueskyPost,
} from './bluesky-mappers.mts'
import {
  decodeBlueskyCombinedCursor,
  encodeBlueskyCombinedCursor,
  fetchBlueskyKind,
} from './bluesky-cursor.mts'
import { rollUpBucketStatus } from './partial-bucket.mts'

export { mapBlueskyActor, mapBlueskyPost } from './bluesky-mappers.mts'

type BlueskyActorSearchResponse = {
  actors: BlueskyActor[]
  cursor?: string
}

type BlueskyPostSearchResponse = {
  posts: BlueskyPost[]
  cursor?: string
}

/* no-mistakes: integration=bluesky */
async function fetchBlueskyActors(
  host: string,
  q: string,
  limit: number,
  cursor: string | undefined,
  budgetSignal: AbortSignal,
): Promise<BlueskyActorSearchResponse> {
  const signal = AbortSignal.any([AbortSignal.timeout(FEDIVERSE_PROVIDER_TIMEOUT_MS), budgetSignal])

  const url = new URL(`https://${host}/xrpc/app.bsky.actor.searchActors`)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(limit))
  if (cursor) url.searchParams.set('cursor', cursor)

  const response = await fetch(url, {
    dispatcher: getProviderRequestDispatcher('fediverse_search_enabled'),
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Bluesky actor search returned ${response.status} for host ${host}`)
  }

  return (await response.json()) as BlueskyActorSearchResponse
}

/* no-mistakes: integration=bluesky */
async function fetchBlueskyPosts(
  host: string,
  q: string,
  limit: number,
  cursor: string | undefined,
  budgetSignal: AbortSignal,
): Promise<BlueskyPostSearchResponse> {
  const signal = AbortSignal.any([AbortSignal.timeout(FEDIVERSE_PROVIDER_TIMEOUT_MS), budgetSignal])

  const url = new URL(`https://${host}/xrpc/app.bsky.feed.searchPosts`)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(limit))
  if (cursor) url.searchParams.set('cursor', cursor)

  const response = await fetch(url, {
    dispatcher: getProviderRequestDispatcher('fediverse_search_enabled'),
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Bluesky post search returned ${response.status} for host ${host}`)
  }

  return (await response.json()) as BlueskyPostSearchResponse
}

function extractBlueskyActors(response: BlueskyActorSearchResponse): BlueskyActor[] {
  return response.actors
}

function extractBlueskyPosts(response: BlueskyPostSearchResponse): BlueskyPost[] {
  return response.posts
}

export function createBlueskyAdapter(
  host: string = FEDIVERSE_BLUESKY_HOST,
): FediverseProviderAdapter {
  return {
    provider: 'bluesky',
    async search(options): Promise<FediverseSearchBucket> {
      if (options.type === 'video' || options.type === 'instance') {
        return { provider: 'bluesky', status: 'ok', items: [] }
      }

      const limit = options.limit ?? 10
      const cursor = decodeFediverseCursor(options.cursor, 'bluesky')
      const budgetSignal = AbortSignal.timeout(FEDIVERSE_ADAPTER_BUDGET_MS)

      try {
        if (options.type === 'profile') {
          const response = await fetchBlueskyActors(host, options.q, limit, cursor, budgetSignal)
          return buildBlueskyBucket(response.actors.map(mapBlueskyActor), response.cursor)
        }

        if (options.type === 'post') {
          const response = await fetchBlueskyPosts(host, options.q, limit, cursor, budgetSignal)
          return buildBlueskyBucket(response.posts.map(mapBlueskyPost), response.cursor)
        }

        // Actors get first priority at full `limit`; posts only get whatever
        // budget remains once actors are mapped, so the combined result
        // never needs slicing.
        const combined = decodeBlueskyCombinedCursor(options.cursor)

        const actorsResult = await fetchBlueskyKind(
          actorsCursor => fetchBlueskyActors(host, options.q, limit, actorsCursor, budgetSignal),
          extractBlueskyActors,
          combined.a,
          true,
        )
        const mappedActors = actorsResult.items.map(mapBlueskyActor)

        const postsLimit = Math.max(0, limit - mappedActors.length)
        const postsResult = await fetchBlueskyKind(
          postsCursor => fetchBlueskyPosts(host, options.q, postsLimit, postsCursor, budgetSignal),
          extractBlueskyPosts,
          combined.p,
          postsLimit > 0,
        )
        const mappedPosts = postsResult.items.map(mapBlueskyPost)

        const status = rollUpBucketStatus([actorsResult, postsResult])
        if (status === 'error') {
          return { provider: 'bluesky', status: 'error', items: [], error_code: 'provider_error' }
        }

        const items = [...mappedActors, ...mappedPosts]
        const hasMore = !actorsResult.next.done || !postsResult.next.done
        const next_cursor = hasMore
          ? encodeBlueskyCombinedCursor({ a: actorsResult.next, p: postsResult.next })
          : undefined

        return {
          provider: 'bluesky',
          status,
          items,
          ...(next_cursor === undefined ? {} : { next_cursor }),
          ...(status === 'ok' ? {} : { error_code: 'provider_error' }),
        }
      } catch (error) {
        onError(error as Error)
        return { provider: 'bluesky', status: 'error', items: [], error_code: 'provider_error' }
      }
    },
  }
}

function buildBlueskyBucket(
  items: FediverseSearchResult[],
  upstreamCursor: string | undefined,
): FediverseSearchBucket {
  if (!upstreamCursor) {
    return { provider: 'bluesky', status: 'ok', items }
  }
  return {
    provider: 'bluesky',
    status: 'ok',
    items,
    next_cursor: encodeFediverseCursor('bluesky', upstreamCursor),
  }
}
