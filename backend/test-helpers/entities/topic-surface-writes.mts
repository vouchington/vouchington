import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { writeImageSurfaceMutation } from '../../services/media-delivery-safety/surface-mutation.mts'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '../../services/media-delivery-safety/surface-mutation-bindings.mts'

export async function setTestTopicSurfaceImages(
  topicId: string,
  input: { logoImageId?: string | null; heroImageId?: string | null },
): Promise<void> {
  await using query = await beginTransaction()
  const logoImageId = input.logoImageId === undefined ? null : input.logoImageId
  const heroImageId = input.heroImageId === undefined ? null : input.heroImageId
  const { rows: actors } = await query<{ created_by_id: string }>(
    sql`/* setTestTopicSurfaceImages:actor */ SELECT created_by_id FROM topics WHERE id = ${topicId}`,
  )
  const actorUserId = actors[0]?.created_by_id ?? null
  const references = [
    ...(input.logoImageId !== undefined
      ? [{ surfaceKind: 'topic-logo-image' as const, topicId, nextImageId: logoImageId }]
      : []),
    ...(input.heroImageId !== undefined
      ? [{ surfaceKind: 'topic-hero-image' as const, topicId, nextImageId: heroImageId }]
      : []),
  ]
  await writeImageSurfaceMutation(
    query,
    references,
    actorUserId,
    async (mutationReferences, scopeQuery) => {
      if (mutationReferences.length === 0) {
        await scopeQuery(sql`/* setTestTopicSurfaceImages */
        UPDATE topics SET logo_image_id = CASE WHEN ${input.logoImageId !== undefined}
          THEN ${logoImageId}::uuid ELSE logo_image_id END,
          hero_image_id = CASE WHEN ${input.heroImageId !== undefined}
          THEN ${heroImageId}::uuid ELSE hero_image_id END
        WHERE id = ${topicId}`)
        return { result: undefined, changes: [] }
      }
      const statement = imageSurfaceMutationPreimage(
        mutationReferences,
        'setTestTopicSurfaceImages',
      )
      statement.append(sql`, updated AS (
      UPDATE topics SET
        logo_image_id = CASE WHEN ${input.logoImageId !== undefined} THEN ${logoImageId}::uuid ELSE logo_image_id END,
        hero_image_id = CASE WHEN ${input.heroImageId !== undefined} THEN ${heroImageId}::uuid ELSE hero_image_id END
      FROM (SELECT DISTINCT topic_id FROM surface_preimage) owner_preimage
      WHERE topics.id = ${topicId} AND owner_preimage.topic_id = topics.id`)
      if (input.logoImageId !== undefined)
        statement.append(sql` AND topics.logo_image_id IS NOT DISTINCT FROM
          (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'topic-logo-image')`)
      if (input.heroImageId !== undefined)
        statement.append(sql` AND topics.hero_image_id IS NOT DISTINCT FROM
          (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'topic-hero-image')`)
      statement.append(sql` RETURNING WITH (OLD AS prior, NEW AS current)
        prior.logo_image_id AS previous_logo_image_id, current.logo_image_id AS current_logo_image_id,
        prior.hero_image_id AS previous_hero_image_id, current.hero_image_id AS current_hero_image_id,
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
      if (rows.length !== 1) throw new Error('Test topic image surface changed')
      const row = rows[0]!
      return {
        result: undefined,
        changes: mutationReferences.map((reference, index) =>
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
  await query.commit()
}
