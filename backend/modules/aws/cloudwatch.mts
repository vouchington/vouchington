import {
  CloudWatchClient,
  PutMetricDataCommand,
  type PutMetricDataCommandInput,
  type PutMetricDataCommandOutput,
} from '@aws-sdk/client-cloudwatch'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { AWS_DUALSTACK_CLIENT_CONFIG } from '@vouchington/aws/request-handler'
import { AWS_REGION, createResponseBodyBoundAwsRequestHandler } from './config.mts'

export type { PutMetricDataCommandInput, PutMetricDataCommandOutput }

/* v8 ignore start -- thin AWS SDK proxy wrapper; higher-level publisher tests mock this boundary. */
let cloudWatchClient: CloudWatchClient | undefined

export const CloudWatchMetricsClient = new Proxy({} as CloudWatchClient, {
  get(targetObject, prop) {
    const target = prop in targetObject ? targetObject : getCloudWatchClient()
    return getReceiverBoundProperty(target, prop)
  },
})

/* no-mistakes: integration=aws */
export async function putCloudWatchMetricData(
  input: PutMetricDataCommandInput,
): Promise<PutMetricDataCommandOutput> {
  return CloudWatchMetricsClient.send(new PutMetricDataCommand(input))
}

function getCloudWatchClient(): CloudWatchClient {
  cloudWatchClient ??= new CloudWatchClient({
    region: AWS_REGION,
    requestHandler: createResponseBodyBoundAwsRequestHandler(),
    ...AWS_DUALSTACK_CLIENT_CONFIG,
  })
  return cloudWatchClient
}
/* v8 ignore stop */
