import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
}

const entityRelationMigratedFrom = [
  'backend/api/v1/entity-relations/__tests__/entity-relations.test.mts',
]

export const nativeEntityRelationReadApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.entity-relations.post.category.topic.default',
    method: 'GET',
    path: '/api/v1/entity-relations/post/post-1/category/topic',
    query: { limit: '1', sort: 'best', after: 'fixture-relation-scope-and-sort-cursor' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.post.category.topic.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/tags/__tests__/topic-category-tags-aside.mock.test.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.post.related.post.default',
    method: 'GET',
    path: '/api/v1/entity-relations/post/post-1/related/post',
    query: { limit: '100', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'related',
        objectType: 'post',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.post.related.post.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/tags/__tests__/post-related-topics-aside-content.mock.test.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.post.related.url.default',
    method: 'GET',
    path: '/api/v1/entity-relations/post/post-1/related/url',
    query: { limit: '100', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'related',
        objectType: 'url',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.post.related.url.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/tags/__tests__/post-related-urls-aside-content.mock.test.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.topic.publisher-type.topic.default',
    method: 'GET',
    path: '/api/v1/entity-relations/topic/topic-1/publisher_type/topic',
    query: { limit: '100', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'topic',
        entityId: 'topic-1',
        predicate: 'publisher_type',
        objectType: 'topic',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.topic.publisher-type.topic.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/tags/__tests__/topic-publisher-types-aside.mock.test.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.rss-feed-item.category.topic.default',
    method: 'GET',
    path: '/api/v1/entity-relations/rss_feed_item/item-1/category/topic',
    query: { limit: '100', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'rss_feed_item',
        entityId: 'item-1',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.rss-feed-item.category.topic.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/feed/manage-categories-menu-item.tsx',
    ],
  },
]
