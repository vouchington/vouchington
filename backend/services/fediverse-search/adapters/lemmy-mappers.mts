import type { FediverseSearchResult } from '../types.mts'

export type LemmyPostView = {
  post: {
    name: string
    body?: string | null
    ap_id: string
    published: string
    thumbnail_url?: string | null
  }
  creator: { name: string; display_name?: string | null; actor_id: string }
}

export type LemmyCommunityView = {
  community: {
    name: string
    title?: string
    description?: string | null
    actor_id: string
    icon?: string | null
    published: string
  }
}

export type LemmyPersonView = {
  person: {
    name: string
    display_name?: string | null
    bio?: string | null
    actor_id: string
    avatar?: string | null
    published: string
  }
}

export function mapLemmyPost(view: LemmyPostView): FediverseSearchResult {
  return {
    provider: 'lemmy',
    result_type: 'post',
    source_hostname: new URL(view.post.ap_id).hostname,
    external_url: view.post.ap_id,
    title: view.post.name,
    summary: view.post.body ?? '',
    author_name: view.creator.display_name ?? view.creator.name,
    author_url: view.creator.actor_id,
    published_at: view.post.published,
    thumbnail_url: view.post.thumbnail_url ?? null,
  }
}

export function mapLemmyPerson(view: LemmyPersonView): FediverseSearchResult {
  return {
    provider: 'lemmy',
    result_type: 'profile',
    source_hostname: new URL(view.person.actor_id).hostname,
    external_url: view.person.actor_id,
    title: view.person.display_name ?? view.person.name,
    summary: view.person.bio ?? '',
    author_name: view.person.display_name ?? view.person.name,
    author_url: view.person.actor_id,
    published_at: view.person.published,
    thumbnail_url: view.person.avatar ?? null,
  }
}

export function mapLemmyCommunity(view: LemmyCommunityView): FediverseSearchResult {
  // A Lemmy community is a Group actor, not a server — it maps to a profile result, not an instance.
  const title = view.community.title || view.community.name
  return {
    provider: 'lemmy',
    result_type: 'profile',
    source_hostname: new URL(view.community.actor_id).hostname,
    external_url: view.community.actor_id,
    title,
    summary: view.community.description ?? '',
    author_name: title,
    author_url: view.community.actor_id,
    published_at: view.community.published,
    thumbnail_url: view.community.icon ?? null,
  }
}
