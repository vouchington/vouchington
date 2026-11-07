import { write } from '@data-stores/psql'
import { readActiveLinkCountTopicPage } from '@services/topics/search/link-count-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const PROGRAM_COUNT = 5_000

// Enough enabled programs that the partial keyset index is cheaper than sorting the table.
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
     ON CONFLICT DO NOTHING`,
    [PROGRAM_COUNT - 1],
  )
  await write(
    `/* seedLinkCountPrograms */ INSERT INTO referral_program_topics (topic_id, enabled_at)
     SELECT id, CURRENT_TIMESTAMP
     FROM topics
     WHERE slug LIKE 'link-count-sort-%'
     ON CONFLICT DO NOTHING`,
  )
  await write(`/* seedLinkCountPrograms */ ANALYZE referral_program_topics, topics`)
}

export async function runTopicLinkCountSortScenario(): Promise<void> {
  await seedLinkCountPrograms()
  // Measured at limit 25 in both plan cache modes: 26 referral_program_topics rows and 26 topics rows.
  registerScenarioContract('topic-link-count-sort', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_referral_program_topics__active_link_count__topic_id'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'referral_program_topics', max: 26 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 26 },
    ],
  })
  await runAndCapture('topic-link-count-sort', () => readActiveLinkCountTopicPage({ limit: 25 }))
}
