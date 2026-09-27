import { community, communityPost, user } from './web-community-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityApplicationPinnedApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.application-questions.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/application-questions`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/application-questions',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      questions: [
        {
          __entity_type: 'community_application_question',
          id: 'question-1',
          community_id: community.id,
          question: 'Why do you want to join?',
          field_type: 'long_text',
          required: true,
          options: null,
          order_index: 0,
          created_at: community.created_at,
          deleted_at: null,
        },
      ],
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/application-questions.mts'],
  },
  {
    id: 'web.communities.pinned-posts.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/pinned-posts`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/pinned-posts',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      pinned_posts: [
        {
          __entity_type: 'community_pinned_post',
          community_id: community.id,
          post_id: communityPost.id,
          order_index: 0,
          pinned_by_id: user.id,
          created_at: community.created_at,
        },
      ],
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/pinned-posts.mts'],
  },
]
