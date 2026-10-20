import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertPostCategoryRelationRows } from '@services/posts/category-relation-insert'
import { deletePendingRecommendation } from '@services/topic-recommendations/delete-pending-recommendation'
import { replaceTopicRecommendationHostnames } from '@services/topic-recommendations/materialize-topic-recommendation'
import { createTopicRecommendationLinkRelation } from '@services/topic-recommendations/create-topic-recommendation-link-relation'
import { writeTopicRecommendationUpdate } from '@services/topic-recommendations/update-topic-recommendation'
import { createPostTextEmbeddingContent } from '@services/posts/content'
import type { TopicRecommendationPost } from '@services/topic-recommendations/types'
import { getTopicByAny } from '@services/topics'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedHostnameIds, seedTopicId, seedUser } from '../run-support.mts'
import { RELATION_INSERT_POST_INDEXES, seedUuid } from '../seed-data/common.mts'

// Budgets are the larger of both plan modes and capture passes, plus 20% rounded up.
export async function runRelationRoundTripScenarios(): Promise<void> {
  registerScenarioContract('topic-recommendation-pending-delete', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_topic_recommendations', max: 0 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 0 },
    ],
  })
  await runAndCapture(
    'topic-recommendation-pending-delete',
    async () => {
      // Posts are seeded through index 99_999. A missing id keeps the write at zero rows.
      await deletePendingRecommendation(seedUser, {
        id: seedUuid(200_000, '05'),
        created_by_id: seedUser.id,
        topic_recommendation: { status: 'pending' },
      } as TopicRecommendationPost).catch((err: unknown) => {
        if ((err as { status?: number }).status !== 403) throw err
      })
    },
    undefined,
    'deletePendingRecommendation',
  )

  registerScenarioContract('topic-recommendation-update-write', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: 3 },
      { kind: 'maxProcessedRows', relation: 'post_topic_recommendations', max: 3 },
    ],
  })
  const pendingRecommendationId = seedUuid(3, '05')
  // EXPLAIN replays on a new connection, so the pending row must already be committed.
  await write(sql`/* explainPendingRecommendation */ UPDATE post_topic_recommendations
    SET reviewed_at = NULL, reviewed_by_id = NULL, created_topic_id = NULL
    WHERE post_id = ${pendingRecommendationId}`)
  await runAndCapture(
    'topic-recommendation-update-write',
    () =>
      writeTopicRecommendationUpdate(
        seedUser.id,
        pendingRecommendationId,
        {
          title: 'explain',
          markdown: 'explain',
          embedding_content_sha: createPostTextEmbeddingContent({
            post_type: 'topic_recommendation',
            title: 'explain',
            markdown: 'explain',
            topic_title: 'explain',
            topic_slug: 'explain-update',
            topic_aliases: [],
            topic_hostnames: [],
          }).content_sha256,
          topic_title: 'explain',
          topic_slug: 'explain-update',
          topic_markdown: null,
          topic_hostname: null,
          topic_hostnames: [],
          topic_aliases: [],
          topic_type: 'topic',
          example_referral_link: null,
          landing_page_urls: [],
          example_referral_url_id: null,
          landing_page_url_ids: [],
          hostname_id: null,
          hostname_ids: [],
        },
        {},
      ),
    undefined,
    'updateTopicRecommendation',
  )

  registerScenarioContract('topic-recommendation-hostname-replace', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_topic_recommendation_hostnames', max: 2 },
    ],
  })
  await runAndCapture(
    'topic-recommendation-hostname-replace',
    async () => {
      await using transaction = await beginTransaction()
      await replaceTopicRecommendationHostnames(seedUuid(3, '05'), [seedHostnameIds[0]!], {
        query: transaction,
      })
    },
    undefined,
    'replaceTopicRecommendationHostnames',
  )

  const topic = await getTopicByAny(seedTopicId)
  if (!topic) throw new Error('The hostname conflict scenario needs the seeded topic')
  registerScenarioContract('topic-landing-page-hostname-conflict', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__topic__landing_page__url', max: 2 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 5 },
    ],
  })
  await runAndCapture(
    'topic-landing-page-hostname-conflict',
    async () => {
      await using transaction = await beginTransaction()
      await createTopicRecommendationLinkRelation(
        seedUser,
        topic,
        { id: seedHostnameIds[0]!, hostname: 'seed-host-0.example.com' },
        { query: transaction },
      ).catch((err: unknown) => {
        if ((err as { status?: number }).status !== 422) throw err
      })
    },
    undefined,
    'createTopicRecommendationLinkRelation',
  )

  registerScenarioContract('bidirectional-relation-insert', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'relation__post__related__post', max: 5 }],
  })
  await runAndCapture(
    'bidirectional-relation-insert',
    async () => {
      await using transaction = await beginTransaction()
      await upsertEntityRelation(
        seedUser,
        getEntityRelationMetadataOrThrow({
          subjectType: 'post',
          objectType: 'post',
          predicate: 'related',
        }),
        { id: seedUuid(RELATION_INSERT_POST_INDEXES[0], '05') },
        [{ id: seedUuid(RELATION_INSERT_POST_INDEXES[1], '05') }],
        { query: transaction, vote: false },
      )
    },
    undefined,
    'buildInsertQuery',
  )

  registerScenarioContract('post-category-relation-insert', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic_alias', max: 2 },
      { kind: 'maxProcessedRows', relation: 'relation__post__category__topic', max: 3 },
    ],
  })
  const { rows: aliasRows } = await write<{ id: string }>(
    `/* postCategoryRelationInsert.alias */ SELECT id FROM topic_aliases WHERE topic_id = $1 LIMIT 1`,
    [seedTopicId],
  )
  const aliasId = aliasRows[0]?.id
  if (!aliasId) throw new Error('seed topic alias missing')
  await runAndCapture(
    'post-category-relation-insert',
    async () => {
      await using transaction = await beginTransaction()
      await upsertPostCategoryRelationRows({
        aliasIds: [aliasId],
        aliasRelation: getEntityRelationMetadataOrThrow({
          subjectType: 'post',
          objectType: 'topic_alias',
          predicate: 'category',
        }),
        creator: seedUser,
        options: { query: transaction },
        postId: seedUuid(RELATION_INSERT_POST_INDEXES[0], '05'),
        topicIds: [seedTopicId],
        topicRelation: getEntityRelationMetadataOrThrow({
          subjectType: 'post',
          objectType: 'topic',
          predicate: 'category',
        }),
      })
    },
    undefined,
    'buildInsertQuery',
  )
}
