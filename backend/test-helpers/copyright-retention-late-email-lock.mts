import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendCopyrightEmailIntakeRecommendation } from '../services/copyright-notices/email-recommendations.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

/** Holds erasure's notice lock until a linked email writer waits, then commits its marker. */
export async function writeLateCopyrightEmailAfterRetentionMarker(
  noticeId: string,
  input: Parameters<typeof appendCopyrightEmailIntakeRecommendation>[0],
): Promise<boolean> {
  await using holder = await beginTransaction()
  const holderPid = await getTestPostgresBackendProcessId(holder)
  await holder(sql`/* testLateCopyrightEmail:holdNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
  const lateWrite = appendCopyrightEmailIntakeRecommendation(input)
  try {
    await waitForTestPostgresLockWaiter(
      holderPid,
      'appendCopyrightEmailIntakeRecommendation:lockNotice',
    )
    await holder(sql`/* testLateCopyrightEmail:marker */
      INSERT INTO copyright_notice_retention_erasures
        (copyright_notice_id, retention_days, erased_object_count)
      VALUES (${noticeId}, 30, 0)`)
  } finally {
    await holder.commit()
    await lateWrite.catch(() => undefined)
  }
  return await lateWrite
}
