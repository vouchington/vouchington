import assert from 'node:assert/strict'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import {
  overrideDynamicConfigFieldsForTest,
  pinDynamicConfigFields,
} from '@voucha/test-helpers/dynamic-config'
import { getTopicDataPointInsights } from '@services/data-points/insights'
import { topicDataPointInsightsConfig } from '@services/data-points/insights-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const ROW_CAP = 8
const SEEDED_POINTS = 12

/** One topic, with more eligible points than the cap, so the lateral limit is visible. */
export async function runTopicDataPointInsightsScenario(): Promise<void> {
  await topicDataPointInsightsConfig.waitForInitialization()
  const restore = overrideDynamicConfigFieldsForTest(topicDataPointInsightsConfig, {
    row_cap: ROW_CAP,
  })
  try {
    const user = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Insights plan ${suffix}`,
      slug: `insights-plan-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })
    await Promise.all(
      Array.from({ length: SEEDED_POINTS }, (_, index) =>
        insertTestDataPoint({
          title: `Insights plan ${suffix} ${index}`,
          slug: `insights-plan-${suffix}-${index}`,
          createdById: user.id,
          vertical: 'credit_card',
          topicId,
          result: 'approved',
          creditScoreRange: '670-739',
          creditLimit: { amount: 100_000 + index, currency: 'usd' },
        }),
      ),
    )
    registerScenarioContract('topic-data-point-insights', {
      expectations: [
        { kind: 'noSeqScan', relation: 'post_data_point_topics' },
        {
          kind: 'maxProcessedRows',
          relation: 'post_data_point_topics',
          max: ROW_CAP,
        },
      ],
    })
    await runAndCapture('topic-data-point-insights', async () => {
      // A Valkey refresh replaces the shared field map between awaits, which resets row_cap to the
      // 10,000 default and makes the lateral return all 12 seeded points. Pin it again in the same
      // turn as the read, as alias-unlink-precapture does.
      pinDynamicConfigFields(topicDataPointInsightsConfig, { row_cap: ROW_CAP })
      const insights = await getTopicDataPointInsights(topicId)
      assert.equal(insights.total_count, ROW_CAP)
    })
  } finally {
    restore()
  }
}
