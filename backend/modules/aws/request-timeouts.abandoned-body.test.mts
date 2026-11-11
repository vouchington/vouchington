import { createServer, type Server } from 'node:http'
import { Readable } from 'node:stream'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it } from 'vitest'
import { listenOnRunnerUnreservedEphemeralPort } from 'vouchington-tooling/runner-port-policy'
import { createResponseBodyBoundAwsRequestHandler, discardAwsResponseBody } from './config.mts'

const TEST_TIMEOUT_MS = 200
const CLOSE_DEADLINE_MS = 2_000

describe('abandoned AWS response bodies', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (!server) return
    server.closeAllConnections()
    await new Promise<void>(resolve => {
      server?.close(() => resolve())
    })
    server = undefined
  })

  it('closes a stalled body nobody reads without raising an uncaught error', async () => {
    const body = await getStalledObjectBody()

    await waitForClose(body)

    expect(body.destroyed).toBe(true)
    expect(body.errored).toBeNull()
  })

  it('discards a body the caller will not read', async () => {
    const body = await getStalledObjectBody()

    discardAwsResponseBody(body)
    await waitForClose(body)

    expect(body.errored).toBeNull()
  })

  async function getStalledObjectBody(): Promise<Readable> {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-length': '10', 'content-type': 'text/plain' })
      response.write('x')
    })
    const port = await listenOnRunnerUnreservedEphemeralPort(server, '127.0.0.1')
    const client = new S3Client({
      credentials: { accessKeyId: 'test-access-key-id', secretAccessKey: 'test-secret' },
      endpoint: `http://127.0.0.1:${port}`,
      forcePathStyle: true,
      maxAttempts: 1,
      region: 'us-west-2',
      requestHandler: createResponseBodyBoundAwsRequestHandler({
        connectionTimeout: TEST_TIMEOUT_MS,
        socketTimeout: TEST_TIMEOUT_MS,
      }),
    })
    const response = await client.send(new GetObjectCommand({ Bucket: 'bucket', Key: 'key' }))
    if (!(response.Body instanceof Readable)) throw new Error('Expected a Node response body')
    return response.Body
  }
})

// A plain 'close' listener: events.once would attach the error listener this test excludes.
function waitForClose(body: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = AbortSignal.timeout(CLOSE_DEADLINE_MS)
    deadline.addEventListener('abort', () => reject(new Error('Body did not close')), {
      once: true,
    })
    body.once('close', () => resolve())
  })
}
