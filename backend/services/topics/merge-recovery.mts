import { write } from '@data-stores/psql'
import { enqueueRecoveredTopicMergePages } from '@queues/background/enqueues/topic-merge-enqueues'
import type {
  TopicMergePageData,
  TopicMergeRecoveryData,
} from '@queues/background/enqueues/topic-merge-jobs'
import { getTopicMergeWorkLimit } from './merge-work-limits.mts'

type ActiveMergeRow = { id: string; generation: number; is_stale: boolean }

/** Reads one raw active-operation page and resumes only stale generations from that page. */
export async function dispatchStalledTopicMergePage(
  data: TopicMergeRecoveryData,
  pageSize: number,
  enqueueRecovered: (
    inputs: TopicMergePageData[],
  ) => Promise<unknown> = enqueueRecoveredTopicMergePages,
): Promise<{ result: number; next?: TopicMergeRecoveryData }> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError('Topic merge recovery page size must be positive')

  let highWaterId = data.highWaterId
  let staleBefore = data.staleBefore
  if (highWaterId === undefined || staleBefore === undefined) {
    const { rows } = await write<{ high_water_id: string | null; stale_before: Date }>(
      `/* dispatchStalledTopicMergePage bounds */ SELECT
        (SELECT id FROM topic_merge_operations
          WHERE completed_at IS NULL AND failed_at IS NULL ORDER BY id DESC LIMIT 1) AS high_water_id,
        CURRENT_TIMESTAMP - ($1::integer * INTERVAL '1 second') AS stale_before`,
      [getStaleSeconds()],
    )
    highWaterId = rows[0]!.high_water_id
    staleBefore = rows[0]!.stale_before.toISOString()
  }

  if (highWaterId === null) return { result: 0 }
  if (!highWaterId || !staleBefore)
    throw new TypeError('Topic merge recovery sweep bounds are incomplete')

  const { rows } = await write<ActiveMergeRow>(
    `/* dispatchStalledTopicMergePage raw page */ WITH page AS MATERIALIZED (
      SELECT id, generation, updated_at FROM topic_merge_operations
      WHERE completed_at IS NULL AND failed_at IS NULL
        AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND id <= $2::uuid
      ORDER BY id LIMIT $3::integer
    ) SELECT id, generation, updated_at < $4::timestamptz AS is_stale
      FROM page ORDER BY id`,
    [data.cursorOperationId ?? null, highWaterId, pageSize, staleBefore],
  )

  const stalled = rows.filter(row => row.is_stale)
  if (stalled.length)
    await enqueueRecovered(
      stalled.map(({ id: operationId, generation }) => ({ operationId, generation })),
    )

  const lastRawId = rows.at(-1)?.id
  return {
    result: stalled.length,
    ...(rows.length === pageSize && lastRawId
      ? {
          next: {
            highWaterId,
            staleBefore,
            cursorOperationId: lastRawId,
          },
        }
      : {}),
  }
}

function getStaleSeconds(): number {
  // DynamicConfig validation and its ceiling are shared with the merge operation settings.
  return getTopicMergeWorkLimit('recovery_stale_seconds')
}
