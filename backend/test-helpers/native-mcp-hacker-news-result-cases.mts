import type { McpResultFixtureCase } from './native-mcp-option-result-cases.mts'

const id = '0198ffff-0000-7000-8000-000000000002'
const createdAt = '2026-10-09T00:00:00.000Z'
const counts = { story_count: 2, comment_count: 3 }
const detail = {
  ...counts,
  stories: [{ hacker_news_item_id: 1, points: 4, reply_count: 2, posted_at: createdAt }],
  comments: [{ hacker_news_item_id: 2, parent_story_item_id: 3, posted_at: createdAt }],
}
const page_info = { has_next_page: false, start_cursor: null, end_cursor: null }
const article = {
  id,
  title: 'Example article',
  markdown: 'Example article text',
  url: 'https://example.test/article',
  guid: 'article-guid',
  published_at: createdAt,
  rss_feed_id: id,
  rss_feed_title: 'Example feed',
}

/** Visible counts and capped metadata rows exercise the optional public HN output contract. */
export const hackerNewsMcpResultCases: readonly McpResultFixtureCase[] = [
  {
    id: 'native.mcp.read-posts.hacker-news-search',
    tool: 'read_posts',
    arguments: { option: 'search', arguments: {} },
    structuredContent: {
      success: true,
      results: [
        {
          id,
          title: 'Example post',
          post_type: 'link',
          hacker_news_references: counts,
        },
      ],
      page_info,
    },
  },
  {
    id: 'native.mcp.read-posts.hacker-news-details',
    tool: 'read_posts',
    arguments: { option: 'details', arguments: { post_id: id } },
    structuredContent: {
      success: true,
      post: {
        data_point_vertical: null,
        structured_data: null,
        id,
        slug: 'example-post',
        post_type: 'link',
        title: 'Example post',
        markdown: 'Example post text',
        parent_post_id: null,
        root_post_id: null,
        created_by_id: id,
        is_anonymous: false,
        created_at: createdAt,
        updated_at: createdAt,
        hacker_news_references: detail,
      },
    },
  },
  {
    id: 'native.mcp.read-rss-item.hacker-news-list',
    tool: 'read_rss_feed_item',
    arguments: { option: 'list', arguments: {} },
    structuredContent: {
      success: true,
      results: [{ ...article, hacker_news_references: counts }],
      page_info,
    },
  },
  {
    id: 'native.mcp.read-rss-item.hacker-news-details',
    tool: 'read_rss_feed_item',
    arguments: { option: 'details', arguments: { rss_feed_item_id: id } },
    structuredContent: {
      success: true,
      rss_feed_item: { ...article, hacker_news_references: detail },
    },
  },
  {
    id: 'native.mcp.get-story.hacker-news-members',
    tool: 'get_story',
    arguments: { story_id: id },
    structuredContent: {
      success: true,
      story: {
        id,
        title: null,
        cluster_reason: null,
        published_at: createdAt,
        official_rss_feed_item_id: null,
        created_at: createdAt,
        updated_at: createdAt,
      },
      items: [{ ...article, hacker_news_references: counts }],
      page_info,
    },
  },
]
