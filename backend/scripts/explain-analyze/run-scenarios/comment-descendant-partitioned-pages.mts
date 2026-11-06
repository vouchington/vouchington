import { getVisibleCommentDescendantIdsPage } from '@services/comments'
import { write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  assertExactIds,
  assertPageSize,
  assertScenarioReadBudget,
} from './comment-descendant-page-budget.mts'
import { verifyWideBoundaryExpansion } from './comment-descendant-wide-boundary.mts'
import { seedCommentDescendantPartitionFixture } from '../seed-data/comment-descendant-partition-fixture.mts'
import { dropCommentDescendantPartitions } from '../seed-data/comment-descendant-partition-storage.mts'

const SEEDED_POSTS = 1_328_636

type DescendantPage = {
  results: string[]
  hasNextPage: boolean
  lastInspectedHeadId?: string | null
}

function register(id: string, maxProcessedRows: number, reason: string): void {
  registerScenarioContract(id, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'posts', max: maxProcessedRows },
      { kind: 'maxBitmapIndexRows', max: maxProcessedRows },
    ],
    // Empty leaf probes are part of a real nonempty page, whose exact ids are checked below.
    allowEmptyResult: true,
    forbidSequentialScans: ['posts'],
    seededRows: { posts: SEEDED_POSTS },
    crossPartition: { posts: reason },
  })
}

function captureServiceSql(id: string, operation: () => Promise<unknown>): Promise<void> {
  return runAndCapture(id, operation, undefined, 'getVisibleCommentDescendantIdsPage')
}

