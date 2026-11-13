import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

const POST_START = 80_000
const ENTITIES_PER_ERA = 12
const REPORTERS_PER_ENTITY = 16
const HOT_REPORT_COUNT = 10_000
const DISTINCT_CLUSTER_COUNT = 20_000
const DISTINCT_CLUSTER_START = 60_000
const REPORT_TIMES = [Date.parse('1970-01-01T00:00:00Z'), Date.parse('2200-01-02T00:00:00Z')]
const STATUSES = ['pending', 'reviewed', 'actioned', 'dismissed'] as const
export const MODERATION_CLUSTER_REPORT_COUNT =
  2 * ENTITIES_PER_ERA * REPORTERS_PER_ENTITY * STATUSES.length +
  HOT_REPORT_COUNT +
  DISTINCT_CLUSTER_COUNT +
  1
export const MODERATION_CLUSTER_HOT_POST_ID = seedUuid(POST_START + 2 * ENTITIES_PER_ERA, '05')
export const MODERATION_CLUSTER_TIED_USER_ID = clusterFixturePostIds(0)[10]!

export function clusterFixturePostIds(era: 0 | 1): string[] {
  return Array.from({ length: ENTITIES_PER_ERA }, (_, offset) =>
    seedUuid(POST_START + era * ENTITIES_PER_ERA + offset, '05'),
  ).toSorted()
}

export function clusterScalePostIds(): string[] {
  return Array.from({ length: DISTINCT_CLUSTER_COUNT }, (_, offset) =>
    seedUuid(DISTINCT_CLUSTER_START + offset, '05'),
  ).toSorted()
}

/** Keep target-index witnesses separate from the hot post's later case-history churn. */
export async function loadModerationClusterWriterPostId(): Promise<string> {
  const postId = clusterFixturePostIds(0)[0]!
  const { rows } = await read<{ resolution_action: string | null }>(
    `/* moderationClusterWriterFixtureOutcomes */ SELECT resolution_action
     FROM moderation_report_clusters WHERE post_id = $1::uuid`,
    [postId],
  )
  assert.deepEqual(rows.map(row => row.resolution_action ?? 'pending').toSorted(), [
    'actioned',
    'dismissed',
    'pending',
    'reviewed',
  ])
  return postId
}

/** Same-millisecond report ids force the cluster order's entity-id tie breaker. */
export async function seedModerationClusterPages(): Promise<void> {
  const postIds = [
    ...clusterFixturePostIds(0),
    ...clusterFixturePostIds(1),
    MODERATION_CLUSTER_HOT_POST_ID,
  ]
  await write(
    `/* seedModerationClusterPages:cases */
    INSERT INTO moderation_cases (post_id)
    SELECT id FROM unnest($1::uuid[]) AS target(id)
    ORDER BY id`,
    [postIds],
  )

  const reportIds: string[] = []
  const targetIds: string[] = []
  const reporterIds: string[] = []
  const actions: Array<string | null> = []
  for (const era of [0, 1] as const) {
    for (const [statusIndex, status] of STATUSES.entries()) {
      for (const [targetIndex, targetId] of clusterFixturePostIds(era).entries()) {
        for (let reporterIndex = 0; reporterIndex < REPORTERS_PER_ENTITY; reporterIndex += 1) {
          const reportIndex =
            era * 10_000 + statusIndex * 2_000 + targetIndex * REPORTERS_PER_ENTITY + reporterIndex
          reportIds.push(seedUuidAtTimestamp(REPORT_TIMES[era]!, reportIndex))
          targetIds.push(targetId)
          reporterIds.push(seedUuid(reporterIndex, '01'))
          actions.push(status === 'pending' ? null : status)
        }
      }
    }
  }
  for (let index = 0; index < HOT_REPORT_COUNT; index += 1) {
    reportIds.push(seedUuidAtTimestamp(Date.parse('2100-01-02T00:00:00Z'), index))
    targetIds.push(MODERATION_CLUSTER_HOT_POST_ID)
    reporterIds.push(seedUuid(index, '01'))
    actions.push(null)
  }
  await write(
    `/* seedModerationClusterPages:reports */
    INSERT INTO moderation_reports
      (id, created_via, reporter_user_id, post_id, case_id, reason, original_reason,
       reviewed_at, resolution_action)
    SELECT input.id, 'system', input.reporter_user_id, input.post_id, c.id,
      'spam', 'spam',
      CASE WHEN input.resolution_action IS NULL THEN NULL ELSE '2250-01-01'::timestamptz END,
      input.resolution_action::moderation_report_resolution_actions
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[])
      AS input(id, post_id, reporter_user_id, resolution_action)
    JOIN moderation_cases c ON c.post_id = input.post_id AND c.resolved_at IS NULL
    ORDER BY input.id`,
    [reportIds, targetIds, reporterIds, actions],
  )

  await write(
    `/* seedModerationClusterPages:tiedUser */
    INSERT INTO users (id, username) VALUES ($1::uuid, 'seed-cluster-same-uuid-user')`,
    [MODERATION_CLUSTER_TIED_USER_ID],
  )
  await write(
    `/* seedModerationClusterPages:tiedUserCase */
    INSERT INTO moderation_cases (reported_user_id) VALUES ($1::uuid)`,
    [MODERATION_CLUSTER_TIED_USER_ID],
  )
  await write(
    `/* seedModerationClusterPages:tiedUserReport */
    INSERT INTO moderation_reports
      (id, created_via, reporter_user_id, reported_user_id, case_id, reason, original_reason)
    SELECT $1::uuid, 'system', $2::uuid, c.reported_user_id, c.id, 'spam', 'spam'
    FROM moderation_cases c
    WHERE c.reported_user_id = $3::uuid AND c.resolved_at IS NULL`,
    [
      seedUuidAtTimestamp(REPORT_TIMES[0]!, 99_999),
      seedUuid(0, '01'),
      MODERATION_CLUSTER_TIED_USER_ID,
    ],
  )

  const distinctPostIds = Array.from({ length: DISTINCT_CLUSTER_COUNT }, (_, offset) =>
    seedUuid(DISTINCT_CLUSTER_START + offset, '05'),
  )
  const distinctReportIds = Array.from({ length: DISTINCT_CLUSTER_COUNT }, (_, offset) =>
    seedUuidAtTimestamp(Date.parse('2050-01-02T00:00:00Z'), DISTINCT_CLUSTER_START + offset),
  )
  await write(
    `/* seedModerationClusterPages:distinctCases */
      INSERT INTO moderation_cases (post_id)
      SELECT id FROM unnest($1::uuid[]) AS target(id) ORDER BY id`,
    [distinctPostIds],
  )
  await write(
    `/* seedModerationClusterPages:distinctReports */
      INSERT INTO moderation_reports
        (id, created_via, reporter_user_id, post_id, case_id, reason, original_reason)
      SELECT input.id, 'system', $3::uuid, input.post_id, c.id, 'spam', 'spam'
      FROM unnest($1::uuid[], $2::uuid[]) AS input(id, post_id)
      JOIN moderation_cases c ON c.post_id = input.post_id AND c.resolved_at IS NULL
      ORDER BY input.id`,
    [distinctReportIds, distinctPostIds, seedUuid(0, '01')],
  )
  // Settle counter-upsert index versions before steady-state access-path measurements.
  await write('/* seedModerationClusterPages:vacuum */ VACUUM (ANALYZE) moderation_report_clusters')
  await write(
    '/* seedModerationClusterPages:analyze */ ANALYZE moderation_reports, moderation_cases, users',
  )
}
