import { Readable, Transform } from 'node:stream'
import { SesInboundTerminalError } from './mime.mts'

const MAX_SES_INBOUND_BYTES = 40 * 1024 * 1024

export function boundedBodyStream(body: unknown): Readable {
  if (!isAsyncIterable(body)) {
    throw new SesInboundTerminalError('Raw SES object body is not readable')
  }

  const source = Readable.from(normalizeBodyChunks(body))
  let bytes = 0
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        bytes += chunk.byteLength
        rejectOversizedRawEmail(bytes)
        callback(null, chunk)
      } catch (error) {
        source.destroy(error as Error)
        callback(error as Error)
      }
    },
  })
  source.once('error', error => counter.destroy(error))
  counter.once('close', () => source.destroy())
  source.pipe(counter)
  return counter
}

async function* normalizeBodyChunks(body: AsyncIterable<unknown>): AsyncGenerator<Uint8Array> {
  for await (const chunk of body) yield toBytes(chunk)
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof (value as AsyncIterable<unknown> | null)?.[Symbol.asyncIterator] === 'function'
}

function toBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === 'string') return Buffer.from(chunk)
  if (chunk instanceof Uint8Array) return chunk
  throw new SesInboundTerminalError('Raw SES object contained an unreadable chunk')
}

export function rejectOversizedRawEmail(bytes: number | undefined): void {
  if (bytes !== undefined && bytes > MAX_SES_INBOUND_BYTES) {
    throw new SesInboundTerminalError(
      `Raw SES object exceeds the ${MAX_SES_INBOUND_BYTES}-byte limit`,
    )
  }
}
