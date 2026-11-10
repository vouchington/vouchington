import {
  imageSurfaceMutationChange,
  type ImageSurfaceMutation,
} from '@services/media-delivery-safety/surface-mutation-bindings'

export type TopicImageMutationRow = {
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
}

export function topicImageMutationChanges(
  references: readonly ImageSurfaceMutation[],
  row: TopicImageMutationRow,
) {
  return references.map((reference, index) =>
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
  )
}
