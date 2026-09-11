import type {
  FediverseProviderAdapter,
  FediverseSearchBucket,
  FediverseSearchResult,
} from '../types.mts'
import onError from '@modules/on-error'
import { fetch } from 'undici'
import { getProviderRequestDispatcher } from '@modules/api-egress-proxy'
import { FEDIVERSE_PEERTUBE_HOST, FEDIVERSE_PROVIDER_TIMEOUT_MS } from '@voucha/config'
import { decodeFediverseCursor, encodeFediverseCursor } from '../cursor.mts'
import { buildPeerTubeCombinedBucket, decodePeerTubeCombinedCursor } from './peertube-cursor.mts'
import {
  type PeerTubeChannel,
  type PeerTubeVideo,
  mapPeerTubeChannel,
  mapPeerTubeVideo,
} from './peertube-mappers.mts'

export { mapPeerTubeChannel, mapPeerTubeVideo } from './peertube-mappers.mts'

type PeerTubeVideoSearchResponse = {
  total: number
  data: PeerTubeVideo[]
}

type PeerTubeChannelSearchResponse = {
  total: number
  data: PeerTubeChannel[]
}

/* no-mistakes: integration=peertube */
async function fetchPeerTubeVideos(
  host: string,
  q: string,
  start: number,
  count: number,
): Promise<PeerTubeVideoSearchResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FEDIVERSE_PROVIDER_TIMEOUT_MS)

  try {
    const url = new URL(`https://${host}/api/v1/search/videos`)
    url.searchParams.set('search', q)
    url.searchParams.set('start', String(start))
    url.searchParams.set('count', String(count))

    const response = await fetch(url, {
      dispatcher: getProviderRequestDispatcher('fediverse_search_enabled'),
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`PeerTube video search returned ${response.status} for host ${host}`)
    }

    return (await response.json()) as PeerTubeVideoSearchResponse
  } finally {
    clearTimeout(timeout)
  }
}

/* no-mistakes: integration=peertube */
async function fetchPeerTubeChannels(
  host: string,
  q: string,
  start: number,
  count: number,
): Promise<PeerTubeChannelSearchResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FEDIVERSE_PROVIDER_TIMEOUT_MS)

  try {
    const url = new URL(`https://${host}/api/v1/search/video-channels`)
    url.searchParams.set('search', q)
    url.searchParams.set('start', String(start))
    url.searchParams.set('count', String(count))

    const response = await fetch(url, {
      dispatcher: getProviderRequestDispatcher('fediverse_search_enabled'),
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`PeerTube channel search returned ${response.status} for host ${host}`)
    }

    return (await response.json()) as PeerTubeChannelSearchResponse
  } finally {
    clearTimeout(timeout)
  }
}

export function createPeerTubeAdapter(
  host: string = FEDIVERSE_PEERTUBE_HOST,
): FediverseProviderAdapter {
  return {
    provider: 'peertube',
    async search(options): Promise<FediverseSearchBucket> {
      if (options.type === 'post' || options.type === 'instance') {
        return { provider: 'peertube', status: 'ok', items: [] }
      }

      const limit = options.limit ?? 10
      const start = readPeerTubeStart(options.cursor)

      try {
        if (options.type === 'video') {
          const response = await fetchPeerTubeVideos(host, options.q, start, limit)
          return buildPeerTubeBucket(response.data.map(mapPeerTubeVideo), start, response.total)
        }

        if (options.type === 'profile') {
          const response = await fetchPeerTubeChannels(host, options.q, start, limit)
          return buildPeerTubeBucket(response.data.map(mapPeerTubeChannel), start, response.total)
        }

        const combined = decodePeerTubeCombinedCursor(options.cursor)
        const [videosResult, channelsResult] = await Promise.allSettled([
          fetchPeerTubeVideos(host, options.q, combined.v, limit),
          fetchPeerTubeChannels(host, options.q, combined.c, limit),
        ])
        return buildPeerTubeCombinedBucket(combined, limit, videosResult, channelsResult)
      } catch (error) {
        onError(error as Error)
        return { provider: 'peertube', status: 'error', items: [], error_code: 'provider_error' }
      }
    },
  }
}

function readPeerTubeStart(cursor: string | undefined): number {
  const value = decodeFediverseCursor(cursor, 'peertube')
  const start = value ? Number(value) : 0
  return Number.isFinite(start) && start > 0 ? start : 0
}

function buildPeerTubeBucket(
  items: FediverseSearchResult[],
  start: number,
  total: number,
): FediverseSearchBucket {
  const nextStart = start + items.length
  if (nextStart >= total) {
    return { provider: 'peertube', status: 'ok', items }
  }
  return {
    provider: 'peertube',
    status: 'ok',
    items,
    next_cursor: encodeFediverseCursor('peertube', String(nextStart)),
  }
}
