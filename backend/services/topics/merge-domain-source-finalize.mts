import assert from 'http-assert'
import type { TransactionQuery } from '@data-stores/psql/types'
import { writeImageSurfaceMutation } from '@services/media-delivery-safety'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '@services/media-delivery-safety/surface-mutation-bindings'
import sql from 'sql-template-strings'
import type { TopicMergeOperationRow } from './merge-operation-types.mts'

export async function finalizeTopicMergeSource(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
): Promise<void> {
  await writeImageSurfaceMutation(
    query,
    [
      { surfaceKind: 'topic-logo-image', topicId: operation.source_topic_id, nextImageId: null },
      { surfaceKind: 'topic-hero-image', topicId: operation.source_topic_id, nextImageId: null },
    ],
    null,
    async (references, scopeQuery) => {
      const statement = imageSurfaceMutationPreimage(references, 'finalizeTopicMergeDomain source')
      statement.append(sql`, updated AS (
        UPDATE topics SET merged_into_topic_id=${operation.destination_topic_id}::uuid,
          merged_at=CURRENT_TIMESTAMP,merged_by_id=${operation.requested_by_id}::uuid,
          updated_by_id=(SELECT id FROM users WHERE id=${operation.requested_by_id}::uuid AND deleted_at IS NULL),
          aliases='{}'::text[]
        FROM (SELECT DISTINCT topic_id FROM surface_preimage) owner_preimage
        WHERE topics.id=${operation.source_topic_id}::uuid AND owner_preimage.topic_id = topics.id
          AND topics.logo_image_id IS NOT DISTINCT FROM
            (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'topic-logo-image')
          AND topics.hero_image_id IS NOT DISTINCT FROM
            (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'topic-hero-image')
        RETURNING WITH (OLD AS prior, NEW AS current)
          prior.logo_image_id AS previous_logo_image_id,
          CASE WHEN current.deleted_at IS NULL AND current.merged_into_topic_id IS NULL
            THEN current.logo_image_id END AS current_logo_image_id,
          prior.hero_image_id AS previous_hero_image_id,
          CASE WHEN current.deleted_at IS NULL AND current.merged_into_topic_id IS NULL
            THEN current.hero_image_id END AS current_hero_image_id,
          (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_placement_id,
          (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_placement_revision,
          (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_activation_revision,
          (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_placement_id,
          (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_placement_revision,
          (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_activation_revision
      ) SELECT * FROM updated`)
      const { rows } = await scopeQuery<{
        previous_logo_image_id: string | null
        current_logo_image_id: string | null
        previous_hero_image_id: string | null
        current_hero_image_id: string | null
        previous_logo_placement_id: string | null
        previous_logo_placement_revision: number | null
        previous_logo_activation_revision: number | null
        previous_hero_placement_id: string | null
        previous_hero_placement_revision: number | null
        previous_hero_activation_revision: number | null
      }>(statement)
      assert(rows.length === 1, 409, 'Topic or image surface changed during merge')
      const row = rows[0]!
      return {
        result: undefined,
        changes: references.map((reference, index) =>
          imageSurfaceMutationChange(
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
          ),
        ),
      }
    },
  )
  await query(
    `/* finalizeTopicMergeDomain source metrics */ DELETE FROM topic_metrics WHERE topic_id=$1::uuid`,
    [operation.source_topic_id],
  )
}
