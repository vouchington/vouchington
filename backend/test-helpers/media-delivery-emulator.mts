import { randomUUID } from 'node:crypto'
import {
  CloudFrontClient,
  CreateDistributionCommand,
  GetInvalidationCommand,
  ListDistributionsCommand,
  ListInvalidationsCommand,
} from '@aws-sdk/client-cloudfront'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import {
  MEDIA_DELIVERY_DISTRIBUTION_COMMENT,
  mediaDeliveryDistributionConfig,
  MEDIA_DELIVERY_REGISTRY_TEST_REGION,
  MEDIA_DELIVERY_REGISTRY_TEST_TABLE,
} from './aws-emulator-media-delivery.mts'

// Independent of the application's clients, so a test reads emulator state without going through
// the code under test. `vitest.setup.aws-emulator.mts` exports the endpoint and keys.
let dynamo: DynamoDBClient | undefined
let cloudFront: CloudFrontClient | undefined
let distributionId: Promise<string> | undefined

function dynamoClient(): DynamoDBClient {
  dynamo ??= new DynamoDBClient({ region: MEDIA_DELIVERY_REGISTRY_TEST_REGION })
  return dynamo
}

function cloudFrontClient(): CloudFrontClient {
  cloudFront ??= new CloudFrontClient({ region: process.env.AWS_REGION ?? 'us-west-2' })
  return cloudFront
}

/** The distribution global setup created; its id is assigned by CloudFront. */
export function mediaDeliveryDistributionId(): Promise<string> {
  distributionId ??= findDistributionId()
  return distributionId
}

async function findDistributionId(): Promise<string> {
  const page = await cloudFrontClient().send(new ListDistributionsCommand({}))
  const found = page.DistributionList?.Items?.find(
    item => item.Comment === MEDIA_DELIVERY_DISTRIBUTION_COMMENT,
  )
  if (!found?.Id) throw new Error('media delivery distribution missing from the AWS Emulator')
  return found.Id
}

/** The env every media-delivery publisher reads, pointing at the provisioned table and distribution. */
export async function mediaDeliveryEdgeEnvironment(): Promise<Record<string, string>> {
  return {
    MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: 'enforce',
    MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED: 'true',
    MEDIA_DELIVERY_REGISTRY_TABLE: MEDIA_DELIVERY_REGISTRY_TEST_TABLE,
    MEDIA_DELIVERY_REGISTRY_REGION: MEDIA_DELIVERY_REGISTRY_TEST_REGION,
    MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID: await mediaDeliveryDistributionId(),
  }
}

export async function readMediaDeliveryRegistryItem(
  deliveryKey: string,
): Promise<{ state: string; generation: string } | undefined> {
  const { Item } = await dynamoClient().send(
    new GetItemCommand({
      TableName: MEDIA_DELIVERY_REGISTRY_TEST_TABLE,
      Key: { delivery_key: { S: deliveryKey } },
      ConsistentRead: true,
    }),
  )
  if (!Item) return undefined
  return { state: Item.state!.S!, generation: Item.generation!.N! }
}

/** A distribution only the calling test invalidates, so its invalidation list is exact. */
export async function createOwnedCloudFrontDistribution(): Promise<string> {
  const reference = `test-media-delivery-${randomUUID()}`
  const { Distribution } = await cloudFrontClient().send(
    new CreateDistributionCommand({
      DistributionConfig: mediaDeliveryDistributionConfig(reference, reference),
    }),
  )
  if (!Distribution?.Id) throw new Error('AWS Emulator created a distribution without an id')
  return Distribution.Id
}

/** Every path invalidated on a distribution, following pages, for asserting what CloudFront was asked to purge. */
export async function listInvalidatedPaths(DistributionId: string): Promise<string[]> {
  const paths: string[] = []
  let Marker: string | undefined
  do {
    const page = await cloudFrontClient().send(
      new ListInvalidationsCommand({ DistributionId, Marker }),
    )
    const list = page.InvalidationList
    for (const summary of list?.Items ?? []) {
      const { Invalidation } = await cloudFrontClient().send(
        new GetInvalidationCommand({ DistributionId, Id: summary.Id }),
      )
      paths.push(...(Invalidation?.InvalidationBatch?.Paths?.Items ?? []))
    }
    Marker = list?.IsTruncated ? list.NextMarker : undefined
  } while (Marker)
  return paths.toSorted()
}
