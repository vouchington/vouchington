import {
  createTopicMergeOperation,
  getTopicMergeOperation,
} from '../services/topics/merge-operations.mts'
import { processTopicMergeOperationPage } from '../services/topics/merge-operation-page.mts'
import { getTopicMergeNativeCheckpoint } from './topic-merge-native-operation.mts'
import { getTopicByAny } from '../services/topics/get.mts'
import type { Topic } from '../services/topics/types.mts'
import type { PrivateUser } from '../services/users/types.mts'
import { write } from '@data-stores/psql'

class TopicMergeFixtureRejectedError extends Error {
  readonly status = 409
  readonly code: string | null

  constructor(code: string | null) {
    super(`Topic merge rejected: ${code}`)
    this.code = code
  }
}

/** Existing reader fixtures settle the real current async operation without a timer or worker. */
export async function mergeTopicsForTest(
  currentUser: PrivateUser,
  source: Topic,
  destination: Topic,
) {
  const operation = await createTopicMergeOperation(currentUser, source, destination)
  await settleTopicMergeOperationForTest(currentUser, source.id, operation.id)
  const { rows } = await write<{ aliases: string[] }>(
    `/* mergeTopicsForTest aliases */ SELECT source_aliases_before AS aliases FROM topic_merge_operations WHERE id=$1::uuid`,
    [operation.id],
  )
  return {
    source_topic_id: source.id,
    destination_topic_id: destination.id,
    destination_topic: (await getTopicByAny(destination.id))!,
    moved_aliases: rows[0]!.aliases,
  }
}

/** Completes an already admitted merge through its durable generations. */
export async function settleTopicMergeOperationForTest(
  currentUser: PrivateUser,
  sourceId: string,
  operationId: string,
) {
  if (!(await getTopicMergeOperation(currentUser, sourceId, operationId)))
    throw new Error('Topic merge fixture does not belong to its source')
  let generation = (await getTopicMergeNativeCheckpoint(operationId)).generation
  for (let pages = 0; pages < 2000; pages++) {
    const next = await processTopicMergeOperationPage(operationId, generation)
    if (next !== null) {
      generation = next
      continue
    }
    const current = await getTopicMergeOperation(currentUser, sourceId, operationId)
    if (current?.status === 'failed') throw new TopicMergeFixtureRejectedError(current.error_code)
    if (current?.status === 'completed') return current
    if (!current) throw new Error('Topic merge fixture operation disappeared')
    const checkpoint = await getTopicMergeNativeCheckpoint(operationId)
    if (checkpoint.generation === generation)
      throw new Error('Topic merge fixture stopped without a committed page')
    generation = checkpoint.generation
  }
  throw new Error('Topic merge fixture exceeded its bounded page budget')
}
