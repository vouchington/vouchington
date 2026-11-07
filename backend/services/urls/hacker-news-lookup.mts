import { areHackerNewsLookupsEnabled, hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { write } from '@data-stores/psql'
import { fetchHackerNewsReferences } from './hacker-news-algolia.mts'
import { replaceHackerNewsReferences } from './hacker-news-references-write.mts'
import { enqueueHackerNewsLookupRefreshes } from '@queues/hacker-news/enqueues'
import { enqueueMissingHackerNewsLookups } from './hacker-news-lookup-enqueue.mts'
import {
  getPrimaryHackerNewsLookupTargets,
  getHackerNewsRefreshDelay,
  isHackerNewsLookupDue,
  type HackerNewsLookupTarget,
} from './hacker-news-lookup-state.mts'

/** One batch implementation; the queue supplies one canonical URL per job. */
export async function lookupHackerNewsReferences(urlIds: string[]): Promise<void> {
  await hackerNewsQueueConfig.waitForInitialization()
  if (!areHackerNewsLookupsEnabled()) return
  const targets = await getPrimaryHackerNewsLookupTargets(urlIds)
  const now = Date.now()
  const due = targets.filter(target => isHackerNewsLookupDue(target, now))
  const results = await fetchHackerNewsReferences(
    due.map(target => ({ urlId: target.id, url: target.url })),
  )
  if (!areHackerNewsLookupsEnabled()) return
  // Canonicals can move during external I/O. Changed targets get their own lookup.
  const current = await getPrimaryHackerNewsLookupTargets(due.map(target => target.id))
  const currentIds = new Set(current.map(target => target.id))
  const unchanged = results.filter(result => currentIds.has(result.urlId))
  await replaceHackerNewsReferences(
    unchanged.map(result => ({
      ...result,
      storyCount: result.stories.length,
      commentCount: result.comments.length,
    })),
  )
  const originalIds = new Set(due.map(target => target.id))
  await enqueueMissingHackerNewsLookups(
    current.flatMap(target => (originalIds.has(target.id) ? [] : [target.id])),
    { query: write },
  )
  await scheduleRefresh(await getPrimaryHackerNewsLookupTargets(targets.map(target => target.id)))
}

async function scheduleRefresh(targets: HackerNewsLookupTarget[]): Promise<void> {
  const now = Date.now()
  const refreshes = targets.flatMap(target => {
    const interval = getHackerNewsRefreshDelay(target, now)
    if (interval === null || !target.looked_up_at) return []
    return [
      {
        urlId: target.id,
        runAt: new Date(new Date(target.looked_up_at).getTime() + interval).toISOString(),
      },
    ]
  })
  await enqueueHackerNewsLookupRefreshes(refreshes)
}
