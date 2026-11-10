import { explainAnalyze, write, type ExplainPlanCacheMode } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'
import type { BeforeExplain } from '../capture-passes.mts'

export type HackerNewsCacheState = 'cold' | 'warm'
export type EvictionEvidence = {
  planCacheMode: ExplainPlanCacheMode
  relations: string[]
  evicted: number
  flushed: number
  skipped: number
}

/** Operator-only instrumentation in the disposable EXPLAIN database, never application startup. */
export async function prepareHackerNewsReadCache(): Promise<void> {
  const { rows } = await write<{ privileged: boolean; database_name: string }>(
    `/* prepareHackerNewsReadCache */ SELECT rolsuper AS privileged,
       current_database() AS database_name FROM pg_roles WHERE rolname = current_user`,
  )
  if (!rows[0]?.privileged)
    throw new Error(
      'HN cold-buffer measurements require a PostgreSQL administrator in the disposable database',
    )
  if (rows[0].database_name === 'voucha')
    throw new Error('HN cache eviction must never use the shared main database')
  await write(
    '/* prepareHackerNewsReadCacheExtension */ CREATE EXTENSION IF NOT EXISTS pg_buffercache',
  )
}

/** Evict only this statement's non-shared, current-database heaps and indexes; never OS caches. */
export function hackerNewsCachePreparation(
  state: HackerNewsCacheState,
  record: (evidence: EvictionEvidence) => void,
): BeforeExplain {
  return async input => {
    const evidence = await evictPlanRelations(input)
    record(evidence)
    if (state === 'warm') {
      // Prime with exactly the same SQL and forced plan mode, immediately before measurement.
      await explainAnalyze('hackerNewsScaleWarmup', input.text, input.values, {
        planCacheMode: input.planCacheMode,
      })
    }
  }
}

async function evictPlanRelations(input: Parameters<BeforeExplain>[0]): Promise<EvictionEvidence> {
  const planned = await explainAnalyze('hackerNewsScaleCachePlan', input.text, input.values, {
    planCacheMode: input.planCacheMode,
    planOnly: true,
  })
  const names = [
    ...new Set(
      collectPlanNodes(planned.plan).flatMap(node =>
        [node['Relation Name'], node['Index Name']].filter(
          (name): name is string => typeof name === 'string',
        ),
      ),
    ),
  ]
  const { rows } = await write<{ name: string }>(
    `/* hackerNewsScaleCacheRelations */ SELECT relation.oid::regclass::text AS name
     FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = current_schema() AND NOT relation.relisshared
       AND relation.relkind IN ('r', 'i', 'm') AND relation.relname = ANY($1::text[])
     ORDER BY relation.oid LIMIT 501`,
    [names],
  )
  if (rows.length === 0 || rows.length > 500)
    throw new Error(
      'HN statement relation inventory must contain between one and 500 local relations',
    )
  const evidence: EvictionEvidence = {
    planCacheMode: input.planCacheMode,
    relations: rows.map(row => row.name),
    evicted: 0,
    flushed: 0,
    skipped: 0,
  }
  let pending = rows.map(row => row.name)
  const skippedBuffers = new Map<string, number>()
  for (let attempt = 0; attempt < 4 && pending.length > 0; attempt++) {
    // A checkpointer or a dying autovacuum worker can pin a buffer for one attempt.
    if (attempt > 0) {
      await new Promise(resolve => {
        setTimeout(resolve, 50)
      })
    }
    const stillSkipped: string[] = []
    for (const name of pending) {
      // no-mistakes-disable-next-line query-reached-per-item: each of at most 500 plan-selected local relations needs its own PostgreSQL cache eviction; no global buffer or OS cache operation.
      const { rows: evictions } = await write<{
        buffers_evicted: number | string
        buffers_flushed: number | string
        buffers_skipped: number | string
      }>(
        `/* evictHackerNewsScaleRelation */
        SELECT buffers_evicted, buffers_flushed, buffers_skipped
        FROM pg_buffercache_evict_relation($1::regclass)`,
        [name],
      )
      const eviction = evictions[0]
      if (!eviction) throw new Error(`No HN cache-eviction evidence for ${name}`)
      evidence.evicted += Number(eviction.buffers_evicted)
      evidence.flushed += Number(eviction.buffers_flushed)
      const skipped = Number(eviction.buffers_skipped)
      if (skipped === 0) skippedBuffers.delete(name)
      else {
        stillSkipped.push(name)
        skippedBuffers.set(name, skipped)
      }
    }
    pending = stillSkipped
  }
  evidence.skipped = [...skippedBuffers.values()].reduce((sum, count) => sum + count, 0)
  if (evidence.skipped !== 0) {
    const detail = [...skippedBuffers.entries()]
      .map(([name, count]) => `${name}=${count}`)
      .join(', ')
    throw new Error(
      `HN cold-buffer preparation skipped ${evidence.skipped} pinned buffers (${detail})`,
    )
  }
  return evidence
}
