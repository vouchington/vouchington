import { write } from '@data-stores/psql'
import {
  getPostPublicationWorkLimit,
  postPublicationWorkConfig,
} from '@services/post-publication/work-limits'
import { reconcileRssFeedItemCandidatePage } from '@services/rss-feed-items/reconcile-feed-candidate'
import {
  getCandidateReconciliationUpperBound,
  getCandidateReconciliationPage,
} from '@services/rss-feed-items/candidate-reconciliation-state'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runRssFeedCandidateReconciliationScenarios(): Promise<void> {
  await postPublicationWorkConfig.waitForInitialization()
  const previous = postPublicationWorkConfig.getFields()
  await postPublicationWorkConfig.setFields({ rss_feed_candidate_page_size: 100 })
  try {
    const throughId = await getCandidateReconciliationUpperBound()
    if (!throughId) throw new Error('RSS candidate reconciliation seed must have pending work')
    registerScenarioContract('rss-feed-candidate-reconciliation-upper-bound', {
      expectations: [
        { kind: 'custom', name: 'rssFeedCandidateMaintenance' },
        {
          kind: 'maxProcessedRows',
          relation: 'rss_feed_item_candidate_reconciliations',
          max: 1,
        },
      ],
    })
    await runAndCapture(
      'rss-feed-candidate-reconciliation-upper-bound',
      () => getCandidateReconciliationUpperBound(),
      undefined,
      'getCandidateReconciliationUpperBound',
    )

    registerScenarioContract('rss-feed-candidate-reconciliation-dispatch-page', {
      expectations: [
        { kind: 'custom', name: 'rssFeedCandidateMaintenance' },
        {
          kind: 'maxProcessedRows',
          relation: 'rss_feed_item_candidate_reconciliations',
          max: getPostPublicationWorkLimit('rss_feed_candidate_dispatch_size'),
        },
      ],
    })
    await runAndCapture(
      'rss-feed-candidate-reconciliation-dispatch-page',
      () =>
        getCandidateReconciliationPage({
          throughId,
          limit: getPostPublicationWorkLimit('rss_feed_candidate_dispatch_size'),
        }),
      undefined,
      'getCandidateReconciliationPage',
    )

    const { rows } = await write<{ id: string }>(
      `/* selectRssCandidateReconciliationFixture */
       SELECT id FROM rss_feed_item_guids WHERE guid = 'rss-candidate-maintenance-fanout-item' LIMIT 1`,
    )
    const itemId = rows[0]?.id
    if (!itemId) throw new Error('RSS candidate reconciliation fixture item is missing')
    registerScenarioContract('rss-feed-candidate-reconciliation-page', {
      allowEmptyResult: true,
      expectations: [
        { kind: 'custom', name: 'rssFeedCandidateMaintenance' },
        {
          kind: 'maxProcessedRows',
          relation: 'rss_feed_item_candidate_reconciliations',
          max: 1,
        },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_feed_candidates', max: 1 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 100 },
        { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 100 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_topic_candidates', max: 100 },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_update_rss_feed_source_item_sort',
          max: 100,
        },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_update_rss_feed_latest_item_sort',
          max: 100,
        },
      ],
    })
    await runAndCapture(
      'rss-feed-candidate-reconciliation-page',
      async () => {
        const first = await reconcileRssFeedItemCandidatePage(itemId)
        const sourceContinuation = await reconcileRssFeedItemCandidatePage(itemId)
        const topicFirst = await reconcileRssFeedItemCandidatePage(itemId)
        const topicContinuation = await reconcileRssFeedItemCandidatePage(itemId)
        if (!first || !sourceContinuation || !topicFirst || topicContinuation !== null)
          throw new Error('RSS candidate fixture must exercise two source and two topic pages')
      },
      undefined,
      undefined,
      {
        exactCapturedNames: [
          'getCandidateReconciliation',
          'readCandidateReconciliationSources',
          'lockCandidateReconciliationFeeds',
          'getCandidateReconciliation',
          'updateCandidateReconciliationSources',
          'checkpointCandidateReconciliation',
          'getCandidateReconciliation',
          'readCandidateReconciliationSources',
          'lockCandidateReconciliationFeeds',
          'getCandidateReconciliation',
          'updateCandidateReconciliationSources',
          'checkpointCandidateReconciliation',
          'getCandidateReconciliation',
          'readCandidateReconciliationTopics',
          'getCandidateReconciliation',
          'updateCandidateReconciliationTopics',
          'checkpointCandidateReconciliation',
          'getCandidateReconciliation',
          'readCandidateReconciliationTopics',
          'getCandidateReconciliation',
          'updateCandidateReconciliationTopics',
          'completeCandidateReconciliation',
        ],
      },
    )
  } finally {
    await postPublicationWorkConfig.setFields(previous)
  }
}
