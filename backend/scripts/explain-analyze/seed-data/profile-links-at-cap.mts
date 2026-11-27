import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

// USER_PROFILE_LINKS_MAX in services/user-product-limits/config.mts.
const PROFILE_LINK_CAPACITY = 50

export const PROFILE_LINK_CAPACITY_OWNER = seedUuid(12_345, '01')

export const profileLinkCapacityRows = Array.from(
  { length: PROFILE_LINK_CAPACITY },
  (_, index) => ({
    // The id order disagrees with the display order across pairs, but breaks ties within each pair.
    id: seedUuid(50_000 + (index % 2) * PROFILE_LINK_CAPACITY + index, '15'),
    sort_order: Math.floor(index / 2),
    link_type: index % 2 === 0 ? 'url' : 'github',
    url_id: index % 2 === 0 ? seedUuid(index, '03') : null,
    handle: index % 2 === 0 ? null : `profile-capacity-${index}`,
  }),
)

const imageLinks = profileLinkCapacityRows.slice(0, 2).map((link, index) => ({
  link_id: link.id,
  image_id: seedUuid(50_000 + index, 'd1'),
  placement_id: seedUuid(50_000 + index, 'd2'),
  hash: contentHash(`profile-link-capacity-image-${index}`).toString('hex'),
}))

export const profileLinkCapacityPlacements = imageLinks.map(({ image_id, placement_id }) => ({
  image_id,
  placement_id,
  placement_revision: 0,
}))

/** The ordinary seed already provides 3,000 links belonging to other users. */
export async function seedProfileLinksAtCapacity(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedProfileLinksAtCapacity */ INSERT INTO user_profile_links
       (id, user_id, sort_order, link_type, url_id, handle)
     SELECT id, $2, sort_order, link_type, url_id, handle
     FROM jsonb_to_recordset($1::jsonb) AS seed
       (id uuid, sort_order integer, link_type user_profile_link_types, url_id uuid, handle text)
     ORDER BY sort_order DESC, id DESC
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(profileLinkCapacityRows), PROFILE_LINK_CAPACITY_OWNER],
  )

  // The write service enforces the configured cap and assigns distinct sort orders. The seed
  // models the maximum and tied positions, then uses the canonical image update trigger.
  const images = JSON.stringify(imageLinks)
  await transaction(
    `/* seedProfileLinksAtCapacity */ INSERT INTO images
       (id, created_by_id, data, sha_256, s3_key, upload_started_at, upload_completed_at,
        openai_omni_moderation_results, is_flagged_by_openai_omni_moderation,
        openai_omni_moderation_created_at)
     SELECT image_id, $2, '{"width":100,"height":100}'::jsonb, decode(hash, 'hex'), hash,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '[]'::jsonb, false, CURRENT_TIMESTAMP
     FROM jsonb_to_recordset($1::jsonb) AS seed(image_id uuid, hash text)
     ON CONFLICT DO NOTHING`,
    [images, PROFILE_LINK_CAPACITY_OWNER],
  )
  await transaction(
    `/* seedProfileLinksAtCapacity */ INSERT INTO retained_image_placement_bindings
       (placement_id, image_id, binding_family)
     SELECT placement_id, image_id, 'surface'
     FROM jsonb_to_recordset($1::jsonb) AS seed(placement_id uuid, image_id uuid)
     ON CONFLICT DO NOTHING`,
    [images],
  )
  await transaction(
    `/* seedProfileLinksAtCapacity */ INSERT INTO media_placements (id)
     SELECT placement_id FROM jsonb_to_recordset($1::jsonb) AS seed(placement_id uuid)
     ON CONFLICT DO NOTHING`,
    [images],
  )
  await transaction(
    `/* seedProfileLinksAtCapacity */ INSERT INTO image_surface_placements
       (placement_id, surface_kind, image_id, user_profile_link_id)
     SELECT seed.placement_id, 'user-profile-link-image', seed.image_id, seed.link_id
     FROM jsonb_to_recordset($1::jsonb) AS seed(placement_id uuid, image_id uuid, link_id uuid)
     WHERE NOT EXISTS (
       SELECT 1 FROM image_surface_placements surface WHERE surface.placement_id = seed.placement_id
     )`,
    [images],
  )
  await transaction(
    `/* seedProfileLinksAtCapacity */ UPDATE user_profile_links link SET image_id = seed.image_id
     FROM jsonb_to_recordset($1::jsonb) AS seed(link_id uuid, image_id uuid)
     WHERE link.id = seed.link_id AND link.image_id IS DISTINCT FROM seed.image_id`,
    [images],
  )
  await transaction(
    `/* seedProfileLinksAtCapacity */ INSERT INTO media_delivery_registry_changes
       (media_delivery_registry_record_id, generation, change_type, desired_state, completed_at)
     SELECT record.id, record.generation, 'completed', 'allow', CURRENT_TIMESTAMP
     FROM jsonb_to_recordset($1::jsonb) AS seed(placement_id uuid, image_id uuid)
     JOIN media_delivery_registry_records record USING (placement_id, image_id)
     WHERE record.placement_revision = 0 AND NOT EXISTS (
       SELECT 1 FROM media_delivery_registry_changes change
       WHERE change.media_delivery_registry_record_id = record.id
         AND change.generation = record.generation AND change.change_type = 'completed'
     )`,
    [images],
  )
  await transaction.commit()
}
