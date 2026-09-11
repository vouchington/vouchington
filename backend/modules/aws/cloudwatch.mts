import {
  CloudWatchClient,
  PutMetricDataCommand,
  type PutMetricDataCommandInput,
  type PutMetricDataCommandOutput,
} from '@aws-sdk/client-cloudwatch'
import { AWS_DUALSTACK_CLIENT_CONFIG, AWS_REGION } from './config.mts'

export type { PutMetricDataCommandInput, PutMetricDataCommandOutput }

/* v8 ignore start -- thin AWS SDK proxy wrapper; higher-level publisher tests mock this boundary. */
let cloudWatchClient: CloudWatchClient | undefined

export const CloudWatchMetricsClient = new Proxy({} as CloudWatchClient, {
  get(targetObject, prop) {
    const target = prop in targetObject ? targetObject : getCloudWatchClient()
    return getClientProperty(target, prop)
  },
})

/* no-mistakes: integration=aws */
export async function putCloudWatchMetricData(
  input: PutMetricDataCommandInput,
): Promise<PutMetricDataCommandOutput> {
  return await CloudWatchMetricsClient.send(new PutMetricDataCommand(input))
}

function getClientProperty(target: object, prop: string | symbol): unknown {
  const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
  const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
  return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
}

function getCloudWatchClient(): CloudWatchClient {
  cloudWatchClient ??= new CloudWatchClient({
    region: AWS_REGION,
    ...AWS_DUALSTACK_CLIENT_CONFIG,
  })
  return cloudWatchClient
}
/* v8 ignore stop */
