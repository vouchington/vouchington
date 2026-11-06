import { beginTransaction } from '@data-stores/psql'
import { derivedReferences, deleteMergedTopicDerivedPage } from '@services/topics/merge-derived'
import { plainReferences } from '@services/topics/merge-references'
import { processTopicMergeReferencePage } from '@services/topics/merge-reference-pages'
import { getTopicMergeWorkLimit, topicMergeWorkConfig } from '@services/topics/merge-work-limits'
import { seedUuid } from '../seed-data/common.mts'
import { TOP_HASHTAG_RSS_SEED_COUNT } from '../seed-data/top-hashtags.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** These callbacks roll back: the feed and alias scenarios must keep their current memberships. */
export async function runRssTopicMergeCandidateScenarios(): Promise<void> {
  await topicMergeWorkConfig.waitForInitialization()
  const previous = topicMergeWorkConfig.getFields()
  await topicMergeWorkConfig.setFields({ page_size: 16 })
  try {
    const limit = getTopicMergeWorkLimit('page_size')
    registerScenarioContract('rss-topic-merge-derived-candidates', {
      allowEmptyResult: true,
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_rss_feed_item_topic_candidates__topic'] },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_topic_candidates', max: limit * 2 },
      ],
    })
    await runAndCapture(
      'rss-topic-merge-derived-candidates',
      async () => {
        await using query = await beginTransaction()
        const position = derivedReferences.findIndex(
          ([table]) => table === 'rss_feed_item_topic_candidates',
        )
        if (position < 0) throw new Error('RSS topic candidate merge inventory is missing')
        const consumed = await deleteMergedTopicDerivedPage(
          query,
          position,
          seedUuid(9999, '04'),
          limit,
        )
        if (consumed !== limit)
          throw new Error('RSS candidate merge fixture must fill the derived page')
      },
      undefined,
      'deleteMergedTopicDerivedPage',
    )

    registerScenarioContract('rss-topic-merge-alias-candidates', {
      // A sequential prefix can be cheaper for the small, separately owned alias fixture.
      seededRows: { rss_feed_item_topic_alias_candidates: TOP_HASHTAG_RSS_SEED_COUNT },
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'rss_feed_item_topic_alias_candidates',
          max: TOP_HASHTAG_RSS_SEED_COUNT * 3,
        },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_project_rss_feed_category_candidates',
          max: limit,
        },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_update_rss_feed_item_topic_candidate_memberships',
          max: limit,
        },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_update_rss_feed_item_topic_candidate_count',
          max: limit * 2,
        },
      ],
    })
    await runAndCapture(
      'rss-topic-merge-alias-candidates',
      async () => {
        await using query = await beginTransaction()
        const reference = plainReferences.find(
          ({ table }) => table === 'rss_feed_item_topic_alias_candidates',
        )
        if (!reference) throw new Error('RSS alias candidate merge inventory is missing')
        const sourceId = seedUuid(2499, '04')
        // Plain reference rows do not use the operation id; only the topic-vote branch does.
        const consumed = await processTopicMergeReferencePage(
          query,
          sourceId,
          reference,
          sourceId,
          seedUuid(2498, '04'),
          limit,
        )
        if (consumed !== limit)
          throw new Error('RSS candidate merge fixture must fill the alias page')
      },
      undefined,
      'processTopicMergeReferencePage',
    )
  } finally {
    await topicMergeWorkConfig.setFields(previous)
  }
}