export async function runCommentDescendantPartitionedPages(): Promise<void> {
  const fixture = await seedCommentDescendantPartitionFixture()
  try {
    await write(`/* analyzeCommentDescendantPartitionFixture */ ANALYZE posts`)

    register(
      'comment-descendants-partitioned-head-page',
      500,
      'A keyset page of direct child heads spans the 24 explicit post partitions.',
    )
    const expectedHeadIds = [...fixture.pageHeadIds].toSorted()
    const firstHeadPage = (await getVisibleCommentDescendantIdsPage(
      null,
      fixture.pageRootId,
      fixture.pageRootId,
      { limit: 100 },
    )) as DescendantPage
    assertPageSize(firstHeadPage, 100, 'The first descendant head page')
    assertExactIds(firstHeadPage.results, expectedHeadIds.slice(0, 100), 'The first head page')
    if (!firstHeadPage.hasNextPage)
      throw new Error('The 101-head fixture must leave a next head after the first 100-head page')
    await captureServiceSql('comment-descendants-partitioned-head-page', () =>
      getVisibleCommentDescendantIdsPage(null, fixture.pageRootId, fixture.pageRootId, {
        limit: 100,
      }),
    )
    assertScenarioReadBudget('comment-descendants-partitioned-head-page', 500, 110)
    const afterId = firstHeadPage.lastInspectedHeadId ?? firstHeadPage.results.at(-1)
    if (!afterId) throw new Error('The first descendant page must expose an inspected cursor head')
    const continuationPage = (await getVisibleCommentDescendantIdsPage(
      null,
      fixture.pageRootId,
      fixture.pageRootId,
      { limit: 100, afterId },
    )) as DescendantPage
    assertExactIds(
      [...firstHeadPage.results, ...continuationPage.results],
      expectedHeadIds,
      'The first page and continuation together',
    )
    register(
      'comment-descendants-partitioned-head-continuation',
      500,
      'The continuation page resumes across the explicit post partition set.',
    )
    await captureServiceSql('comment-descendants-partitioned-head-continuation', async () => {
      const page = (await getVisibleCommentDescendantIdsPage(
        null,
        fixture.pageRootId,
        fixture.pageRootId,
        { limit: 100, afterId },
      )) as DescendantPage
      assertPageSize(page, 100, 'The continued descendant head page')
      assertExactIds(page.results, expectedHeadIds.slice(100), 'The continued head page')
      if (page.results.length !== 1 || page.hasNextPage)
        throw new Error('The continuation after 100 of 101 heads must return only the final head')
      return page
    })
    assertScenarioReadBudget('comment-descendants-partitioned-head-continuation', 500, 5)
    register(
      'comment-descendants-partitioned-wide-preview',
      500,
      'A wide and deep comment thread is previewed across its explicit post partitions.',
    )
    await captureServiceSql('comment-descendants-partitioned-wide-preview', async () => {
      const page = (await getVisibleCommentDescendantIdsPage(
        null,
        fixture.wideRootId,
        fixture.wideRootId,
        { limit: 100 },
      )) as DescendantPage
      assertPageSize(page, 100, 'The wide thread preview')
      if (
        !page.results.includes(fixture.wideHeadIds[0]!) ||
        !page.results.includes(fixture.wideBoundaryPathIds[1]!)
      )
        throw new Error('The wide preview must expose its first head and its pending child')
      return page
    })
    assertScenarioReadBudget('comment-descendants-partitioned-wide-preview', 500, 110)

    const wideBoundary = await verifyWideBoundaryExpansion(fixture)
    register(
      'comment-descendants-partitioned-boundary-empty-expansion',
      500,
      'The first 100 pending children of a returned boundary placeholder yield an empty page with a cursor.',
    )
    await captureServiceSql(
      'comment-descendants-partitioned-boundary-empty-expansion',
      async () => {
        const page = await getVisibleCommentDescendantIdsPage(
          null,
          fixture.boundaryRootId,
          wideBoundary.boundaryId,
          { limit: 100 },
        )
        if (page.results.length !== 0 || !page.hasNextPage || !page.lastInspectedHeadId)
          throw new Error('The first wide-boundary expansion must return an empty cursor page')
        return page
      },
    )
    assertScenarioReadBudget('comment-descendants-partitioned-boundary-empty-expansion', 500, 110)
    register(
      'comment-descendants-partitioned-boundary-expansion',
      50,
      'The sixth bounded expansion page reaches the valid reply after 500 pending siblings.',
    )
    await captureServiceSql('comment-descendants-partitioned-boundary-expansion', async () => {
      const page = await getVisibleCommentDescendantIdsPage(
        null,
        fixture.boundaryRootId,
        wideBoundary.boundaryId,
        { limit: 100, afterId: wideBoundary.lastPendingId },
      )
      if (page.results.length !== 1 || page.results[0] !== wideBoundary.validReplyId)
        throw new Error('The sixth wide-boundary expansion must reveal the valid reply')
      return page
    })
    assertScenarioReadBudget('comment-descendants-partitioned-boundary-expansion', 50, 5)

    register(
      'comment-descendants-partitioned-boundary-lookdown',
      100,
      'A depth-boundary placeholder lookdown follows one deep branch across explicit post partitions.',
    )
    const boundaryPage = (await getVisibleCommentDescendantIdsPage(
      null,
      fixture.boundaryRootId,
      fixture.boundaryRootId,
      { limit: 100 },
    )) as DescendantPage
    assertExactIds(
      boundaryPage.results,
      fixture.deepPathIds.slice(0, 7),
      'The seven-level wide boundary preview',
    )
    await captureServiceSql('comment-descendants-partitioned-boundary-lookdown', async () => {
      const page = (await getVisibleCommentDescendantIdsPage(
        null,
        fixture.boundaryRootId,
        fixture.boundaryRootId,
        { limit: 100 },
      )) as DescendantPage
      assertPageSize(page, 100, 'The boundary placeholder preview')
      if (!page.results.includes(fixture.boundaryHeadId))
        throw new Error('The bounded lookdown must preserve the unresolved boundary placeholder')
      return page
    })
    assertScenarioReadBudget('comment-descendants-partitioned-boundary-lookdown', 100, 10)
  } finally {
    await dropCommentDescendantPartitions(fixture.partitionNames)
    await write(`/* analyzeAfterCommentDescendantPartitionFixture */ ANALYZE posts`)
  }
}
