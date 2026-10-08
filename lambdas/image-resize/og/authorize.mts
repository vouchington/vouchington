import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import {
  getImagePlacementDeliveryKey,
  parseMediaDeliveryEdgeEnforcementMode,
  type DependencyAuthorization,
  type PlacementSourcePolicy,
} from '@ts-shared/url-signing'
import { MAX_OG_DEPENDENCIES } from './params.mts'

export type OgDependencyAuthorizationResult = {
  states: readonly DependencyAuthorization[]
  cacheable: boolean
}

const clients = new Map<string, DynamoDBClient>()

/** Reads current placement authority on an OG cache miss. */
/* no-mistakes: integration=aws */
export async function authorizeOgDependencies(
  dependencies: readonly PlacementSourcePolicy[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<OgDependencyAuthorizationResult> {
  if (dependencies.length === 0) return { states: [], cacheable: true }
  const unknown = (): DependencyAuthorization[] => dependencies.map(() => 'unknown')
  if (dependencies.length > MAX_OG_DEPENDENCIES) {
    return { states: unknown(), cacheable: false }
  }
  if (parseMediaDeliveryEdgeEnforcementMode(env) !== 'enforce') {
    return { states: unknown(), cacheable: true }
  }
  const table = env.MEDIA_DELIVERY_REGISTRY_TABLE?.trim()
  const region = env.MEDIA_DELIVERY_REGISTRY_REGION?.trim()
  if (!table || !region) return { states: unknown(), cacheable: false }

  try {
    let client = clients.get(region)
    if (!client) {
      // Use the SDK credential chain so Lambda execution-role tokens can rotate.
      client = new DynamoDBClient({ region })
      clients.set(region, client)
    }
    const states = await Promise.all(
      dependencies.map(async dependency => {
        const result = await client.send(
          new GetItemCommand({
            TableName: table,
            Key: { delivery_key: { S: getImagePlacementDeliveryKey(dependency) } },
            ConsistentRead: true,
            ProjectionExpression: '#state',
            ExpressionAttributeNames: { '#state': 'state' },
          }),
        )
        const state = result.Item?.state?.S
        return state === 'allow' || state === 'withheld' ? state : 'unknown'
      }),
    )
    return { states, cacheable: true }
  } catch {
    return { states: unknown(), cacheable: false }
  }
}
