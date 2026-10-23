import { createServer, type Server } from 'node:http'
import { FirehoseClient, ListDeliveryStreamsCommand } from '@aws-sdk/client-firehose'
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3'
import { ListQueuesCommand, SQSClient } from '@aws-sdk/client-sqs'
import { afterEach, describe, expect, it } from 'vitest'
import { listenOnRunnerUnreservedEphemeralPort } from 'vouchington-tooling/runner-port-policy'
import { createResponseBodyBoundAwsRequestHandler } from './config.mts'

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

  it('bounds a stalled S3 request through the shared handler factory', async () => {
    const endpoint = await startStalledServer()
    const client = new S3Client({
      credentials: TEST_CREDENTIALS,
      endpoint,
      forcePathStyle: true,
      maxAttempts: 1,
      region: 'us-west-2',
      requestHandler: createResponseBodyBoundAwsRequestHandler({
        connectionTimeout: TEST_TIMEOUT_MS,
        socketTimeout: TEST_TIMEOUT_MS,
      }),
    })

    try {
      const error = await captureRejectionBeforeDeadline(client.send(new ListBucketsCommand({})))
      expect(error).toBeInstanceOf(Error)
    } finally {
      client.destroy()
    }
  })

  it('bounds an S3 response body that stalls after headers', async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/xml' })
      response.flushHeaders()
    })
    const port = await listenOnRunnerUnreservedEphemeralPort(server, '127.0.0.1')
    const client = new S3Client({
      credentials: TEST_CREDENTIALS,
      endpoint: `http://127.0.0.1:${port}`,
      forcePathStyle: true,
      maxAttempts: 1,
      region: 'us-west-2',
      requestHandler: createResponseBodyBoundAwsRequestHandler({
        connectionTimeout: TEST_TIMEOUT_MS,
        socketTimeout: TEST_TIMEOUT_MS,
      }),
    })

    try {
      const error = await captureRejectionBeforeDeadline(client.send(new ListBucketsCommand({})))
      expect(error).toMatchObject({ name: 'TimeoutError', code: 'ETIMEDOUT' })
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
      requestHandler: createResponseBodyBoundAwsRequestHandler({
        connectionTimeout: TEST_TIMEOUT_MS,
        socketTimeout: TEST_TIMEOUT_MS,
      }),
    })

    try {
      const error = await captureRejectionBeforeDeadline(client.send(new ListQueuesCommand({})))
      expect(error).toBeInstanceOf(Error)
    } finally {
      client.destroy()
    }
  })

  it('bounds a stalled Firehose request through the shared handler factory', async () => {
    const endpoint = await startStalledServer()
    const client = new FirehoseClient({
      credentials: TEST_CREDENTIALS,
      endpoint,
      maxAttempts: 1,
      region: 'us-west-2',
      requestHandler: createResponseBodyBoundAwsRequestHandler({
        connectionTimeout: TEST_TIMEOUT_MS,
        socketTimeout: TEST_TIMEOUT_MS,
      }),
    })

    try {
      const error = await captureRejectionBeforeDeadline(
        client.send(new ListDeliveryStreamsCommand({})),
      )
      expect(error).toBeInstanceOf(Error)
    } finally {
      client.destroy()
    }
  })

  async function startStalledServer(): Promise<string> {
    server = createServer(() => {})
    const port = await listenOnRunnerUnreservedEphemeralPort(server, '127.0.0.1')
    return `http://127.0.0.1:${port}`
  }
})

async function captureRejectionBeforeDeadline(request: Promise<unknown>): Promise<unknown> {
  const deadline = AbortSignal.timeout(REJECTION_DEADLINE_MS)
  const deadlineExceeded = new Promise<never>((_resolve, reject) => {
    deadline.addEventListener(
      'abort',
      () => reject(new Error(`AWS request did not reject within ${REJECTION_DEADLINE_MS}ms`)),
      { once: true },
    )
  })

  return Promise.race([
    request.then(
      async () => {
        throw new Error('Expected the stalled AWS request to reject')
      },
      err => err,
    ),
    deadlineExceeded,
  ])
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
