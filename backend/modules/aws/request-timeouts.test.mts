import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3'
import { ListQueuesCommand, SQSClient } from '@aws-sdk/client-sqs'
import { afterEach, describe, expect, it } from 'vitest'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import {
  AWS_CONNECTION_TIMEOUT_MS,
  AWS_REQUEST_TIMEOUT_MS,
  createAwsRequestHandler,
} from './config.mts'

const TEST_TIMEOUT_MS = 200
const REJECTION_DEADLINE_MS = 1_000
const TEST_CREDENTIALS = {
  accessKeyId: 'test-access-key-id',
  secretAccessKey: 'test-secret-access-key',
}

describe('AWS request timeouts', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (!server) return
    server.closeAllConnections()
    await closeServer(server)
    server = undefined
  })

  it('defines the shared production connect and socket-idle timeout defaults', () => {
    expect(AWS_CONNECTION_TIMEOUT_MS).toBe(3_000)
    expect(AWS_REQUEST_TIMEOUT_MS).toBe(10_000)
  })

  it('wires every client in this layer through the shared handler factory', () => {
    const expectedFactoryCallsByModule = new Map([
      ['bedrock-control.mts', 1],
      ['cloudwatch.mts', 1],
      ['s3-bedrock-batch.mts', 1],
      ['s3.mts', 2],
      ['ses.mts', 1],
      ['sqs.mts', 1],
    ])

    for (const [moduleName, expectedCalls] of expectedFactoryCallsByModule) {
      const source = readFileSync(`backend/modules/aws/${moduleName}`, 'utf8')
      expect(source.match(/requestHandler: createAwsRequestHandler\(/g)).toHaveLength(expectedCalls)
    }
  })

  it('bounds a stalled S3 request through the shared handler factory', async () => {
    const endpoint = await startStalledServer()
    const client = new S3Client({
      credentials: TEST_CREDENTIALS,
      endpoint,
      forcePathStyle: true,
      maxAttempts: 1,
      region: 'us-west-2',
      requestHandler: createAwsRequestHandler({
        connectionTimeout: TEST_TIMEOUT_MS,
        requestTimeout: TEST_TIMEOUT_MS,
      }),
    })

    try {
      const result = await captureRejection(client.send(new ListBucketsCommand({})))
      expect(result.error).toBeInstanceOf(Error)
      expect(result.elapsedMs).toBeLessThan(REJECTION_DEADLINE_MS)
    } finally {
      client.destroy()
    }
  })

  it('bounds a stalled SQS request through the shared handler factory', async () => {
    const endpoint = await startStalledServer()
    const client = new SQSClient({
      credentials: TEST_CREDENTIALS,
      endpoint,
      maxAttempts: 1,
      region: 'us-west-2',
      requestHandler: createAwsRequestHandler({
        connectionTimeout: TEST_TIMEOUT_MS,
        requestTimeout: TEST_TIMEOUT_MS,
      }),
    })

    try {
      const result = await captureRejection(client.send(new ListQueuesCommand({})))
      expect(result.error).toBeInstanceOf(Error)
      expect(result.elapsedMs).toBeLessThan(REJECTION_DEADLINE_MS)
    } finally {
      client.destroy()
    }
  })

  async function startStalledServer(): Promise<string> {
    server = createServer(() => {})
    const port = await listenOnEphemeralPort(server, '127.0.0.1')
    return `http://127.0.0.1:${port}`
  }
})

async function captureRejection(
  request: Promise<unknown>,
): Promise<{ elapsedMs: number; error: unknown }> {
  const startedAt = performance.now()
  try {
    await request
  } catch (err) {
    return { elapsedMs: performance.now() - startedAt, error: err }
  }
  return { elapsedMs: performance.now() - startedAt, error: undefined }
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}
