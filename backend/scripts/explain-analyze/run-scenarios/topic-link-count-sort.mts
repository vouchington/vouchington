import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { readActiveLinkCountTopicPage } from '@services/topics/search/link-count-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { runReferralProgramCountRefreshScenario } from './referral-program-count-refresh.mts'

const PROGRAM_COUNT = 5_000
const DISABLED_COUNT = 100
const DELETED_COUNT = 50
const MERGED_COUNT = 50
const STALE_COUNT = DISABLED_COUNT + DELETED_COUNT + MERGED_COUNT
const topicId = (suffix: number) =>
  `019e0000-8a00-7000-8000-${(100 + suffix).toString(16).padStart(12, '0')}`

async function seedLinkCountPrograms(): Promise<void> {
  await write(
    `/* seedLinkCountPrograms */ INSERT INTO topics
       (id, topic_type, name, slug, bedrock_nova_multimodal_v1_content_sha256, created_via)
     SELECT ('019e0000-8a00-7000-8000-' || lpad(to_hex(100 + g), 12, '0'))::uuid,
       'referral_program', 'Link count ' || g, 'link-count-sort-' || g,
       digest('link-count-sort-' || g, 'sha256'), 'system'
     FROM generate_series(0, $1 - 1) AS g
     ON CONFLICT (id) DO UPDATE SET
       deleted_at = NULL, deleted_by_id = NULL, merged_into_topic_id = NULL,
       merged_at = NULL, merged_by_id = NULL
     WHERE topics.slug = EXCLUDED.slug`,
    [PROGRAM_COUNT],
  )
  await write(
    `/* seedLinkCountProgramAttributes */ INSERT INTO referral_program_topics (topic_id, enabled_at)
     SELECT id, CURRENT_TIMESTAMP FROM topics WHERE slug LIKE 'link-count-sort-%'
     ON CONFLICT (topic_id) DO UPDATE SET enabled_at = EXCLUDED.enabled_at, disabled_at = NULL`,
  )
  await write(
    `/* seedLinkCountLinks */ INSERT INTO user_referral_program_links
       (user_id, referral_program_topic_id, url_id, created_via)
     SELECT $1::uuid, id, (SELECT id FROM urls LIMIT 1), 'system'
     FROM topics WHERE slug LIKE 'link-count-sort-%'
     ON CONFLICT DO NOTHING`,
    [seedUser.id],
  )
  await write(
    '/* refreshLinkCountFixture */ REFRESH MATERIALIZED VIEW mv_referral_program_link_counts',
  )
  await write(
    '/* analyzeLinkCountFixture */ ANALYZE mv_referral_program_link_counts, referral_program_topics, topics',
  )
}

function register(id: string, maxRows: number): void {
  registerScenarioContract(id, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_mv_referral_program_link_counts__count__topic_id'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'mv_referral_program_link_counts', max: maxRows },
      { kind: 'maxProcessedRows', relation: 'referral_program_topics', max: maxRows },
      { kind: 'maxProcessedRows', relation: 'topics', max: maxRows },
    ],
  })
}

export async function runTopicLinkCountSortScenario(): Promise<void> {
  await seedLinkCountPrograms()
  await runReferralProgramCountRefreshScenario()
  register('topic-link-count-sort', 26)
  await runAndCapture('topic-link-count-sort', async () => {
    const page = await readActiveLinkCountTopicPage({ limit: 25 })
    assert.equal(page.rows.length, 25)
  })
  register('topic-link-count-cursor', 26)
  await runAndCapture('topic-link-count-cursor', async () => {
    const page = await readActiveLinkCountTopicPage({
      limit: 25,
      after: encodeCursor({ score: 1, id: topicId(PROGRAM_COUNT - 26) }),
    })
    assert.equal(page.rows.length, 25)
  })

  // Keep stale MV rows at the head to measure the actual extra live-eligibility work.
  await write(
    `/* seedLinkCountDisabled */ UPDATE referral_program_topics
     SET enabled_at = NULL, disabled_at = CURRENT_TIMESTAMP
     WHERE topic_id >= $1::uuid AND topic_id < $2::uuid`,
    [topicId(PROGRAM_COUNT - DISABLED_COUNT), topicId(PROGRAM_COUNT)],
  )
  await write(
    `/* seedLinkCountDeleted */ UPDATE topics
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = $3::uuid
     WHERE id >= $1::uuid AND id < $2::uuid`,
    [
      topicId(PROGRAM_COUNT - DISABLED_COUNT - DELETED_COUNT),
      topicId(PROGRAM_COUNT - DISABLED_COUNT),
      seedUser.id,
    ],
  )
  await write(
    `/* seedLinkCountMerged */ UPDATE topics
     SET merged_into_topic_id = $3::uuid, merged_at = CURRENT_TIMESTAMP, merged_by_id = $4::uuid,
       updated_by_id = $4::uuid, aliases = '{}'::text[]
     WHERE id >= $1::uuid AND id < $2::uuid`,
    [
      topicId(PROGRAM_COUNT - STALE_COUNT),
      topicId(PROGRAM_COUNT - DISABLED_COUNT - DELETED_COUNT),
      topicId(0),
      seedUser.id,
    ],
  )
  await write('/* analyzeStaleLinkCountFixture */ ANALYZE referral_program_topics, topics')
  register('topic-link-count-live-eligibility', 226)
  await runAndCapture('topic-link-count-live-eligibility', async () => {
    const page = await readActiveLinkCountTopicPage({ limit: 25 })
    assert.equal(page.rows.length, 25)
    assert.ok(page.rows.every(row => row.id < topicId(PROGRAM_COUNT - STALE_COUNT)))
  })
}
