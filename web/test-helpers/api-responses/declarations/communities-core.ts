import communitiesAgentPromptsDefault from '../../../../api-fixtures/v1/responses/web.communities.agent-prompts.default.json'
import communitiesAgentPromptsHistoryDefault from '../../../../api-fixtures/v1/responses/web.communities.agent-prompts.history.default.json'
import communitiesAiAgentDefault from '../../../../api-fixtures/v1/responses/web.communities.ai-agent.default.json'
import communitiesAiAgentsDefault from '../../../../api-fixtures/v1/responses/web.communities.ai-agents.default.json'
import communitiesApplicationQuestionsDefault from '../../../../api-fixtures/v1/responses/web.communities.application-questions.default.json'
import communitiesApplicationsDefault from '../../../../api-fixtures/v1/responses/web.communities.applications.default.json'
import communitiesArchiveDefault from '../../../../api-fixtures/v1/responses/web.communities.archive.default.json'
import communitiesInvitesDefault from '../../../../api-fixtures/v1/responses/web.communities.invites.default.json'
import communitiesMembersDefault from '../../../../api-fixtures/v1/responses/web.communities.members.default.json'
import communitiesNewsDefault from '../../../../api-fixtures/v1/responses/web.communities.news.default.json'
import communitiesPinnedPostsDefault from '../../../../api-fixtures/v1/responses/web.communities.pinned-posts.default.json'
import communitiesPostsDefault from '../../../../api-fixtures/v1/responses/web.communities.posts.default.json'
import communitiesSearchDefault from '../../../../api-fixtures/v1/responses/web.communities.search.default.json'
import communitiesShowDefault from '../../../../api-fixtures/v1/responses/web.communities.show.default.json'
import type {
  CommunityAgentPromptHistoryEntry,
  CommunityAgentPromptsResponseBody,
} from '@/lib/api/client/community-agent-prompts'
import type {
  CommunitiesSearchResponseBody,
  CommunityAiAgentResponseBody,
  CommunityAiAgentsResponseBody,
  CommunityApplicationQuestionsResponseBody,
  CommunityApplicationsResponseBody,
  CommunityArchiveResponseBody,
  CommunityInvitesResponseBody,
  CommunityMembersResponseBody,
  CommunityPinnedPostsResponseBody,
  CommunityPostsResponseBody,
  CommunityResponseBody,
} from '@/types/api-responses'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const COMMUNITIES_CORE_DECLARATIONS = [
  defineWebApiFixture<{
    entries: CommunityAgentPromptHistoryEntry[]
    next_cursor: string | null
  }>()(
    'web.communities.agent-prompts.history.default',
    communitiesAgentPromptsHistoryDefault,
    context =>
      context.server.communityAgentPrompts.getCommunityAgentPromptHistory('test-community'),
    [
      context =>
        context.client.communityAgentPrompts.fetchCommunityAgentPromptHistory('test-community'),
    ],
  ),
  defineWebApiFixture<CommunityAgentPromptsResponseBody>()(
    'web.communities.agent-prompts.default',
    communitiesAgentPromptsDefault,
    context => context.server.communityAgentPrompts.getCommunityAgentPrompts('test-community'),
    [context => context.client.communityAgentPrompts.fetchCommunityAgentPrompts('test-community')],
  ),
  defineWebApiFixture<CommunityAiAgentResponseBody>()(
    'web.communities.ai-agent.default',
    communitiesAiAgentDefault,
    context =>
      context.client.communityAiAgents.enableCommunityAiAgent('test-community', 'self-promotion'),
  ),
  defineWebApiFixture<CommunityAiAgentsResponseBody>()(
    'web.communities.ai-agents.default',
    communitiesAiAgentsDefault,
    context => context.server.communities.getCommunityAiAgents('test-community'),
  ),
  defineWebApiFixture<CommunityApplicationQuestionsResponseBody>()(
    'web.communities.application-questions.default',
    communitiesApplicationQuestionsDefault,
    context => context.server.communities.getCommunityApplicationQuestions('test-community'),
  ),
  defineWebApiFixture<CommunityApplicationsResponseBody>()(
    'web.communities.applications.default',
    communitiesApplicationsDefault,
    context =>
      context.server.communities.getCommunityApplications('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<CommunityArchiveResponseBody>()(
    'web.communities.archive.default',
    communitiesArchiveDefault,
    context => context.client.communityArchive.archiveCommunity('test-community'),
  ),
  defineWebApiFixture<CommunitiesSearchResponseBody>()(
    'web.communities.search.default',
    communitiesSearchDefault,
    context => context.server.communities.getCommunities({ searchParams: { q: 'test' } }),
    [
      context => context.client.communitySearch.fetchCommunities({ q: 'test' }),
      context =>
        context.server.trendingCommunities.getTrendingCommunities({ searchParams: { q: 'test' } }),
    ],
  ),
  defineWebApiFixture<CommunityResponseBody>()(
    'web.communities.show.default',
    communitiesShowDefault,
    context => context.server.communities.getCommunity('test-community'),
  ),
  defineWebApiFixture<CommunityInvitesResponseBody>()(
    'web.communities.invites.default',
    communitiesInvitesDefault,
    context =>
      context.server.communities.getCommunityInvites('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<CommunityMembersResponseBody>()(
    'web.communities.members.default',
    communitiesMembersDefault,
    context =>
      context.server.communities.getCommunityMembers('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<RssFeedItemsFeedResponseBody>()(
    'web.communities.news.default',
    communitiesNewsDefault,
    context =>
      context.server.communities.getCommunityNews('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
  defineWebApiFixture<CommunityPinnedPostsResponseBody>()(
    'web.communities.pinned-posts.default',
    communitiesPinnedPostsDefault,
    context => context.server.communities.getCommunityPinnedPosts('test-community'),
    [context => context.client.communities.fetchCommunityPinnedPosts('test-community')],
  ),
  defineWebApiFixture<CommunityPostsResponseBody>()(
    'web.communities.posts.default',
    communitiesPostsDefault,
    context =>
      context.server.communities.getCommunityPosts('test-community', {
        searchParams: { limit: 25 },
      }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
