import onError from '@modules/on-error'
import type { FediverseSearchBucket, FediverseSearchResult } from '../types.mts'
import { decodeFediverseCursor, encodeFediverseCursor } from '../cursor.mts'
import {
  type PeerTubeChannel,
  type PeerTubeVideo,
  mapPeerTubeChannel,
  mapPeerTubeVideo,
} from './peertube-mappers.mts'

export type PeerTubeCombinedCursor = { v: number; c: number }

type PeerTubeSearchResponse<T> = { total: number; data: T[] }
type PeerTubeSettled<T> = PromiseSettledResult<PeerTubeSearchResponse<T>>

// The untyped (all-types) branch combines two independent sub-searches into
// one page, so each must track its own start offset — advancing both by the
// same amount would skip whichever sub-search's items got sliced off.
export function decodePeerTubeCombinedCursor(cursor: string | undefined): PeerTubeCombinedCursor {
  const raw = decodeFediverseCursor(cursor, 'peertube')
  if (!raw) return { v: 0, c: 0 }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<'v' | 'c', unknown>>
    const v =
      typeof parsed.v === 'number' && Number.isFinite(parsed.v) && parsed.v >= 0 ? parsed.v : 0
    const c =
      typeof parsed.c === 'number' && Number.isFinite(parsed.c) && parsed.c >= 0 ? parsed.c : 0
    return { v, c }
  } catch {
    return { v: 0, c: 0 }
  }
}

function encodePeerTubeCombinedCursor(v: number, c: number): string {
  return encodeFediverseCursor('peertube', JSON.stringify({ v, c }))
}

// A rejected sub-search shouldn't discard a successful sibling's results;
// only report `error` when both video and channel searches fail, and keep
// a failed side's cursor offset unchanged so the next page retries it.
export function buildPeerTubeCombinedBucket(
  combined: PeerTubeCombinedCursor,
  limit: number,
  videosResult: PeerTubeSettled<PeerTubeVideo>,
  channelsResult: PeerTubeSettled<PeerTubeChannel>,
): FediverseSearchBucket {
  if (videosResult.status === 'rejected') onError(videosResult.reason as Error)
  if (channelsResult.status === 'rejected') onError(channelsResult.reason as Error)
  if (videosResult.status === 'rejected' && channelsResult.status === 'rejected') {
    return { provider: 'peertube', status: 'error', items: [], error_code: 'provider_error' }
  }

  const videos = videosResult.status === 'fulfilled' ? videosResult.value : { total: 0, data: [] }
  const channels =
    channelsResult.status === 'fulfilled' ? channelsResult.value : { total: 0, data: [] }
  const mappedVideos = videos.data.map(mapPeerTubeVideo)
  const mappedChannels = channels.data.map(mapPeerTubeChannel)
  const items: FediverseSearchResult[] = [...mappedVideos, ...mappedChannels].slice(0, limit)

  const emittedVideos = Math.min(mappedVideos.length, limit)
  const emittedChannels = Math.max(0, Math.min(mappedChannels.length, limit - emittedVideos))
  const nextVideosStart = combined.v + emittedVideos
  const nextChannelsStart = combined.c + emittedChannels
  const hasMore =
    videosResult.status === 'rejected' ||
    channelsResult.status === 'rejected' ||
    videos.total > nextVideosStart ||
    channels.total > nextChannelsStart

  const status =
    videosResult.status === 'fulfilled' && channelsResult.status === 'fulfilled' ? 'ok' : 'partial'
  if (!hasMore) {
    return status === 'ok'
      ? { provider: 'peertube', status, items }
      : { provider: 'peertube', status, items, error_code: 'provider_error' }
  }
  const next_cursor = encodePeerTubeCombinedCursor(nextVideosStart, nextChannelsStart)
  return status === 'ok'
    ? { provider: 'peertube', status, items, next_cursor }
    : { provider: 'peertube', status, items, next_cursor, error_code: 'provider_error' }
}
