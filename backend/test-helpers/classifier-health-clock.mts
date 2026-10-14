import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type PersistedTimes = { first: Date; last: Date }

/** Read only this fixture's classifier receipts; never rewrite native receipt timestamps. */
export async function readClassifierHealthClockForTest(classifierSlug: string) {
  const { rows } = await write<PersistedTimes>(sql`/* readClassifierHealthClockForTest */
    WITH owned_times AS (
      SELECT run.created_at AS at, 'run' AS kind FROM classifier_runs run
      JOIN classifiers classifier ON classifier.id = run.classifier_id
      WHERE classifier.slug = ${classifierSlug}
      UNION ALL
      SELECT request.created_at AS at, 'request' AS kind FROM classifier_run_requests request
      JOIN classifiers classifier ON classifier.id = request.classifier_id
      WHERE classifier.slug = ${classifierSlug}
    )
    SELECT COALESCE((SELECT min(at) FROM owned_times WHERE kind = 'run'),
      (SELECT min(at) FROM owned_times), classifier.created_at) AS first,
      COALESCE((SELECT max(at) FROM owned_times), classifier.created_at) AS last
    FROM classifiers classifier WHERE classifier.slug = ${classifierSlug}
  `)
  const times = rows[0]
  if (!times) throw new Error('Missing owned classifier clock source')
  return persistedClock(times)
}

/** The eligible-since timestamp of the exact feed item whose grace period is asserted. */
export async function readClassifierFeedItemClockForTest(itemId: string) {
  const { rows } = await write<PersistedTimes>(sql`/* readClassifierFeedItemClockForTest */
    SELECT updated_at AS first, updated_at AS last FROM rss_feed_items WHERE id = ${itemId}
  `)
  const times = rows[0]
  if (!times) throw new Error('Missing owned feed-item clock source')
  return persistedClock(times)
}

function persistedClock({ first, last }: PersistedTimes) {
  const start = first.getTime()
  const end = last.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('Invalid owned health clock interval')
  }
  return {
    fresh: new Date(start),
    afterHours: (hours: number) => new Date(end + hours * 60 * 60 * 1000),
  }
}
