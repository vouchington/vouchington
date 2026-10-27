import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import type { PersistedPage } from './run-persisted-pages.mts'

type PageState<Row> = {
  last: Row | undefined
  hasMore: boolean
  upperBound: string
  deleted: number
}

type PageSteps<Progress, Row, Continuation> = {
  query?: TransactionQuery
  batchSize: number
  lockProgress: (query: TransactionQuery) => Promise<Progress>
  upperBound: (progress: Progress) => string
  select: (
    query: TransactionQuery,
    progress: Progress,
    upperBound: string,
    limit: number,
  ) => Promise<readonly Row[]>
  apply: (query: TransactionQuery, page: readonly Row[], upperBound: string) => Promise<number>
  checkpoint: (query: TransactionQuery, state: PageState<Row>) => Promise<void>
  continuation: (last: Row) => Continuation
}

/** One locked page, its mutation, and its persisted cursor commit or rollback together. */
export async function runKeysetRetentionPage<Progress, Row, Continuation>(
  steps: PageSteps<Progress, Row, Continuation>,
): Promise<PersistedPage<Continuation>> {
  await using owned = steps.query ? undefined : await beginTransaction()
  const query = steps.query ?? owned!
  const progress = await steps.lockProgress(query)
  const upperBound = steps.upperBound(progress)
  const candidates = await steps.select(query, progress, upperBound, steps.batchSize + 1)
  const page = candidates.slice(0, steps.batchSize)
  const deleted = await steps.apply(query, page, upperBound)
  const hasMore = candidates.length > steps.batchSize
  const last = page.at(-1)
  await steps.checkpoint(query, { last, hasMore, upperBound, deleted })
  if (owned) await owned.commit()
  return {
    deleted,
    hasMore,
    continuation: hasMore ? steps.continuation(last!) : null,
  }
}
