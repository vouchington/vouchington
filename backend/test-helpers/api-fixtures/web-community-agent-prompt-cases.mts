import { community, communityAiAgent, timestamp, user } from './web-community-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityAgentPromptApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.ai-agents.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/ai-agents`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/ai-agents',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: { community_ai_agents: [communityAiAgent] },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/ai-agents.mts'],
  },
  {
    id: 'web.communities.agent-prompts.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/agent-prompts`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/agent-prompts',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      community_agent_prompts: [
        {
          id: 'prompt-1',
          community_id: community.id,
          created_by_id: 'user-1',
          slot_allocated: true,
          activated_at: timestamp,
          deactivated_at: null,
          deleted_at: null,
          deleted_by_id: null,
          agent_id: 'agent-1',
          prompt: 'Welcome new members.',
          model_name: 'gpt-5.4-nano',
          model_provider: 'openai',
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
      slot_info: {
        limit: 3,
        limits_by_plan: { plus: 3, pro: 10 },
        remaining: 2,
        used: 1,
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/agent-prompts.mts'],
  },
  {
    id: 'web.communities.agent-prompts.history.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/agent-prompts/history`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/agent-prompts/history',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      entries: [
        {
          id: 'prompt-history-1',
          community_id: community.id,
          agent_prompt_id: 'prompt-1',
          action: 'created',
          changed_by: { id: user.id, username: user.username },
          previous_fields: {},
          next_fields: { prompt: 'Welcome new members.' },
          changed_fields: {},
          created_at: timestamp,
        },
      ],
      next_cursor: null,
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/agent-prompts-history.mts'],
  },
]
