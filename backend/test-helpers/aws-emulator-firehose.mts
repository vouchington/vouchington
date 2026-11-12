import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import {
  CreateDeliveryStreamCommand,
  DescribeDeliveryStreamCommand,
  FirehoseClient,
} from '@aws-sdk/client-firehose'
import { CreateRoleCommand, IAMClient } from '@aws-sdk/client-iam'
import { createWaiter, WaiterState } from '@smithy/core/client'
import { ANALYTICS_TABLES } from '../data-stores/analytics/tables.mts'
import type { AwsEmulatorConnection } from './aws-emulator.mts'

/** The stream prefix the analytics tests export as `ANALYTICS_FIREHOSE_PREFIX`. */
export const ANALYTICS_TEST_FIREHOSE_PREFIX = 'voucha-analytics-test-'

const DESTINATION_BUCKET = 'test-analytics-firehose'
const ROLE_NAME = 'test-analytics-firehose'
const ACTIVE_DEADLINE_SECONDS = 30

/**
 * Creates one active delivery stream per analytics table, delivering into a destination bucket.
 * The application derives stream names from a prefix in the environment, so they exist before any
 * test runs. The emulator rejects a stream whose role does not exist, and accepts records only
 * once the stream is ACTIVE (about three seconds after creation), so this waits for every stream.
 */
export async function provisionAnalyticsFirehose(emulator: AwsEmulatorConnection): Promise<void> {
  const config = {
    endpoint: emulator.endpoint,
    region: emulator.region,
    credentials: { accessKeyId: emulator.accessKeyId, secretAccessKey: emulator.secretAccessKey },
  }
  const s3 = new S3Client(config)
  const iam = new IAMClient(config)
  const firehose = new FirehoseClient(config)
  try {
    await s3.send(new CreateBucketCommand({ Bucket: DESTINATION_BUCKET }))
    const { Role } = await iam.send(
      new CreateRoleCommand({
        RoleName: ROLE_NAME,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'firehose.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        }),
      }),
    )
    const names = ANALYTICS_TABLES.map(table => `${ANALYTICS_TEST_FIREHOSE_PREFIX}${table}`)
    await Promise.all(
      names.map(DeliveryStreamName =>
        firehose.send(
          new CreateDeliveryStreamCommand({
            DeliveryStreamName,
            DeliveryStreamType: 'DirectPut',
            ExtendedS3DestinationConfiguration: {
              RoleARN: Role?.Arn,
              BucketARN: `arn:aws:s3:::${DESTINATION_BUCKET}`,
              Prefix: `${DeliveryStreamName}/`,
            },
          }),
        ),
      ),
    )
    await Promise.all(names.map(name => waitUntilActive(firehose, name)))
  } finally {
    s3.destroy()
    iam.destroy()
    firehose.destroy()
  }
}

// Firehose ships no SDK waiter, so the SDK's waiter primitive (the one behind every generated
// `waitUntil*`) checks the stream status until it is ACTIVE.
async function waitUntilActive(client: FirehoseClient, DeliveryStreamName: string) {
  await createWaiter(
    { client, maxWaitTime: ACTIVE_DEADLINE_SECONDS, minDelay: 1, maxDelay: 2 },
    { DeliveryStreamName },
    async (waiterClient, input) => {
      const { DeliveryStreamDescription } = await waiterClient.send(
        new DescribeDeliveryStreamCommand(input),
      )
      const reason = DeliveryStreamDescription?.DeliveryStreamStatus
      return { state: reason === 'ACTIVE' ? WaiterState.SUCCESS : WaiterState.RETRY, reason }
    },
  )
}
