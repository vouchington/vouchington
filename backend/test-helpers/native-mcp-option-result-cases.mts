import { emailPreferencesFixture } from './api-fixtures/swift-email-cases.mts'

/** Structured MCP results consumed by native clients. The catalog validates each case. */
export type McpResultFixtureCase = {
  id: string
  tool: string
  arguments: Record<string, unknown>
  structuredContent: Record<string, unknown>
}

const userId = '0198ffff-0000-7000-8000-000000000001'
const entityId = '0198ffff-0000-7000-8000-000000000002'
const createdAt = '2026-10-09T00:00:00.000Z'
const pageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }
const feedResult = {
  success: true,
  results: [
    {
      id: entityId,
      entity_id: entityId,
      delivery_type: 'share',
      shared_by_id: userId,
      shared_at: createdAt,
    },
  ],
  page_info: pageInfo,
}

/** Synthetic service-shaped facts validated against each real selected catalog contract. */
export const optionMcpResultCases: readonly McpResultFixtureCase[] = [
  {
    id: 'native.mcp.read-my-profile.bio',
    tool: 'read_my_profile',
    arguments: { option: 'bio', arguments: {} },
    structuredContent: { success: true, profile: { id: userId, markdown: 'Example bio' } },
  },
  {
    id: 'native.mcp.read-my-profile.links',
    tool: 'read_my_profile',
    arguments: { option: 'links', arguments: {} },
    structuredContent: {
      success: true,
      results: [
        {
          id: entityId,
          user_id: userId,
          link_type: 'github',
          handle: 'example',
          name: null,
          url: null,
          url_id: null,
          image_id: null,
          image_placement: null,
          sort_order: 0,
          created_at: createdAt,
          updated_at: createdAt,
        },
      ],
    },
  },
  {
    id: 'native.mcp.read-my-preferences.email',
    tool: 'read_my_preferences',
    arguments: { option: 'email', arguments: {} },
    structuredContent: { success: true, email_preferences: emailPreferencesFixture },
  },
  {
    id: 'native.mcp.read-my-preferences.general',
    tool: 'read_my_preferences',
    arguments: { option: 'general', arguments: {} },
    structuredContent: {
      success: true,
      settings: {
        follows_visibility: 'everyone',
        topic_follows_visibility: 'followers',
        rss_feed_follows_visibility: 'mutual_followers',
        community_memberships_visibility: 'nobody',
        followers_visibility: 'users',
        likes_visibility: 'nobody',
        direct_messages_audience: 'mutual_followers',
        default_post_broadcast: 'followers',
        default_post_privacy: 'private',
        country: 'US',
        ui_locale: null,
        should_import_hacker_news_discussions: false,
      },
    },
  },
  {
    id: 'native.mcp.read-feed.posts',
    tool: 'read_feed',
    arguments: { option: 'posts', arguments: { feed_type: 'follow_users' } },
    structuredContent: feedResult,
  },
  {
    id: 'native.mcp.read-feed.rss-items',
    tool: 'read_feed',
    arguments: { option: 'rss_items', arguments: { feed_type: 'follow_rss_feeds' } },
    structuredContent: feedResult,
  },
  {
    id: 'native.mcp.read-feed.referral-links',
    tool: 'read_feed',
    arguments: { option: 'referral_links', arguments: { feed_type: 'follow_users' } },
    structuredContent: { success: true, results: [], page_info: pageInfo },
  },
  {
    id: 'native.mcp.manage-bookmark.set',
    tool: 'manage_bookmark',
    arguments: {
      option: 'set',
      arguments: { entity_type: 'topic', entity_id: entityId, predicate: 'follow' },
    },
    structuredContent: {
      success: true,
      bookmark: {
        subject_id: userId,
        object_id: entityId,
        created_at: createdAt,
        created_by_id: userId,
      },
    },
  },
  {
    id: 'native.mcp.manage-bookmark.remove',
    tool: 'manage_bookmark',
    arguments: {
      option: 'remove',
      arguments: { entity_type: 'topic', entity_id: entityId, predicate: 'follow' },
    },
    structuredContent: { success: true },
  },
]
