import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { getModerationSummaryRecipients } from '@services/communities/moderation-summary-recipients'
import { getCommunitiesWorkLimit } from '@services/communities/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { contentHash, seedUuid } from '../seed-data/common.mts'

const RECIPIENT_ID = '019d0000-0000-7000-8000-000000000001'
const TARGET_COMMUNITY_ID = '019d0000-0000-7000-8000-000000000002'
const NOISE_COMMUNITY_ID = '019d0000-0000-7000-8000-000000000003'

/** A moderator with only report work must not scan reports from other communities. */
export async function runModerationSummaryReportScenario(): Promise<void> {
  const pageSize = getCommunitiesWorkLimit('summary_email_batch_size')
  const reportNoise = pageSize * 4 + 1
  const postIds = Array.from({ length: reportNoise + 1 }, (_, index) =>
    seedUuid(900_000 + index, '05'),
  ).toSorted()
  const reportIds = Array.from({ length: reportNoise + 1 }, (_, index) =>
    seedUuid(reportNoise - index, 'f9'),
  )
  const hash = contentHash('moderation-summary-reports')
  let seeded = false
  try {
    await using transaction = await beginTransaction()
    await transaction(
      `/* seedSummaryReportRecipient */ INSERT INTO users
       (id, username, moderation_email_time_of_day, moderation_email_timezone)
       VALUES ($1, 'explain-summary-reports', '00:00', 'UTC')`,
      [RECIPIENT_ID],
    )
    const { rows: emails } = await transaction<{ user_id: string }>(
      `/* seedSummaryReportEmail */ INSERT INTO user_email_addresses
       (user_id, email_address, email_domain_hostname_id, is_primary)
       SELECT $1, 'explain-summary-reports@example.com', email_domain_hostname_id, TRUE
       FROM user_email_addresses WHERE user_id = $2 AND is_primary = TRUE RETURNING user_id`,
      [RECIPIENT_ID, seedUuid(1, '01')],
    )
    assert.equal(emails.length, 1, 'Moderation report fixture needs a source primary email')
    await transaction(
      `/* seedSummaryReportCommunities */ INSERT INTO communities (id, name, slug, created_by_id, created_via)
       VALUES ($1, 'Summary report target', 'explain-summary-report-target', $3, 'system'),
              ($2, 'Summary report noise', 'explain-summary-report-noise', $3, 'system')`,
      [TARGET_COMMUNITY_ID, NOISE_COMMUNITY_ID, RECIPIENT_ID],
    )
    await transaction(
      `/* seedSummaryReportModerator */ INSERT INTO community_members (community_id, user_id, role)
       VALUES ($1, $2, 'moderator')`,
      [TARGET_COMMUNITY_ID, RECIPIENT_ID],
    )
    await transaction(
      `/* seedSummaryReportPosts */ INSERT INTO posts
       (id, created_via, post_type, title, markdown, created_by_id, community_id,
        gemini_embedding_2_content_sha256, llm_moderation_content_sha256, deleted_at, bedrock_nova_multimodal_v1_content_sha256)
       SELECT id, 'system', 'discussion', 'Summary report', 'Report fixture', $2,
         CASE WHEN ordinal = $6 THEN $3::uuid ELSE $4::uuid END, $5, $5,
         CASE WHEN ordinal = $6 THEN CURRENT_TIMESTAMP END
       , $5 FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)`,
      [postIds, RECIPIENT_ID, TARGET_COMMUNITY_ID, NOISE_COMMUNITY_ID, hash, postIds.length],
    )
    await transaction(
      `/* seedSummaryPendingReports */ WITH cases AS (
         INSERT INTO moderation_cases (post_id)
         SELECT id FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)
         ORDER BY ordinal RETURNING id, post_id
       )
       INSERT INTO moderation_reports (id, created_via, reporter_user_id, post_id, case_id, reason, original_reason)
       SELECT report.id, 'system', $2, target.post_id, target.id, 'spam', 'spam'
       FROM (SELECT id, post_id, row_number() OVER (ORDER BY post_id) AS ordinal FROM cases) target
       JOIN unnest($3::uuid[]) WITH ORDINALITY AS report(id, ordinal) USING (ordinal)
       ORDER BY target.ordinal`,
      [postIds, seedUser.id, reportIds],
    )
    await transaction.commit()
    seeded = true
    await write(
      '/* analyzeSummaryReportFixture */ ANALYZE posts, moderation_reports, community_members, communities, users',
    )
    registerScenarioContract('moderation-summary-report-work', {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_moderation_reports__active_post_unique'] },
        { kind: 'maxProcessedRows', relation: 'moderation_reports', max: pageSize + 1 },
        { kind: 'maxProcessedRows', relation: 'posts', max: pageSize * 2 + 1 },
      ],
      crossPartition: {
        posts: 'The moderation summary probes reported posts by community across post partitions.',
      },
    })
    await runAndCapture('moderation-summary-report-work', async () => {
      const recipients = await getModerationSummaryRecipients(new Date())
      assert.ok(
        recipients.some(({ id }) => id === RECIPIENT_ID),
        'A report on a deleted post remains moderator work',
      )
      return recipients
    })
  } finally {
    if (seeded)
      await write('/* cleanupSummaryReportPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])', [
        postIds,
      ])
    if (seeded)
      await write(
        '/* cleanupSummaryReportCommunities */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
        [[TARGET_COMMUNITY_ID, NOISE_COMMUNITY_ID]],
      )
    if (seeded)
      await write('/* cleanupSummaryReportRecipient */ DELETE FROM users WHERE id = $1', [
        RECIPIENT_ID,
      ])
    if (seeded)
      await write(
        '/* vacuumSummaryReportFixture */ VACUUM (ANALYZE) moderation_reports, moderation_cases, posts, community_members, communities, users, user_email_addresses',
      )
  }
}
