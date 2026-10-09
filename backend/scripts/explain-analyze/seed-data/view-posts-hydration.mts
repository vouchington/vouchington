import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedFreshRelationId, seedUuid } from './common.mts'

/** Exercise every populated post hydration branch on the same fifty-post page. */
export async function seedViewPostsHydration(): Promise<void> {
  const posts = Array.from({ length: 2500 }, (_, index) =>
    seedUuid(index < 50 ? index : 65_000 + index - 50, '05'),
  )
  // A fixed background cohort makes per-post index probes compete against a real table scan.
  // The measured first fifty posts still have exactly two images each.
  const images = Array.from({ length: 5000 }, (_, index) => ({
    id: seedUuid(index, 'd1'),
    placement_id: seedUuid(index, 'd2'),
    record_id: seedUuid(index, 'd3'),
    post_id: seedUuid(Math.floor(index / 2), '05'),
    user_id: seedUuid(Math.floor(index / 2) % 20_000, '01'),
    order_index: index % 2,
    hash: contentHash(`view-posts-hydration-image-${index}`).toString('hex'),
  }))
  const values = JSON.stringify(images)
  const recommendations = [
    seedUuid(3, '05'),
    ...Array.from({ length: 500 }, (_, index) => seedUuid(65_001 + index * 3, '05')),
  ]
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO post_topic_alias_sources
      (post_id, topic_alias_id, contributor_user_id, source, authored_token)
     SELECT post.id, alias.id, post.created_by_id, 'explicit', 'HydrationFixture'
     FROM posts post JOIN topic_aliases alias ON alias.alias = 'seed-alias-2499'
     WHERE post.id = ANY($1::uuid[]) ON CONFLICT DO NOTHING`,
    [posts],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO post_explicit_topic_categories (post_id, topic_id)
     SELECT unnest($1::uuid[]), $2::uuid ON CONFLICT DO NOTHING`,
    [posts, seedUuid(2499, '04')],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO images
      (id, created_by_id, data, sha_256, s3_key, upload_started_at, upload_completed_at,
       openai_omni_moderation_results, is_flagged_by_openai_omni_moderation,
       openai_omni_moderation_created_at)
     SELECT id, user_id, '{"width":100,"height":100}'::jsonb, decode(hash, 'hex'), hash,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '[]'::jsonb, false, CURRENT_TIMESTAMP
     FROM jsonb_to_recordset($1::jsonb) AS seed(id uuid, user_id uuid, hash text)
     ON CONFLICT DO NOTHING`,
    [values],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO retained_image_placement_bindings
      (placement_id, image_id, binding_family)
     SELECT placement_id, id, 'post' FROM jsonb_to_recordset($1::jsonb)
       AS seed(placement_id uuid, id uuid) ON CONFLICT DO NOTHING`,
    [values],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO media_placements (id)
     SELECT placement_id FROM jsonb_to_recordset($1::jsonb) AS seed(placement_id uuid)
     ON CONFLICT DO NOTHING`,
    [values],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO image_placements (placement_id, post_id, image_id)
     SELECT placement_id, post_id, id FROM jsonb_to_recordset($1::jsonb)
       AS seed(placement_id uuid, post_id uuid, id uuid) ON CONFLICT DO NOTHING`,
    [values],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO post_images (post_id, image_id, order_index)
     SELECT post_id, id, order_index FROM jsonb_to_recordset($1::jsonb)
       AS seed(post_id uuid, id uuid, order_index integer) ON CONFLICT DO NOTHING`,
    [values],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO media_delivery_registry_records
      (id, placement_id, placement_revision, image_id, desired_state)
     SELECT record_id, placement_id, 0, id, 'allow' FROM jsonb_to_recordset($1::jsonb)
       AS seed(record_id uuid, placement_id uuid, id uuid) ON CONFLICT DO NOTHING`,
    [values],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO media_delivery_registry_changes
      (media_delivery_registry_record_id, generation, change_type, desired_state, completed_at)
     SELECT record.id, record.generation, 'completed', 'allow', CURRENT_TIMESTAMP
     FROM media_delivery_registry_records record
     JOIN jsonb_to_recordset($1::jsonb) AS seed(record_id uuid) ON seed.record_id = record.id
     WHERE NOT EXISTS (SELECT 1 FROM media_delivery_registry_changes history
       WHERE history.media_delivery_registry_record_id = record.id AND history.change_type = 'completed')`,
    [values],
  )
  // Review and recommendation are mutually exclusive post_type branches.
  await transaction(
    `/* seedViewPostsHydration */ UPDATE posts SET post_type = 'topic_recommendation'
     WHERE id = ANY($1::uuid[])`,
    [recommendations],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO post_topic_recommendations
      (post_id, topic_title, topic_slug, reviewed_at, reviewed_by_id, created_topic_id)
     SELECT unnest($1::uuid[]), 'Hydration Fixture', 'hydration-fixture', CURRENT_TIMESTAMP, $2, $3
     ON CONFLICT DO NOTHING`,
    [recommendations, seedUuid(0, '01'), seedUuid(2499, '04')],
  )
  await transaction(
    `/* seedViewPostsHydration */ INSERT INTO relation__topic__category__topic
      (id, subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     VALUES ($1, $2, $3, $4, 1, 1) ON CONFLICT DO NOTHING`,
    [seedFreshRelationId(990_001), seedUuid(0, '04'), seedUuid(2499, '04'), seedUuid(0, '01')],
  )
  await transaction.commit()
}
