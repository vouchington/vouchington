import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
  type ImageSurfaceMutation,
  type ImageSurfaceMutationWrite,
} from '../services/media-delivery-safety/surface-mutation-bindings.mts'

export async function retireTestTopicSurfaces(
  topicId: string,
  references: readonly ImageSurfaceMutation[],
  query: TransactionQuery,
): Promise<ImageSurfaceMutationWrite<void>> {
  const statement = imageSurfaceMutationPreimage(references, 'retireTestTopicSurfaces')
  statement.append(sql`, retired AS (
    UPDATE topics SET logo_image_id = NULL, hero_image_id = NULL
    FROM (SELECT DISTINCT topic_id FROM surface_preimage) owner_preimage
    WHERE topics.id = ${topicId} AND owner_preimage.topic_id = topics.id
      AND topics.logo_image_id IS NOT DISTINCT FROM
        (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'topic-logo-image')
      AND topics.hero_image_id IS NOT DISTINCT FROM
        (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'topic-hero-image')
    RETURNING WITH (OLD AS prior, NEW AS current)
      prior.logo_image_id AS previous_logo_image_id,
      prior.hero_image_id AS previous_hero_image_id,
      current.logo_image_id AS current_logo_image_id,
      current.hero_image_id AS current_hero_image_id,
      (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_placement_id,
      (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_placement_revision,
      (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_activation_revision,
      (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_placement_id,
      (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_placement_revision,
      (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_activation_revision
  ) SELECT * FROM retired`)
  const { rows } = await query<{
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
  if (rows.length !== 1) throw new Error('Test topic surface changed')
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
}
