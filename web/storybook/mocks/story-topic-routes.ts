import { storyText } from './story-mutation-bodies'

const emptyPage = { has_next_page: false, end_cursor: null, start_cursor: null }
const storyAt = '2026-09-26T00:00:00.000Z'

let enabled = false
let nextAlias = 0
let aliasRecords: { id: string; alias: string }[] = []
let rssFeed: Record<string, unknown> | null = null

export function setStoryTopicRoutes(): void {
  enabled = true
  nextAlias = 0
  aliasRecords = []
  rssFeed = null
}

export function clearStoryTopicRoutes(): void {
  setStoryTopicRoutes()
  enabled = false
}

function record(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

function aliasList() {
  return {
    results: aliasRecords.map(alias => alias.alias),
    alias_records: aliasRecords,
    page_info: emptyPage,
  }
}

function storyTopic(id: string, body: unknown) {
  const fields = record(body)
  const hostname = typeof fields.hostname === 'string' ? fields.hostname : null
  return {
    id,
    name: typeof fields.name === 'string' ? fields.name : 'Story topic',
    slug: typeof fields.slug === 'string' ? fields.slug : 'story-topic',
    topic_type: typeof fields.topic_type === 'string' ? fields.topic_type : 'topic',
    markdown: typeof fields.markdown === 'string' ? fields.markdown : '',
    hostname_id: hostname ? 'hostname-story' : null,
    hostname: hostname ? { hostname } : null,
  }
}

function rememberFeed(endpoint: string, body: unknown) {
  const fields = record(body)
  const current = rssFeed ?? {
    id: endpoint.split('/')[4] ?? 'rss-feed-story',
    title: null,
    rss_feed_url: { url: 'https://example.com/feed.xml' },
    home_page_url: null,
    is_enabled: true,
    is_discoverable: true,
    last_fetched_at: null,
    etag: null,
    last_modified_at: null,
  }
  rssFeed = {
    ...current,
    ...(typeof fields.title === 'string' || fields.title === null ? { title: fields.title } : {}),
    ...(typeof fields.rss_feed_url === 'string'
      ? { rss_feed_url: { url: fields.rss_feed_url } }
      : {}),
    ...(typeof fields.enabled === 'boolean' ? { is_enabled: fields.enabled } : {}),
    ...(typeof fields.discoverable === 'boolean' ? { is_discoverable: fields.discoverable } : {}),
  }
  return { rss_feed: rssFeed }
}

export function storyTopicGet(endpoint: string): unknown | undefined {
  if (!enabled) return undefined
  if (/^\/api\/v1\/topics\/[^/]+\/aliases$/.test(endpoint)) return aliasList()
  if (/^\/api\/v1\/topics\/[^/]+\/prioritized-referral-links$/.test(endpoint)) {
    return {
      links: [
        {
          id: 'referral-link-story',
          user_id: null,
          is_official: true,
          referral_program_id: endpoint.split('/')[4] ?? 'topic-story',
          url: 'https://example.com/refer',
          label: 'Story referral',
          priority_group: 1,
          contribution_rank: 1,
          tier_rank: 1,
          best_score: 1,
          review_post_id: null,
          review_post_slug: null,
          review_avg_rating: null,
        },
      ],
      users: {},
    }
  }
  if (endpoint === '/api/v1/rss-feeds') {
    return { results: rssFeed ? [rssFeed] : [], page_info: emptyPage }
  }
  if (/^\/api\/v1\/rss-feeds\/[^/]+\/crawls$/.test(endpoint)) {
    return { results: [], page_info: emptyPage }
  }
  if (/^\/api\/v1\/referral-link-validations\/[^/]+$/.test(endpoint)) {
    return {
      validation: {
        id: 'validation-story',
        slug: endpoint.split('/').pop() ?? 'validation-story',
        user_help_text: '',
        updated_at: storyAt,
      },
    }
  }
  return undefined
}

export function storyTopicPost(endpoint: string, body: unknown): unknown | undefined {
  if (/^\/api\/v1\/topics\/[^/]+\/aliases$/.test(endpoint)) {
    const added = storyText(body, 'aliases')
      .split(/[\n,]/)
      .map(alias => alias.trim())
      .filter(Boolean)
      .map(alias => ({ id: `alias-story-${(nextAlias += 1)}`, alias }))
    aliasRecords = [...aliasRecords, ...added]
    return { added }
  }
  if (/^\/api\/v1\/topics\/[^/]+\/merges$/.test(endpoint)) {
    const destinationId = storyText(body, 'destination_id_or_slug') || 'topic-story'
    return {
      topic: storyTopic(destinationId, { name: 'Destination topic', slug: 'destination-topic' }),
      topic_merge: {
        source_topic_id: endpoint.split('/')[4] ?? 'source-topic',
        destination_topic_id: destinationId,
        moved_aliases: [],
      },
    }
  }
  if (/^\/api\/v1\/topics\/[^/]+\/additional-hostnames$/.test(endpoint)) {
    const hostname = storyText(body, 'hostname')
    return {
      additional_hostname: {
        hostname_id: `hostname-${hostname || 'story'}`,
        hostname,
        topic_id: endpoint.split('/')[4] ?? 'topic-story',
        created_at: storyAt,
      },
    }
  }
  if (/^\/api\/v1\/rss-feeds\/[^/]+\/refreshes$/.test(endpoint)) {
    return {
      success: true,
      message: 'RSS refresh enqueued',
      rss_feed_id: endpoint.split('/')[4] ?? 'rss-feed-story',
      force: true,
    }
  }
  return undefined
}

export function storyTopicPatch(endpoint: string, body: unknown): unknown | undefined {
  const topic = endpoint.match(/^\/api\/v1\/topics\/([^/]+)$/)
  if (topic) return { topic: storyTopic(topic[1]!, body) }
  if (/^\/api\/v1\/topics\/[^/]+\/spending-category$/.test(endpoint)) {
    return { spending_category_attributes: record(body) }
  }
  const attributes = endpoint.match(/^\/api\/v1\/topics\/[^/]+\/([^/]+)$/)
  if (attributes) {
    return { [`${attributes[1]!.replaceAll('-', '_')}_attributes`]: record(body) }
  }
  if (/^\/api\/v1\/rss-feeds\/[^/]+$/.test(endpoint)) return rememberFeed(endpoint, body)
  return undefined
}

export function storyTopicDelete(endpoint: string): unknown | undefined {
  const alias = endpoint.match(/^\/api\/v1\/topics\/[^/]+\/aliases\/([^/]+)$/)
  if (alias) {
    aliasRecords = aliasRecords.filter(entry => entry.id !== alias[1])
    return {}
  }
  if (/^\/api\/v1\/topics\/[^/]+\/additional-hostnames\/[^/]+$/.test(endpoint)) return {}
  if (/^\/api\/v1\/rss-feeds\/[^/]+$/.test(endpoint)) {
    rssFeed = null
    return {}
  }
  return undefined
}
