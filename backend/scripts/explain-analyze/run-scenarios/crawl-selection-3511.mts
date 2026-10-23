import { searchParentPathsNeedingBoilerplateRemoval } from '@services/boilerplate-removals/search'
import { deleteOldInvalidCrawls } from '@services/crawls/cleanup'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runCrawlSelection3511Scenarios(): Promise<void> {
  registerScenarioContract('crawl-boilerplate-parent-paths', {
    seededRows: { crawls: 11000 },
    crossPartition: {
      crawls:
        'A recent completed HTML snapshot can belong to a crawl started in an older ID partition.',
    },
    expectations: [{ kind: 'maxProcessedRows', relation: 'crawls', max: 2000 }],
  })
  await runAndCapture(
    'crawl-boilerplate-parent-paths',
    async () => {
      if ((await searchParentPathsNeedingBoilerplateRemoval(100)).length < 1)
        throw new Error('Expected a shared HTML parent path')
    },
    undefined,
    'searchParentPathsNeedingBoilerplateRemoval',
  )

  registerScenarioContract('crawl-invalid-cleanup-due', {
    seededRows: { crawls: 11000 },
    crossPartition: {
      crawls: 'Retention selects old invalid rows across every retained crawl ID partition.',
    },
    expectations: [{ kind: 'maxProcessedRows', relation: 'crawls', max: 50 }],
  })
  await runAndCapture(
    'crawl-invalid-cleanup-due',
    async () => {
      // The fixture's UUIDv7s sit in a current test partition; advance the as-of
      // cutoff one retention window so the same old-row predicate is measurable.
      const cutoffId = getMinUUIDv7ForDate(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000))
      if ((await deleteOldInvalidCrawls({ cutoffId, limit: 10 })).deleted !== 10)
        throw new Error('Expected a full old invalid crawl cleanup page')
    },
    undefined,
    'deleteOldInvalidCrawls',
  )
}
