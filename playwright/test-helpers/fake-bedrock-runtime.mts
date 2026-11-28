import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { EMBEDDING_DIMENSION } from '../../backend/services/bedrock-embeddings/config.mts'

// The AWS Emulator does not run model inference, and the Playwright stack has no AWS account, so
// semantic search (the topic similarity panels) needs a stand-in for the Bedrock InvokeModel
// embedding call. The vector is derived from the request body: stable per query, no semantics.
export function fakeEmbedding(seed: Buffer): number[] {
  const values: number[] = []
  for (let block = 0; values.length < EMBEDDING_DIMENSION; block += 1) {
    const digest = createHash('sha256').update(seed).update(String(block)).digest()
    for (const byte of digest) values.push(byte / 255 - 0.5)
  }
  const vector = values.slice(0, EMBEDDING_DIMENSION)
  const norm = Math.hypot(...vector)
  return vector.map(value => value / norm)
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks)
}

/** Starts the stand-in on an ephemeral loopback port and returns its endpoint URL. */
export async function startFakeBedrockRuntime(): Promise<string> {
  const server = createServer(async (request, response) => {
    const body = await readBody(request)
    const isInvoke = request.method === 'POST' && /^\/model\/[^/]+\/invoke$/.test(request.url ?? '')
    if (!isInvoke) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ message: 'Unsupported fake Bedrock Runtime route' }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        embeddings: [{ embeddingType: 'TEXT', embedding: fakeEmbedding(body) }],
      }),
    )
  })
  server.unref()
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
