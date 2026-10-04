import { write } from '@data-stores/psql'

export async function insertTestUnfurlDispatchPlanLinks(input: {
  userId: string
  referralProgramId: string
  urlIds: string[]
  requestedAt: string
}): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* insertTestUnfurlDispatchPlanLinks */
    INSERT INTO user_referral_program_links
      (user_id, referral_program_id, url_id, created_via, unfurl_requested_at)
    SELECT $1::uuid, $2::uuid, url_id, 'system', $4::timestamptz
    FROM unnest($3::uuid[]) url_id RETURNING id`,
    [input.userId, input.referralProgramId, input.urlIds, input.requestedAt],
  )
  return rows.map(row => row.id).toSorted()
}

export async function analyzeTestUnfurlDispatchPlanTable(): Promise<void> {
  await write('/* analyzeTestUnfurlDispatchPlanTable */ ANALYZE user_referral_program_links')
}

export async function insertTestReferralCrawlPlanLinks(input: {
  userId: string
  referralProgramId: string
  urlIds: string[]
  lastSuccessAt: string | null
  lastFailureAt?: string
}): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* insertTestReferralCrawlPlanLinks */
    INSERT INTO user_referral_program_links
      (user_id, referral_program_id, url_id, created_via, last_crawl_success_at, last_crawl_failure_at)
    SELECT $1::uuid, $2::uuid, url_id, 'system', $4::timestamptz, $5::timestamptz
    FROM unnest($3::uuid[]) url_id RETURNING id`,
    [
      input.userId,
      input.referralProgramId,
      input.urlIds,
      input.lastSuccessAt,
      input.lastFailureAt ?? null,
    ],
  )
  return rows.map(row => row.id).toSorted()
}
