import { write } from '@data-stores/psql'
import { readActiveLinkCountTopicPage } from '@services/topics/search/link-count-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { runTopicLinkCountLifecycleScenarios } from './topic-link-count-lifecycle.mts'

const PROGRAM_COUNT = 5_000
const INACTIVE_PER_KIND = 100

// The first 100 programs have a positive count and the rest are 0. The partial keyset
// index walks the positive leading column and stops at LIMIT, before the zero tail.
async function seedLinkCountPrograms(): Promise<void> {
  await write(
    `/* seedLinkCountPrograms */ INSERT INTO topics
       (id, topic_type, name, slug, bedrock_nova_multimodal_v1_content_sha256, created_via)
     SELECT
       ('019e0000-8a00-7000-8000-' || lpad(to_hex(100 + g), 12, '0'))::uuid,
       'referral_program',
       'Link count ' || g,
       'link-count-sort-' || g,
       digest('link-count-sort-' || g, 'sha256'),
       'system'
     FROM generate_series(0, $1) AS g
     ON CONFLICT (id) DO UPDATE SET
       deleted_at = NULL, deleted_by_id = NULL, merged_into_topic_id = NULL,
       merged_at = NULL, merged_by_id = NULL
     WHERE topics.slug = EXCLUDED.slug`,
    [PROGRAM_COUNT + 2 * INACTIVE_PER_KIND - 1],
  )
  await write(
    `/* seedLinkCountPrograms */ INSERT INTO referral_program_topics
       (topic_id, enabled_at, active_link_count)
     SELECT
       id,
       CURRENT_TIMESTAMP,
       CASE WHEN suffix >= $1 THEN 1000 + suffix
         WHEN suffix < 100 THEN 100 - suffix ELSE 0 END
     FROM (
       SELECT id, substring(slug FROM 'link-count-sort-([0-9]+)$')::integer AS suffix
       FROM topics
       WHERE slug LIKE 'link-count-sort-%'
     ) seeded
     ON CONFLICT (topic_id) DO UPDATE SET
       active_link_count = EXCLUDED.active_link_count,
       enabled_at = EXCLUDED.enabled_at, disabled_at = NULL`,
    [PROGRAM_COUNT],
  )
  // Exercise the same topic lifecycle fields used by delete and merge, after inserting
  // enabled programs with positive counts. The counts remain positive after lifecycle changes.
  const { rows: before } = await write<{ count: number }>(
    `/* seedLinkCountLifecycleBefore */
    SELECT count(*)::integer AS count FROM topics t JOIN referral_program_topics rp ON rp.topic_id = t.id
    WHERE t.slug LIKE 'link-count-sort-%'
      AND substring(t.slug FROM 'link-count-sort-([0-9]+)$')::integer >= $1
      AND t.deleted_at IS NULL AND t.merged_into_topic_id IS NULL AND rp.active_link_count > 0`,
    [PROGRAM_COUNT],
  )
  if (before[0]?.count !== 2 * INACTIVE_PER_KIND)
    throw new Error('Expected active positive-count lifecycle fixtures')
  await write(
    `/* seedLinkCountSoftDelete */ UPDATE topics
    SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $3::uuid
    WHERE substring(slug FROM 'link-count-sort-([0-9]+)$')::integer >= $1
      AND substring(slug FROM 'link-count-sort-([0-9]+)$')::integer < $2`,
    [PROGRAM_COUNT, PROGRAM_COUNT + INACTIVE_PER_KIND, seedUser.id],
  )
  await write(
    `/* seedLinkCountMerge */ UPDATE topics
    SET merged_into_topic_id = $3::uuid, merged_at = CURRENT_TIMESTAMP, merged_by_id = $4::uuid,
      updated_by_id = $4::uuid, aliases = '{}'::text[]
    WHERE substring(slug FROM 'link-count-sort-([0-9]+)$')::integer >= $1
      AND substring(slug FROM 'link-count-sort-([0-9]+)$')::integer < $2`,
    [
      PROGRAM_COUNT + INACTIVE_PER_KIND,
      PROGRAM_COUNT + 2 * INACTIVE_PER_KIND,
      '019e0000-8a00-7000-8000-000000000064',
      seedUser.id,
    ],
  )
  const { rows: after } = await write<{ count: number }>(
    `/* seedLinkCountLifecycleAfter */
    SELECT count(*)::integer AS count FROM topics t JOIN referral_program_topics rp ON rp.topic_id = t.id
    WHERE t.slug LIKE 'link-count-sort-%'
      AND substring(t.slug FROM 'link-count-sort-([0-9]+)$')::integer >= $1
      AND (t.deleted_at IS NOT NULL OR t.merged_into_topic_id IS NOT NULL) AND rp.active_link_count > 0`,
    [PROGRAM_COUNT],
  )
  if (after[0]?.count !== 2 * INACTIVE_PER_KIND)
    throw new Error('Expected inactive fixtures to retain positive counts')
  const { rows: projected } = await write<{ count: number }>(
    `/* seedLinkCountInactiveProjection */
    SELECT count(*)::integer AS count FROM topics t
    JOIN referral_program_link_counts ranking ON ranking.topic_id = t.id
    WHERE t.slug LIKE 'link-count-sort-%'
      AND substring(t.slug FROM 'link-count-sort-([0-9]+)$')::integer >= $1
      AND (t.deleted_at IS NOT NULL OR t.merged_into_topic_id IS NOT NULL)`,
    [PROGRAM_COUNT],
  )
  if (projected[0]?.count !== 0)
    throw new Error('Inactive topics must leave the ranking projection')
  await write(
    `/* seedLinkCountPrograms */ ANALYZE referral_program_link_counts, referral_program_topics, topics`,
  )
}

export async function runTopicLinkCountSortScenario(): Promise<void> {
  await seedLinkCountPrograms()
  // Limit 25 reads 26 rows. The partial index stops on the positive-count prefix.
  registerScenarioContract('topic-link-count-sort', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_referral_program_link_counts__active_link_count__topic_id'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'referral_program_link_counts', max: 26 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 26 },
    ],
  })
  await runAndCapture('topic-link-count-sort', () => readActiveLinkCountTopicPage({ limit: 25 }))
  await runTopicLinkCountLifecycleScenarios()
}
