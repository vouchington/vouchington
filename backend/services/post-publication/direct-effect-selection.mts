import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { PublicationCapturedKey } from './captured-keys.mts'
import type { LivePublicationPost } from './live-publication-posts.mts'

type SitemapPostType = (typeof SITEMAP_CONFIG.POST_TYPES)[number]

export type DirectPublicationEffectSelection = {
  posts: LivePublicationPost[]
  missingPostIds: string[]
  topicIds: string[]
  rssFeedItemIds: string[]
  sitemapTargets: Array<{ postType: SitemapPostType; day: string }>
  identityKeys: Array<{
    kind: 'author' | 'community' | 'community_slug' | 'post_slug' | 'rss_feed' | 'topic_alias'
    value: string
  }>
}

/** Combines committed preimage keys with the current rows returned by a bounded post-ID read. */
export function selectDirectPublicationEffects(
  capturedKeys: readonly PublicationCapturedKey[],
  posts: readonly LivePublicationPost[],
): DirectPublicationEffectSelection {
  const seenPosts = new Set(posts.map(post => post.id))
  const impactedPostIds = new Set<string>()
  const topicIds = new Set<string>()
  const rssFeedItemIds = new Set<string>()
  const identityKeys = new Map<string, DirectPublicationEffectSelection['identityKeys'][number]>()
  const sitemapTargets = new Map<
    string,
    DirectPublicationEffectSelection['sitemapTargets'][number]
  >()
  const addIdentity = (
    kind: DirectPublicationEffectSelection['identityKeys'][number]['kind'],
    value: string | null,
  ) => {
    if (value) identityKeys.set(`${kind}:${value}`, { kind, value })
  }
  const addSitemapTarget = (postType: string, day: string) => {
    if (!(SITEMAP_CONFIG.POST_TYPES as readonly string[]).includes(postType)) return
    const target = { postType: postType as SitemapPostType, day }
    sitemapTargets.set(`${postType}:${day}`, target)
  }

  for (const key of capturedKeys) {
    switch (key.kind) {
      case 'impact_post':
        impactedPostIds.add(key.uuidValue)
        break
      case 'impact_topic':
        topicIds.add(key.uuidValue)
        break
      case 'impact_community':
        addIdentity('community', key.uuidValue)
        break
      case 'impact_rss_feed_item':
        rssFeedItemIds.add(key.uuidValue)
        break
      case 'identity_author':
        addIdentity('author', key.uuidValue)
        break
      case 'identity_author_username':
        addIdentity('author', key.textValue)
        break
      case 'identity_community':
        addIdentity('community', key.uuidValue)
        break
      case 'identity_community_slug':
        addIdentity('community_slug', key.textValue)
        break
      case 'identity_post_slug':
        addIdentity('post_slug', key.textValue)
        break
      case 'identity_rss_feed':
        addIdentity('rss_feed', key.uuidValue)
        break
      case 'identity_topic_alias':
        addIdentity('topic_alias', key.textValue)
        break
      case 'sitemap_target':
        addSitemapTarget(key.postType, key.day)
        break
    }
  }
  for (const post of posts) {
    addIdentity('author', post.created_by_id)
    addIdentity('community', post.community_id)
    addSitemapTarget(post.post_type, post.sitemap_day)
  }
  return {
    posts: [...posts],
    missingPostIds: [...impactedPostIds].filter(id => !seenPosts.has(id)),
    topicIds: [...topicIds],
    rssFeedItemIds: [...rssFeedItemIds],
    sitemapTargets: [...sitemapTargets.values()],
    identityKeys: [...identityKeys.values()],
  }
}
