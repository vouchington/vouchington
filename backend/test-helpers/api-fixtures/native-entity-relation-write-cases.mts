import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
}

const entityRelationMigratedFrom = [
  'backend/api/v1/entity-relations/__tests__/entity-relations.test.mts',
]

export const nativeEntityRelationWriteApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.entity-relations.post.category.topic.create.default',
    method: 'POST',
    path: '/api/v1/entity-relations/post/post-1/category/topic',
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    requestBody: { objectId: 'topic-2' },
    status: 201,
    body: responseBody('native.entity-relations.post.category.topic.create.default'),
    migratedFrom: [...entityRelationMigratedFrom, 'web/components/tags/add-tag-form.tsx'],
  },
  {
    ...shared,
    id: 'native.entity-relations.user.category.topic.default',
    method: 'GET',
    path: '/api/v1/entity-relations/user/user-abc/category/topic',
    query: { limit: '100', positiveNetVoteScore: 'true', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'user',
        entityId: 'user-abc',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.user.category.topic.default'),
    migratedFrom: [
      'backend/api/v1/entity-relations/__tests__/user-tags.test.mts',
      'web/components/users/user-tags-aside.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.user.category.topic.create.default',
    method: 'POST',
    path: '/api/v1/entity-relations/user/user-abc/category/topic',
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'user',
        entityId: 'user-abc',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    requestBody: { objectId: 'user-tag-bot' },
    status: 201,
    body: responseBody('native.entity-relations.user.category.topic.create.default'),
    migratedFrom: [
      'backend/api/v1/entity-relations/__tests__/user-tags.test.mts',
      'web/components/tags/add-tag-form.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.post.category.topic.vote.default',
    method: 'PUT',
    path: '/api/v1/entity-relations/relation-post-category-topic-1/vote',
    route: {
      routeTemplate: '/api/v1/entity-relations/:id/vote',
      pathParams: { id: 'relation-post-category-topic-1' },
    },
    requestBody: { choice: 'confirm' },
    status: 204,
    body: responseBody('native.entity-relations.post.category.topic.vote.default'),
    migratedFrom: [
      'backend/api/v1/entity-relations/__tests__/entity-relations.vote.test.mts',
      'web/components/tags/tag-item.tsx',
    ],
  },
]
