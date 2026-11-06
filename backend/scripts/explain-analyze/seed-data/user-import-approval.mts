import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { seedViewPostsHydration } from './view-posts-hydration.mts'

export async function seedViewPostsAndUserImportApproval(): Promise<void> {
  await seedViewPostsHydration()
  await seedUserImportApproval()
}

/** Interleave requests for ten recommendations, including deep keyset pages. */
async function seedUserImportApproval(): Promise<void> {
  await write(
    `/* seedUserImportApproval */ INSERT INTO user_import_requests
      (id, user_id, entity_type, topic_recommendation_post_id, input_value)
     SELECT format('019e0000-7e00-7000-8000-%s', lpad(to_hex(n), 12, '0'))::uuid,
       format('019e0000-0100-7000-8000-%s', lpad(to_hex(n), 12, '0'))::uuid,
       'topic', CASE WHEN n % 10 = 0 THEN $1::uuid ELSE ($2::uuid[])[n % 10] END,
       'explain approval'
     FROM generate_series(0, 19999) AS n ON CONFLICT DO NOTHING`,
    [
      seedUuid(3, '05'),
      Array.from({ length: 9 }, (_, index) => seedUuid(65_001 + index * 3, '05')),
    ],
  )
  // Statistics only. ANALYZE_TARGETS vacuums this table later so the covering index can be
  // index-only; ANALYZE alone leaves that choice to autovacuum.
  await write(`/* seedUserImportApproval:analyze */ ANALYZE user_import_requests`)
}
