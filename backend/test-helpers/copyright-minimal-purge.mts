import { purgeCopyrightMinimalRecordWithWork } from '../services/copyright-notices/retention-minimal-purge.mts'
import { cleanupCopyrightMinimalRecords } from '../services/data-retention/cleanup-copyright-minimal-records.mts'
import { getCopyrightRetentionWorkDate } from './copyright-retention-work.mts'

type PurgeOptions = Parameters<typeof purgeCopyrightMinimalRecordWithWork>[1]

/** Test-facing scalar outcome; production uses the budgeted work result directly. */
export async function purgeCopyrightMinimalRecord(noticeId: string, options: PurgeOptions) {
  return (
    await purgeCopyrightMinimalRecordWithWork(noticeId, options, getCopyrightRetentionWorkDate())
  ).outcome
}

/** Run the bounded candidate sweep at the explicit fixture clock. */
export async function cleanupCopyrightMinimalRecordsAtTestClock(
  limits: Parameters<typeof cleanupCopyrightMinimalRecords>[0],
  options: Parameters<typeof cleanupCopyrightMinimalRecords>[1],
) {
  return cleanupCopyrightMinimalRecords(limits, options, getCopyrightRetentionWorkDate())
}
