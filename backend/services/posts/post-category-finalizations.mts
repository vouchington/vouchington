import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { enqueueReconcilePostCategoryFinalizations } from '@queues/entity-listeners/enqueues'
import { getPrivateUserByAny } from '@services/users/get'
import { finalizePostHashtagCategoryVotes } from './hashtag-votes.mts'
import { withPostFinalizationLock } from './update/post-finalization-lock.mts'
import { refreshContributionAdmissionPostResponses } from '@services/contribution-gating/refresh-post-response'
import type { Post } from './types.mts'

export const POST_CATEGORY_FINALIZATION_BATCH_SIZE = 25

export type PostCategoryFinalization = {
  post_id: string
  actor_user_ids: string[]
  topic_category_owner_id: string
  generation: string
}

export type PostCategoryFinalizationOrigin = 'create' | 'update'

export async function enqueuePostCategoryFinalizationReconciliationBestEffort(): Promise<void> {
  try {
    await enqueueReconcilePostCategoryFinalizations()
  } catch {
    // createEnqueueFunction reports terminal rejection; the durable row is schedule-replayed.
  }
}

export async function persistPostCategoryFinalization(
  postId: string,
  actorUserId: string,
  topicCategoryOwnerId: string,
  origin: PostCategoryFinalizationOrigin,
  options: QueryOptions,
): Promise<PostCategoryFinalization> {
  const { rows } = await write<PostCategoryFinalization>(
    `/* persistPostCategoryFinalization */ WITH response_topics AS MATERIALIZED (
      SELECT CASE WHEN $4 = 'create' THEN ARRAY(
        SELECT topic_id FROM (
          SELECT topic_id FROM post_explicit_topic_categories
          WHERE post_id = $1
          UNION
          SELECT topic_id FROM post_data_point_topics
          WHERE post_id = $1
        ) persisted_topics
        ORDER BY topic_id
      ) ELSE NULL::UUID[] END AS topic_ids
    ), finalization AS (
      INSERT INTO post_category_finalizations
        (
          post_id,
          actor_user_ids,
          topic_category_owner_id,
          generation,
          admission_response_generation,
          admission_response_topic_ids
        )
      SELECT
        $1,
        ARRAY[$2]::UUID[],
        $3,
        1,
        CASE WHEN response_topics.topic_ids IS NULL THEN NULL ELSE 1 END,
        response_topics.topic_ids
      FROM response_topics
      ORDER BY $1 ASC NULLS LAST
      ON CONFLICT (post_id) DO UPDATE
      SET actor_user_ids = ARRAY(
            SELECT DISTINCT actor_user_id
            FROM unnest(
              post_category_finalizations.actor_user_ids || EXCLUDED.actor_user_ids
            ) AS actor_user_id
            ORDER BY actor_user_id
          ),
          topic_category_owner_id = EXCLUDED.topic_category_owner_id,
          generation = post_category_finalizations.generation + 1,
          admission_response_generation = CASE
            WHEN EXCLUDED.admission_response_topic_ids IS NULL THEN NULL
            ELSE post_category_finalizations.generation + 1
          END,
          admission_response_topic_ids = EXCLUDED.admission_response_topic_ids,
          updated_at = CURRENT_TIMESTAMP
      RETURNING post_id, actor_user_ids, topic_category_owner_id, generation
    ), complete_response_without_refresh AS (
      UPDATE post_admission_reservations
      SET replay_metadata = replay_metadata || '{"finalization":"complete"}'::jsonb,
        updated_at = NOW()
      WHERE committed_post_id = $1
        AND state = 'committed'
        AND $4 = 'update'
        AND COALESCE(replay_metadata->>'finalization', 'pending') <> 'complete'
    )
    SELECT post_id, actor_user_ids, topic_category_owner_id, generation
    FROM finalization`,
    [postId, actorUserId, topicCategoryOwnerId, origin],
    options,
  )
  return rows[0]!
}

export async function reconcilePostCategoryFinalizations(): Promise<{ reconciled: number }> {
  const { rows } = await write<PostCategoryFinalization>(
    `/* reconcilePostCategoryFinalizations */
      SELECT post_id, actor_user_ids, topic_category_owner_id, generation
      FROM post_category_finalizations
      ORDER BY updated_at, post_id
      LIMIT $1`,
    [POST_CATEGORY_FINALIZATION_BATCH_SIZE],
  )
  return reconcilePostCategoryFinalizationRows(rows)
}

export async function reconcilePostCategoryFinalizationRows(
  rows: readonly PostCategoryFinalization[],
): Promise<{ reconciled: number }> {
  let reconciled = 0
  const errors: unknown[] = []
  for (const row of rows) {
    try {
      // eslint-disable-next-line no-await-in-loop -- each acknowledgement follows its finalization.
      await reconcilePostCategoryFinalization(row)
      reconciled += 1
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Post category finalization reconciliation failed')
  }
  return { reconciled }
}

export async function reconcilePostCategoryFinalization(
  scheduledFinalization: PostCategoryFinalization,
): Promise<Post['post_related_topics'] | undefined> {
  return withPostFinalizationLock(scheduledFinalization.post_id, async () => {
    const finalization = await getCurrentPostCategoryFinalization(scheduledFinalization.post_id)
    if (!finalization) return undefined
    const owner = await getPrivateUserByAny(finalization.topic_category_owner_id, {
      readOnly: false,
    })
    for (const actorUserId of finalization.actor_user_ids) {
      // eslint-disable-next-line no-await-in-loop -- one finalization lock serializes all retained actors.
      const actor = await getPrivateUserByAny(actorUserId, { readOnly: false })
      // Account deletion removes the actor's votes before this durable replay can run. Skipping
      // that actor preserves the deletion instead of retrying the row forever or restoring votes
      // under a different identity.
      if (!actor) continue
      // eslint-disable-next-line no-await-in-loop -- actor load and attributed vote finalization are ordered.
      await finalizePostHashtagCategoryVotes(actor, finalization.post_id, owner?.id)
    }
    const createResponseTopics = await refreshContributionAdmissionPostResponses(
      finalization.post_id,
      finalization.generation,
    )
    await acknowledgePostCategoryFinalization(finalization)
    return createResponseTopics
  })
}

async function getCurrentPostCategoryFinalization(
  postId: string,
): Promise<PostCategoryFinalization | undefined> {
  const { rows } = await write<PostCategoryFinalization>(
    `/* getCurrentPostCategoryFinalization */
      SELECT post_id, actor_user_ids, topic_category_owner_id, generation
      FROM post_category_finalizations
      WHERE post_id = $1`,
    [postId],
  )
  return rows[0]
}

export async function acknowledgePostCategoryFinalization(
  finalization: PostCategoryFinalization,
): Promise<void> {
  await write(
    `/* acknowledgePostCategoryFinalization */
      DELETE FROM post_category_finalizations
      WHERE post_id = $1 AND generation = $2`,
    [finalization.post_id, finalization.generation],
  )
}
