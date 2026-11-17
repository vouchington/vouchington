import onError from '@modules/on-error'
import type { CopyrightCasePurgeJobData } from '@queues/psql/types'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

/** An aborted page remains eligible for the next scheduled pass, without queue retry. */
export async function runScheduledCopyrightCasePurgePage(data: CopyrightCasePurgeJobData) {
  try {
    return await runCopyrightCasePurgePage(data)
  } catch (err) {
    if (!(err instanceof Error)) throw err
    const failure = err as { code?: string; status?: number; cause?: { code?: string } }
    if (failure.code !== '40P01' && !(failure.status === 409 && failure.cause?.code === '40001'))
      throw err
    onError(err)
    return { data, hasMore: false }
  }
}
