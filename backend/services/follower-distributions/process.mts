import { getFollowerDistributionsWorkLimit } from './work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import type { FollowerDistributionProcessResult } from './types.mts'
import type { ProcessOptions } from './process-types.mts'
import {
  getDistributionForUpdate,
  getNextRecipientBatch,
  markDistributionCompleted,
  updateDistributionCursor,
} from './process-state.mts'
import { processTargetRows } from './process-target-rows.mts'

export async function processFollowerDistributionChunk(
  distributionId: string,
  options: ProcessOptions = {},
): Promise<FollowerDistributionProcessResult> {
  const chunkSize = options.chunkSize ?? getFollowerDistributionsWorkLimit('recipient_chunk_size')
  await using query = await beginTransaction()

  const distribution = await getDistributionForUpdate(distributionId, query)
  if (!distribution || distribution.completed_at || distribution.failed_at) {
    await query.commit()
    return emptyResult(distributionId, true)
  }
  const recipients = await getNextRecipientBatch(distribution, chunkSize, query)
  if (recipients.ids.length === 0) {
    await markDistributionCompleted(distribution.id, query)
    await query.commit()
    return emptyResult(distribution.id, true)
  }
  let notificationsToDeliver: FollowerDistributionProcessResult['notificationsToDeliver'] = []
  if (recipients.ids.length > 0) {
    const targetRowsResult = await processTargetRows(distribution, recipients.ids, query)
    if (targetRowsResult.failed) {
      await query.commit()
      return emptyResult(distribution.id, true)
    }
    notificationsToDeliver = targetRowsResult.notificationsToDeliver
  }
  const cursorRecipientId = recipients.ids.at(-1)!
  const completed = !recipients.hasMore
  if (!options.deferCursorUpdate) {
    await updateDistributionCursor(distribution.id, cursorRecipientId, query)
  }
  if (completed && !options.deferCursorUpdate) {
    await markDistributionCompleted(distribution.id, query)
  }
  await query.commit()
  return {
    distributionId: distribution.id,
    completed,
    processed: recipients.ids.length,
    notificationsToDeliver,
    cursorRecipientId,
  }
}

export async function advanceFollowerDistributionChunkCursor(
  distributionId: string,
  cursorRecipientId: string,
  completed: boolean,
): Promise<void> {
  await using query = await beginTransaction()

  const distribution = await getDistributionForUpdate(distributionId, query)
  if (!distribution || distribution.completed_at || distribution.failed_at) {
    await query.commit()
    return
  }
  await updateDistributionCursor(distribution.id, cursorRecipientId, query)
  if (completed) {
    await markDistributionCompleted(distribution.id, query)
  }

  await query.commit()
}

function emptyResult(
  distributionId: string,
  completed: boolean,
): FollowerDistributionProcessResult {
  return { distributionId, completed, processed: 0, notificationsToDeliver: [] }
}
