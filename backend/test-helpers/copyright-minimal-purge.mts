import { purgeCopyrightMinimalRecordWithWork } from '../services/copyright-notices/retention-minimal-purge.mts'

type PurgeOptions = Parameters<typeof purgeCopyrightMinimalRecordWithWork>[1]

/** Test-facing scalar outcome; production uses the budgeted work result directly. */
export async function purgeCopyrightMinimalRecord(noticeId: string, options: PurgeOptions) {
  return (await purgeCopyrightMinimalRecordWithWork(noticeId, options)).outcome
}
