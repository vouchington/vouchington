import { CreateTableCommand, DynamoDBClient, waitUntilTableExists } from '@aws-sdk/client-dynamodb'
import { CloudFrontClient, CreateDistributionCommand } from '@aws-sdk/client-cloudfront'
import type { AwsEmulatorConnection } from './aws-emulator.mts'

/** The DynamoDB table the edge viewer-request function reads; Lambda@Edge runs in us-east-1. */
export const MEDIA_DELIVERY_REGISTRY_TEST_TABLE = 'test-media-delivery-registry'
export const MEDIA_DELIVERY_REGISTRY_TEST_REGION = 'us-east-1'
/** CloudFront assigns the distribution id, so workers find it again by this comment. */
export const MEDIA_DELIVERY_DISTRIBUTION_COMMENT = 'voucha-test-media-delivery'

/**
 * Creates the one media-delivery registry table and CloudFront distribution the application reads
 * from the environment. Tests isolate their records with unique delivery keys, never shared cleanup.
 */
export async function provisionMediaDeliveryEdge(emulator: AwsEmulatorConnection): Promise<void> {
  const credentials = {
    accessKeyId: emulator.accessKeyId,
    secretAccessKey: emulator.secretAccessKey,
  }
  const dynamo = new DynamoDBClient({
    endpoint: emulator.endpoint,
    region: MEDIA_DELIVERY_REGISTRY_TEST_REGION,
    credentials,
  })
  const cloudFront = new CloudFrontClient({
    endpoint: emulator.endpoint,
    region: emulator.region,
    credentials,
  })
  try {
    await dynamo.send(
      new CreateTableCommand({
        TableName: MEDIA_DELIVERY_REGISTRY_TEST_TABLE,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [{ AttributeName: 'delivery_key', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'delivery_key', KeyType: 'HASH' }],
      }),
    )
    await Promise.all([
      // CreateTable returns before the table accepts writes.
      waitUntilTableExists(
        { client: dynamo, maxWaitTime: 30 },
        { TableName: MEDIA_DELIVERY_REGISTRY_TEST_TABLE },
      ),
      cloudFront.send(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: MEDIA_DELIVERY_DISTRIBUTION_COMMENT,
            Comment: MEDIA_DELIVERY_DISTRIBUTION_COMMENT,
            Enabled: true,
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: 'origin',
                  DomainName: 'media.example.com',
                  CustomOriginConfig: {
                    HTTPPort: 80,
                    HTTPSPort: 443,
                    OriginProtocolPolicy: 'https-only',
                  },
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: 'origin',
              ViewerProtocolPolicy: 'allow-all',
              // The AWS-managed CachingOptimized policy.
              CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
            },
          },
        }),
      ),
    ])
  } finally {
    dynamo.destroy()
    cloudFront.destroy()
  }
}
