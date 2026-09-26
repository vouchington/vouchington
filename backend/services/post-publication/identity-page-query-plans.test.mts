import { beforeAll, describe, expect, it } from 'vitest'
import {
  beginTransaction,
  enableQueryCapture,
  stopTestQueryCapture,
  explainCapturedTestQuery,
  collectPlanNodes,
  type CapturedTestQuery,
} from '@voucha/test-helpers'
import {
  analyzePublicationSlugPageForTest,
  analyzePublicationSnapshotKeyPageForTest,
  analyzePublicationCleanupPageForTest,
  insertTestPublicationSnapshotHeaderFanout,
} from '@voucha/test-helpers/entities/post-publication-query-plans'
import { insertTestPublicationTopicSlugFanout } from '@voucha/test-helpers/entities/post-publication-snapshots'
import { createTestPublicationSnapshotWork } from './test-fixtures.mts'
import { listPublicationIdentitySourcePage } from './identity-source-paging.mts'
import { materializePostPublicationIdentitySnapshot } from './identity-snapshots.mts'
import { activatePostPublicationTypedProtocol } from './identity-protocol.mts'
import { acknowledgePostPublicationProjectionReceipts } from './receipts.mts'
import { retainStoredPublicationIdentityPage } from './retain-stored-identities.mts'
import { cleanupPostPublicationIdentitySnapshots } from './snapshot-cleanup.mts'

let slugQuery: CapturedTestQuery
let snapshotQuery: CapturedTestQuery
let cleanupQuery: CapturedTestQuery
let cleanupLockQuery: CapturedTestQuery

describe('publication identity physical page query plans', () => {
  beforeAll(async () => {
    await activatePostPublicationTypedProtocol()
    const { work, candidate, user } = await createTestPublicationSnapshotWork()
    const fixtures = await insertTestPublicationTopicSlugFanout(candidate.id, user.id, 1001)
    slugQuery = await captureAnnotatedQuery(
      'listPostPublicationIdentityNativeSourcePage',
      async () => {
        await using query = await beginTransaction()
        await listPublicationIdentitySourcePage(
          query,
          candidate.id,
          'slug',
          fixtures.slugs[500]!,
          100,
        )
      },
    )
    let snapshot = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    const noise = await createTestPublicationSnapshotWork()
    await insertTestPublicationTopicSlugFanout(noise.candidate.id, noise.user.id, 1001)
    await materializePostPublicationIdentitySnapshot(noise.work, noise.candidate, 1000)
    for (let page = 0; page < 30 && !snapshot.complete; page += 1)
      snapshot = await materializePostPublicationIdentitySnapshot(work, candidate, 100)
    if (!snapshot.complete) throw new Error('Expected complete high-fanout plan fixture')
    candidate.identity_snapshot_id = snapshot.snapshotId
    if (!(await acknowledgePostPublicationProjectionReceipts(work, [candidate])))
      throw new Error('Expected accepted snapshot fixture')
    await using retention = await beginTransaction()
    const first = await retainStoredPublicationIdentityPage(
      retention,
      work.id,
      candidate.id,
      null,
      null,
      100,
    )
    snapshotQuery = await captureAnnotatedQuery(
      'listStoredPublicationSnapshotNativePage',
      async () => {
        await retainStoredPublicationIdentityPage(
          retention,
          work.id,
          candidate.id,
          first.cursorKind,
          first.cursorValue,
          100,
        )
      },
    )
    await retention.commit()
    await insertTestPublicationSnapshotHeaderFanout({
      workId: work.id,
      generation: work.generation,
      postId: candidate.id,
      count: 1001,
    })
    cleanupQuery = await captureAnnotatedQuery(
      'listPublicationSnapshotCleanupHeaderPage',
      async () => {
        await cleanupPostPublicationIdentitySnapshots(100)
      },
    )
    cleanupLockQuery = await captureAnnotatedQuery(
      'lockPublicationSnapshotCleanupHeaderPage',
      async () => {
        await cleanupPostPublicationIdentitySnapshots(100)
      },
    )
  })

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'seeks native slugs before LIMIT in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-native-slug-page',
        slugQuery,
        mode,
        analyzePublicationSlugPageForTest,
      )
      expect(physicalRows(plan, 'post_slugs')).toBe(100)
      expect(scanIndexes(plan, 'post_slugs')).toContain('idx_post_slugs__post_id_slug')
      expect(
        collectPlanNodes(plan).some(
          node =>
            node['Relation Name'] === 'post_slugs' &&
            String(node['Index Cond']).includes('post_id'),
        ),
      ).toBe(true)
    },
  )
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'seeks typed receipt keys before LIMIT in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-typed-receipt-page',
        snapshotQuery,
        mode,
        analyzePublicationSnapshotKeyPageForTest,
      )
      expect(physicalRows(plan, 'post_publication_identity_snapshot_keys')).toBe(100)
      const scopedSeeks = collectPlanNodes(plan).filter(
        node =>
          node['Relation Name'] === 'post_publication_identity_snapshot_keys' &&
          typeof node['Index Name'] === 'string' &&
          String(node['Index Cond']).includes('snapshot_id'),
      )
      expect(scopedSeeks).toHaveLength(1)
    },
  )
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'bounds each candidate header lock probe in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-cleanup-lock-page',
        cleanupLockQuery,
        mode,
        analyzePublicationCleanupPageForTest,
      )
      expect(physicalRows(plan, 'post_publication_identity_snapshots')).toBeLessThanOrEqual(100)
      expect(scanIndexes(plan, 'post_publication_identity_snapshots')).toContain(
        'post_publication_identity_snapshots_pkey',
      )
    },
  )
  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'caps headers before ownership probes in %s',
    async mode => {
      const plan = await explainCapturedTestQuery(
        'publication-cleanup-header-page',
        cleanupQuery,
        mode,
        analyzePublicationCleanupPageForTest,
      )
      expect(physicalRows(plan, 'post_publication_identity_snapshots')).toBe(100)
      expect(scanIndexes(plan, 'post_publication_identity_snapshots')).toContain(
        'post_publication_identity_snapshots_pkey',
      )
    },
  )
})

async function captureAnnotatedQuery(
  annotation: string,
  run: () => Promise<void>,
): Promise<CapturedTestQuery> {
  enableQueryCapture()
  let queries: CapturedTestQuery[] = []
  try {
    await run()
  } finally {
    queries = stopTestQueryCapture()
  }
  const selected = queries.filter(query => query.text.startsWith(`/* ${annotation} */`))
  if (selected.length !== 1)
    throw new Error(`Expected one actual ${annotation} query, got ${selected.length}`)
  return selected[0]!
}

function physicalRows(plan: unknown, relation: string): number {
  return collectPlanNodes(plan)
    .filter(node => node['Relation Name'] === relation)
    .reduce(
      (rows, node) =>
        rows +
        (Number(node['Actual Rows'] ?? 0) +
          Number(node['Rows Removed by Filter'] ?? 0) +
          Number(node['Rows Removed by Index Recheck'] ?? 0)) *
          Number(node['Actual Loops'] ?? 1),
      0,
    )
}
function scanIndexes(plan: unknown, relation: string): unknown[] {
  return collectPlanNodes(plan).flatMap(node =>
    node['Relation Name'] === relation ? [node['Index Name']] : [],
  )
}
