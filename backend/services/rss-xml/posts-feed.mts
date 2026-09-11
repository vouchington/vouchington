import { getPostIds } from '@services/posts/search/get-ids'
import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { getPublicUserByAny } from '@services/users/get'
import { getPostRouteSegment } from '@services/entity-links/routes'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { buildRssXml, type RssChannel, type RssItem } from './xml-builder.mts'
import { renderPostDescriptions } from './posts-feed-descriptions.mts'
import type { Post } from '@services/posts/types'
import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import { VALID_RSS_POST_TYPES, isCatalogValue } from '@ts-shared/feed-capabilities'
import { getPublicPostIds } from '@services/posts'

export interface PostsFeedOptions {
  topicSlugs?: string[]
  postType?: string
  username?: string
  limit?: number
}

function buildPostLink(post: Post, baseUrl: string): string {
  return `${baseUrl}/${getPostRouteSegment(post.post_type)}/${post.slug ?? post.id}`
}

function buildChannelTitle(options: PostsFeedOptions, topicNames: string[]): string {
  if (options.username) {
    return `Posts by @${options.username}`
  }
  if (topicNames.length > 0) {
    return `${topicNames.join(', ')} - Posts`
  }
  return 'Latest Posts'
}

function buildChannelDescription(options: PostsFeedOptions, topicNames: string[]): string {
  if (options.username) {
    return `Recent posts by @${options.username}`
  }
  if (topicNames.length > 0) {
    return `Recent posts in ${topicNames.join(', ')}`
  }
  return 'Recent posts'
}

export async function buildPostsRssFeed(options: PostsFeedOptions): Promise<string> {
  try {
    return await buildPostsRssFeedImpl(options)
  } catch (err) {
    if (!err || typeof err !== 'object' || !('status' in err)) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
    throw err
  }
}

async function buildPostsRssFeedImpl(options: PostsFeedOptions): Promise<string> {
  const { topicSlugs, postType, username, limit = 25 } = options
  const baseUrl = SITEMAP_CONFIG.BASE_URL

  if (postType !== undefined && !isCatalogValue(VALID_RSS_POST_TYPES, postType)) {
    throw createHttpError(400, 'invalid post_type')
  }

  // Look up user if username provided
  let userId: string | undefined
  if (username) {
    const user = await getPublicUserByAny(username)
    if (!user) {
      const channel: RssChannel = {
        title: `Posts by @${username}`,
        link: baseUrl,
        description: `No posts found for @${username}`,
      }
      return buildRssXml(channel, [])
    }
    userId = user.id
  }

  // Look up topics if topicSlugs provided
  const topicIds: string[] = []
  const topicNames: string[] = []
  if (topicSlugs && topicSlugs.length > 0) {
    const topicLookups = await getTopicsByAnyBatch(topicSlugs)
    for (const topic of topicLookups) {
      if (topic) {
        topicIds.push(topic.id)
        topicNames.push(topic.name)
      }
    }
    // If all slugs were invalid, return empty feed rather than all posts
    if (topicIds.length === 0) {
      const channel: RssChannel = {
        title: buildChannelTitle(options, []),
        link: baseUrl,
        description: buildChannelDescription(options, []),
        lastBuildDate: new Date(),
      }
      return buildRssXml(channel, [])
    }
  }

  // Build post types filter
  const postTypes =
    postType !== undefined
      ? ([postType] as Post['post_type'][])
      : ([...VALID_RSS_POST_TYPES] as Post['post_type'][])

  // Search for post IDs
  const { results } = await getPostIds(undefined, {
    related_topic_ids: topicIds.length > 0 ? topicIds : undefined,
    post_types: postTypes,
    user_id: userId,
    time_range: 'all',
    sort: 'new',
    limit,
  })

  if (results.length === 0) {
    const channel: RssChannel = {
      title: buildChannelTitle(options, topicNames),
      link: baseUrl,
      description: buildChannelDescription(options, topicNames),
      lastBuildDate: new Date(),
    }
    return buildRssXml(channel, [])
  }

  // Fetch full post data
  const postIds = results.map(r => r.id)
  const posts = await getPostByAnyCachedBatch(postIds)
  const publicPostIds = await getPublicPostIds(postIds)

  // Search IDs and cached rows can straddle a state change, so verify the
  // canonical publication predicate again immediately before serialization.
  const validPosts = posts.filter(
    (post): post is NonNullable<typeof post> => !!post && publicPostIds.has(post.id),
  )

  // Render markdown to HTML, partitioned by admin status
  const descriptions = await renderPostDescriptions(validPosts)

  const rssItems: RssItem[] = validPosts.map((post, i) => ({
    title: post.title || 'Untitled',
    link: buildPostLink(post, baseUrl),
    description: descriptions[i] ?? '',
    pubDate: post.created_at,
    guid: post.id,
    categories: post.post_related_topics?.map(t => t.name) ?? [],
  }))

  const channel: RssChannel = {
    title: buildChannelTitle(options, topicNames),
    link: baseUrl,
    description: buildChannelDescription(options, topicNames),
    lastBuildDate: new Date(),
  }

  return buildRssXml(channel, rssItems)
}
