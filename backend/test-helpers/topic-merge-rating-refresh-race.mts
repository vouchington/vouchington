import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import { lockActiveTopicForRatingStatsRefresh } from '../services/topics/ratings-lifecycle.mts'

/** Exercise the real refresher query sequence while a merge transaction owns its rating key. */
export async function runTopicMergeRatingRefreshRace(
  sourceId: string,
  destinationId: string,
  mergerId: string,
): Promise<{ passedPrecheck: boolean; stayedActive: boolean }> {
  await using merge = await beginTransaction()
  await merge(
    `/* holdTopicMergeRatingRefreshRace */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`topic-rating:${sourceId}`],
  )
  await using refresher = await beginTransaction()
  const ratingLockIssued = Promise.withResolvers<void>()
  let passedPrecheck = false
  const observed = new Proxy(refresher, {
    apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
      const [input] = argumentsList
      const statement = typeof input === 'string' ? input : input.text
      const pending: ReturnType<QueryExecutor> = Reflect.apply(target, thisArgument, argumentsList)
      if (statement.includes('/* getActiveTopicForRatingStatsRefresh */'))
        return pending.then(result => {
          passedPrecheck = Boolean(result.rowCount)
          return result
        })
      if (statement.includes('/* lockTopicRatingStatsRefresh */')) ratingLockIssued.resolve()
      return pending
    },
  })
  const pendingRefresh = lockActiveTopicForRatingStatsRefresh(observed, sourceId)
  void pendingRefresh.catch(err => ratingLockIssued.reject(err))

  let mergeCommitted = false
  try {
    // The production precheck completed and its actual rating advisory-lock query was issued.
    // That query cannot finish until this transaction commits its redirect and metric deletion.
    await ratingLockIssued.promise
    if (!passedPrecheck) throw new Error('Source rating refresh missed the pre-redirect precheck')
    await merge(
      `/* commitTopicMergeRatingRefreshRace redirect */ UPDATE topics SET
        merged_into_topic_id = $2::uuid, merged_at = CURRENT_TIMESTAMP, merged_by_id = $3::uuid
        WHERE id = $1::uuid`,
      [sourceId, destinationId, mergerId],
    )
    await merge(
      `/* commitTopicMergeRatingRefreshRace metrics */ DELETE FROM topic_metrics
        WHERE topic_id = $1::uuid`,
      [sourceId],
    )
    await merge.commit()
    mergeCommitted = true
    const stayedActive = await pendingRefresh
    await refresher.commit()
    return { passedPrecheck, stayedActive }
  } finally {
    if (!mergeCommitted) await merge.rollback()
    await Promise.allSettled([pendingRefresh])
  }
}

export async function hasTopicMergeRatingMetricRow(topicId: string): Promise<boolean> {
  const { rows } = await write<{ exists: boolean }>(
    `/* hasTopicMergeRatingMetricRow */ SELECT EXISTS(
      SELECT 1 FROM topic_metrics WHERE topic_id = $1::uuid
    ) AS exists`,
    [topicId],
  )
  return rows[0]!.exists
}
