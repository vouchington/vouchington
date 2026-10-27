import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import { expect, onTestFinished } from 'vitest'

/** Hold the relation row until the updater has actually acquired its publication fence. */
export async function assertTestRelationPublicationLockOrder(options: {
  relationId: string
  aliasId: string
  update: () => Promise<void>
}): Promise<void> {
  await using holder = await beginTransaction()
  let outcome: Promise<PromiseSettledResult<void>[]> | undefined
  let cleaning: Promise<void> | undefined
  let closed = false
  const cleanup = () => {
    closed = true
    return (cleaning ??= (async () => {
      await holder.commit()
      await outcome
    })())
  }
  onTestFinished(cleanup)
  try {
    await holder(
      '/* assertTestRelationPublicationLockOrder.holdAlias */ SELECT 1 FROM relation__rss_feed_item__category__topic_alias WHERE id = $1 FOR UPDATE',
      [options.relationId],
    )
    if (closed) throw new Error('Publication lock observation closed before updater admission')
    const diagnostics = await runWithCapturedQueries(async context => {
      const acquired = Promise.withResolvers<void>()
      let publicationExecutor: QueryExecutor | undefined
      let updatedWithFence = false
      const annotation = '/* lockTopicAliasPublicationCaptures */'
      const unsubscribe = context.subscribe(event => {
        if (
          event.text.includes(annotation) &&
          Array.isArray(event.values[0]) &&
          event.values[0].includes(options.aliasId)
        ) {
          if (event.status === 'rejected') acquired.reject(event.reason)
          else {
            publicationExecutor = event.executor
            acquired.resolve()
          }
        }
        if (
          event.text.includes('/* updateEntityRelationVoteStatsIfChanged */') &&
          event.values.includes(options.relationId) &&
          event.status === 'fulfilled' &&
          event.executor === publicationExecutor
        )
          updatedWithFence = true
        return undefined
      })
      outcome = Promise.allSettled([
        Promise.resolve().then(() => {
          if (closed)
            throw new Error('Publication lock observation closed before updater admission')
          return options.update()
        }),
      ])
      try {
        await Promise.race([
          acquired.promise,
          outcome.then(([result]) => {
            if (result?.status === 'rejected') throw result.reason
            throw new Error('Vote stats update completed without acquiring its publication fence')
          }),
        ])
        // One real competing acquisition must fail while the original transaction holds its fence.
        await expect(probePublicationLock()).rejects.toMatchObject({ code: '55P03' })
        await cleanup()
        const [result] = await outcome
        if (result?.status === 'rejected') throw result.reason
        expect(updatedWithFence).toBe(true)
      } finally {
        try {
          await cleanup()
        } finally {
          unsubscribe()
        }
      }
    })
    await diagnostics.completionDrain
  } finally {
    await cleanup()
  }

  async function probePublicationLock(): Promise<void> {
    await using probe = await beginTransaction()
    await probe(
      "/* assertTestRelationPublicationLockOrder.timeout */ SET LOCAL lock_timeout = '50ms'",
    )
    await probe(
      '/* assertTestRelationPublicationLockOrder.probe */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`topic_alias:${options.aliasId}`],
    )
    await probe.commit()
  }
}
