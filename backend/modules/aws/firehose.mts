import {
  FirehoseClient,
  PutRecordBatchCommand,
  type PutRecordBatchCommandInput,
  type PutRecordBatchCommandOutput,
} from '@aws-sdk/client-firehose'
import { AWS_DUALSTACK_CLIENT_CONFIG, AWS_REGION } from './config.mts'
import { getFirehoseCredentials, hasFirehoseCredentials } from './credentials.mts'

export type { PutRecordBatchCommandInput, PutRecordBatchCommandOutput }

/* v8 ignore start -- thin AWS SDK proxy wrapper; higher-level Firehose writer tests inject the sender. */
let firehoseClient: FirehoseClient | undefined

export const FirehoseDeliveryClient = new Proxy({} as FirehoseClient, {
  get(targetObject, prop) {
    if (prop in targetObject) {
      return getClientProperty(targetObject, prop)
    }
    const target = getFirehoseClient()
    return getClientProperty(target, prop)
  },
})

/* no-mistakes: integration=aws */
export async function putFirehoseRecordBatch(
  input: PutRecordBatchCommandInput,
): Promise<PutRecordBatchCommandOutput> {
  return await FirehoseDeliveryClient.send(new PutRecordBatchCommand(input))
}

function getClientProperty(target: object, prop: string | symbol): unknown {
  const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
  const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
  return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
}

function getFirehoseClient(): FirehoseClient {
  if (!firehoseClient) {
    const credentials = hasFirehoseCredentials() ? getFirehoseCredentials() : undefined
    firehoseClient = new FirehoseClient({
      ...(credentials ? { credentials } : {}),
      region: AWS_REGION,
      ...AWS_DUALSTACK_CLIENT_CONFIG,
    })
  }

  return firehoseClient
}
/* v8 ignore stop */
