import type { FediverseSearchResult } from '../types.mts'

export type PeerTubeAccount = {
  name: string
  displayName?: string
  host: string
  url?: string
}

export type PeerTubeVideo = {
  uuid: string
  name: string
  description?: string | null
  thumbnailPath?: string | null
  publishedAt?: string | null
  url?: string
  account?: PeerTubeAccount
  channel?: PeerTubeAccount
}

export type PeerTubeChannel = {
  name: string
  displayName?: string
  description?: string | null
  host: string
  url?: string
  avatar?: { path?: string } | null
}

export function mapPeerTubeVideo(video: PeerTubeVideo): FediverseSearchResult {
  const hostname = video.account?.host ?? video.channel?.host ?? ''
  const externalUrl =
    video.url || (hostname ? `https://${hostname}/videos/watch/${video.uuid}` : '')
  return {
    provider: 'peertube',
    result_type: 'video',
    source_hostname: hostname,
    external_url: externalUrl,
    title: video.name,
    summary: video.description ?? '',
    author_name: video.account?.displayName ?? video.account?.name ?? null,
    author_url: video.account?.url ?? null,
    published_at: video.publishedAt ?? null,
    thumbnail_url:
      video.thumbnailPath && hostname ? `https://${hostname}${video.thumbnailPath}` : null,
  }
}

export function mapPeerTubeChannel(channel: PeerTubeChannel): FediverseSearchResult {
  const externalUrl = channel.url || `https://${channel.host}/video-channels/${channel.name}`
  const title = channel.displayName ?? channel.name
  return {
    provider: 'peertube',
    result_type: 'profile',
    source_hostname: channel.host,
    external_url: externalUrl,
    title,
    summary: channel.description ?? '',
    author_name: title,
    author_url: externalUrl,
    published_at: null,
    thumbnail_url: channel.avatar?.path ? `https://${channel.host}${channel.avatar.path}` : null,
  }
}
