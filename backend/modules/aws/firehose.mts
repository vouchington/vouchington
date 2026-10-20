import {
  FirehoseClient,
  PutRecordBatchCommand,
  type PutRecordBatchCommandInput,
  type PutRecordBatchCommandOutput,
} from '@aws-sdk/client-firehose'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { AWS_DUALSTACK_CLIENT_CONFIG } from '@vouchington/aws/request-handler'
import { AWS_REGION, createResponseBodyBoundAwsRequestHandler } from './config.mts'
import { getFirehoseCredentials, hasFirehoseCredentials } from './credentials.mts'

export type { PutRecordBatchCommandInput, PutRecordBatchCommandOutput }

/* v8 ignore start -- thin AWS SDK proxy wrapper; higher-level Firehose writer tests mock this provider boundary. */
let firehoseClient: FirehoseClient | undefined

export const FirehoseDeliveryClient = new Proxy({} as FirehoseClient, {
  get(targetObject, prop) {
    if (prop in targetObject) {
      return getReceiverBoundProperty(targetObject, prop)
    }
    const target = getFirehoseClient()
    return getReceiverBoundProperty(target, prop)
  },
})

/* no-mistakes: integration=aws */
export async function putFirehoseRecordBatch(
  input: PutRecordBatchCommandInput,
): Promise<PutRecordBatchCommandOutput> {
  return FirehoseDeliveryClient.send(new PutRecordBatchCommand(input))
}

function getFirehoseClient(): FirehoseClient {
  if (!firehoseClient) {
    const credentials = hasFirehoseCredentials() ? getFirehoseCredentials() : undefined
    firehoseClient = new FirehoseClient({
      ...(credentials ? { credentials } : {}),
      region: AWS_REGION,
      requestHandler: createResponseBodyBoundAwsRequestHandler(),
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }

  return firehoseClient
}
/* v8 ignore stop */
