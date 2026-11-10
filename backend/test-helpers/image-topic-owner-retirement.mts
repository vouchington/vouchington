import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  ImageSurfaceMutation,
  ImageSurfaceMutationWrite,
} from '../services/media-delivery-safety/surface-mutation.mts'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '../services/media-delivery-safety/surface-mutation-bindings.mts'

export async function retireTestTopicImageOwners(
  references: readonly ImageSurfaceMutation[],
  query: TransactionQuery,
  setClause: ReturnType<typeof sql>,
  annotation = 'retireTestTopicImageOwners',
): Promise<ImageSurfaceMutationWrite<void>> {
  const statement = imageSurfaceMutationPreimage(references, annotation)
  statement.append(sql`, retired AS (UPDATE topics SET `).append(setClause)
  statement.append(sql` FROM (SELECT DISTINCT topic_id FROM surface_preimage) owner_preimage
    WHERE topics.id = owner_preimage.topic_id
      AND topics.logo_image_id IS NOT DISTINCT FROM (
        SELECT current_image_id FROM surface_preimage preimage
        WHERE preimage.topic_id = topics.id AND preimage.surface_kind = 'topic-logo-image'
      )
      AND topics.hero_image_id IS NOT DISTINCT FROM (
        SELECT current_image_id FROM surface_preimage preimage
        WHERE preimage.topic_id = topics.id AND preimage.surface_kind = 'topic-hero-image'
      )
    RETURNING WITH (OLD AS prior, NEW AS current)
      prior.id AS topic_id, prior.logo_image_id AS previous_logo_image_id,
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
  ) SELECT * FROM retired`)
  const { rows } = await query<{
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
  const byTopicId = new Map(rows.map(row => [row.topic_id, row]))
  if (
    byTopicId.size !==
    new Set(references.map(reference => ('topicId' in reference ? reference.topicId : ''))).size
  )
    throw new Error('Test topic image owner changed')
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
}
