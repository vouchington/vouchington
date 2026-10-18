import { describe, expect, it } from 'vitest'
import type { NodeHttpHandler } from '@smithy/node-http-handler'
import {
  AWS_CONNECTION_TIMEOUT_MS,
  AWS_LONG_POLL_SOCKET_TIMEOUT_MS,
  AWS_SOCKET_TIMEOUT_MS,
} from '@vouchington/aws/request-handler'
import { BedrockControlClient } from './bedrock-control.mts'
import { BedrockEmbeddingsClient } from './bedrock-runtime.mts'
import { CloudWatchMetricsClient } from './cloudwatch.mts'
import { AWS_REGION, BEDROCK_AWS_REGION } from './config.mts'
import { FirehoseDeliveryClient } from './firehose.mts'
import { S3ImagesClient, S3ImageUploadsClient } from './s3.mts'
import { S3BedrockBatchClient } from './s3-bedrock-batch.mts'
import { SESClient } from './ses.mts'
import { SQSClient as LazySQSClient } from './sqs.mts'

type EndpointProviderConfig = {
  requestHandler: Pick<NodeHttpHandler, 'handle' | 'httpHandlerConfigs'>
  endpointProvider: (params: Record<string, boolean | string>) => { url: URL }
  useDualstackEndpoint: () => Promise<boolean>
}

function getEndpointHostname(
  client: { config: unknown },
  region: string,
  useDualStack: boolean,
): string {
  const config = client.config as EndpointProviderConfig
  return config.endpointProvider({ Region: region, UseDualStack: useDualStack, UseFIPS: false }).url
    .hostname
}

describe('AWS client configuration', () => {
  it('configures production clients with the shared request bounds and long-poll policy', async () => {
    for (const [client, socketTimeout] of [
      [BedrockControlClient, AWS_SOCKET_TIMEOUT_MS],
      [BedrockEmbeddingsClient, AWS_SOCKET_TIMEOUT_MS],
      [CloudWatchMetricsClient, AWS_SOCKET_TIMEOUT_MS],
      [FirehoseDeliveryClient, AWS_SOCKET_TIMEOUT_MS],
      [S3ImagesClient, AWS_SOCKET_TIMEOUT_MS],
      [S3ImageUploadsClient, AWS_SOCKET_TIMEOUT_MS],
      [S3BedrockBatchClient, AWS_SOCKET_TIMEOUT_MS],
      [SESClient, AWS_SOCKET_TIMEOUT_MS],
      [LazySQSClient, AWS_LONG_POLL_SOCKET_TIMEOUT_MS],
    ] as const) {
      const { requestHandler } = client.config as EndpointProviderConfig
      // Resolve the handler's lazy configuration without opening a network connection.
      await Promise.allSettled([
        requestHandler.handle(
          {
            protocol: 'https:',
            hostname: 'localhost',
            method: 'GET',
            path: '/',
            headers: {},
            query: {},
            clone() {
              return this
            },
          },
          { abortSignal: AbortSignal.abort() },
        ),
      ])
      expect(requestHandler.httpHandlerConfigs()).toMatchObject({
        connectionTimeout: AWS_CONNECTION_TIMEOUT_MS,
        socketTimeout,
      })
    }
  })

  it('keeps production delivery clients on dual-stack endpoints', async () => {
    const clients = [
      [CloudWatchMetricsClient, 'monitoring'],
      [FirehoseDeliveryClient, 'firehose'],
      [S3ImagesClient, 's3'],
      [S3ImageUploadsClient, 's3'],
      [SESClient, 'email'],
      [LazySQSClient, 'sqs'],
    ] as const

    for (const [client, service] of clients) {
      const config = client.config as EndpointProviderConfig
      await expect(config.useDualstackEndpoint()).resolves.toBe(true)
      expect(getEndpointHostname(client, AWS_REGION, true)).toBe(
        service === 's3'
          ? `s3.dualstack.${AWS_REGION}.amazonaws.com`
          : `${service}.${AWS_REGION}.api.aws`,
      )
    }
  })

  it('keeps the SQS client on its resolved dual-stack endpoint instead of the QueueUrl host', () => {
    // useQueueUrlAsEndpoint defaults to true, which would override the dual-stack endpoint with
    // the IPv4 host baked into every provisioned QueueUrl and warn twice per call.
    const config = LazySQSClient.config as unknown as { useQueueUrlAsEndpoint: boolean }
    expect(config.useQueueUrlAsEndpoint).toBe(false)
  })

  it('keeps Bedrock clients on their supported IPv4 endpoints', async () => {
    for (const [client, service] of [
      [BedrockControlClient, 'bedrock'],
      [BedrockEmbeddingsClient, 'bedrock-runtime'],
    ] as const) {
      const config = client.config as EndpointProviderConfig
      await expect(config.useDualstackEndpoint()).resolves.toBe(false)
      expect(getEndpointHostname(client, BEDROCK_AWS_REGION, false)).toBe(
        `${service}.${BEDROCK_AWS_REGION}.amazonaws.com`,
      )
    }
  })
})
