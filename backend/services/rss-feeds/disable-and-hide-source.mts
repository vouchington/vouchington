import assert from 'http-assert'
import { writeImageSurfaceMutation } from '@services/media-delivery-safety'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '@services/media-delivery-safety/surface-mutation-bindings'
import sql from 'sql-template-strings'
import {
  beginTransaction,
  withTransactionOptions,
  registerPostCommitAction,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication'
import { getRssFeedAutoUpdaterUserId } from '@services/users/system-users'
import { invalidate } from '@services/entity-cache/invalidate'

/**
 * Soft-deletes the source topic and disables the feed for a permanently-redirected feed.
 * Only marks the topic deleted if its topic_type is 'rss_feed' (avoids hiding manually-created topics).
 */
export async function disableAndHideSource(
  rssFeedId: string,
  options: QueryOptions = {},
): Promise<void> {
  if (!options.query) {
    if (options.client)
      return withTransactionOptions(options, query => disableAndHideSource(rssFeedId, { query }))
    await using query = await beginTransaction()
    await disableAndHideSource(rssFeedId, { query })
    await query.commit()
    return
  }
  return withTransactionOptions(options, query => hideSource(rssFeedId, query))
}

async function hideSource(rssFeedId: string, query: TransactionQuery): Promise<void> {
  const systemUserId = await getRssFeedAutoUpdaterUserId()
  const { rows: sourceRows } = await query<{
    topic_id: string
    topic_type: string
    deleted_at: Date | null
  }>(
    `/* disableAndHideSource:topicId */ SELECT feed.topic_id, topic.topic_type, topic.deleted_at
      FROM rss_feeds feed JOIN topics topic ON topic.id = feed.topic_id AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL WHERE feed.id = $1::uuid`,
    [rssFeedId],
  )
  const topicIds = sourceRows.map(row => row.topic_id)
  // ast-grep-ignore: no-three-sequential-awaits -- Enablement, publication capture, and discoverability record one hide; the topic soft-delete uses the topic ids read above.
  await query(
    `/* disableAndHideSource:rss_feed */
       INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, changed_by_id, reason)
       VALUES ('enablement', $1, FALSE, $2, 'permanent redirect to canonical feed')
      `,
    [rssFeedId, systemUserId],
  )
  await recordPostPublicationChange(query, {
    scope: { type: 'rss_feed', rssFeedId },
    reason: 'rss_feed_discoverability_changed',
  })
  await query(
    `/* disableAndHideSource:discoverability */
       INSERT INTO rss_feed_setting_changes (change_type, rss_feed_id, is_enabled, changed_by_id, reason)
       VALUES ('discoverability', $1, FALSE, $2, 'permanent redirect to canonical feed')
      `,
    [rssFeedId, systemUserId],
  )
  const retiringTopicIds = sourceRows.flatMap(row =>
    row.topic_type === 'rss_feed' && row.deleted_at === null ? [row.topic_id] : [],
  )
  await writeImageSurfaceMutation(
    query,
    retiringTopicIds.flatMap(topicId => [
      { surfaceKind: 'topic-logo-image' as const, topicId, nextImageId: null },
      { surfaceKind: 'topic-hero-image' as const, topicId, nextImageId: null },
    ]),
    null,
    async (references, scopeQuery) => {
      if (references.length === 0) return { result: undefined, changes: [] }
      const statement = imageSurfaceMutationPreimage(references, 'disableAndHideSource:topic')
      statement.append(sql`, updated AS (
        UPDATE topics SET deleted_at = CURRENT_TIMESTAMP
        FROM (SELECT DISTINCT topic_id FROM surface_preimage) owner_preimage
        WHERE topics.id = owner_preimage.topic_id AND topics.topic_type = 'rss_feed'
          AND topics.deleted_at IS NULL AND topics.merged_into_topic_id IS NULL
          AND topics.logo_image_id IS NOT DISTINCT FROM (
            SELECT current_image_id FROM surface_preimage preimage
            WHERE preimage.topic_id = topics.id AND preimage.surface_kind = 'topic-logo-image'
          )
          AND topics.hero_image_id IS NOT DISTINCT FROM (
            SELECT current_image_id FROM surface_preimage preimage
            WHERE preimage.topic_id = topics.id AND preimage.surface_kind = 'topic-hero-image'
          )
        RETURNING WITH (OLD AS prior, NEW AS current)
          prior.id AS topic_id,
          prior.logo_image_id AS previous_logo_image_id,
          prior.hero_image_id AS previous_hero_image_id,
          CASE WHEN current.deleted_at IS NULL AND current.merged_into_topic_id IS NULL
            THEN current.logo_image_id END AS current_logo_image_id,
          CASE WHEN current.deleted_at IS NULL AND current.merged_into_topic_id IS NULL
            THEN current.hero_image_id END AS current_hero_image_id,
          (SELECT placement_id FROM surface_preimage preimage WHERE preimage.topic_id = prior.id
            AND preimage.surface_kind = 'topic-logo-image') AS previous_logo_placement_id,
          (SELECT placement_revision FROM surface_preimage preimage WHERE preimage.topic_id = prior.id
            AND preimage.surface_kind = 'topic-logo-image') AS previous_logo_placement_revision,
          (SELECT activation_revision FROM surface_preimage preimage WHERE preimage.topic_id = prior.id
            AND preimage.surface_kind = 'topic-logo-image') AS previous_logo_activation_revision,
          (SELECT placement_id FROM surface_preimage preimage WHERE preimage.topic_id = prior.id
            AND preimage.surface_kind = 'topic-hero-image') AS previous_hero_placement_id,
          (SELECT placement_revision FROM surface_preimage preimage WHERE preimage.topic_id = prior.id
            AND preimage.surface_kind = 'topic-hero-image') AS previous_hero_placement_revision,
          (SELECT activation_revision FROM surface_preimage preimage WHERE preimage.topic_id = prior.id
            AND preimage.surface_kind = 'topic-hero-image') AS previous_hero_activation_revision
      ) SELECT * FROM updated`)
      const { rows } = await scopeQuery<{
        topic_id: string
        previous_logo_image_id: string | null
        previous_hero_image_id: string | null
        current_logo_image_id: string | null
        current_hero_image_id: string | null
        previous_logo_placement_id: string | null
        previous_logo_placement_revision: number | null
        previous_logo_activation_revision: number | null
        previous_hero_placement_id: string | null
        previous_hero_placement_revision: number | null
        previous_hero_activation_revision: number | null
      }>(statement)
      assert(
        rows.length === retiringTopicIds.length,
        409,
        'RSS source images changed during retirement',
      )
      const byTopicId = new Map(rows.map(row => [row.topic_id, row]))
      return {
        result: undefined,
        changes: references.map((reference, index) => {
          const row = byTopicId.get('topicId' in reference ? reference.topicId : '')!
          return imageSurfaceMutationChange(
            reference.surfaceKind === 'topic-logo-image'
              ? {
                  ordinality: index + 1,
                  previousImageId: row.previous_logo_image_id,
                  currentImageId: row.current_logo_image_id,
                  previousPlacementId: row.previous_logo_placement_id,
                  previousPlacementRevision: row.previous_logo_placement_revision,
                  previousActivationRevision: row.previous_logo_activation_revision,
                }
              : {
                  ordinality: index + 1,
                  previousImageId: row.previous_hero_image_id,
                  currentImageId: row.current_hero_image_id,
                  previousPlacementId: row.previous_hero_placement_id,
                  previousPlacementRevision: row.previous_hero_placement_revision,
                  previousActivationRevision: row.previous_hero_activation_revision,
                },
          )
        }),
      }
    },
  )
  registerPostCommitAction(query, () => invalidate.rss_feeds(rssFeedId))
}
