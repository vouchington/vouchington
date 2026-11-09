import { write } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

const POST_START = 80_000
const ENTITIES_PER_ERA = 12
const REPORTERS_PER_ENTITY = 16
const REPORT_TIMES = [Date.parse('1970-01-02T00:00:00Z'), Date.parse('2200-01-02T00:00:00Z')]
const STATUSES = ['pending', 'reviewed', 'actioned', 'dismissed'] as const
export const MODERATION_CLUSTER_REPORT_COUNT =
  2 * ENTITIES_PER_ERA * REPORTERS_PER_ENTITY * STATUSES.length

export type ClusterFixtureStatus = (typeof STATUSES)[number]

export function clusterFixturePostIds(era: 0 | 1): string[] {
  return Array.from({ length: ENTITIES_PER_ERA }, (_, offset) =>
    seedUuid(POST_START + era * ENTITIES_PER_ERA + offset, '05'),
  ).toSorted()
}

/** Same-millisecond report ids force the cluster order's entity-id tie breaker. */
export async function seedModerationClusterPages(): Promise<void> {
  const postIds = [...clusterFixturePostIds(0), ...clusterFixturePostIds(1)]
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
}
