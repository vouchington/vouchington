import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { createTestPublicationSnapshotWork } from '@voucha/test-helpers/post-publication-fixtures'
import { insertTestPublicationTopicSlugFanout } from '@voucha/test-helpers/entities/post-publication-snapshots'
import {
  analyzePublicationSnapshotKeyPageForTest,
  analyzePublicationCleanupPageForTest,
  insertTestPublicationSnapshotHeaderFanout,
  publicationPhysicalRowsWithinBudget as physicalRows,
  publicationScanIndexes as scanIndexes,
} from '@voucha/test-helpers/entities/post-publication-query-plans'
import { collectPlanNodes } from '@voucha/test-helpers/query-plans'
import { materializePostPublicationIdentitySnapshot } from '@services/post-publication/identity-snapshots'
import { acknowledgePostPublicationProjectionReceipts } from '@services/post-publication/receipts'
import { retainStoredPublicationIdentityPage } from '@services/post-publication/retain-stored-identities'
import { cleanupPostPublicationIdentitySnapshots } from '@services/post-publication/snapshot-cleanup'
import { getResults, runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runPublicationSnapshotPageScenarios(): Promise<void> {
  const { work, candidate, user } = await createTestPublicationSnapshotWork()
  await insertTestPublicationTopicSlugFanout(candidate.id, user.id, 1001)
  // Materialize the fixed fixture once; every measured page below retains its 100-row cap.
  const snapshot = await materializePostPublicationIdentitySnapshot(work, candidate, 3000)
  const noise = await createTestPublicationSnapshotWork()
  await insertTestPublicationTopicSlugFanout(noise.candidate.id, noise.user.id, 1001)
  await materializePostPublicationIdentitySnapshot(noise.work, noise.candidate, 1000)
  assert.ok(snapshot.complete, 'Expected complete high-fanout plan fixture')
  candidate.identity_snapshot_id = snapshot.snapshotId
  assert.ok(await acknowledgePostPublicationProjectionReceipts(work, [candidate]))
  await using retention = await beginTransaction()
  const first = await retainStoredPublicationIdentityPage(
    retention,
    work.id,
    candidate.id,
    null,
    null,
    100,
  )
  await runAndCapture(
    'publication-typed-receipt-page',
    () =>
      retainStoredPublicationIdentityPage(
        retention,
        work.id,
        candidate.id,
        first.cursorKind,
        first.cursorValue,
        100,
      ),
    undefined,
    'listStoredPublicationSnapshotNativePage',
    { afterCapture: analyzePublicationSnapshotKeyPageForTest },
  )
  await retention.commit()
  for (const { plan } of getResults().filter(
    result => result.scenario_id === 'publication-typed-receipt-page',
  )) {
    assert.equal(physicalRows(plan, 'post_publication_identity_snapshot_keys'), 100)
    const seeks = collectPlanNodes(plan).filter(
      node =>
        node['Relation Name'] === 'post_publication_identity_snapshot_keys' &&
        typeof node['Index Name'] === 'string' &&
        String(node['Index Cond']).includes('snapshot_id'),
    )
    assert.equal(seeks.length, 2)
  }
  await insertTestPublicationSnapshotHeaderFanout({
    workId: work.id,
    generation: work.generation,
    postId: candidate.id,
    count: 1001,
  })
  await runAndCapture(
    'publication-cleanup-header-page',
    () => cleanupPostPublicationIdentitySnapshots(100),
    undefined,
    'listPublicationSnapshotCleanupHeaderPage',
    { afterCapture: analyzePublicationCleanupPageForTest },
  )
  await runAndCapture(
    'publication-cleanup-lock-page',
    () => cleanupPostPublicationIdentitySnapshots(100),
    undefined,
    'lockPublicationSnapshotCleanupHeaderPage',
    { afterCapture: analyzePublicationCleanupPageForTest },
  )
  for (const { plan, scenario_id } of getResults().filter(result =>
    result.scenario_id?.startsWith('publication-cleanup-'),
  )) {
    const rows = physicalRows(plan, 'post_publication_identity_snapshots')
    if (scenario_id === 'publication-cleanup-header-page') assert.equal(rows, 100)
    assert.ok(
      scanIndexes(plan, 'post_publication_identity_snapshots').includes(
        'post_publication_identity_snapshots_pkey',
      ),
    )
  }
}

registerScenarioContract('publication-typed-receipt-page', {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'post_publication_identity_snapshot_keys', max: 100 },
  ],
})
for (const id of ['publication-cleanup-header-page', 'publication-cleanup-lock-page']) {
  registerScenarioContract(id, {
    seededRows: { post_publication_projection_receipts: 1 },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'post_publication_identity_snapshots', max: 100 },
      { kind: 'usesIndexes', indexes: ['post_publication_identity_snapshots_pkey'] },
    ],
  })
}
