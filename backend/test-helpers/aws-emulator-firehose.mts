import { provisionFirehoseStreams, type AwsEmulatorConnection } from '@vouchington/aws/testing'
import { ANALYTICS_TABLES } from '../data-stores/analytics/tables.mts'

/** The stream prefix the analytics tests export as `ANALYTICS_FIREHOSE_PREFIX`. */
export const ANALYTICS_TEST_FIREHOSE_PREFIX = 'voucha-analytics-test-'

/**
 * Creates one active delivery stream per analytics table. The application derives stream names
 * from a prefix in the environment, so they exist before any test runs.
 */
export async function provisionAnalyticsFirehose(emulator: AwsEmulatorConnection): Promise<void> {
  await provisionFirehoseStreams(emulator, {
    streamNames: ANALYTICS_TABLES.map(table => `${ANALYTICS_TEST_FIREHOSE_PREFIX}${table}`),
    bucketName: 'test-analytics-firehose',
    roleName: 'test-analytics-firehose',
  })
}
