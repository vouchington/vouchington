import type { FediverseSearchResult } from '../types.mts'

const BLUESKY_WEB_HOST = 'bsky.app'

export type BlueskyActor = {
  did: string
  handle: string
  displayName?: string
  description?: string
  avatar?: string
}

export type BlueskyPostAuthor = {
  handle: string
  displayName?: string
}

export type BlueskyPostRecord = {
  text: string
  createdAt?: string
}

export type BlueskyPost = {
  uri: string
  author: BlueskyPostAuthor
  record: BlueskyPostRecord
  indexedAt?: string
}

export function mapBlueskyActor(actor: BlueskyActor): FediverseSearchResult {
  const externalUrl = `https://${BLUESKY_WEB_HOST}/profile/${actor.handle}`
  const title = actor.displayName || actor.handle
  return {
    provider: 'bluesky',
    result_type: 'profile',
    source_hostname: BLUESKY_WEB_HOST,
    external_url: externalUrl,
    title,
    summary: actor.description ?? '',
    author_name: title,
    author_url: externalUrl,
    published_at: null,
    thumbnail_url: actor.avatar ?? null,
  }
}

export function mapBlueskyPost(post: BlueskyPost): FediverseSearchResult {
  const rkey = post.uri.split('/').at(-1) ?? ''
  const externalUrl = `https://${BLUESKY_WEB_HOST}/profile/${post.author.handle}/post/${rkey}`
  return {
    provider: 'bluesky',
    result_type: 'post',
    source_hostname: BLUESKY_WEB_HOST,
    external_url: externalUrl,
    title: post.record.text,
    summary: '',
    author_name: post.author.displayName || post.author.handle,
    author_url: `https://${BLUESKY_WEB_HOST}/profile/${post.author.handle}`,
    published_at: post.record.createdAt ?? post.indexedAt ?? null,
    thumbnail_url: null,
  }
}
