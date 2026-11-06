import { beginTransaction, write } from '@data-stores/psql'
import {
  readAliasCategoryRawPage,
  type AliasCategoryPhase,
} from '@services/rss-feeds/topic-alias-category-raw-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { processReconcileTopicAliasCategoryMappings } from '@services/rss-feeds/reconcile-topic-alias-category-mappings'
import { seedUuid } from '../seed-data/common.mts'

export async function runTopicAliasRawPageScenarios(aliasId: string): Promise<void> {
  await captureRawPhase(
    aliasId,
    'rss_item_categories',
    'readAliasCategoryRawPage authoredItems',
    'idx_rss_feed_item_categories__topic_alias_id',
  )
  await captureRawPhase(
    aliasId,
    'rss_item_text_categories',
    'readAliasCategoryRawPage textItems',
    'idx_rss_feed_item_categories__category_identity_id',
  )
  await captureRawPhase(
    aliasId,
    'rss_feed_text_categories',
    'readAliasCategoryRawPage textFeeds',
    'idx_rss_feed_categories__category_identity_id',
  )
  const { rows } = await write<{ id: string }>(
    `/* selectExplainAliasCandidateSeed */ SELECT id FROM topic_aliases WHERE alias = 'seed-alias-2499' LIMIT 1`,
  )
  const candidateAliasId = rows[0]?.id
  if (!candidateAliasId) throw new Error('RSS alias candidate seed requires seed-alias-2499')
  await captureRawPhase(
    candidateAliasId,
    'rss_item_alias_candidates',
    'readAliasCategoryRawPage aliasCandidates',
    'rss_feed_item_topic_alias_candidates_pkey',
  )
  await captureAliasCandidateReconciliation(candidateAliasId)
}

async function captureAliasCandidateReconciliation(aliasId: string): Promise<void> {
  const scenarioId = 'topic-alias-reconcile-rss_item_alias_candidates'
  registerScenarioContract(scenarioId, {
    allowEmptyResult: true,
    expectations: [
      // At 432 seeded rows PostgreSQL can correctly prefer a whole-table scan.
      // Keep the indexed key predicates and a finite processed-row budget.
      { kind: 'queryBinds', token: 'topic_alias_id' },
      { kind: 'queryBinds', token: 'rss_feed_item_id' },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_topic_alias_candidates',
        max: 500,
      },
      {
        kind: 'maxFunctionCalls',
        function: 'fn_project_rss_feed_category_candidates',
        max: 500,
      },
      {
        kind: 'maxFunctionCalls',
        function: 'fn_update_rss_feed_item_topic_candidate_memberships',
        max: 500,
      },
      // EXPLAIN replays this UPDATE after the callback has already moved the alias. A replay
      // with unchanged topic IDs calls the membership helper but skips its count helper.
      // Each membership call can change at most two counts, so its 500-call cap bounds both.
    ],
  })
  const originalTopicId = seedUuid(2499, '04')
  let restored = false
  const failures: unknown[] = []
  try {
    await runAndCapture(
      scenarioId,
      async () => {
        await write(
          `/* seedRssAliasCandidateReconciliation */
           UPDATE topic_aliases SET topic_id = $2::uuid WHERE id = $1::uuid`,
          [aliasId, seedUuid(2498, '04')],
        )
        let complete = false
        for (let attempt = 0; attempt < 8; attempt++) {
          // no-mistakes-disable-next-line query-reached-per-item: bounded durable phases must complete in order before the alias-write plan is captured.
          const result = await processReconcileTopicAliasCategoryMappings(undefined, [aliasId])
          if (result.reconciled === 1) {
            complete = true
            break
          }
        }
        if (!complete) throw new Error(`${scenarioId} did not drain all alias phases`)
      },
      undefined,
      'reconcileAliasFeedCandidates',
    )
  } catch (err) {
    failures.push(err)
  }
  try {
    await write(
      `/* restoreRssAliasCandidateReconciliation */
       UPDATE topic_aliases SET topic_id = $2::uuid WHERE id = $1::uuid`,
      [aliasId, originalTopicId],
    )
    for (let attempt = 0; attempt < 8; attempt++) {
      // no-mistakes-disable-next-line query-reached-per-item: bounded durable phases restore the fixture owner through the real reconciler.
      const result = await processReconcileTopicAliasCategoryMappings(undefined, [aliasId])
      if (result.reconciled === 1) {
        restored = true
        break
      }
    }
    if (!restored) throw new Error(`${scenarioId} could not restore the original alias owner`)
  } catch (err) {
    failures.push(err)
  }
  if (failures.length) throw new AggregateError(failures, `${scenarioId} capture or cleanup failed`)
}

async function captureRawPhase(
  aliasId: string,
  phase: Exclude<AliasCategoryPhase, 'completed'>,
  queryName: string,
  indexName: string,
): Promise<void> {
  const emptyCursor = {
    sweep_upper_bound_item_id: null,
    sweep_upper_bound_feed_id: null,
    cursor_item_id: null,
    cursor_category_identity_id: null,
    cursor_feed_id: null,
  }
  const label = `topic-alias-raw-${phase}`
  const aliasCandidate = phase === 'rss_item_alias_candidates'
  registerScenarioContract(label, {
    expectations: [
      ...(aliasCandidate
        ? [
            { kind: 'queryBinds' as const, token: 'topic_alias_id' },
            { kind: 'queryBinds' as const, token: 'rss_feed_item_id' },
          ]
        : [{ kind: 'usesIndexes' as const, indexes: [indexName] }]),
      {
        kind: 'maxProcessedRows',
        relation:
          phase === 'rss_feed_text_categories'
            ? 'rss_feed_categories'
            : phase === 'rss_item_alias_candidates'
              ? 'rss_feed_item_topic_alias_candidates'
              : 'rss_feed_item_categories',
        max: aliasCandidate ? 500 : 150,
      },
    ],
    seededRows: {
      rss_feed_item_categories: 6_000,
      rss_feed_categories: 22_000,
      rss_feed_item_topic_alias_candidates: 500,
    },
  })
  await runAndCapture(
    label,
    async () => {
      await using transaction = await beginTransaction()
      const page = await readAliasCategoryRawPage(
        transaction,
        aliasId,
        'seed-alias-0',
        { ...emptyCursor, phase },
        100,
      )
      if (page.rows.length !== 100 || !page.hasMore)
        throw new Error(`${label} needs a full raw page with continuation`)
      await transaction.commit()
      return page
    },
    undefined,
    queryName,
  )
}
