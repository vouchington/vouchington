import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const BAN_PAGE_COMMUNITY_ID = seedUuid(0, '14')
export const BAN_PAGE_USER_ID = seedUuid(19_998, '01')
export const BAN_EMPTY_USER_ID = seedUuid(19_999, '01')
export const BAN_EXPIRED_COUNT = 5_000
export const BAN_ACTIVE_COUNT = 104
export const BAN_HISTORY_NOISE_COUNT = 5_000
export const BAN_BULK_USER_ID = seedUuid(19_997, '01')
export const BAN_BULK_COUNT = 100

/** Many expired, not-lifted rows expose id-order active-page scans that overread history. */
export async function seedCommunityBanPages(): Promise<void> {
  const caseId = seedUuid(0, '28')
  await write(
    `/* seedCommunityBanPages:case */
     INSERT INTO moderation_cases (id, reported_user_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [caseId, BAN_PAGE_USER_ID],
  )
  const ids = Array.from({ length: BAN_EXPIRED_COUNT + BAN_ACTIVE_COUNT }, (_, index) =>
    seedUuid(index, '29'),
  )
  await write(
    `/* seedCommunityBanPages:bans */
     INSERT INTO community_bans
       (id, case_id, community_id, user_id, banned_by_id, expires_at)
     SELECT source.id, $2, $3, $4, $4,
       CASE WHEN source.ordinal <= $5 THEN CURRENT_TIMESTAMP - interval '1 day'
            WHEN source.ordinal <= $5 + 3 THEN CURRENT_TIMESTAMP + interval '7 days'
            ELSE NULL END
     FROM unnest($1::uuid[]) WITH ORDINALITY AS source(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [ids, caseId, BAN_PAGE_COMMUNITY_ID, BAN_PAGE_USER_ID, BAN_EXPIRED_COUNT],
  )
  const olderOtherCommunityIds = Array.from({ length: BAN_HISTORY_NOISE_COUNT }, (_, index) =>
    seedUuid(index, '27'),
  )
  await write(
    `/* seedCommunityBanPages:historyNoise */
     INSERT INTO community_bans
       (id, case_id, community_id, user_id, banned_by_id, expires_at)
     SELECT source.id, $2, $3, $4, $4, CURRENT_TIMESTAMP - interval '1 day'
     FROM unnest($1::uuid[]) AS source(id)
     ON CONFLICT DO NOTHING`,
    [olderOtherCommunityIds, caseId, seedUuid(1, '14'), BAN_PAGE_USER_ID],
  )
  const bulkCaseId = seedUuid(1, '28')
  await write(
    `/* seedCommunityBanPages:bulkCase */
     INSERT INTO moderation_cases (id, reported_user_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [bulkCaseId, BAN_BULK_USER_ID],
  )
  const bulkIds = Array.from({ length: BAN_BULK_COUNT }, (_, index) => seedUuid(index, '26'))
  await write(
    `/* seedCommunityBanPages:bulkBans */
     INSERT INTO community_bans
       (id, case_id, community_id, user_id, banned_by_id)
     SELECT source.id, $2, $3, $4,
       CASE WHEN source.ordinal = 1 THEN $5::uuid ELSE $6::uuid END
     FROM unnest($1::uuid[]) WITH ORDINALITY AS source(id, ordinal)
     ON CONFLICT DO NOTHING`,
    [
      bulkIds,
      bulkCaseId,
      BAN_PAGE_COMMUNITY_ID,
      BAN_BULK_USER_ID,
      seedUuid(0, '01'),
      seedUuid(1, '01'),
    ],
  )
  await write('/* seedCommunityBanPages:analyze */ ANALYZE community_bans')
}
