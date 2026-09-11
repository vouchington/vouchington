import type { ViewAgentModerationElection } from '@services/elections-votes/agent-moderation'
import type { ElectionVote } from '@services/elections-votes/shared'
import type { AgentModerationResult } from '@services/moderation'
import type { Post, PostElection, PostMetrics, PostSearchResult } from '@services/posts'
import type { UrlEmbed } from '@services/rss-feed-items/get-url-embed'
import type { PageInfo } from '@voucha/types/pagination'
import type { StreamJsonObjectInput } from '@jongleberry/api-server'

export type PostsResponseBody = {
  results: PostSearchResult[]
  page_info: PageInfo
  posts: Record<string, Post>
  posts_metrics: Record<string, PostMetrics>
  post_elections: Record<string, PostElection>
  markdown_to_html: Record<string, string>
  communities?: Record<string, { id: string; name: string; slug: string }>
  post_link_embeds?: Record<string, UrlEmbed>
  bookmarks?: Record<string, Record<string, boolean>>
  election_votes?: Record<string, ElectionVote>
  post_moderations?: Record<string, AgentModerationResult[]>
  agent_moderation_elections?: Record<string, ViewAgentModerationElection>
}

export type PostsResponseInput = StreamJsonObjectInput<PostsResponseBody>
