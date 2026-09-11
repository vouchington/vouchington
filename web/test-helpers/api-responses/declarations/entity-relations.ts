import nativeEntityRelationsPostCategoryTopicCreateDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.post.category.topic.create.default.json'
import nativeEntityRelationsPostCategoryTopicDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.post.category.topic.default.json'
import nativeEntityRelationsPostCategoryTopicVoteDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.post.category.topic.vote.default.json'
import nativeEntityRelationsPostRelatedPostDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.post.related.post.default.json'
import nativeEntityRelationsPostRelatedUrlDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.post.related.url.default.json'
import nativeEntityRelationsRssFeedItemCategoryTopicDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.rss-feed-item.category.topic.default.json'
import nativeEntityRelationsTopicPublisherTypeTopicDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.topic.publisher-type.topic.default.json'
import nativeEntityRelationsUserCategoryTopicCreateDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.user.category.topic.create.default.json'
import nativeEntityRelationsUserCategoryTopicDefault from '../../../../api-fixtures/v1/responses/native.entity-relations.user.category.topic.default.json'
import type {
  EntityRelationCreateResponseBody,
  EntityRelationsResponseBody,
} from '@/types/entity-relations'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const ENTITY_RELATIONS_DECLARATIONS = [
  defineWebApiFixture<EntityRelationCreateResponseBody>()(
    'native.entity-relations.post.category.topic.create.default',
    nativeEntityRelationsPostCategoryTopicCreateDefault,
    async context => ({
      relation: await context.client.entityRelations.createEntityRelation(
        'post',
        'post-1',
        'category',
        'topic',
        'topic-2',
      ),
    }),
  ),
  defineWebApiFixture<EntityRelationsResponseBody>()(
    'native.entity-relations.post.category.topic.default',
    nativeEntityRelationsPostCategoryTopicDefault,
    context =>
      context.server.entityRelations.getEntityRelations('post', 'post-1', 'category', 'topic', {
        searchParams: {
          after: 'fixture-relation-scope-and-sort-cursor',
          limit: 1,
          sort: 'best',
        },
      }),
    [
      context =>
        context.client.entityRelations.fetchEntityRelations('post', 'post-1', 'category', 'topic', {
          after: 'fixture-relation-scope-and-sort-cursor',
          limit: 1,
          sort: 'best',
        }),
    ],
  ),
  defineWebApiFixture<null>()(
    'native.entity-relations.post.category.topic.vote.default',
    nativeEntityRelationsPostCategoryTopicVoteDefault,
    context =>
      context.client.entityRelations.submitEntityRelationVote(
        'relation-post-category-topic-1',
        'confirm',
      ),
  ),
  defineWebApiFixture<EntityRelationCreateResponseBody>()(
    'native.entity-relations.user.category.topic.create.default',
    nativeEntityRelationsUserCategoryTopicCreateDefault,
    async context => ({
      relation: await context.client.entityRelations.createEntityRelation(
        'user',
        'user-abc',
        'category',
        'topic',
        'user-tag-bot',
      ),
    }),
  ),
  defineWebApiFixture<EntityRelationsResponseBody>()(
    'native.entity-relations.user.category.topic.default',
    nativeEntityRelationsUserCategoryTopicDefault,
    context =>
      context.server.entityRelations.getEntityRelations('user', 'user-abc', 'category', 'topic', {
        searchParams: { limit: 100, positiveNetVoteScore: true, sort: 'best' },
      }),
    [
      context =>
        context.client.entityRelations.fetchEntityRelations(
          'user',
          'user-abc',
          'category',
          'topic',
          { limit: 100, positiveNetVoteScore: true, sort: 'best' },
        ),
    ],
  ),
  defineWebApiFixture<EntityRelationsResponseBody>()(
    'native.entity-relations.post.related.post.default',
    nativeEntityRelationsPostRelatedPostDefault,
    context =>
      context.server.entityRelations.getEntityRelations('post', 'post-1', 'related', 'post', {
        searchParams: { limit: 100, sort: 'best' },
      }),
    [
      context =>
        context.client.entityRelations.fetchEntityRelations('post', 'post-1', 'related', 'post', {
          limit: 100,
          sort: 'best',
        }),
    ],
  ),
  defineWebApiFixture<EntityRelationsResponseBody>()(
    'native.entity-relations.post.related.url.default',
    nativeEntityRelationsPostRelatedUrlDefault,
    context =>
      context.server.entityRelations.getEntityRelations('post', 'post-1', 'related', 'url', {
        searchParams: { limit: 100, sort: 'best' },
      }),
    [
      context =>
        context.client.entityRelations.fetchEntityRelations('post', 'post-1', 'related', 'url', {
          limit: 100,
          sort: 'best',
        }),
    ],
  ),
  defineWebApiFixture<EntityRelationsResponseBody>()(
    'native.entity-relations.rss-feed-item.category.topic.default',
    nativeEntityRelationsRssFeedItemCategoryTopicDefault,
    context =>
      context.server.entityRelations.getEntityRelations(
        'rss_feed_item',
        'item-1',
        'category',
        'topic',
        {
          searchParams: { limit: 100, sort: 'best' },
        },
      ),
    [
      context =>
        context.client.entityRelations.fetchEntityRelations(
          'rss_feed_item',
          'item-1',
          'category',
          'topic',
          { limit: 100, sort: 'best' },
        ),
    ],
  ),
  defineWebApiFixture<EntityRelationsResponseBody>()(
    'native.entity-relations.topic.publisher-type.topic.default',
    nativeEntityRelationsTopicPublisherTypeTopicDefault,
    context =>
      context.server.entityRelations.getEntityRelations(
        'topic',
        'topic-1',
        'publisher_type',
        'topic',
        {
          searchParams: { limit: 100, sort: 'best' },
        },
      ),
    [
      context =>
        context.client.entityRelations.fetchEntityRelations(
          'topic',
          'topic-1',
          'publisher_type',
          'topic',
          { limit: 100, sort: 'best' },
        ),
    ],
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
