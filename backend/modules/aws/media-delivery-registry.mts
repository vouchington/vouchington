import {
  CreateInvalidationCommand,
  CloudFrontClient,
  type CreateInvalidationCommandOutput,
} from '@aws-sdk/client-cloudfront'
import { DynamoDBClient, PutItemCommand, type PutItemCommandOutput } from '@aws-sdk/client-dynamodb'
import { randomUUID } from 'node:crypto'
import { AWS_DUALSTACK_CLIENT_CONFIG, AWS_REGION } from './config.mts'

export type MediaDeliveryRegistryState = 'allow' | 'withheld'

export type MediaDeliveryRegistryRecord = {
  deliveryKey: string
  state: MediaDeliveryRegistryState
  generation: string
}

let cloudFrontClient: CloudFrontClient | undefined
let dynamoDbClient: DynamoDBClient | undefined
let dynamoDbClientRegion: string | undefined

/** Writes the exact delivery tuple that the viewer-request edge function authorizes. */
/* no-mistakes: integration=aws */
export async function putMediaDeliveryRegistryRecord(
  record: MediaDeliveryRegistryRecord,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PutItemCommandOutput> {
  const tableName = getRequiredMediaDeliveryEnvironment('MEDIA_DELIVERY_REGISTRY_TABLE', env)
  return await getDynamoDbClient(getMediaDeliveryRegistryRegion(env)).send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        delivery_key: { S: record.deliveryKey },
        state: { S: record.state },
        generation: { N: String(record.generation) },
      },
      ConditionExpression:
        'attribute_not_exists(delivery_key) OR #generation < :generation OR (#generation = :generation AND #state = :state)',
      ExpressionAttributeNames: { '#generation': 'generation', '#state': 'state' },
      ExpressionAttributeValues: {
        ':generation': { N: String(record.generation) },
        ':state': { S: record.state },
      },
    }),
  )
}

/** Removes stale cached objects after the DynamoDB edge authority has already changed. */
/* no-mistakes: integration=aws */
export async function invalidateMediaDeliveryPath(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CreateInvalidationCommandOutput> {
  const distributionId = getRequiredMediaDeliveryEnvironment(
    'MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID',
    env,
  )
  return await getCloudFrontClient().send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `media-delivery:${randomUUID()}`,
        Paths: { Quantity: 1, Items: [path] },
      },
    }),
  )
}

export function isMediaDeliveryEdgeEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED === 'true'
}

export function isMediaDeliveryRegistryPublicationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED !== 'true') return false
  getRequiredMediaDeliveryEnvironment('MEDIA_DELIVERY_REGISTRY_TABLE', env)
  getRequiredMediaDeliveryEnvironment('MEDIA_DELIVERY_REGISTRY_REGION', env)
  getRequiredMediaDeliveryEnvironment('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', env)
  return true
}

export function assertMediaDeliveryLegalEnforcementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (
    !isMediaDeliveryEdgeEnforcementEnabled(env) ||
    !isMediaDeliveryRegistryPublicationEnabled(env)
  ) {
    throw new Error(
      'Media delivery enforcement requires both registry publication and edge enforcement',
    )
  }
}

/** Lambda@Edge executes in us-east-1, so its DynamoDB authority is intentionally regional. */
export function getMediaDeliveryRegistryRegion(env: NodeJS.ProcessEnv = process.env): string {
  return getRequiredMediaDeliveryEnvironment('MEDIA_DELIVERY_REGISTRY_REGION', env)
}

function getRequiredMediaDeliveryEnvironment(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim()
  if (value) return value
  throw new Error(`Missing ${name} for media delivery edge enforcement`)
}

function getDynamoDbClient(region: string): DynamoDBClient {
  if (dynamoDbClient && dynamoDbClientRegion === region) return dynamoDbClient
  dynamoDbClient = new DynamoDBClient({ region, ...AWS_DUALSTACK_CLIENT_CONFIG })
  dynamoDbClientRegion = region
  return dynamoDbClient
}

function getCloudFrontClient(): CloudFrontClient {
  cloudFrontClient ??= new CloudFrontClient({ region: AWS_REGION, ...AWS_DUALSTACK_CLIENT_CONFIG })
  return cloudFrontClient
}
