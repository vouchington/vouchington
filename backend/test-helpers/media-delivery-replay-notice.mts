import { beginTransaction, write } from '@data-stores/psql'
import { seedMediaDeliveryReplayNotice } from '../scripts/explain-analyze/seed-data/media-delivery-replay.mts'
import { MEDIA_REPLAY_ACTOR_ID } from '../scripts/explain-analyze/seed-data/media-delivery-replay-cohort.mts'

export async function readCopyrightNoticeIdentityCounts(noticeId: string) {
  const { rows } = await write<{ notices: number; identities: number }>(
    `/* readCopyrightNoticeIdentityCounts */
    SELECT (SELECT count(*)::integer FROM copyright_notices WHERE id = $1) AS notices,
      (SELECT count(*)::integer FROM retained_copyright_notice_identities WHERE id = $1) AS identities`,
    [noticeId],
  )
  return rows[0]!
}

/** Deletes through the case-purge permit, which leaves the retained identity in place. */
export async function deleteCopyrightNoticeKeepingIdentity(noticeId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* deleteCopyrightNoticeKeepingIdentity:permit */
    SELECT set_config('app.copyright_case_purge_table', 'copyright_notices', true),
      set_config('app.copyright_case_purge_notice_id', $1, true)`,
    [noticeId],
  )
  await transaction(
    `/* deleteCopyrightNoticeKeepingIdentity */ DELETE FROM copyright_notices WHERE id = $1`,
    [noticeId],
  )
  await transaction.commit()
}

/** Commits one repeat of the real seed statement, as the replay seed does. */
export async function seedMediaDeliveryReplayNoticeCommitted(noticeId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await seedMediaDeliveryReplayNotice(transaction, noticeId, MEDIA_REPLAY_ACTOR_ID)
  await transaction.commit()
}
