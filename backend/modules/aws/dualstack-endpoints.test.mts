import { readFileSync } from 'node:fs'
import { BedrockClient } from '@aws-sdk/client-bedrock'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch'
import { FirehoseClient } from '@aws-sdk/client-firehose'
import { S3Client } from '@aws-sdk/client-s3'
import { SESClient } from '@aws-sdk/client-ses'
import { SQSClient } from '@aws-sdk/client-sqs'
import { describe, expect, it } from 'vitest'
import { AWS_DUALSTACK_CLIENT_CONFIG, AWS_REGION, BEDROCK_AWS_REGION } from './config.mts'

type EndpointProviderConfig = {
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

describe('AWS SDK endpoint selection', () => {
  it('wires the dual-stack config into every supported production client constructor', () => {
    const productionClientModules = [
      'cloudwatch.mts',
      'firehose.mts',
      's3.mts',
      's3-bedrock-batch.mts',
      'ses.mts',
      'sqs.mts',
    ]

    for (const moduleName of productionClientModules) {
      const source = readFileSync(`backend/modules/aws/${moduleName}`, 'utf8')
      expect(source).toContain('...AWS_DUALSTACK_CLIENT_CONFIG')
    }
  })

  it('enables dual-stack endpoints for CloudWatch, Firehose, S3, SES, and SQS clients', async () => {
    const clients = [
      [new CloudWatchClient({ region: AWS_REGION, ...AWS_DUALSTACK_CLIENT_CONFIG }), 'monitoring'],
      [new FirehoseClient({ region: AWS_REGION, ...AWS_DUALSTACK_CLIENT_CONFIG }), 'firehose'],
      [new S3Client({ region: AWS_REGION, ...AWS_DUALSTACK_CLIENT_CONFIG }), 's3'],
      [new SESClient({ region: AWS_REGION, ...AWS_DUALSTACK_CLIENT_CONFIG }), 'email'],
      [new SQSClient({ region: AWS_REGION, ...AWS_DUALSTACK_CLIENT_CONFIG }), 'sqs'],
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

  it('keeps Bedrock control and runtime clients on their supported IPv4 endpoints', async () => {
    const clients = [
      new BedrockClient({ region: BEDROCK_AWS_REGION }),
      new BedrockRuntimeClient({
        region: BEDROCK_AWS_REGION,
      }),
    ]

    for (const client of clients) {
      const config = client.config as EndpointProviderConfig
      await expect(config.useDualstackEndpoint()).resolves.toBe(false)
    }
    expect(getEndpointHostname(clients[0]!, BEDROCK_AWS_REGION, false)).toBe(
      `bedrock.${BEDROCK_AWS_REGION}.amazonaws.com`,
    )
    expect(getEndpointHostname(clients[1]!, BEDROCK_AWS_REGION, false)).toBe(
      `bedrock-runtime.${BEDROCK_AWS_REGION}.amazonaws.com`,
    )
  })
})
